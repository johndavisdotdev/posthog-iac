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
	store := api.Collection("/api/projects/{project_id}/experiments/", cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"description": "", "type": "product", "archived": false, "tags": []any{},
			"status": "draft", "metrics": []any{}, "metrics_secondary": []any{},
			"exposure_criteria": map[string]any{"filterTestAccounts": true},
			"stats_config":      map[string]any{"method": "bayesian"},
			"saved_metrics":     []any{}, "health": nil, "results": map[string]any{"ignored": true},
		},
		WriteOnly: []string{"allow_unknown_events", "saved_metrics_ids", "holdout_id"},
		OnCreate:  simulateServer,
		OnUpdate:  simulateServer,
	})
	return api, store
}

// simulateServer mimics PostHog: it links a feature flag, adds a uuid to each
// metric, projects flag config into parameters, and turns saved_metrics_ids
// and holdout_id into their read-only representations.
func simulateServer(obj map[string]any) {
	if obj["feature_flag"] == nil || obj["feature_flag"].(map[string]any)["id"] == nil {
		obj["feature_flag"] = map[string]any{"id": 7, "key": obj["feature_flag_key"], "filters": map[string]any{}}
	}
	for _, field := range []string{"metrics", "metrics_secondary"} {
		list, _ := obj[field].([]any)
		for i, mm := range list {
			metric := mm.(map[string]any)
			if metric["uuid"] == nil {
				metric["uuid"] = "uuid-" + field + string(rune('0'+i))
			}
		}
	}
	params, _ := obj["parameters"].(map[string]any)
	if params == nil {
		params = map[string]any{}
	}
	params["feature_flag_variants"] = []any{map[string]any{"key": "control"}, map[string]any{"key": "test"}}
	obj["parameters"] = params
	if ids, ok := obj["saved_metrics_ids"].([]any); ok {
		links := []any{}
		for _, raw := range ids {
			item := raw.(map[string]any)
			links = append(links, map[string]any{"saved_metric": item["id"], "metadata": item["metadata"], "name": "x", "query": map[string]any{}})
		}
		obj["saved_metrics"] = links
	}
	if h, ok := obj["holdout_id"]; ok {
		if h == nil {
			obj["holdout"] = nil
		} else {
			obj["holdout"] = map[string]any{"id": h, "name": "holdout"}
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:          cfntest.Ptr(project),
		Name:               cfntest.Ptr("Checkout button colour"),
		Description:        cfntest.Ptr("Green converts better"),
		FeatureFlagKey:     cfntest.Ptr("checkout-button"),
		FeatureFlag:        cfntest.Ptr(`{"filters": {"multivariate": {"variants": [{"key": "control", "rollout_percentage": 50}, {"key": "test", "rollout_percentage": 50}]}}}`),
		HoldoutId:          cfntest.Ptr("3"),
		Metrics:            cfntest.Ptr(`[ {"kind": "ExperimentMetric", "metric_type": "mean", "source": {"kind": "EventsNode", "event": "purchase"}} ]`),
		Parameters:         cfntest.Ptr(`{"variant_notes": {"test": "green"}}`),
		SavedMetrics:       []SavedMetricLink{{Id: cfntest.Ptr("11"), Type: cfntest.Ptr("secondary")}},
		Tags:               []string{"growth"},
		AllowUnknownEvents: cfntest.Ptr(true),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || *created.FeatureFlagId != "7" || *created.Status != "draft" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// Server-added metric uuids and flag-projected parameters don't change
	// the template's JSON strings.
	if *created.Metrics != *model.Metrics || *created.Parameters != *model.Parameters {
		t.Fatalf("JSON not preserved: metrics=%s parameters=%s", *created.Metrics, *created.Parameters)
	}
	// Server defaults the template did not set are not reported.
	if created.Type != nil || created.ExposureCriteria != nil || created.StatsConfig != nil || created.Archived != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	// Write-only inputs are never returned.
	if created.FeatureFlag != nil || created.AllowUnknownEvents != nil {
		t.Fatal("write-only properties returned")
	}
	if *created.HoldoutId != "3" || len(created.SavedMetrics) != 1 || *created.SavedMetrics[0].Id != "11" || *created.SavedMetrics[0].Type != "secondary" {
		t.Fatalf("references not read back: %+v", created)
	}
	post := api.CallsTo(http.MethodPost, "/api/projects/42/experiments/")[0].Body
	if post["feature_flag_key"] != "checkout-button" || post["feature_flag"] == nil || post["allow_unknown_events"] != true || post["holdout_id"] != float64(3) {
		t.Fatalf("create body: %v", post)
	}
	if _, ok := post["results"]; ok {
		t.Fatal("results must never be sent")
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Checkout button colour" || *read.Metrics != *model.Metrics || *read.FeatureFlagKey != "checkout-button" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename, set an explicit exposure config, drop description,
	// holdout, saved metrics, parameters and tags (all must be cleared).
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, FeatureFlagKey: created.FeatureFlagKey,
		Name:             cfntest.Ptr("Checkout button colour (v2)"),
		Metrics:          created.Metrics,
		ExposureCriteria: cfntest.Ptr(`{"filterTestAccounts": false}`),
		StartDate:        cfntest.Ptr("2026-02-01T00:00:00Z"),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Checkout button colour (v2)" || after.Description != nil || after.Tags != nil ||
		after.HoldoutId != nil || after.SavedMetrics != nil || after.Parameters != nil {
		t.Fatalf("update returned %+v", after)
	}
	if after.ExposureCriteria == nil || *after.ExposureCriteria != `{"filterTestAccounts": false}` || *after.StartDate != "2026-02-01T00:00:00Z" {
		t.Fatalf("update lost explicit values: %+v", after)
	}
	patch := api.CallsTo(http.MethodPatch, "/api/projects/42/experiments/1/")[0].Body
	if patch["description"] != "" || patch["holdout_id"] != nil || len(patch["saved_metrics_ids"].([]any)) != 0 || patch["parameters"] != nil {
		t.Fatalf("removed properties not cleared: %v", patch)
	}
	if _, ok := patch["feature_flag_key"]; ok {
		t.Fatal("create-only feature_flag_key must not be sent on update")
	}
	if _, ok := patch["feature_flag"]; ok {
		t.Fatal("feature_flag must not be sent on update")
	}

	// List
	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete soft-deletes.
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1")["deleted"] != true {
		t.Fatal("experiment not soft-deleted")
	}

	// A soft-deleted experiment is gone as far as CloudFormation is concerned.
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted experiment still listed: %+v", ev.ResourceModels)
	}
}

func TestListIncludesArchived(t *testing.T) {
	api := cfntest.NewAPI(t)
	api.Handle("GET /api/projects/42/experiments/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("archived") == "true" {
			cfntest.List(w, map[string]any{"id": 2, "archived": true}, map[string]any{"id": 3, "deleted": true})
			return
		}
		cfntest.List(w, map[string]any{"id": 1})
	})
	m := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err := List(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 2 {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}
}

func TestReadWithoutTemplateOmitsFlagProjection(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{
		"id": 5, "name": "imported", "feature_flag_key": "k", "deleted": false,
		"parameters": map[string]any{"feature_flag_variants": []any{}, "minimum_detectable_effect": nil},
		"metrics":    []any{}, "type": "web",
	})
	m := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("5")}
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	got := ev.ResourceModel.(*Model)
	if got.Parameters != nil || got.Metrics != nil || *got.Type != "web" {
		t.Fatalf("read returned %+v", got)
	}
}

func TestDriftIsReported(t *testing.T) {
	api, store := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	obj := store.Get(parent, "1")
	obj["metrics"].([]any)[0].(map[string]any)["metric_type"] = "funnel"
	store.Put(parent, obj)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if got := *ev.ResourceModel.(*Model).Metrics; !strings.Contains(got, "funnel") {
		t.Fatalf("drift hidden: %s", got)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("999"), Name: cfntest.Ptr("x"), FeatureFlagKey: cfntest.Ptr("x")}
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
		"no project":       func(m *Model) { m.ProjectId = nil },
		"no name":          func(m *Model) { m.Name = nil },
		"no flag key":      func(m *Model) { m.FeatureFlagKey = nil },
		"bad metrics":      func(m *Model) { m.Metrics = cfntest.Ptr(`[{"kind":`) },
		"bad feature flag": func(m *Model) { m.FeatureFlag = cfntest.Ptr(`{`) },
		"bad holdout":      func(m *Model) { m.HoldoutId = cfntest.Ptr("abc") },
		"bad saved metric": func(m *Model) { m.SavedMetrics[0].Id = cfntest.Ptr("x") },
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
