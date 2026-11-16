package resource

import (
	"net/http"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const collection = "/api/projects/" + project + "/event_definitions/"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/event_definitions/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "description": nil, "tags": []any{}, "owner": nil,
			"verified": false, "hidden": nil, "enforcement_mode": "allow", "primary_property": nil,
			"post_to_slack": false, "default_columns": []any{}, "last_seen_at": nil,
		},
		OnCreate: expandOwner,
		OnUpdate: expandOwner,
	})
	return api, store
}

// expandOwner imitates PostHog, which takes the owner as a user ID and
// returns it as a user object.
func expandOwner(obj map[string]any) {
	if id, ok := obj["owner"].(float64); ok {
		obj["owner"] = map[string]any{"id": id, "email": "owner@example.com"}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:       cfntest.Ptr(project),
		Name:            cfntest.Ptr("signed_up"),
		Description:     cfntest.Ptr("User finished the sign-up flow"),
		Tags:            []string{"growth"},
		Owner:           cfntest.Ptr("5"),
		Verified:        cfntest.Ptr(true),
		PrimaryProperty: cfntest.Ptr("plan"),
		DefaultColumns:  []string{"person", "properties.plan"},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	id := "0190a1b2-0000-7000-8000-000000000001"
	if created.Id == nil || *created.Id != id || created.CreatedAt == nil || *created.Name != "signed_up" {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Owner != "5" || *created.Verified != true || len(created.DefaultColumns) != 2 {
		t.Fatalf("create returned %+v", created)
	}
	// Server defaults the template did not set are not reported.
	if created.Hidden != nil || created.PostToSlack != nil || created.EnforcementMode != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Description != *model.Description || *read.Owner != "5" || len(read.Tags) != 1 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: drop description, tags, owner and columns (cleared), reject
	// events that don't match the schema.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: created.Name,
		EnforcementMode: cfntest.Ptr("reject"), Hidden: cfntest.Ptr(true),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.Description != nil || after.Tags != nil || after.Owner != nil || after.DefaultColumns != nil || after.Verified != nil {
		t.Fatalf("update returned %+v", after)
	}
	if *after.EnforcementMode != "reject" || *after.Hidden != true {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["owner"] != nil || stored["description"] != "" || stored["verified"] != false || stored["name"] != "signed_up" {
		t.Fatalf("fields not cleared: %v", stored)
	}
	if _, ok := api.CallsTo("PATCH", collection+id+"/")[0].Body["name"]; ok {
		t.Fatal("create-only name sent on update")
	}

	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("event definition not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestCreateExistingNameIsAlreadyExists(t *testing.T) {
	api, store := newAPI(t)
	// Ingestion created the definition before the stack did.
	store.Put(parent, map[string]any{"id": "0190a1b2-0000-7000-8000-00000000abcd", "name": "signed_up"})
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireFailed(t, ev, err, "AlreadyExists")
	if len(api.CallsTo("POST", collection)) != 0 {
		t.Fatal("create must not POST when the name exists")
	}
	if q := api.CallsTo("GET", collection)[0].Query; q == "" {
		t.Fatal("lookup should filter by name")
	}
}

func TestCreateConflictFromAPIIsAlreadyExists(t *testing.T) {
	api := cfntest.NewAPI(t)
	api.Handle("GET /api/projects/{project_id}/event_definitions/", func(w http.ResponseWriter, r *http.Request) { cfntest.List(w) })
	api.Handle("POST /api/projects/{project_id}/event_definitions/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.Error(w, http.StatusBadRequest, "validation_error", "unique", "Event definition with this name already exists.")
	})
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireFailed(t, ev, err, "AlreadyExists")
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("0190a1b2-0000-7000-8000-999999999999")
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
		"no project": func(m *Model) { m.ProjectId = nil },
		"no name":    func(m *Model) { m.Name = nil },
		"bad owner":  func(m *Model) { m.Owner = cfntest.Ptr("me") },
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s %q (%v)", name, ev.HandlerErrorCode, ev.Message, err)
		}
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if len(api.Calls()) != 0 || store.Len() != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
