package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const filters = `{"properties": {"type": "OR", "values": [{"type": "AND", "values": [{"key": "email", "type": "person", "value": "@example.com", "operator": "icontains"}]}]}}`

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/cohorts/", cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "description": "", "is_static": false,
			"filters": nil, "query": nil, "count": 0, "is_calculating": true,
		},
		OnCreate: enrich,
		OnUpdate: enrich,
	})
	return api, store
}

// enrich mimics PostHog: it derives cohort_type and adds bytecode to each
// property filter.
func enrich(obj map[string]any) {
	if obj["cohort_type"] == nil {
		obj["cohort_type"] = "person_property"
	}
	f, _ := obj["filters"].(map[string]any)
	if f == nil {
		obj["filters"] = map[string]any{"properties": map[string]any{}}
		return
	}
	outer, _ := f["properties"].(map[string]any)
	groups, _ := outer["values"].([]any)
	for _, g := range groups {
		inner, _ := g.(map[string]any)["values"].([]any)
		for _, p := range inner {
			p.(map[string]any)["bytecode"] = []any{"_H", 1}
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("Example.com users"),
		Description: cfntest.Ptr("Persons with an example.com email"),
		Filters:     cfntest.Ptr(filters),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// The template's filters are kept although PostHog added bytecode, and the
	// derived cohort_type and default is_static are not reported.
	if *created.Filters != filters {
		t.Fatalf("Filters = %s", *created.Filters)
	}
	if created.CohortType != nil || created.IsStatic != nil || created.Query != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if body := api.CallsTo("POST", "/api/projects/42/cohorts/")[0].Body; body["is_static"] != false {
		t.Fatalf("create body = %v", body)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Example.com users" || *read.Filters != filters {
		t.Fatalf("read returned %+v", read)
	}

	// Drift: someone changes the filter value in PostHog.
	stored := store.Get(parent, "1")
	stored["filters"].(map[string]any)["properties"].(map[string]any)["values"].([]any)[0].(map[string]any)["values"].([]any)[0].(map[string]any)["value"] = "@other.com"
	store.Put(parent, stored)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if got := *ev.ResourceModel.(*Model).Filters; got == filters {
		t.Fatal("changed filters not reported")
	}

	// Update: rename, drop the description and switch to a HogQL query.
	query := `{"kind": "HogQLQuery", "query": "select person_id from events where event = 'signed_up'"}`
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Signed up"),
		Query: cfntest.Ptr(query), CohortType: cfntest.Ptr("analytical"),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Signed up" || after.Description != nil || after.Filters != nil || *after.Query != query || *after.CohortType != "analytical" {
		t.Fatalf("update returned %+v", after)
	}
	body := api.CallsTo("PATCH", "/api/projects/42/cohorts/1/")[0].Body
	if body["description"] != "" || body["filters"] != nil {
		t.Fatalf("removed properties not cleared: %v", body)
	}
	if _, sent := body["is_static"]; sent {
		t.Fatal("create-only is_static sent on update")
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
		t.Fatal("cohort not soft-deleted")
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
		t.Fatalf("deleted cohort still listed: %+v", ev.ResourceModels)
	}
}

func TestStaticCohort(t *testing.T) {
	api, _ := newAPI(t)
	model := &Model{ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("Beta testers"), IsStatic: cfntest.Ptr(true)}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.IsStatic == nil || !*created.IsStatic || created.Filters != nil {
		t.Fatalf("create returned %+v", created)
	}
	// IsStatic is create-only.
	changed := *created
	changed.IsStatic = cfntest.Ptr(false)
	ev, err = Update(api.Request(t, &changed, created), created, &changed)
	cfntest.RequireFailed(t, ev, err, "NotUpdatable")
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
	noProject := &Model{Name: cfntest.Ptr("x")}
	ev, err := Create(api.Request(t, noProject, nil), &Model{}, noProject)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noName := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = Create(api.Request(t, noName, nil), &Model{}, noName)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	badJSON := desired()
	badJSON.Filters = cfntest.Ptr(`{"properties":`)
	ev, err = Create(api.Request(t, badJSON, nil), &Model{}, badJSON)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	badQuery := desired()
	badQuery.Query = cfntest.Ptr(`not json`)
	ev, err = Create(api.Request(t, badQuery, nil), &Model{}, badQuery)
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
