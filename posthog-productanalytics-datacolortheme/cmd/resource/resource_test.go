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
	store := api.Collection("/api/projects/{project_id}/data_color_themes/", cfntest.CollectionOptions{
		Defaults: map[string]any{"created_at": "2026-01-01T00:00:00Z", "is_global": false, "colors": []any{}},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId: cfntest.Ptr(project),
		Name:      cfntest.Ptr("Brand"),
		Colors:    []string{"#1d4aff", "#621da6", "#42827e"},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)
	// A built-in global theme the List handler must skip.
	store.Put(parent, map[string]any{"id": 100, "name": "Default", "colors": []any{"#000000"}, "is_global": true})

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil || len(created.Colors) != 3 || created.Colors[1] != "#621da6" {
		t.Fatalf("create returned %+v", created)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Brand" || len(read.Colors) != 3 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename and drop colors (must be cleared).
	updated := &Model{ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Brand v2")}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Brand v2" || after.Colors != nil {
		t.Fatalf("update returned %+v", after)
	}
	if c, _ := store.Get(parent, "1")["colors"].([]any); len(c) != 0 {
		t.Fatalf("colors not cleared: %v", c)
	}

	// List skips the global theme.
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1") != nil {
		t.Fatal("theme not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
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
	noProject := desired()
	noProject.ProjectId = nil
	ev, err := Create(api.Request(t, noProject, nil), &Model{}, noProject)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noName := desired()
	noName.Name = nil
	ev, err = Create(api.Request(t, noName, nil), &Model{}, noName)
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
