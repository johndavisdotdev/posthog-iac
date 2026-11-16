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
	store := api.Collection("/api/projects/{project_id}/dashboards/", cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "description": "", "pinned": false, "tags": []any{},
			"filters": map[string]any{}, "breakdown_colors": []any{}, "data_color_theme_id": nil,
			"quick_filter_ids": nil, "tiles": []any{},
		},
		// PostHog folds the display presets into customization and fills in defaults.
		OnCreate: customize,
		OnUpdate: customize,
	})
	return api, store
}

func customize(obj map[string]any) {
	cz, _ := obj["customization"].(map[string]any)
	if cz == nil {
		cz = map[string]any{"tile_spacing": "standard", "layout_compaction": "vertical", "group_display": "sections"}
	}
	for in, out := range map[string]string{"grid_spacing": "tile_spacing", "layout_compaction": "layout_compaction", "group_display": "group_display"} {
		if v, ok := obj[in]; ok {
			cz[out] = v
			delete(obj, in)
		}
	}
	obj["customization"] = cz
	delete(obj, "use_template")
	delete(obj, "use_dashboard")
}

func desired() *Model {
	return &Model{
		ProjectId:        cfntest.Ptr(project),
		Name:             cfntest.Ptr("Growth"),
		Description:      cfntest.Ptr("Weekly growth metrics"),
		Pinned:           cfntest.Ptr(true),
		Tags:             []string{"growth"},
		Filters:          cfntest.Ptr(`{"date_from": "-30d", "filterTestAccounts": true}`),
		BreakdownColors:  []BreakdownColor{{BreakdownValue: cfntest.Ptr("Chrome"), ColorToken: cfntest.Ptr("preset-2")}},
		DataColorThemeId: cfntest.Ptr("7"),
		GridSpacing:      cfntest.Ptr("tight"),
		UseTemplate:      cfntest.Ptr("DEFAULT_APP"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil || *created.DataColorThemeId != "7" {
		t.Fatalf("create returned %+v", created)
	}
	if created.Filters == nil || *created.Filters != *model.Filters {
		t.Fatalf("Filters = %v", created.Filters)
	}
	if created.UseTemplate != nil {
		t.Fatal("write-only UseTemplate returned")
	}
	if *created.GridSpacing != "tight" || created.LayoutCompaction != nil || created.GroupDisplay != nil {
		t.Fatalf("display presets: %+v", created)
	}
	if len(created.BreakdownColors) != 1 || *created.BreakdownColors[0].ColorToken != "preset-2" {
		t.Fatalf("BreakdownColors = %+v", created.BreakdownColors)
	}
	post := api.CallsTo("POST", "/api/projects/42/dashboards/")[0].Body
	if post["use_template"] != "DEFAULT_APP" || post["data_color_theme_id"] != float64(7) {
		t.Fatalf("create body = %v", post)
	}
	// Filters are read-only on create, so they are set with a PATCH.
	if patches := api.CallsTo("PATCH", "/api/projects/42/dashboards/1/"); len(patches) != 1 || patches[0].Body["filters"] == nil {
		t.Fatalf("filters PATCH = %+v", patches)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Growth" || !*read.Pinned || len(read.Tags) != 1 || *read.Filters != *model.Filters {
		t.Fatalf("read returned %+v", read)
	}

	// An auto-assigned color is not reported.
	stored := store.Get(parent, "1")
	stored["breakdown_colors"] = append(stored["breakdown_colors"].([]any), map[string]any{"breakdownValue": "Safari", "colorToken": "preset-3", "source": "auto"})
	store.Put(parent, stored)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if n := len(ev.ResourceModel.(*Model).BreakdownColors); n != 1 {
		t.Fatalf("auto colors reported: %d", n)
	}

	// Update: rename and drop everything optional.
	updated := &Model{ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Growth v2")}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Growth v2" || after.Description != nil || after.Tags != nil || after.Pinned != nil ||
		after.Filters != nil || after.DataColorThemeId != nil || after.GridSpacing != nil {
		t.Fatalf("update returned %+v", after)
	}
	s := store.Get(parent, "1")
	if s["description"] != "" || s["pinned"] != false || s["data_color_theme_id"] != nil || len(s["filters"].(map[string]any)) != 0 {
		t.Fatalf("removed properties not cleared: %v", s)
	}
	if body := api.CallsTo("PATCH", "/api/projects/42/dashboards/1/")[1].Body; body["use_template"] != nil {
		t.Fatal("create-only use_template sent on update")
	}

	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1")["deleted"] != true {
		t.Fatal("dashboard not soft-deleted")
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
		t.Fatalf("deleted dashboard still listed: %+v", ev.ResourceModels)
	}
}

func TestCreateWithoutFiltersSkipsPatch(t *testing.T) {
	api, _ := newAPI(t)
	model := &Model{ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("Plain")}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Filters != nil || created.Pinned != nil || created.GridSpacing != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if n := len(api.CallsTo("PATCH", "/api/projects/42/dashboards/1/")); n != 0 {
		t.Fatalf("unexpected PATCH calls: %d", n)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("999"), Name: cfntest.Ptr("x")}
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
		"no project":  {Name: cfntest.Ptr("x")},
		"no name":     {ProjectId: cfntest.Ptr(project)},
		"bad filters": {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x"), Filters: cfntest.Ptr(`{"date_from":`)},
		"bad theme":   {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x"), DataColorThemeId: cfntest.Ptr("abc")},
		"bad source":  {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x"), UseDashboard: cfntest.Ptr("abc")},
		"bad color":   {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x"), BreakdownColors: []BreakdownColor{{ColorToken: cfntest.Ptr("preset-1")}}},
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
