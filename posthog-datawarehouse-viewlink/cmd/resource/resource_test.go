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
	store := api.Collection("/api/projects/{project_id}/warehouse_view_links/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults:  map[string]any{"created_at": "2026-01-01T00:00:00Z", "deleted": false},
		// PostHog stores an empty configuration as {}.
		OnCreate: emptyConfiguration,
		OnUpdate: emptyConfiguration,
	})
	return api, store
}

func emptyConfiguration(obj map[string]any) {
	if obj["configuration"] == nil {
		obj["configuration"] = map[string]any{}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:        cfntest.Ptr(project),
		SourceTableName:  cfntest.Ptr("persons"),
		SourceTableKey:   cfntest.Ptr("properties.email"),
		JoiningTableName: cfntest.Ptr("stripe_customer"),
		JoiningTableKey:  cfntest.Ptr("email"),
		FieldName:        cfntest.Ptr("stripe_customer"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	model.Configuration = cfntest.Ptr(`{ "experiments_optimized": true,  "experiments_timestamp_key": "timestamp" }`)
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || *created.FieldName != "stripe_customer" {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Configuration != *model.Configuration {
		t.Fatalf("Configuration = %s, want the template's string", *created.Configuration)
	}
	id := *created.Id
	if cfg := store.Get(parent, id)["configuration"].(map[string]any); cfg["experiments_optimized"] != true {
		t.Fatalf("configuration not sent: %v", cfg)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if read := ev.ResourceModel.(*Model); *read.SourceTableKey != "properties.email" || read.Configuration == nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update: new key, configuration removed (cleared with null).
	updated := desired()
	updated.Id = created.Id
	updated.SourceTableKey = cfntest.Ptr("lower(properties.email)")
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.SourceTableKey != "lower(properties.email)" || after.Configuration != nil {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/warehouse_view_links/"+id+"/")[0]
	if v, ok := patch.Body["configuration"]; !ok || v != nil {
		t.Fatalf("configuration not cleared: %s", patch.Raw)
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("delete must remove the join and carry no model")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestSoftDeletedIsNotFound(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{"id": "abc", "field_name": "x", "deleted": true})
	m := desired()
	m.Id = cfntest.Ptr("abc")
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, m, m), m, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("soft-deleted join listed: %+v", ev.ResourceModels)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("missing")
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
	noProject := desired()
	noProject.ProjectId = nil
	noField := desired()
	noField.FieldName = nil
	noKey := desired()
	noKey.JoiningTableKey = cfntest.Ptr("")
	badJSON := desired()
	badJSON.Configuration = cfntest.Ptr(`{"a":`)
	for name, m := range map[string]*Model{"no project": noProject, "no field": noField, "no key": noKey, "bad JSON": badJSON} {
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %q", name, ev.HandlerErrorCode)
		}
		cfntest.RequireFailed(t, ev, err, "InvalidRequest")
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
