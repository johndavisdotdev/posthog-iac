package posthogcfn

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go/service/cloudformation"
)

// APIError is a non-2xx response from the PostHog API.
type APIError struct {
	Method     string
	Path       string
	StatusCode int
	// Type, Code, Detail and Attr come from PostHog's error body
	// ({"type": "validation_error", "code": "invalid_input", "detail": "...", "attr": "name"}).
	Type   string
	Code   string
	Detail string
	Attr   string
}

func (e *APIError) Error() string {
	var b strings.Builder
	fmt.Fprintf(&b, "PostHog API %s %s returned %d", e.Method, e.Path, e.StatusCode)
	if e.Code != "" {
		fmt.Fprintf(&b, " (%s)", e.Code)
	}
	if e.Detail != "" {
		fmt.Fprintf(&b, ": %s", e.Detail)
	}
	if e.Attr != "" {
		fmt.Fprintf(&b, " [field: %s]", e.Attr)
	}
	return b.String()
}

// NetworkError is a transport failure talking to PostHog.
type NetworkError struct {
	Method string
	Path   string
	Err    error
}

func (e *NetworkError) Error() string {
	return fmt.Sprintf("PostHog API %s %s: %v", e.Method, e.Path, e.Err)
}

func (e *NetworkError) Unwrap() error { return e.Err }

func newAPIError(method, path string, resp *http.Response, raw []byte) *APIError {
	e := &APIError{Method: method, Path: path, StatusCode: resp.StatusCode}
	var body struct {
		Type   string `json:"type"`
		Code   string `json:"code"`
		Detail any    `json:"detail"`
		Attr   string `json:"attr"`
		Error  string `json:"error"`
	}
	if json.Unmarshal(raw, &body) == nil {
		e.Type, e.Code, e.Attr = body.Type, body.Code, body.Attr
		switch d := body.Detail.(type) {
		case string:
			e.Detail = d
		case nil:
			e.Detail = body.Error
		default:
			if b, err := json.Marshal(d); err == nil {
				e.Detail = string(b)
			}
		}
	}
	if e.Detail == "" {
		e.Detail = http.StatusText(resp.StatusCode)
	}
	return e
}

// StatusCode returns the HTTP status of a PostHog API error, or 0.
func StatusCode(err error) int {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode
	}
	return 0
}

// ErrorCode returns the CloudFormation handler error code for err.
func ErrorCode(err error) string {
	var netErr *NetworkError
	if errors.As(err, &netErr) {
		return cloudformation.HandlerErrorCodeNetworkFailure
	}
	switch s := StatusCode(err); {
	case s == 0:
		return cloudformation.HandlerErrorCodeGeneralServiceException
	case s == http.StatusNotFound:
		return cloudformation.HandlerErrorCodeNotFound
	case s == http.StatusUnauthorized || s == http.StatusForbidden:
		return cloudformation.HandlerErrorCodeAccessDenied
	case s == http.StatusConflict:
		return cloudformation.HandlerErrorCodeResourceConflict
	case s == http.StatusTooManyRequests:
		return cloudformation.HandlerErrorCodeThrottling
	case s == http.StatusBadRequest || s == http.StatusUnprocessableEntity || s == http.StatusMethodNotAllowed:
		return cloudformation.HandlerErrorCodeInvalidRequest
	case s >= 500:
		return cloudformation.HandlerErrorCodeServiceInternalError
	default:
		return cloudformation.HandlerErrorCodeGeneralServiceException
	}
}

// IsNotFound reports whether err is a PostHog 404.
func IsNotFound(err error) bool { return StatusCode(err) == http.StatusNotFound }

// IsConflict reports whether err is a PostHog 409.
func IsConflict(err error) bool { return StatusCode(err) == http.StatusConflict }
