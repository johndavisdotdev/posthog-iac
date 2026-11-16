package resource

import (
	"net/http"
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/experiment_saved_metrics/", cfntest.CollectionOptions{
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"description": nil, "tags": []any{}, "linked_experiments": []any{},
		},
		// PostHog fills in a metric uuid and default goal.
		OnCreate: addQueryDefaults,
		OnUpdate: addQueryDefaults,
	})
	return api, store
}

func addQueryDefaults(obj map[string]any) {
	if q, ok := obj["query"].(map[string]any); ok {
		if q["uuid"] == nil {
			q["uuid"] = "0190-metric"
		}
		if q["goal"] == nil {
			q["goal"] = "increase"
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("Purchases"),
		Description: cfntest.Ptr("Mean purchases per user"),
		Query:       cfntest.Ptr(`{"kind": "ExperimentMetric", "metric_type": "mean", "source": {"kind": "EventsNode", "event": "purchase"}}`),
		Tags:        []string{"revenue"},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil || created.UpdatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Query != *model.Query {
		t.Fatalf("Query not preserved despite server-added keys: %s", *created.Query)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Purchases" || *read.Query != *model.Query || len(read.Tags) != 1 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: new query, drop description and tags.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Purchases v2"),
		Query: cfntest.Ptr(`{"kind": "ExperimentMetric", "metric_type": "funnel", "series": [{"kind": "EventsNode", "event": "a"}, {"kind": "EventsNode", "event": "b"}]}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Purchases v2" || after.Description != nil || after.Tags != nil || *after.Query != *updated.Query {
		t.Fatalf("update returned %+v", after)
	}
	if stored := store.Get(parent, "1"); stored["description"] != "" || len(stored["tags"].([]any)) != 0 {
		t.Fatalf("removed properties not cleared: %v", stored)
	}

	// Out-of-band changes to the query are reported.
	obj := store.Get(parent, "1")
	obj["query"].(map[string]any)["metric_type"] = "mean"
	store.Put(parent, obj)
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if q := *ev.ResourceModel.(*Model).Query; !strings.Contains(q, `"mean"`) {
		t.Fatalf("drift hidden: %s", q)
	}

	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 || len(api.CallsTo(http.MethodDelete, "/api/projects/42/experiment_saved_metrics/1/")) != 1 {
		t.Fatal("shared metric not hard-deleted")
	}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted metric still listed: %+v", ev.ResourceModels)
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
		"no project": func(m *Model) { m.ProjectId = nil },
		"no name":    func(m *Model) { m.Name = nil },
		"no query":   func(m *Model) { m.Query = nil },
		"bad query":  func(m *Model) { m.Query = cfntest.Ptr(`{"kind":`) },
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Fatalf("%s: got %+v, %v", name, ev, err)
		}
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
