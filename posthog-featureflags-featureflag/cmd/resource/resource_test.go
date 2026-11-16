package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/feature_flags/", cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"name": "", "active": true, "archived": false, "tags": []any{}, "version": 0,
			"is_remote_configuration": nil, "ensure_experience_continuity": false,
			"evaluation_runtime": "all", "bucketing_identifier": nil, "status": "ACTIVE",
		},
		// PostHog never returns evaluation_contexts on the flag.
		WriteOnly: []string{"evaluation_contexts"},
		OnCreate:  normalize,
		OnUpdate: func(obj map[string]any) {
			normalize(obj)
			obj["version"] = obj["version"].(float64) + 1
			obj["updated_at"] = "2026-01-02T00:00:00Z"
		},
	})
	return api, store
}

// normalize mimics PostHog filling in filter members the request left out.
func normalize(obj map[string]any) {
	f, _ := obj["filters"].(map[string]any)
	if f == nil {
		f = map[string]any{}
	}
	for k, v := range map[string]any{"multivariate": nil, "payloads": map[string]any{}, "aggregation_group_type_index": nil} {
		if _, ok := f[k]; !ok {
			f[k] = v
		}
	}
	groups, _ := f["groups"].([]any)
	for _, g := range groups {
		group := g.(map[string]any)
		if _, ok := group["variant"]; !ok {
			group["variant"] = nil
		}
		if _, ok := group["properties"]; !ok {
			group["properties"] = []any{}
		}
	}
	obj["filters"] = f
	if v, ok := obj["evaluation_runtime"]; ok && v == nil {
		obj["evaluation_runtime"] = "all"
	}
	if _, ok := obj["version"].(int); ok {
		obj["version"] = float64(obj["version"].(int))
	}
}

const filters = `{"groups": [{"properties": [{"key": "email", "value": "@example.com", "operator": "icontains", "type": "person"}], "rollout_percentage": 50}],
 "payloads": {"true": "{\"theme\": \"dark\"}"}}`

func desired() *Model {
	return &Model{
		ProjectId:          cfntest.Ptr(project),
		Key:                cfntest.Ptr("new-checkout"),
		Name:               cfntest.Ptr("New checkout flow"),
		Filters:            cfntest.Ptr(filters),
		Tags:               []string{"checkout"},
		EvaluationContexts: []string{"web"},
	}
}

func listModel() *Model { return &Model{ProjectId: cfntest.Ptr(project)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil || *created.Key != "new-checkout" {
		t.Fatalf("create returned %+v", created)
	}
	// The template's JSON string survives PostHog's normalization.
	if created.Filters == nil || *created.Filters != filters {
		t.Fatalf("Filters = %v", created.Filters)
	}
	// Server defaults the template left out are not reported.
	if created.Active != nil || created.Archived != nil || created.EvaluationRuntime != nil ||
		created.BucketingIdentifier != nil || created.EnsureExperienceContinuity != nil || created.IsRemoteConfiguration != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	// Write-only evaluation contexts reach the API but are never returned.
	if created.EvaluationContexts != nil {
		t.Fatal("EvaluationContexts must not be returned")
	}
	stored := store.Get(parent, "1")
	if ctx, _ := stored["evaluation_contexts"].([]any); len(ctx) != 1 || ctx[0] != "web" {
		t.Fatalf("evaluation_contexts not sent: %v", stored["evaluation_contexts"])
	}
	if stored["active"] != true {
		t.Fatalf("flag must be created active by default: %v", stored["active"])
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "New checkout flow" || *read.Filters != filters || len(read.Tags) != 1 || read.EvaluationContexts != nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update: disable, change targeting, drop name/tags/contexts (cleared).
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Key: cfntest.Ptr("new-checkout-v2"),
		Active:            cfntest.Ptr(false),
		EvaluationRuntime: cfntest.Ptr("server"),
		Filters:           cfntest.Ptr(`{"groups":[{"rollout_percentage":100}],"multivariate":{"variants":[{"key":"a","rollout_percentage":50},{"key":"b","rollout_percentage":50}]}}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Key != "new-checkout-v2" || after.Active == nil || *after.Active || after.Name != nil || after.Tags != nil ||
		*after.EvaluationRuntime != "server" || *after.Filters != *updated.Filters {
		t.Fatalf("update returned %+v", after)
	}
	stored = store.Get(parent, "1")
	if stored["name"] != "" || len(stored["tags"].([]any)) != 0 || len(stored["evaluation_contexts"].([]any)) != 0 {
		t.Fatalf("removed properties not cleared: %v", stored)
	}
	// The version from the preceding read is sent for optimistic concurrency.
	patches := api.CallsTo("PATCH", "/api/projects/42/feature_flags/1/")
	if len(patches) != 1 {
		t.Fatalf("expected one PATCH, got %d", len(patches))
	}
	if v, ok := patches[0].Body["version"]; !ok || v != float64(0) {
		t.Fatalf("version not sent: %v", patches[0].Body)
	}

	// Removing Filters and EvaluationRuntime resets them.
	reset := &Model{ProjectId: created.ProjectId, Id: created.Id, Key: cfntest.Ptr("new-checkout-v2")}
	ev, err = Update(api.Request(t, reset, after), after, reset)
	cfntest.RequireSuccess(t, ev, err)
	final := ev.ResourceModel.(*Model)
	if final.Filters != nil || final.EvaluationRuntime != nil || final.Active != nil {
		t.Fatalf("reset returned %+v", final)
	}
	if store.Get(parent, "1")["active"] != true {
		t.Fatal("removing Active must re-enable the flag (the default)")
	}

	// List
	ev, err = List(api.Request(t, listModel(), nil), nil, listModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" || *ev.ResourceModels[0].(Model).Key != "new-checkout-v2" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete soft-deletes (PostHog refuses a hard DELETE for flags).
	ev, err = Delete(api.Request(t, final, nil), nil, final)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1")["deleted"] != true {
		t.Fatal("flag not soft-deleted")
	}

	// A soft-deleted flag is gone as far as CloudFormation is concerned.
	ev, err = Read(api.Request(t, final, nil), nil, final)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, final, final), final, final)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, final, nil), nil, final)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, listModel(), nil), nil, listModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted flag still listed: %+v", ev.ResourceModels)
	}
}

func TestDriftIsReported(t *testing.T) {
	api, store := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	// Someone changes the flag in the PostHog UI.
	obj := store.Get(parent, "1")
	obj["active"] = false
	obj["bucketing_identifier"] = "device_id"
	obj["filters"] = map[string]any{"groups": []any{map[string]any{"properties": []any{}, "rollout_percentage": 10}}}
	store.Put(parent, obj)

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if read.Active == nil || *read.Active || read.BucketingIdentifier == nil || *read.BucketingIdentifier != "device_id" {
		t.Fatalf("out-of-band changes not reported: %+v", read)
	}
	if read.Filters == nil || *read.Filters == filters {
		t.Fatalf("changed filters not reported: %v", read.Filters)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("999"), Key: cfntest.Ptr("x")}
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
	noProject := &Model{Key: cfntest.Ptr("x")}
	ev, err := Create(api.Request(t, noProject, nil), &Model{}, noProject)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noKey := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = Create(api.Request(t, noKey, nil), &Model{}, noKey)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	badJSON := desired()
	badJSON.Filters = cfntest.Ptr(`{"groups":`)
	ev, err = Create(api.Request(t, badJSON, nil), &Model{}, badJSON)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	notObject := desired()
	notObject.Filters = cfntest.Ptr(`[{"rollout_percentage": 10}]`)
	ev, err = Create(api.Request(t, notObject, nil), &Model{}, notObject)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	ev, err = List(api.Request(t, &Model{}, nil), nil, &Model{})
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
