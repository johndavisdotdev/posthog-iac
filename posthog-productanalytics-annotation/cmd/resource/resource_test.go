package resource

import (
	"testing"
	"time"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	// PostHog stores date_marker as a timestamp and returns it normalised.
	normalize := func(obj map[string]any) {
		if s, ok := obj["date_marker"].(string); ok {
			if ts, ok := parseTime(s); ok {
				obj["date_marker"] = ts.UTC().Format(time.RFC3339)
			}
		}
	}
	store := api.Collection("/api/projects/{project_id}/annotations/", cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"creation_type": "USR", "emoji": nil, "hidden_in_user_interface": nil,
			"dashboard_item": nil, "dashboard_id": nil,
		},
		OnCreate: normalize,
		OnUpdate: normalize,
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Content:     cfntest.Ptr("Released v2.0"),
		DateMarker:  cfntest.Ptr("2026-05-01T14:00:00.000+02:00"),
		Scope:       cfntest.Ptr("dashboard"),
		DashboardId: cfntest.Ptr("7"),
		Emoji:       cfntest.Ptr("🚀"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil || created.UpdatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// The template's timestamp is kept when PostHog returns the same instant.
	if *created.DateMarker != *model.DateMarker {
		t.Fatalf("DateMarker = %s", *created.DateMarker)
	}
	if created.CreationType != nil || created.HiddenInUserInterface != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	stored := store.Get(parent, "1")
	if stored["dashboard_id"] != float64(7) || stored["creation_type"] != "USR" {
		t.Fatalf("stored %+v", stored)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Content != "Released v2.0" || *read.DashboardId != "7" || *read.Emoji != "🚀" || *read.Scope != "dashboard" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: project scope, drop dashboard and emoji (must be cleared), hide it.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Content: cfntest.Ptr("Deploy 123"),
		DateMarker: cfntest.Ptr("2026-05-02T09:00:00Z"), Scope: cfntest.Ptr("project"),
		CreationType: cfntest.Ptr("GIT"), HiddenInUserInterface: cfntest.Ptr(true),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Content != "Deploy 123" || after.DashboardId != nil || after.Emoji != nil ||
		*after.CreationType != "GIT" || !*after.HiddenInUserInterface || *after.DateMarker != "2026-05-02T09:00:00Z" {
		t.Fatalf("update returned %+v", after)
	}
	if stored := store.Get(parent, "1"); stored["dashboard_id"] != nil || stored["emoji"] != nil {
		t.Fatalf("dashboard_id/emoji not cleared: %+v", stored)
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete soft-deletes (PostHog refuses a hard DELETE for annotations).
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1")["deleted"] != true {
		t.Fatal("annotation not soft-deleted")
	}

	// A soft-deleted annotation is gone as far as CloudFormation is concerned.
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted annotation still listed: %+v", ev.ResourceModels)
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
		"no content":        func(m *Model) { m.Content = nil },
		"no date":           func(m *Model) { m.DateMarker = nil },
		"bad date":          func(m *Model) { m.DateMarker = cfntest.Ptr("yesterday") },
		"no scope":          func(m *Model) { m.Scope = nil },
		"non-numeric dash":  func(m *Model) { m.DashboardId = cfntest.Ptr("abc") },
		"non-numeric insig": func(m *Model) { m.DashboardItem = cfntest.Ptr("xyz12") },
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s (%v)", name, ev.HandlerErrorCode, err)
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
