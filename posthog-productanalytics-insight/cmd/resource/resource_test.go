package resource

import (
	"fmt"
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const query = `{"kind": "InsightVizNode", "source": {"kind": "TrendsQuery", "series": [{"kind": "EventsNode", "event": "$pageview"}]}}`

// newAPI mounts a fake insights collection. With withDashboards false the
// fake behaves like PostHog once the deprecated dashboards field is no longer
// returned: only dashboard_tiles are.
func newAPI(t *testing.T, withDashboards bool) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	derive := func(obj map[string]any) {
		obj["short_id"] = fmt.Sprintf("Ab%06v", obj["id"])
		var tiles []any
		ds, _ := obj["dashboards"].([]any)
		for i, d := range ds {
			tiles = append(tiles, map[string]any{"id": i + 100, "dashboard_id": d, "deleted": nil})
		}
		obj["dashboard_tiles"] = tiles
		// Computed results must never reach the model.
		obj["result"] = []any{map[string]any{"count": 1234}}
		obj["hogql"] = "SELECT count() FROM events"
	}
	opts := cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "name": nil, "derived_name": nil, "description": nil,
			"tags": []any{}, "favorited": false, "dashboards": []any{}, "order": nil,
		},
		OnCreate: derive,
		OnUpdate: derive,
	}
	if !withDashboards {
		opts.WriteOnly = []string{"dashboards"}
	}
	store := api.Collection("/api/projects/{project_id}/insights/", opts)
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("Pageviews"),
		Description: cfntest.Ptr("Daily pageviews"),
		Query:       cfntest.Ptr(query),
		Tags:        []string{"web"},
		Dashboards:  []string{"7", "3"},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t, true)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.ShortId == nil || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Query != query || strings.Join(created.Dashboards, ",") != "3,7" || created.Favorited != nil {
		t.Fatalf("create returned %+v", created)
	}
	post := api.CallsTo("POST", "/api/projects/42/insights/")[0]
	if !strings.Contains(post.Query, "include_dashboards=true") {
		t.Fatalf("create query = %q", post.Query)
	}
	if ds := post.Body["dashboards"].([]any); len(ds) != 2 || ds[0] != float64(7) {
		t.Fatalf("dashboards sent as %v", post.Body["dashboards"])
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Pageviews" || *read.Query != query || len(read.Tags) != 1 || len(read.Dashboards) != 2 {
		t.Fatalf("read returned %+v", read)
	}
	get := api.CallsTo("GET", "/api/projects/42/insights/1/")[0]
	if !strings.Contains(get.Query, "refresh=force_cache") || !strings.Contains(get.Query, "include_dashboards=true") {
		t.Fatalf("read query = %q", get.Query)
	}

	// Update: new query, off every dashboard, no name/description/tags.
	newQuery := `{"kind": "DataVisualizationNode", "source": {"kind": "HogQLQuery", "query": "select count() from events"}}`
	updated := &Model{ProjectId: created.ProjectId, Id: created.Id, Query: cfntest.Ptr(newQuery), Favorited: cfntest.Ptr(true)}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Query != newQuery || after.Name != nil || after.Description != nil || after.Tags != nil || after.Dashboards != nil || !*after.Favorited {
		t.Fatalf("update returned %+v", after)
	}
	s := store.Get(parent, "1")
	if s["name"] != nil || s["description"] != "" || len(s["dashboards"].([]any)) != 0 {
		t.Fatalf("removed properties not cleared: %v", s)
	}

	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}
	if q := api.CallsTo("GET", "/api/projects/42/insights/")[0].Query; !strings.Contains(q, "basic=true") {
		t.Fatalf("list query = %q", q)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1")["deleted"] != true {
		t.Fatal("insight not soft-deleted")
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
		t.Fatalf("deleted insight still listed: %+v", ev.ResourceModels)
	}
}

func TestDashboardsFromTiles(t *testing.T) {
	api, store := newAPI(t, false)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if strings.Join(created.Dashboards, ",") != "3,7" {
		t.Fatalf("Dashboards = %v", created.Dashboards)
	}
	// A tile removed from a dashboard is not reported.
	s := store.Get(parent, "1")
	s["dashboard_tiles"].([]any)[0].(map[string]any)["deleted"] = true
	store.Put(parent, s)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if got := ev.ResourceModel.(*Model).Dashboards; strings.Join(got, ",") != "3" {
		t.Fatalf("Dashboards = %v", got)
	}
}

func TestQueryDrift(t *testing.T) {
	api, store := newAPI(t, true)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	// Keys PostHog adds are not drift...
	s := store.Get(parent, "1")
	s["query"].(map[string]any)["full"] = true
	store.Put(parent, s)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Query != query {
		t.Fatalf("Query = %s", *ev.ResourceModel.(*Model).Query)
	}
	// ...but a changed value is.
	s["query"].(map[string]any)["source"].(map[string]any)["kind"] = "LifecycleQuery"
	store.Put(parent, s)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Query == query {
		t.Fatal("changed query not reported")
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t, true)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("999"), Query: cfntest.Ptr(query)}
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
	api, store := newAPI(t, true)
	for name, m := range map[string]*Model{
		"no project":    {Query: cfntest.Ptr(query)},
		"no query":      {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x")},
		"bad query":     {ProjectId: cfntest.Ptr(project), Query: cfntest.Ptr(`{"kind":`)},
		"array query":   {ProjectId: cfntest.Ptr(project), Query: cfntest.Ptr(`[]`)},
		"bad dashboard": {ProjectId: cfntest.Ptr(project), Query: cfntest.Ptr(query), Dashboards: []string{"main"}},
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
