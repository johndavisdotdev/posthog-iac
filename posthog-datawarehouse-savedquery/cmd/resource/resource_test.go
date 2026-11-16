package resource

import (
	"net/http"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/warehouse_saved_queries/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": nil, "description": nil,
			"sync_frequency": nil, "incremental": nil, "folder_id": nil, "is_test": false,
			"status": nil, "is_materialized": false, "last_run_at": nil, "latest_error": nil,
			"latest_history_id": "rev-1", "deleted": false,
		},
		WriteOnly: []string{"edited_history_id", "acknowledge_breaking_changes", "soft_update"},
		OnCreate:  fillIncrementalDefaults,
		OnUpdate: func(obj map[string]any) {
			fillIncrementalDefaults(obj)
			if obj["sync_frequency"] != nil {
				obj["status"] = "Running"
				obj["is_materialized"] = true
			}
		},
	})
	return api, store
}

// PostHog fills in incremental defaults the request left out.
func fillIncrementalDefaults(obj map[string]any) {
	if inc, ok := obj["incremental"].(map[string]any); ok {
		if inc["enabled"] == nil {
			inc["enabled"] = false
		}
		if inc["lookback_seconds"] == nil {
			inc["lookback_seconds"] = 0
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("daily_signups"),
		Query:       cfntest.Ptr(`{"kind": "HogQLQuery",  "query": "SELECT toDate(timestamp) AS day, count() AS n FROM events WHERE event = 'signed_up' GROUP BY day"}`),
		Description: cfntest.Ptr("One row per day"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	model.Incremental = &Incremental{IncrementalKey: cfntest.Ptr("day"), UniqueKey: []string{"day"}}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || *created.Name != "daily_signups" {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Query != *model.Query {
		t.Fatalf("Query = %s, want the template's string", *created.Query)
	}
	if created.IsTest != nil || created.SyncFrequency != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if inc := created.Incremental; inc == nil || *inc.IncrementalKey != "day" || inc.Enabled != nil || inc.LookbackSeconds != nil {
		t.Fatalf("Incremental = %+v", created.Incremental)
	}
	sent := api.CallsTo("POST", "/api/projects/42/warehouse_saved_queries/")[0].Body
	if sent["query"].(map[string]any)["kind"] != "HogQLQuery" {
		t.Fatalf("create body = %v", sent)
	}
	if _, ok := sent["sync_frequency"]; ok {
		t.Fatal("unset sync_frequency must not be sent on create")
	}
	id := *created.Id

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Description != "One row per day" || read.AcknowledgeBreakingChanges != nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update: new query and a schedule; description and incremental removed.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: created.Name,
		Query:         cfntest.Ptr(`{"kind":"HogQLQuery","query":"SELECT 1"}`),
		SyncFrequency: cfntest.Ptr("24hour"),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.Description != nil || after.Incremental != nil || *after.SyncFrequency != "24hour" {
		t.Fatalf("update returned %+v", after)
	}
	if *after.Status != "Running" || !*after.IsMaterialized {
		t.Fatalf("materialization status not reported: %+v", after)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/warehouse_saved_queries/"+id+"/")[0].Body
	if patch["edited_history_id"] != "rev-1" {
		t.Fatalf("edited_history_id = %v", patch["edited_history_id"])
	}
	if stored := store.Get(parent, id); stored["description"] != "" || stored["incremental"] != nil {
		t.Fatalf("fields not cleared: %v", stored)
	}

	// Unchanged schedule is not resent.
	ev, err = Update(api.Request(t, updated, updated), updated, updated)
	cfntest.RequireSuccess(t, ev, err)
	patches := api.CallsTo("PATCH", "/api/projects/42/warehouse_saved_queries/"+id+"/")
	if _, ok := patches[len(patches)-1].Body["sync_frequency"]; ok {
		t.Fatal("unchanged sync_frequency resent")
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
		t.Fatal("delete must remove the saved query and carry no model")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestDeletedFlagIsNotFound(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{"id": "abc", "name": "old", "query": map[string]any{"kind": "HogQLQuery", "query": "SELECT 1"}, "deleted": true})
	m := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("abc"), Name: cfntest.Ptr("old"), Query: cfntest.Ptr(`{"kind":"HogQLQuery","query":"SELECT 1"}`)}
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, m, m), m, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
}

func TestListSkipsDeleted(t *testing.T) {
	api := cfntest.NewAPI(t)
	api.Handle("GET /api/projects/{project_id}/warehouse_saved_queries/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.List(w, map[string]any{"id": "a", "deleted": false}, map[string]any{"id": "b", "deleted": true})
	})
	m := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err := List(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "a" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
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
	noName := desired()
	noName.Name = nil
	badJSON := desired()
	badJSON.Query = cfntest.Ptr(`{"kind":`)
	noQuery := desired()
	noQuery.Query = nil
	for name, m := range map[string]*Model{"no project": noProject, "no name": noName, "bad JSON": badJSON, "no query": noQuery} {
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
