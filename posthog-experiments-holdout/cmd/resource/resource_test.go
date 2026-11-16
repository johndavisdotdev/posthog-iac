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
	store := api.Collection("/api/projects/{project_id}/experiment_holdouts/", cfntest.CollectionOptions{
		Defaults: map[string]any{"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "description": nil},
		// PostHog sets every group's variant to holdout-<id> and fills in
		// missing members.
		OnCreate: setVariant,
		OnUpdate: setVariant,
	})
	return api, store
}

func setVariant(obj map[string]any) {
	groups, _ := obj["filters"].([]any)
	for _, g := range groups {
		group := g.(map[string]any)
		group["variant"] = fmt.Sprintf("holdout-%v", obj["id"])
		if _, ok := group["properties"]; !ok {
			group["properties"] = []any{}
		}
	}
}

const filters = `[ {"rollout_percentage": 10} ]`

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("Global holdout"),
		Description: cfntest.Ptr("10% of users never see experiments"),
		Filters:     cfntest.Ptr(filters),
	}
}

func listModel() *Model { return &Model{ProjectId: cfntest.Ptr(project)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// The server-set variant and filled-in members are not drift.
	if *created.Filters != filters {
		t.Fatalf("Filters = %s", *created.Filters)
	}
	if store.Get(parent, "1")["filters"].([]any)[0].(map[string]any)["variant"] != "holdout-1" {
		t.Fatal("fake did not set the variant")
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Global holdout" || *read.Description != "10% of users never see experiments" || *read.Filters != filters {
		t.Fatalf("read returned %+v", read)
	}

	// Update: new population, description removed (cleared).
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("EU holdout"),
		Filters: cfntest.Ptr(`[{"properties":[{"key":"$geoip_continent_code","value":["EU"],"operator":"exact","type":"person"}],"rollout_percentage":5}]`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "EU holdout" || after.Description != nil || *after.Filters != *updated.Filters {
		t.Fatalf("update returned %+v", after)
	}
	if store.Get(parent, "1")["description"] != "" {
		t.Fatal("description not cleared")
	}

	// List
	ev, err = List(api.Request(t, listModel(), nil), nil, listModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete hard-deletes.
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("holdout not deleted")
	}
}

func TestDriftIsReportedWithoutVariant(t *testing.T) {
	api, store := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	obj := store.Get(parent, "1")
	obj["filters"] = []any{map[string]any{"rollout_percentage": 20, "variant": "holdout-1", "properties": []any{}}}
	store.Put(parent, obj)

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if got := *ev.ResourceModel.(*Model).Filters; got != `[{"properties":[],"rollout_percentage":20}]` {
		t.Fatalf("Filters = %s", got)
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
	cases := map[string]func(m *Model){
		"no project":    func(m *Model) { m.ProjectId = nil },
		"no name":       func(m *Model) { m.Name = nil },
		"no filters":    func(m *Model) { m.Filters = nil },
		"invalid JSON":  func(m *Model) { m.Filters = cfntest.Ptr(`[{"rollout_percentage":`) },
		"empty array":   func(m *Model) { m.Filters = cfntest.Ptr(`[]`) },
		"object":        func(m *Model) { m.Filters = cfntest.Ptr(`{"groups": []}`) },
		"non-object el": func(m *Model) { m.Filters = cfntest.Ptr(`[10]`) },
	}
	for name, mutate := range cases {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s %v", name, ev.HandlerErrorCode, err)
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
