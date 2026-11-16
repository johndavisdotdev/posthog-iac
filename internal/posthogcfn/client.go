// Package posthogcfn holds code shared by every PostHog::* CloudFormation
// resource type: a small client for the PostHog REST (management) API built
// from the type configuration, mapping PostHog errors to CloudFormation
// handler error codes, progress-event helpers, pagination helpers, and a
// Secrets Manager writer.
//
// github.com/posthog/posthog-go is the event-capture and flag-evaluation SDK
// and has no management API, so the handlers call the REST API described by
// posthog.openapi.json through this client.
package posthogcfn

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ErrMissingAPIKey is returned when the type configuration has no API key.
var ErrMissingAPIKey = errors.New("PostHog API key is not set: register the type configuration with SetTypeConfiguration (ApiKey)")

// DefaultBaseURL is the PostHog Cloud US API host. EU users set BaseUrl to
// https://eu.posthog.com in the type configuration; self-hosted users set it to
// their instance URL.
const DefaultBaseURL = "https://us.posthog.com"

// UserAgent identifies these handlers to the PostHog API.
const UserAgent = "posthog-cloudformation/0.1.0 (+https://github.com/johndavisdev/posthog-iac)"

// HandlerTimeout bounds every PostHog call made by a handler invocation.
// CloudFormation handlers have about 60s before the invocation is retried.
const HandlerTimeout = 50 * time.Second

// maxAttempts is how many times an idempotent request is tried when PostHog
// answers 429 or a transient 5xx.
const maxAttempts = 3

// Client calls the PostHog REST API with a personal API key.
type Client struct {
	BaseURL string
	apiKey  string
	HTTP    *http.Client
	// Sleep waits between retries; tests replace it to avoid real delays.
	Sleep func(time.Duration)
}

// NewClient builds a client from the type configuration values. apiKey is
// required; baseURL is optional and defaults to DefaultBaseURL.
func NewClient(apiKey, baseURL *string) (*Client, error) {
	key := strings.TrimSpace(StringValue(apiKey))
	if key == "" {
		return nil, ErrMissingAPIKey
	}
	u := strings.TrimRight(strings.TrimSpace(StringValue(baseURL)), "/")
	if u == "" {
		u = DefaultBaseURL
	}
	if _, err := url.ParseRequestURI(u); err != nil {
		return nil, fmt.Errorf("BaseUrl %q is not a valid URL: %w", u, err)
	}
	return &Client{
		BaseURL: u,
		apiKey:  key,
		HTTP:    &http.Client{Timeout: HandlerTimeout},
		Sleep:   time.Sleep,
	}, nil
}

// Context returns a context bounded by HandlerTimeout.
func Context() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), HandlerTimeout)
}

// Path builds an API path from a format string, escaping every argument as a
// single path segment:
//
//	posthogcfn.Path("/api/projects/%s/actions/%s/", projectID, id)
func Path(format string, segments ...string) string {
	args := make([]any, len(segments))
	for i, s := range segments {
		args[i] = url.PathEscape(s)
	}
	return fmt.Sprintf(format, args...)
}

// Get sends GET path and decodes the JSON response into out (may be nil).
func (c *Client) Get(ctx context.Context, path string, query url.Values, out any) error {
	return c.Do(ctx, http.MethodGet, path, query, nil, out)
}

// Post sends POST path with in as the JSON body and decodes into out.
func (c *Client) Post(ctx context.Context, path string, in, out any) error {
	return c.Do(ctx, http.MethodPost, path, nil, in, out)
}

// Patch sends PATCH path with in as the JSON body and decodes into out.
func (c *Client) Patch(ctx context.Context, path string, in, out any) error {
	return c.Do(ctx, http.MethodPatch, path, nil, in, out)
}

// Put sends PUT path with in as the JSON body and decodes into out.
func (c *Client) Put(ctx context.Context, path string, in, out any) error {
	return c.Do(ctx, http.MethodPut, path, nil, in, out)
}

// Delete sends DELETE path (a hard delete; PostHog answers 204).
func (c *Client) Delete(ctx context.Context, path string) error {
	return c.Do(ctx, http.MethodDelete, path, nil, nil, nil)
}

// SoftDelete marks a resource deleted with PATCH {"deleted": true}. Many
// PostHog models (actions, cohorts, dashboards, insights, feature flags,
// experiments, hog functions, ...) refuse a hard DELETE with 405 and are
// deleted this way; their GET keeps returning the object with deleted=true,
// or 404, so Read must treat both as NotFound.
func (c *Client) SoftDelete(ctx context.Context, path string) error {
	return c.Patch(ctx, path, map[string]any{"deleted": true}, nil)
}

// Do sends one request. in is JSON-encoded when non-nil; a 2xx response body
// is decoded into out when out is non-nil. Non-2xx responses return *APIError.
// Request bodies are never logged or included in errors.
func (c *Client) Do(ctx context.Context, method, path string, query url.Values, in, out any) error {
	var body []byte
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return fmt.Errorf("encoding %s %s request: %w", method, path, err)
		}
		body = b
	}
	target := c.BaseURL + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	idempotent := method != http.MethodPost
	for attempt := 1; ; attempt++ {
		resp, err := c.send(ctx, method, target, body)
		if err != nil {
			return &NetworkError{Method: method, Path: path, Err: err}
		}
		raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
		resp.Body.Close()
		if readErr != nil {
			return &NetworkError{Method: method, Path: path, Err: readErr}
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if out == nil || len(bytes.TrimSpace(raw)) == 0 {
				return nil
			}
			if err := json.Unmarshal(raw, out); err != nil {
				return fmt.Errorf("decoding %s %s response: %w", method, path, err)
			}
			return nil
		}
		apiErr := newAPIError(method, path, resp, raw)
		if idempotent && attempt < maxAttempts && retryable(resp.StatusCode) {
			c.Sleep(retryDelay(resp, attempt))
			if ctx.Err() != nil {
				return apiErr
			}
			continue
		}
		return apiErr
	}
}

func (c *Client) send(ctx context.Context, method, target string, body []byte) (*http.Response, error) {
	var r io.Reader
	if body != nil {
		r = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, r)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", UserAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.HTTP.Do(req)
}

func retryable(status int) bool {
	return status == http.StatusTooManyRequests || status == http.StatusBadGateway ||
		status == http.StatusServiceUnavailable || status == http.StatusGatewayTimeout
}

func retryDelay(resp *http.Response, attempt int) time.Duration {
	if s := resp.Header.Get("Retry-After"); s != "" {
		if secs, err := strconv.Atoi(s); err == nil && secs >= 0 {
			d := time.Duration(secs) * time.Second
			if d > 10*time.Second {
				d = 10 * time.Second
			}
			return d
		}
	}
	return time.Duration(attempt) * time.Second
}
