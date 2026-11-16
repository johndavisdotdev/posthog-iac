package resource

import (
	"net/http"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const (
	rulesPath  = "/api/projects/42/error_tracking/suppression_rules/"
	reorderURL = rulesPath + "reorder/"
)

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/error_tracking/suppression_rules/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"order_key": 0, "disabled_data": nil, "sampling_rate": 1.0,
			"filters": map[string]any{"type": "AND", "values": []any{}},
		},
	})
	// PATCH reorder/ takes {"orders": {"<uuid>": <order>}} and answers 204.
	api.Handle("PATCH /api/projects/{project_id}/error_tracking/suppression_rules/reorder/", func(w http.ResponseWriter, r *http.Request) {
		orders, _ := cfntest.Decode(r)["orders"].(map[string]any)
		p := map[string]string{"project_id": r.PathValue("project_id")}
		for id, order := range orders {
			obj := store.Get(p, id)
			if obj == nil {
				cfntest.NotFound(w)
				return
			}
			obj["order_key"] = order
			store.Put(p, obj)
		}
		cfntest.NoContent(w)
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:    cfntest.Ptr(project),
		Filters:      cfntest.Ptr(`{ "type": "AND", "values": [ {"key": "$exception_values", "type": "event", "operator": "icontains", "value": "ResizeObserver loop"} ] }`),
		SamplingRate: cfntest.Ptr(0.5),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	model.OrderKey = cfntest.Ptr(4)
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	if *created.Filters != *model.Filters || *created.SamplingRate != 0.5 || *created.OrderKey != 4 {
		t.Fatalf("create returned %+v", created)
	}
	if len(api.CallsTo("PATCH", reorderURL)) != 1 {
		t.Fatal("expected one reorder call after create")
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Filters != *model.Filters || *read.Id != id {
		t.Fatalf("read returned %+v", read)
	}

	// Update: drop Filters and SamplingRate; they are reset to match-all / 1.0
	// and not reported, so the template shows no drift.
	updated := &Model{ProjectId: created.ProjectId, Id: created.Id}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.Filters != nil || after.SamplingRate != nil || after.OrderKey != nil {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["sampling_rate"] != 1.0 || len(stored["filters"].(map[string]any)["values"].([]any)) != 0 {
		t.Fatalf("not reset: %v", stored)
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("rule not deleted")
	}
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMatchAllAndStringifiedRate(t *testing.T) {
	api, _ := newAPI(t)
	// CloudFormation sends numbers as strings; the plugin must accept that.
	raw := map[string]any{"ProjectId": project, "SamplingRate": "0.25"}
	req := api.Request(t, raw, nil)
	var m Model
	if err := req.Unmarshal(&m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	ev, err := Create(req, &Model{}, &m)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Filters != nil || created.SamplingRate == nil || *created.SamplingRate != 0.25 {
		t.Fatalf("create returned %+v", created)
	}
	post := api.CallsTo("POST", rulesPath)[0]
	if f := post.Body["filters"].(map[string]any); f["type"] != "AND" || len(f["values"].([]any)) != 0 {
		t.Fatalf("match-all filters not sent: %v", post.Body)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999")
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
		"bad JSON":         func(m *Model) { m.Filters = cfntest.Ptr(`{"type":`) },
		"filters is array": func(m *Model) { m.Filters = cfntest.Ptr(`[]`) },
		"rate too high":    func(m *Model) { m.SamplingRate = cfntest.Ptr(1.5) },
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
