package resource

import (
	"net/http"
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/web_experiments/", cfntest.CollectionOptions{
		Defaults: map[string]any{"created_at": "2026-01-01T00:00:00Z"},
		OnCreate: func(obj map[string]any) {
			obj["feature_flag_key"] = "web-experiment-flag"
			addVariantDefaults(obj)
		},
		OnUpdate: addVariantDefaults,
	})
	return api, store
}

// addVariantDefaults mimics PostHog normalising each variant.
func addVariantDefaults(obj map[string]any) {
	variants, _ := obj["variants"].(map[string]any)
	for _, v := range variants {
		variant := v.(map[string]any)
		if _, ok := variant["conditions"]; !ok {
			variant["conditions"] = nil
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId: cfntest.Ptr(project),
		Name:      cfntest.Ptr("Hero headline"),
		Variants:  cfntest.Ptr(`{"control": {"transforms": [], "rollout_percentage": 50}, "test": {"transforms": [{"selector": "#hero h1", "text": "Here comes Superman!"}], "rollout_percentage": 50}}`),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || *created.FeatureFlagKey != "web-experiment-flag" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Variants != *model.Variants {
		t.Fatalf("Variants not preserved: %s", *created.Variants)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Hero headline" || *read.Variants != *model.Variants {
		t.Fatalf("read returned %+v", read)
	}

	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Hero headline v2"),
		Variants: cfntest.Ptr(`{"control": {"transforms": [], "rollout_percentage": 20}, "test": {"transforms": [], "rollout_percentage": 80}}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Hero headline v2" || *after.Variants != *updated.Variants {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo(http.MethodPatch, "/api/projects/42/web_experiments/1/")[0].Body
	if _, ok := patch["feature_flag_key"]; ok {
		t.Fatalf("read-only feature_flag_key sent: %v", patch)
	}

	// Out-of-band changes are reported.
	obj := store.Get(parent, "1")
	obj["variants"].(map[string]any)["test"].(map[string]any)["rollout_percentage"] = 10
	store.Put(parent, obj)
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if v := *ev.ResourceModel.(*Model).Variants; !strings.Contains(v, `"rollout_percentage":10`) {
		t.Fatalf("drift hidden: %s", v)
	}

	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("web experiment not deleted")
	}
}

func TestSoftDeletedIsNotFound(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{"id": 5, "name": "x", "variants": map[string]any{}, "deleted": true})
	m := desired()
	m.Id = cfntest.Ptr("5")
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, m, m), m, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	if len(api.CallsTo(http.MethodPatch, "/api/projects/42/web_experiments/5/")) != 0 {
		t.Fatal("soft-deleted web experiment was patched")
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("999")
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
	for name, mutate := range map[string]func(*Model){
		"no project":        func(m *Model) { m.ProjectId = nil },
		"no name":           func(m *Model) { m.Name = nil },
		"no variants":       func(m *Model) { m.Variants = nil },
		"bad variants":      func(m *Model) { m.Variants = cfntest.Ptr(`{"control":`) },
		"variants not dict": func(m *Model) { m.Variants = cfntest.Ptr(`["control"]`) },
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Fatalf("%s: got %+v, %v", name, ev, err)
		}
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
