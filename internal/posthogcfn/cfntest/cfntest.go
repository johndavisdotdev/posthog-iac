// Package cfntest helps unit-test PostHog CloudFormation handlers against a
// fake PostHog API served by httptest.
//
// For ordinary CRUD resources, register an in-memory collection:
//
//	api := cfntest.NewAPI(t)
//	store := api.Collection("/api/projects/{project_id}/actions/", cfntest.CollectionOptions{SoftDelete: true})
//	req := api.Request(t, &resource.Model{ProjectId: cfntest.Ptr("1"), Name: cfntest.Ptr("Signed up")}, nil)
//	ev, err := resource.Create(req, &resource.Model{}, model)
//
// For anything else, register routes directly with Handle.
package cfntest

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/aws/aws-sdk-go/aws/session"
)

// TestAPIKey is the API key placed in the type configuration of test requests.
const TestAPIKey = "phx_cfntest"

// Call records one request received by the fake API.
type Call struct {
	Method string
	Path   string
	Query  string
	Body   map[string]any
	Raw    []byte
}

// API is a fake PostHog API. Register routes with Handle using Go 1.22
// ServeMux patterns ("GET /api/projects/{project_id}/actions/{id}/").
// Unregistered routes return a PostHog-shaped 404.
type API struct {
	Server *httptest.Server
	mux    *http.ServeMux

	mu    sync.Mutex
	calls []Call
}

// NewAPI starts a fake PostHog API that is closed when the test ends.
func NewAPI(t testing.TB) *API {
	t.Helper()
	a := &API{mux: http.NewServeMux()}
	a.Server = httptest.NewServer(http.HandlerFunc(a.serve))
	t.Cleanup(a.Server.Close)
	return a
}

func (a *API) serve(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	r.Body = io.NopCloser(strings.NewReader(string(raw)))
	c := Call{Method: r.Method, Path: r.URL.Path, Query: r.URL.RawQuery, Raw: raw}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &c.Body)
	}
	a.mu.Lock()
	a.calls = append(a.calls, c)
	a.mu.Unlock()

	if r.Header.Get("Authorization") != "Bearer "+TestAPIKey {
		Error(w, http.StatusUnauthorized, "authentication_error", "not_authenticated", "Invalid personal API key.")
		return
	}
	if _, pattern := a.mux.Handler(r); pattern == "" {
		NotFound(w)
		return
	}
	a.mux.ServeHTTP(w, r)
}

// Handle registers a route on the fake API.
func (a *API) Handle(pattern string, h http.HandlerFunc) {
	a.mux.HandleFunc(pattern, h)
}

// Calls returns every request received so far.
func (a *API) Calls() []Call {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]Call(nil), a.calls...)
}

// CallsTo returns the requests matching method and exact path.
func (a *API) CallsTo(method, path string) []Call {
	var out []Call
	for _, c := range a.Calls() {
		if c.Method == method && c.Path == path {
			out = append(out, c)
		}
	}
	return out
}

// TypeConfig returns the type configuration JSON pointing at the fake API.
func (a *API) TypeConfig() []byte {
	b, _ := json.Marshal(map[string]string{"ApiKey": TestAPIKey, "BaseUrl": a.Server.URL})
	return b
}

// Request builds a handler.Request whose type configuration points at the
// fake API. current and previous are resource models (or nil). The models go
// through JSON, exercising the plugin's unmarshal path.
func (a *API) Request(t testing.TB, current, previous any) handler.Request {
	t.Helper()
	return NewRequest(t, current, previous, a.TypeConfig())
}

// NewRequest builds a handler.Request with explicit type configuration bytes.
// Pass nil typeConfig to simulate a type with no configuration registered.
func NewRequest(t testing.TB, current, previous any, typeConfig []byte) handler.Request {
	t.Helper()
	return handler.NewRequest(
		"TestResource",
		map[string]interface{}{},
		handler.RequestContext{Region: "us-east-1", AccountID: "123456789012"},
		session.Must(session.NewSession()),
		marshal(t, previous),
		marshal(t, current),
		typeConfig,
	)
}

func marshal(t testing.TB, v any) []byte {
	t.Helper()
	if v == nil {
		return []byte("{}")
	}
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal model: %v", err)
	}
	return b
}

// JSON writes v as a JSON response with the given status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes a PostHog-shaped error body.
func Error(w http.ResponseWriter, status int, typ, code, detail string) {
	JSON(w, status, map[string]any{"type": typ, "code": code, "detail": detail, "attr": nil})
}

// NotFound writes a PostHog-shaped 404.
func NotFound(w http.ResponseWriter) {
	Error(w, http.StatusNotFound, "invalid_request", "not_found", "Not found.")
}

// NoContent writes an empty 204, as PostHog returns for hard deletes.
func NoContent(w http.ResponseWriter) { w.WriteHeader(http.StatusNoContent) }

// List writes a PostHog list envelope with no further pages.
func List(w http.ResponseWriter, items ...any) {
	if items == nil {
		items = []any{}
	}
	JSON(w, http.StatusOK, map[string]any{"count": len(items), "next": nil, "previous": nil, "results": items})
}

// Ptr returns a pointer to v.
func Ptr[T any](v T) *T { return &v }

// Decode reads a JSON request body into a map (empty map for no body).
func Decode(r *http.Request) map[string]any {
	m := map[string]any{}
	_ = json.NewDecoder(r.Body).Decode(&m)
	return m
}
