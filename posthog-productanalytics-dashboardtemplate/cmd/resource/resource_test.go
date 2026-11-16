package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const (
	tiles     = `[{"type": "INSIGHT", "name": "Signups", "query": {"kind": "InsightVizNode", "source": {"kind": "TrendsQuery", "series": [{"kind": "EventsNode", "event": "{VARIABLE_1}"}]}}, "layouts": {}}]`
	variables = `[{"id": "VARIABLE_1", "name": "Signup event", "type": "event", "default": {"id": "signed_up"}, "required": true, "description": "The event fired on sign-up"}]`
)

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/dashboard_templates/", cfntest.CollectionOptions{
		StringIDs:  true,
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "scope": "team", "tags": []any{},
			"dashboard_filters": nil, "tiles": []any{}, "variables": []any{}, "image_url": nil,
			"availability_contexts": nil, "customization": nil, "is_featured": false, "team_id": 42,
		},
		// PostHog adds a color to each tile.
		OnCreate: addTileColor,
		OnUpdate: addTileColor,
	})
	return api, store
}

func addTileColor(obj map[string]any) {
	ts, _ := obj["tiles"].([]any)
	for _, tile := range ts {
		if m := tile.(map[string]any); m["color"] == nil {
			m["color"] = "white"
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:            cfntest.Ptr(project),
		TemplateName:         cfntest.Ptr("Signup funnel"),
		DashboardDescription: cfntest.Ptr("Tracks sign-ups"),
		DashboardFilters:     cfntest.Ptr(`{"date_from": "-30d"}`),
		Tiles:                cfntest.Ptr(tiles),
		Variables:            cfntest.Ptr(variables),
		Tags:                 []string{"growth"},
		Customization:        &Customization{TileSpacing: cfntest.Ptr("relaxed")},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	id := "0190a1b2-0000-7000-8000-000000000001"
	if created.Id == nil || *created.Id != id || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// Template JSON strings are kept although PostHog added a tile color, and
	// the default scope is not reported.
	if *created.Tiles != tiles || *created.Variables != variables || *created.DashboardFilters != *model.DashboardFilters {
		t.Fatalf("JSON properties changed: %+v", created)
	}
	if created.Scope != nil {
		t.Fatalf("default scope reported: %v", *created.Scope)
	}
	if created.Customization == nil || *created.Customization.TileSpacing != "relaxed" {
		t.Fatalf("Customization = %+v", created.Customization)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.TemplateName != "Signup funnel" || *read.Tiles != tiles || len(read.Tags) != 1 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename, organization scope, drop everything else.
	updated := &Model{ProjectId: created.ProjectId, Id: created.Id, TemplateName: cfntest.Ptr("Signups"), Scope: cfntest.Ptr("organization")}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.TemplateName != "Signups" || *after.Scope != "organization" || after.Tiles != nil || after.Variables != nil ||
		after.DashboardFilters != nil || after.DashboardDescription != nil || after.Tags != nil || after.Customization != nil {
		t.Fatalf("update returned %+v", after)
	}
	s := store.Get(parent, id)
	if len(s["tiles"].([]any)) != 0 || s["dashboard_filters"] != nil || s["customization"] != nil || s["dashboard_description"] != "" {
		t.Fatalf("removed properties not cleared: %v", s)
	}

	// Official templates in the list are not project resources.
	store.Put(parent, map[string]any{"id": "global-1", "template_name": "Product analytics", "scope": "global"})
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, id)["deleted"] != true {
		t.Fatal("template not soft-deleted")
	}

	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted template still listed: %+v", ev.ResourceModels)
	}
}

func TestTileDriftIsReported(t *testing.T) {
	api, store := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	s := store.Get(parent, *created.Id)
	s["tiles"].([]any)[0].(map[string]any)["name"] = "Renamed in the UI"
	store.Put(parent, s)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Tiles == tiles {
		t.Fatal("changed tiles not reported")
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999"), TemplateName: cfntest.Ptr("x")}
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
		"no project":     {TemplateName: cfntest.Ptr("x")},
		"no name":        {ProjectId: cfntest.Ptr(project)},
		"bad tiles":      {ProjectId: cfntest.Ptr(project), TemplateName: cfntest.Ptr("x"), Tiles: cfntest.Ptr(`[{"type":`)},
		"tiles object":   {ProjectId: cfntest.Ptr(project), TemplateName: cfntest.Ptr("x"), Tiles: cfntest.Ptr(`{"type": "TEXT"}`)},
		"bad variables":  {ProjectId: cfntest.Ptr(project), TemplateName: cfntest.Ptr("x"), Variables: cfntest.Ptr(`nope`)},
		"bad filters":    {ProjectId: cfntest.Ptr(project), TemplateName: cfntest.Ptr("x"), DashboardFilters: cfntest.Ptr(`{`)},
		"bad cust group": {ProjectId: cfntest.Ptr(project), TemplateName: cfntest.Ptr("x"), Customization: &Customization{Groups: cfntest.Ptr(`{`)}},
	} {
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %q (%v)", name, ev.HandlerErrorCode, err)
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
