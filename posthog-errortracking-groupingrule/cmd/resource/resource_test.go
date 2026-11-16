package resource

import (
	"net/http"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

const (
	rulesPath  = "/api/projects/42/error_tracking/grouping_rules/"
	reorderURL = rulesPath + "reorder/"
)

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/error_tracking/grouping_rules/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"order_key": 0, "disabled_data": nil, "assignee": nil, "description": nil, "issue": nil,
		},
	})
	// PATCH reorder/ takes {"orders": {"<uuid>": <order>}} and answers 204.
	api.Handle("PATCH /api/projects/{project_id}/error_tracking/grouping_rules/reorder/", func(w http.ResponseWriter, r *http.Request) {
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
		ProjectId: cfntest.Ptr(project),
		Filters:   cfntest.Ptr(`{ "type": "AND", "values": [ {"key": "$exception_types", "type": "event", "operator": "exact", "value": ["ChunkLoadError"]} ] }`),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create with assignee, description and an explicit order.
	model := desired()
	model.Assignee = &Assignee{Type: cfntest.Ptr("user"), Id: cfntest.Ptr("7")}
	model.Description = cfntest.Ptr("All chunk load errors in one issue")
	model.OrderKey = cfntest.Ptr(2)
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	if *created.Filters != *model.Filters || *created.Description != *model.Description {
		t.Fatalf("create returned %+v", created)
	}
	if created.Assignee == nil || *created.Assignee.Id != "7" || *created.Assignee.Type != "user" {
		t.Fatalf("assignee = %+v", created.Assignee)
	}
	if created.OrderKey == nil || *created.OrderKey != 2 {
		t.Fatalf("OrderKey = %v", created.OrderKey)
	}
	post := api.CallsTo("POST", rulesPath)[0]
	if _, ok := post.Body["order_key"]; ok {
		t.Fatal("order_key is not part of the create request")
	}
	if len(api.CallsTo("PATCH", reorderURL)) != 1 {
		t.Fatal("expected one reorder call after create")
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Filters != *model.Filters || *read.Id != id || *read.OrderKey != 2 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: only filters and order are sent to the item PATCH.
	updated := *created
	updated.Filters = cfntest.Ptr(`{"type":"OR","values":[]}`)
	updated.OrderKey = cfntest.Ptr(0)
	ev, err = Update(api.Request(t, &updated, created), created, &updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Filters != *updated.Filters || *after.OrderKey != 0 || *after.Description != *model.Description {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo("PATCH", rulesPath+id+"/")
	if len(patch) != 1 || len(patch[0].Body) != 1 || patch[0].Body["filters"] == nil {
		t.Fatalf("PATCH body = %v", patch)
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
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestServerDefaultsNotReported(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.OrderKey != nil || created.Assignee != nil || created.Description != nil {
		t.Fatalf("unset properties reported: %+v", created)
	}
	if len(api.CallsTo("PATCH", reorderURL)) != 0 {
		t.Fatal("no reorder expected when OrderKey is unset")
	}
}

func TestListWithoutPagination(t *testing.T) {
	// The real list endpoint answers {"results": [...]} with no count/next.
	api := cfntest.NewAPI(t)
	api.Handle("GET /api/projects/{project_id}/error_tracking/grouping_rules/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.JSON(w, http.StatusOK, map[string]any{"results": []any{map[string]any{"id": "a"}, map[string]any{"id": "b"}}})
	})
	m := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err := List(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 2 {
		t.Fatalf("list returned %+v", ev.ResourceModels)
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
		"no filters":       func(m *Model) { m.Filters = nil },
		"no assignee id":   func(m *Model) { m.Assignee = &Assignee{Type: cfntest.Ptr("user")} },
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
