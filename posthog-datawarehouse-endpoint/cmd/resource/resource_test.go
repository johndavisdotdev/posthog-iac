package resource

import (
	"fmt"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	n := 0
	store := api.Collection("/api/projects/{project_id}/endpoints/", cfntest.CollectionOptions{
		IDField: "name",
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "description": nil,
			"data_freshness_seconds": 86400, "is_active": true, "is_materialized": false,
			"derived_from_insight": nil, "bucket_overrides": nil, "tags": []any{},
			"optional_breakdown_properties": []any{}, "current_version": 1,
			"materialization": map[string]any{"name": "", "enabled": false, "ready": false, "can_materialize": true},
		},
		OnCreate: func(obj map[string]any) {
			n++
			obj["id"] = fmt.Sprintf("0190a1b2-0000-7000-8000-%012d", n)
			obj["endpoint_path"] = "/api/projects/42/endpoints/" + obj["name"].(string) + "/run"
			obj["url"] = "https://us.posthog.com" + obj["endpoint_path"].(string)
			activeFlag(obj)
		},
		OnUpdate: func(obj map[string]any) {
			activeFlag(obj)
			if obj["is_materialized"] == true {
				obj["materialization"].(map[string]any)["status"] = "Running"
			}
		},
	})
	return api, store
}

// The single-item GET describes the current version: its is_active is the
// version's flag, and endpoint_is_active the endpoint's.
func activeFlag(obj map[string]any) {
	if v, ok := obj["is_active"]; ok {
		obj["endpoint_is_active"] = v
	}
	obj["is_active"] = true
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("daily-signups"),
		Query:       cfntest.Ptr(`{"kind": "HogQLQuery",  "query": "SELECT count() FROM events WHERE event = 'signed_up'"}`),
		Description: cfntest.Ptr("Sign-ups today"),
		Tags:        []string{"growth"},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)
	name := "daily-signups"

	// Create
	model := desired()
	model.BucketOverrides = map[string]string{"day": "1d"}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Name != name || *created.EndpointPath != "/api/projects/42/endpoints/daily-signups/run" || *created.CurrentVersion != 1 {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Query != *model.Query {
		t.Fatalf("Query = %s, want the template's string", *created.Query)
	}
	if created.DataFreshnessSeconds != nil || created.IsActive != nil || created.IsMaterialized != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if created.BucketOverrides["day"] != "1d" || len(created.Tags) != 1 {
		t.Fatalf("create returned %+v", created)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Description != "Sign-ups today" || *read.Id != *created.Id || read.IsActive != nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update with the same query: it is not resent (that would create a new
	// version). Deactivate, materialize, and drop description/tags/overrides.
	updated := &Model{
		ProjectId: created.ProjectId, Name: created.Name,
		Query:                cfntest.Ptr(`{"query":"SELECT count() FROM events WHERE event = 'signed_up'","kind":"HogQLQuery"}`),
		IsActive:             cfntest.Ptr(false),
		IsMaterialized:       cfntest.Ptr(true),
		DataFreshnessSeconds: cfntest.Ptr(3600),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.IsActive || !*after.IsMaterialized || *after.DataFreshnessSeconds != 3600 || *after.MaterializationStatus != "Running" {
		t.Fatalf("update returned %+v", after)
	}
	if after.Description != nil || after.Tags != nil || after.BucketOverrides != nil {
		t.Fatalf("fields not cleared: %+v", after)
	}
	if *after.Query != *updated.Query {
		t.Fatal("JSON-equal query not preserved")
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/endpoints/"+name+"/")[0].Body
	if _, ok := patch["query"]; ok {
		t.Fatal("unchanged query must not be sent")
	}
	if _, ok := patch["name"]; ok {
		t.Fatal("name is create-only and must not be sent")
	}

	// A changed query is sent; removed properties go back to the defaults.
	changed := &Model{ProjectId: created.ProjectId, Name: created.Name, Query: cfntest.Ptr(`{"kind":"HogQLQuery","query":"SELECT 1"}`)}
	ev, err = Update(api.Request(t, changed, updated), updated, changed)
	cfntest.RequireSuccess(t, ev, err)
	patches := api.CallsTo("PATCH", "/api/projects/42/endpoints/"+name+"/")
	last := patches[len(patches)-1].Body
	if last["query"] == nil || last["is_active"] != true || last["data_freshness_seconds"] != float64(86400) || last["is_materialized"] != false {
		t.Fatalf("update body = %v", last)
	}
	if m := ev.ResourceModel.(*Model); m.IsActive != nil || m.DataFreshnessSeconds != nil || m.IsMaterialized != nil {
		t.Fatalf("defaults reported after reset: %+v", m)
	}

	// List returns the name-based primary identifier.
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Name != name {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("delete must remove the endpoint and carry no model")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestSoftDeletedIsNotFound(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{"name": "old", "id": "x", "deleted": true})
	m := desired()
	m.Name = cfntest.Ptr("old")
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, m, m), m, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Name = cfntest.Ptr("missing")
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
	noName := desired()
	noName.Name = nil
	badJSON := desired()
	badJSON.Query = cfntest.Ptr(`{"kind":`)
	notObject := desired()
	notObject.Query = cfntest.Ptr(`"SELECT 1"`)
	for name, m := range map[string]*Model{"no project": noProject, "no name": noName, "bad JSON": badJSON, "not an object": notObject} {
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
