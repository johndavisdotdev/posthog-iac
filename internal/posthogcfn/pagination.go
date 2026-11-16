package posthogcfn

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
)

// MaxListItems caps how many items List and Find read, so a handler cannot
// run past its invocation deadline on a very large project.
const MaxListItems = 10000

// PageSize is the limit requested for each page.
const PageSize = 100

// Page is PostHog's list envelope: {"count", "next", "previous", "results"}.
type Page[T any] struct {
	Count    int     `json:"count"`
	Next     *string `json:"next"`
	Previous *string `json:"previous"`
	Results  []T     `json:"results"`
}

// List reads every page of a PostHog list endpoint (limit/offset or cursor
// pagination, following "next"). query may carry filters; limit is set when
// absent. Endpoints that return a bare JSON array are also accepted.
func List[T any](ctx context.Context, c *Client, path string, query url.Values) ([]T, error) {
	q := url.Values{}
	for k, v := range query {
		q[k] = append([]string(nil), v...)
	}
	if q.Get("limit") == "" {
		q.Set("limit", strconv.Itoa(PageSize))
	}
	var out []T
	for pages := 0; ; pages++ {
		var raw json.RawMessage
		if err := c.Get(ctx, path, q, &raw); err != nil {
			return nil, err
		}
		if len(raw) > 0 && raw[0] == '[' {
			var items []T
			if err := json.Unmarshal(raw, &items); err != nil {
				return nil, fmt.Errorf("decoding %s list: %w", path, err)
			}
			return append(out, items...), nil
		}
		var page Page[T]
		if err := json.Unmarshal(raw, &page); err != nil {
			return nil, fmt.Errorf("decoding %s list: %w", path, err)
		}
		out = append(out, page.Results...)
		if len(out) >= MaxListItems || page.Next == nil || *page.Next == "" || len(page.Results) == 0 {
			return out, nil
		}
		next, err := url.Parse(*page.Next)
		if err != nil {
			return nil, fmt.Errorf("parsing next page URL for %s: %w", path, err)
		}
		// Only the query of "next" is used: the host in it may be an internal
		// name, and the path is the one we asked for.
		q = next.Query()
		if pages > MaxListItems/PageSize+1 {
			return out, nil
		}
	}
}

// Find returns the first item of a list endpoint for which match returns
// true, or nil when none matches. Use it for resources with no single-item
// GET. If MaxListItems items are scanned without a match it returns an error
// rather than nil, so a live resource is never reported as NotFound.
func Find[T any](ctx context.Context, c *Client, path string, query url.Values, match func(*T) bool) (*T, error) {
	items, err := List[T](ctx, c, path, query)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if match(&items[i]) {
			return &items[i], nil
		}
	}
	if len(items) >= MaxListItems {
		return nil, fmt.Errorf("item not found in the first %d list results; the list is too large to search", MaxListItems)
	}
	return nil, nil
}

// Map converts a slice of API objects into resource models.
func Map[T, M any](items []T, f func(*T) M) []M {
	out := make([]M, 0, len(items))
	for i := range items {
		out = append(out, f(&items[i]))
	}
	return out
}
