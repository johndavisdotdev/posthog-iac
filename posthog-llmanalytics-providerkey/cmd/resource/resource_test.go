package resource

import (
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const (
	project = "42"
	secret  = "sk-test-0123456789abcdef"
	rotated = "sk-test-rotated-99990000"
)

var parent = map[string]string{"project_id": project}

var writeOnly = []string{"api_key", "base_url", "system_one_model", "azure_endpoint", "api_version", "set_as_active"}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/llm_analytics/provider_keys/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "last_used_at": nil, "state": "unknown", "error_message": nil,
			"created_by": map[string]any{"id": 1, "email": "someone@example.com"},
		},
		// PostHog never returns the write-only fields; it derives the
		// masked key and *_display fields from them.
		WriteOnly: writeOnly,
		OnCreate:  derive,
		OnUpdate:  derive,
	})
	return api, store
}

func derive(obj map[string]any) {
	if k, ok := obj["api_key"].(string); ok && len(k) > 4 {
		obj["api_key_masked"] = k[:3] + "..." + k[len(k)-4:]
	}
	for _, f := range []string{"base_url", "system_one_model", "azure_endpoint", "api_version"} {
		v, _ := obj[f].(string)
		if f == "base_url" || f == "azure_endpoint" {
			v = strings.TrimRight(v, "/")
		}
		if v == "" {
			obj[f+"_display"] = nil
		} else {
			obj[f+"_display"] = v
		}
	}
	obj["state"] = "ok"
}

func desired() *Model {
	return &Model{
		ProjectId:     cfntest.Ptr(project),
		Provider:      cfntest.Ptr("azure_openai"),
		Name:          cfntest.Ptr("Azure prod"),
		ApiKey:        cfntest.Ptr(secret),
		AzureEndpoint: cfntest.Ptr("https://my-resource.openai.azure.com/"),
		ApiVersion:    cfntest.Ptr("2024-10-21"),
		SetAsActive:   cfntest.Ptr(true),
	}
}

// requireNoSecret fails if a write-only value reached the model.
func requireNoSecret(t *testing.T, m *Model) {
	t.Helper()
	if m.ApiKey != nil || m.SetAsActive != nil {
		t.Fatalf("write-only property returned: %+v", m)
	}
	for _, s := range []string{secret, rotated} {
		if (m.ApiKeyMasked != nil && *m.ApiKeyMasked == s) || strings.Contains(strings.Join([]string{
			deref(m.Name), deref(m.BaseUrl), deref(m.ErrorMessage),
		}, " "), s) {
			t.Fatalf("API key leaked into the model: %+v", m)
		}
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	requireNoSecret(t, created)
	if created.Id == nil || *created.ApiKeyMasked != "sk-...cdef" || *created.State != "ok" || *created.Provider != "azure_openai" {
		t.Fatalf("create returned %+v", created)
	}
	// The endpoint comes back normalised but the template's value is kept.
	if *created.AzureEndpoint != "https://my-resource.openai.azure.com/" || *created.ApiVersion != "2024-10-21" {
		t.Fatalf("display fields not mapped: %+v", created)
	}
	post := api.CallsTo("POST", "/api/projects/42/llm_analytics/provider_keys/")[0].Body
	if post["api_key"] != secret || post["provider"] != "azure_openai" || post["set_as_active"] != true {
		t.Fatalf("create body = %v", post)
	}
	id := *created.Id
	if store.Get(parent, id)["api_key"] != secret {
		t.Fatal("key not stored")
	}

	// Read never returns the key, even though the request carries no key.
	readReq := &Model{ProjectId: cfntest.Ptr(project), Id: created.Id}
	ev, err = Read(api.Request(t, readReq, nil), nil, readReq)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	requireNoSecret(t, read)
	if *read.Name != "Azure prod" || *read.AzureEndpoint != "https://my-resource.openai.azure.com" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename and rotate the key. Provider is create-only and not sent.
	updated := desired()
	updated.Id = created.Id
	updated.Name = cfntest.Ptr("Azure prod (rotated)")
	updated.ApiKey = cfntest.Ptr(rotated)
	updated.SetAsActive = nil
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	requireNoSecret(t, after)
	if *after.Name != "Azure prod (rotated)" || *after.ApiKeyMasked != "sk-...0000" {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/llm_analytics/provider_keys/"+id+"/")[0].Body
	if _, sent := patch["provider"]; sent {
		t.Fatal("create-only provider must not be sent on update")
	}
	if _, sent := patch["set_as_active"]; sent {
		t.Fatal("set_as_active must only be sent when true")
	}

	// Update without ApiKey keeps the stored key.
	noKey := desired()
	noKey.Id = created.Id
	noKey.ApiKey = nil
	ev, err = Update(api.Request(t, noKey, after), after, noKey)
	cfntest.RequireSuccess(t, ev, err)
	if store.Get(parent, id)["api_key"] != rotated {
		t.Fatal("stored key changed by an update without ApiKey")
	}

	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("key not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("nope")
	ev, err := Read(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, gone, gone), gone, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	empty := &Model{}
	ev, err = Read(api.Request(t, empty, nil), nil, empty)
	cfntest.RequireNotFound(t, ev, err)
}

func TestValidation(t *testing.T) {
	api, store := newAPI(t)
	mod := func(f func(*Model)) *Model { m := desired(); f(m); return m }
	for name, m := range map[string]*Model{
		"no project":  mod(func(m *Model) { m.ProjectId = nil }),
		"no provider": mod(func(m *Model) { m.Provider = nil }),
		"no name":     mod(func(m *Model) { m.Name = nil }),
	} {
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %v %v", name, ev.HandlerErrorCode, err)
		}
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 || len(api.Calls()) != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
