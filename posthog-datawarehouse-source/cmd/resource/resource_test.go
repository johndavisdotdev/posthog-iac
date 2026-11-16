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
	store := api.Collection("/api/projects/{project_id}/external_data_sources/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "status": "Running", "prefix": nil, "description": nil,
			"access_method": "warehouse", "direct_query_enabled": false,
			"auto_sync_new_schemas": false, "auto_sync_schema_patterns": nil,
			"latest_error": nil, "last_run_at": nil,
		},
		// PostHog never echoes credentials back.
		WriteOnly: []string{"payload", "destination_ids", "job_inputs"},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		SourceType:  cfntest.Ptr("Postgres"),
		Payload:     cfntest.Ptr(`{"host": "db.example.com", "port": 5432, "password": "s3cret", "schemas": [{"name": "orders"}]}`),
		Prefix:      cfntest.Ptr("prod_"),
		Description: cfntest.Ptr("Production database"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	model.AutoSyncNewSchemas = cfntest.Ptr(true)
	model.AutoSyncSchemaPatterns = []string{"raw_*"}
	model.DestinationIds = []string{"0190a1b2-0000-7000-8000-00000000abcd"}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || *created.Status != "Running" || *created.SourceType != "Postgres" {
		t.Fatalf("create returned %+v", created)
	}
	if created.Payload != nil || created.DestinationIds != nil {
		t.Fatal("write-only properties must not be returned")
	}
	if created.AccessMethod != nil || created.DirectQueryEnabled != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if !*created.AutoSyncNewSchemas || len(created.AutoSyncSchemaPatterns) != 1 {
		t.Fatalf("auto-sync settings not applied: %+v", created)
	}
	posts := api.CallsTo("POST", "/api/projects/42/external_data_sources/")
	if len(posts) != 1 {
		t.Fatalf("expected one POST, got %d", len(posts))
	}
	sent := posts[0].Body
	if sent["source_type"] != "Postgres" || sent["payload"].(map[string]any)["host"] != "db.example.com" {
		t.Fatalf("create body = %v", sent)
	}
	if _, ok := sent["auto_sync_new_schemas"]; ok {
		t.Fatal("auto-sync settings are not accepted on create")
	}
	id := *created.Id

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Prefix != "prod_" || *read.Description != "Production database" || read.Payload != nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update without touching credentials: job_inputs must not be sent, and
	// removed properties are cleared.
	updated := &Model{ProjectId: created.ProjectId, Id: created.Id, SourceType: model.SourceType, Payload: model.Payload, DirectQueryEnabled: cfntest.Ptr(true)}
	ev, err = Update(api.Request(t, updated, model), model, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.Prefix != nil || after.Description != nil || after.AutoSyncNewSchemas != nil || after.AutoSyncSchemaPatterns != nil || !*after.DirectQueryEnabled {
		t.Fatalf("update returned %+v", after)
	}
	patches := api.CallsTo("PATCH", "/api/projects/42/external_data_sources/"+id+"/")
	last := patches[len(patches)-1].Body
	if _, ok := last["job_inputs"]; ok {
		t.Fatal("unchanged credentials must not be resent")
	}
	if last["prefix"] != "" || last["description"] != "" || last["auto_sync_new_schemas"] != false {
		t.Fatalf("update body = %v", last)
	}

	// Rotating credentials sends them as job_inputs, without the schemas list.
	rotated := *updated
	rotated.Payload = cfntest.Ptr(`{"host": "db.example.com", "port": 5432, "password": "n3w", "schemas": [{"name": "orders"}]}`)
	ev, err = Update(api.Request(t, &rotated, updated), updated, &rotated)
	cfntest.RequireSuccess(t, ev, err)
	patches = api.CallsTo("PATCH", "/api/projects/42/external_data_sources/"+id+"/")
	inputs, _ := patches[len(patches)-1].Body["job_inputs"].(map[string]any)
	if inputs["password"] != "n3w" || inputs["schemas"] != nil {
		t.Fatalf("job_inputs = %v", inputs)
	}
	if stored := store.Get(parent, id); stored["job_inputs"] == nil {
		t.Fatal("job_inputs not stored")
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
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("source not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestCreateWithoutAutoSyncDoesNotPatch(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	for _, c := range api.Calls() {
		if c.Method == "PATCH" {
			t.Fatal("unexpected PATCH on create")
		}
	}
	if ev.ResourceModel.(*Model).AutoSyncNewSchemas != nil {
		t.Fatal("default auto_sync_new_schemas leaked into the model")
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999"), SourceType: cfntest.Ptr("Postgres")}
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
	for name, m := range map[string]*Model{
		"no project":     {SourceType: cfntest.Ptr("Postgres"), Payload: cfntest.Ptr(`{}`)},
		"no source type": {ProjectId: cfntest.Ptr(project), Payload: cfntest.Ptr(`{}`)},
		"no payload":     {ProjectId: cfntest.Ptr(project), SourceType: cfntest.Ptr("Postgres")},
		"bad JSON":       {ProjectId: cfntest.Ptr(project), SourceType: cfntest.Ptr("Postgres"), Payload: cfntest.Ptr(`{"host":`)},
		"not an object":  {ProjectId: cfntest.Ptr(project), SourceType: cfntest.Ptr("Postgres"), Payload: cfntest.Ptr(`[1]`)},
	} {
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
