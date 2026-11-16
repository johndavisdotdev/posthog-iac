package posthogcfn_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go/aws/client"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/secretsmanager"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

func newClient(t *testing.T, api *cfntest.API) *posthogcfn.Client {
	t.Helper()
	c, err := posthogcfn.NewClient(cfntest.Ptr(cfntest.TestAPIKey), cfntest.Ptr(api.Server.URL+"/"))
	if err != nil {
		t.Fatal(err)
	}
	c.Sleep = func(time.Duration) {}
	return c
}

func TestNewClientRequiresAPIKey(t *testing.T) {
	if _, err := posthogcfn.NewClient(nil, nil); !errors.Is(err, posthogcfn.ErrMissingAPIKey) {
		t.Fatalf("err = %v, want ErrMissingAPIKey", err)
	}
	c, err := posthogcfn.NewClient(cfntest.Ptr("k"), nil)
	if err != nil || c.BaseURL != posthogcfn.DefaultBaseURL {
		t.Fatalf("got %v %v", c, err)
	}
	if _, err := posthogcfn.NewClient(cfntest.Ptr("k"), cfntest.Ptr("not a url")); err == nil {
		t.Fatal("want error for invalid BaseUrl")
	}
}

func TestPathEscapesSegments(t *testing.T) {
	got := posthogcfn.Path("/api/projects/%s/endpoints/%s/", "1", "a b/c")
	if got != "/api/projects/1/endpoints/a%20b%2Fc/" {
		t.Fatalf("got %s", got)
	}
}

func TestErrorMapping(t *testing.T) {
	cases := map[int]string{
		404: "NotFound", 401: "AccessDenied", 403: "AccessDenied", 409: "ResourceConflict",
		400: "InvalidRequest", 405: "InvalidRequest", 429: "Throttling", 500: "ServiceInternalError",
	}
	for status, want := range cases {
		api := cfntest.NewAPI(t)
		api.Handle("POST /x/", func(w http.ResponseWriter, r *http.Request) {
			cfntest.Error(w, status, "validation_error", "invalid_input", "bad name")
		})
		err := newClient(t, api).Post(t.Context(), "/x/", map[string]any{}, nil)
		if got := posthogcfn.ErrorCode(err); got != want {
			t.Errorf("%d: code = %s, want %s (%v)", status, got, want, err)
		}
	}
}

func TestAuthHeaderAndErrorDetail(t *testing.T) {
	api := cfntest.NewAPI(t)
	c, _ := posthogcfn.NewClient(cfntest.Ptr("wrong"), cfntest.Ptr(api.Server.URL))
	err := c.Get(t.Context(), "/api/projects/1/actions/", nil, nil)
	var apiErr *posthogcfn.APIError
	if !errors.As(err, &apiErr) || apiErr.StatusCode != 401 || apiErr.Detail == "" {
		t.Fatalf("err = %#v", err)
	}
	if posthogcfn.ErrorCode(err) != "AccessDenied" {
		t.Fatalf("code = %s", posthogcfn.ErrorCode(err))
	}
}

func TestRetriesIdempotentRequestsOnly(t *testing.T) {
	api := cfntest.NewAPI(t)
	n := 0
	api.Handle("GET /flaky/", func(w http.ResponseWriter, r *http.Request) {
		n++
		if n < 3 {
			cfntest.Error(w, 503, "server_error", "unavailable", "try later")
			return
		}
		cfntest.JSON(w, 200, map[string]any{"ok": true})
	})
	api.Handle("POST /flaky/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.Error(w, 503, "server_error", "unavailable", "try later")
	})
	c := newClient(t, api)
	var out map[string]any
	if err := c.Get(t.Context(), "/flaky/", nil, &out); err != nil || out["ok"] != true {
		t.Fatalf("GET: %v %v", out, err)
	}
	if err := c.Post(t.Context(), "/flaky/", map[string]any{}, nil); err == nil {
		t.Fatal("POST should fail")
	}
	if got := len(api.CallsTo("POST", "/flaky/")); got != 1 {
		t.Fatalf("POST attempts = %d, want 1", got)
	}
}

type item struct {
	ID   posthogcfn.FlexID `json:"id"`
	Name string            `json:"name"`
}

func TestListFollowsPagesAndFind(t *testing.T) {
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/things/", cfntest.CollectionOptions{})
	for i := 1; i <= 250; i++ {
		store.Put(map[string]string{"project_id": "7"}, map[string]any{"id": i, "name": "n"})
	}
	store.Put(map[string]string{"project_id": "8"}, map[string]any{"id": 999, "name": "other"})
	c := newClient(t, api)
	items, err := posthogcfn.List[item](t.Context(), c, "/api/projects/7/things/", url.Values{"search": {"x"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 250 {
		t.Fatalf("got %d items, want 250", len(items))
	}
	if len(api.CallsTo("GET", "/api/projects/7/things/")) != 3 {
		t.Fatalf("want 3 page requests")
	}
	found, err := posthogcfn.Find(t.Context(), c, "/api/projects/7/things/", nil, func(i *item) bool { return i.ID == "200" })
	if err != nil || found == nil || found.ID != "200" {
		t.Fatalf("Find = %v, %v", found, err)
	}
	missing, err := posthogcfn.Find(t.Context(), c, "/api/projects/7/things/", nil, func(i *item) bool { return i.ID == "999" })
	if err != nil || missing != nil {
		t.Fatalf("Find(missing) = %v, %v", missing, err)
	}
}

func TestListAcceptsBareArray(t *testing.T) {
	api := cfntest.NewAPI(t)
	api.Handle("GET /arr/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.JSON(w, 200, []any{map[string]any{"id": "a"}, map[string]any{"id": "b"}})
	})
	items, err := posthogcfn.List[item](t.Context(), newClient(t, api), "/arr/", nil)
	if err != nil || len(items) != 2 || items[1].ID != "b" {
		t.Fatalf("got %v %v", items, err)
	}
}

func TestCollectionSoftDelete(t *testing.T) {
	api := cfntest.NewAPI(t)
	api.Collection("/api/projects/{project_id}/actions/", cfntest.CollectionOptions{SoftDelete: true})
	c := newClient(t, api)
	var created item
	if err := c.Post(t.Context(), "/api/projects/1/actions/", map[string]any{"name": "a"}, &created); err != nil {
		t.Fatal(err)
	}
	path := posthogcfn.Path("/api/projects/%s/actions/%s/", "1", created.ID.String())
	if err := c.Delete(t.Context(), path); posthogcfn.StatusCode(err) != 405 {
		t.Fatalf("hard delete err = %v, want 405", err)
	}
	if err := c.SoftDelete(t.Context(), path); err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := c.Get(t.Context(), path, nil, &got); err != nil || got["deleted"] != true {
		t.Fatalf("got %v %v", got, err)
	}
	items, _ := posthogcfn.List[item](t.Context(), c, "/api/projects/1/actions/", nil)
	if len(items) != 0 {
		t.Fatalf("soft-deleted item still listed")
	}
}

func TestFlexID(t *testing.T) {
	var v struct {
		A posthogcfn.FlexID `json:"a"`
		B posthogcfn.FlexID `json:"b"`
		C posthogcfn.FlexID `json:"c"`
	}
	if err := json.Unmarshal([]byte(`{"a": 12345678901, "b": "abc", "c": null}`), &v); err != nil {
		t.Fatal(err)
	}
	if v.A != "12345678901" || v.B != "abc" || v.C != "" || v.C.Ptr() != nil {
		t.Fatalf("got %+v", v)
	}
	b, _ := json.Marshal(v)
	if string(b) != `{"a":12345678901,"b":"abc","c":null}` {
		t.Fatalf("marshal = %s", b)
	}
}

func TestJSONHelpers(t *testing.T) {
	v, err := posthogcfn.ParseJSON("Filters", cfntest.Ptr(`{"b": 1, "a": [1, 2]}`))
	if err != nil || v == nil {
		t.Fatal(v, err)
	}
	if _, err := posthogcfn.ParseJSON("Filters", cfntest.Ptr(`{`)); err == nil {
		t.Fatal("want error for invalid JSON")
	}
	if v, err := posthogcfn.ParseJSON("Filters", nil); v != nil || err != nil {
		t.Fatal("nil should parse to nil")
	}
	desired := `{ "a": [1,2], "b": 1.0 }`
	api := map[string]any{"b": 1, "a": []any{1, 2}}
	if got := posthogcfn.PreserveJSON(&desired, api); got != &desired {
		t.Fatalf("PreserveJSON should keep the template string, got %v", *got)
	}
	changed := map[string]any{"b": 2}
	if got := posthogcfn.PreserveJSON(&desired, changed); got == nil || *got != `{"b":2}` {
		t.Fatalf("PreserveJSON should return the API value on drift, got %v", got)
	}
	if posthogcfn.ToJSONString(nil) != nil || posthogcfn.ToJSONString(json.RawMessage("null")) != nil {
		t.Fatal("null should map to nil")
	}
}

func TestJSONContains(t *testing.T) {
	for _, tc := range []struct {
		want, have string
		ok         bool
	}{
		{`{"a": 1}`, `{"a": 1, "b": 2}`, true},
		{`{"a": 1}`, `{"a": 2}`, false},
		{`{"a": 1}`, `{"b": 1}`, false},
		{`{"a": null}`, `{}`, true},
		{`{"a": [1, 2]}`, `{"a": [1, 2]}`, true},
		{`{"a": [1]}`, `{"a": [1, 2]}`, false},
		{`[{"x": 1}]`, `[{"x": 1, "y": 2}]`, true},
		{`{"a": {}}`, `{"a": 3}`, false},
		{`{"a": 1.0}`, `{"a": 1}`, true},
		{`"x"`, `"x"`, true},
	} {
		var w, h any
		if err := json.Unmarshal([]byte(tc.want), &w); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal([]byte(tc.have), &h); err != nil {
			t.Fatal(err)
		}
		if got := posthogcfn.JSONContains(w, h); got != tc.ok {
			t.Errorf("JSONContains(%s, %s) = %v, want %v", tc.want, tc.have, got, tc.ok)
		}
	}
}

func TestPreserveJSONSubset(t *testing.T) {
	desired := `{ "groups": [ {"rollout_percentage": 50} ] }`
	enriched := json.RawMessage(`{"groups":[{"rollout_percentage":50,"variant":null,"bytecode":["_H"]}],"payloads":{}}`)
	if got := posthogcfn.PreserveJSONSubset(&desired, enriched); got != &desired {
		t.Fatalf("server-added keys should not count as drift, got %v", *got)
	}
	changed := json.RawMessage(`{"groups":[{"rollout_percentage":25}]}`)
	if got := posthogcfn.PreserveJSONSubset(&desired, changed); got == nil || *got != `{"groups":[{"rollout_percentage":25}]}` {
		t.Fatalf("a changed value must be reported, got %v", got)
	}
	if got := posthogcfn.PreserveJSONSubset(nil, changed); got == nil || *got != string(changed) {
		t.Fatalf("no template value should return the API value, got %v", got)
	}
	if posthogcfn.PreserveJSONSubset(&desired, json.RawMessage("null")) != nil || posthogcfn.PreserveJSONSubset(&desired, nil) != nil {
		t.Fatal("an API null must map to nil")
	}
	bad := `{not json`
	if got := posthogcfn.PreserveJSONSubset(&bad, changed); got == nil || *got != string(changed) {
		t.Fatalf("an unparsable template value should return the API value, got %v", got)
	}
}

func TestEmptyJSON(t *testing.T) {
	for raw, want := range map[string]bool{
		``: true, `null`: true, ` {} `: true, `[]`: true, `{ }`: true,
		`{"a":1}`: false, `[1]`: false, `0`: false, `""`: false, `false`: false,
	} {
		if got := posthogcfn.EmptyJSON(json.RawMessage(raw)); got != want {
			t.Errorf("EmptyJSON(%q) = %v, want %v", raw, got, want)
		}
	}
}

type fakeSecrets struct {
	in *secretsmanager.PutSecretValueInput
}

func (f *fakeSecrets) PutSecretValue(in *secretsmanager.PutSecretValueInput) (*secretsmanager.PutSecretValueOutput, error) {
	f.in = in
	return &secretsmanager.PutSecretValueOutput{}, nil
}

func TestPutSecret(t *testing.T) {
	fake := &fakeSecrets{}
	orig := posthogcfn.NewSecretWriter
	posthogcfn.NewSecretWriter = func(client.ConfigProvider) posthogcfn.SecretWriter { return fake }
	t.Cleanup(func() { posthogcfn.NewSecretWriter = orig })

	sess := session.Must(session.NewSession())
	if err := posthogcfn.PutSecret(sess, "arn:secret", "phs_value"); err != nil {
		t.Fatal(err)
	}
	if *fake.in.SecretId != "arn:secret" || *fake.in.SecretString != "phs_value" {
		t.Fatalf("got %+v", fake.in)
	}
	if err := posthogcfn.PutSecret(sess, "", "x"); err == nil {
		t.Fatal("want error for empty secret ID")
	}
}

func TestEvents(t *testing.T) {
	ev := posthogcfn.ListSuccess[int](nil, "")
	if ev.ResourceModels == nil || len(ev.ResourceModels) != 0 {
		t.Fatal("ListSuccess(nil) must give an empty, non-nil slice")
	}
	if posthogcfn.DeleteSuccess().ResourceModel != nil {
		t.Fatal("DeleteSuccess must carry no model")
	}
	ev = posthogcfn.FromError("reading", &posthogcfn.NetworkError{Method: "GET", Path: "/", Err: errors.New("dial")})
	if ev.HandlerErrorCode != "NetworkFailure" {
		t.Fatalf("code = %s", ev.HandlerErrorCode)
	}
}
