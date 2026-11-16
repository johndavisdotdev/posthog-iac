package resource

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const collection = "/api/projects/" + project + "/session_recording_playlists/"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	n := 0
	store := api.Collection("/api/projects/{project_id}/session_recording_playlists/", cfntest.CollectionOptions{
		IDField:    "short_id",
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "name": nil, "derived_name": nil, "description": "",
			"pinned": false, "filters": map[string]any{}, "is_synthetic": false, "recordings_counts": map[string]any{},
		},
		WriteOnly: []string{"_create_in_folder", "creation_method"},
		// PostHog assigns both a numeric id and a short_id.
		OnCreate: func(obj map[string]any) {
			n++
			obj["id"] = n
			obj["short_id"] = fmt.Sprintf("Pl%d", n)
		},
	})
	return api, store
}

const filtersJSON = `{ "date_from": "-7d", "filter_test_accounts": true, "duration": [{"key": "duration", "type": "recording", "value": 60, "operator": "gt"}] }`

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Type:        cfntest.Ptr("filters"),
		Name:        cfntest.Ptr("Long sessions"),
		Description: cfntest.Ptr("Sessions over a minute"),
		Pinned:      cfntest.Ptr(true),
		Filters:     cfntest.Ptr(filtersJSON),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.ShortId == nil || *created.ShortId != "Pl1" || *created.Id != "1" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// The template's JSON string is kept verbatim when equal to the API value.
	if *created.Filters != filtersJSON || *created.Type != "filters" || *created.Pinned != true {
		t.Fatalf("create returned %+v", created)
	}
	post := api.CallsTo("POST", collection)[0].Body
	if post["type"] != "filters" || post["filters"].(map[string]any)["date_from"] != "-7d" {
		t.Fatalf("create body = %v", post)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if read := ev.ResourceModel.(*Model); *read.Name != "Long sessions" || *read.Filters != filtersJSON {
		t.Fatalf("read returned %+v", read)
	}

	// Update: drop name, description, pinned and filters (cleared).
	updated := &Model{ProjectId: created.ProjectId, ShortId: created.ShortId, Type: created.Type}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.Name != nil || after.Description != nil || after.Pinned != nil || after.Filters != nil {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, "Pl1")
	if stored["name"] != nil || stored["description"] != "" || stored["pinned"] != false || len(stored["filters"].(map[string]any)) != 0 {
		t.Fatalf("fields not cleared: %v", stored)
	}
	if _, ok := api.CallsTo("PATCH", collection+"Pl1/")[0].Body["type"]; ok {
		t.Fatal("create-only type sent on update")
	}

	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).ShortId != "Pl1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "Pl1")["deleted"] != true {
		t.Fatal("playlist not soft-deleted")
	}

	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted playlist still listed: %+v", ev.ResourceModels)
	}
}

func TestCollectionPlaylistDefaultsNoDrift(t *testing.T) {
	api, _ := newAPI(t)
	model := &Model{ProjectId: cfntest.Ptr(project), Type: cfntest.Ptr("collection"), Name: cfntest.Ptr("Bugs")}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	got := ev.ResourceModel.(*Model)
	if got.Filters != nil || got.Pinned != nil || got.Description != nil {
		t.Fatalf("server defaults leaked into the model: %+v", got)
	}
	if _, ok := api.CallsTo("POST", collection)[0].Body["filters"]; ok {
		t.Fatal("filters sent for a collection playlist without Filters")
	}
}

func TestTypeChangeIsNotUpdatable(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	changed := *created
	changed.Type = cfntest.Ptr("collection")
	ev, err = Update(api.Request(t, &changed, created), created, &changed)
	cfntest.RequireFailed(t, ev, err, "NotUpdatable")
}

func TestListSkipsSyntheticPlaylists(t *testing.T) {
	api := cfntest.NewAPI(t)
	api.Handle("GET /api/projects/{project_id}/session_recording_playlists/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.List(w,
			map[string]any{"id": nil, "short_id": "synthetic-watch-history", "is_synthetic": true},
			map[string]any{"id": 3, "short_id": "Abc", "is_synthetic": false})
	})
	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err := List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).ShortId != "Abc" || *ev.ResourceModels[0].(Model).Id != "3" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.ShortId = cfntest.Ptr("nope")
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
		"no project":      func(m *Model) { m.ProjectId = nil },
		"no type":         func(m *Model) { m.Type = nil },
		"invalid JSON":    func(m *Model) { m.Filters = cfntest.Ptr(`{"date_from":`) },
		"non-object JSON": func(m *Model) { m.Filters = cfntest.Ptr(`[1, 2]`) },
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
