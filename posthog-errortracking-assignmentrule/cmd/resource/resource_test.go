package resource

import (
	"net/http"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const (
	rulesPath  = "/api/projects/42/error_tracking/assignment_rules/"
	reorderURL = rulesPath + "reorder/"
)

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/error_tracking/assignment_rules/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"order_key": 0, "disabled_data": nil,
		},
	})
	// PATCH reorder/ takes {"orders": {"<uuid>": <order>}} and answers 204.
	api.Handle("PATCH /api/projects/{project_id}/error_tracking/assignment_rules/reorder/", func(w http.ResponseWriter, r *http.Request) {
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
		Filters:   cfntest.Ptr(`{ "type": "AND", "values": [ {"key": "$exception_types", "type": "event", "operator": "exact", "value": ["TypeError"]} ] }`),
		Assignee:  &Assignee{Type: cfntest.Ptr("user"), Id: cfntest.Ptr("7")},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || created.UpdatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	// The template's JSON string is kept verbatim when equal to the API value.
	if *created.Filters != *model.Filters {
		t.Fatalf("Filters = %s", *created.Filters)
	}
	// Server-default order_key is not reported when the template leaves it out.
	if created.OrderKey != nil {
		t.Fatalf("default OrderKey leaked into the model: %d", *created.OrderKey)
	}
	if created.Assignee == nil || *created.Assignee.Type != "user" || *created.Assignee.Id != "7" {
		t.Fatalf("assignee = %+v", created.Assignee)
	}
	// User IDs are sent as JSON numbers.
	post := api.CallsTo("POST", rulesPath)[0]
	if got := post.Body["assignee"].(map[string]any)["id"]; got != float64(7) {
		t.Fatalf("assignee id sent as %#v", got)
	}
	if _, ok := post.Body["order_key"]; ok {
		t.Fatal("order_key must not be sent when unset")
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Filters != *model.Filters || *read.Id != id {
		t.Fatalf("read returned %+v", read)
	}

	// Update: new filters, assign to a role, move to order 3.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id,
		Filters:  cfntest.Ptr(`{"type":"OR","values":[]}`),
		Assignee: &Assignee{Type: cfntest.Ptr("role"), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-00000000abcd")},
		OrderKey: cfntest.Ptr(3),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Filters != *updated.Filters || *after.Assignee.Type != "role" || *after.Assignee.Id != *updated.Assignee.Id {
		t.Fatalf("update returned %+v", after)
	}
	if after.OrderKey == nil || *after.OrderKey != 3 {
		t.Fatalf("OrderKey = %v", after.OrderKey)
	}
	if calls := api.CallsTo("PATCH", reorderURL); len(calls) != 1 {
		t.Fatalf("reorder calls = %d", len(calls))
	}
	if patch := api.CallsTo("PATCH", rulesPath+id+"/")[0]; patch.Body["order_key"] != nil {
		t.Fatal("order_key must go through reorder/, not the item PATCH")
	}
	// An unchanged OrderKey does not reorder again.
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireSuccess(t, ev, err)
	if calls := api.CallsTo("PATCH", reorderURL); len(calls) != 1 {
		t.Fatalf("reorder calls = %d after a no-op update", len(calls))
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
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestCreateWithOrderKey(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	model.OrderKey = cfntest.Ptr(5)
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.OrderKey == nil || *created.OrderKey != 5 {
		t.Fatalf("OrderKey = %v", created.OrderKey)
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
	noProject := desired()
	noProject.ProjectId = nil
	ev, err := Create(api.Request(t, noProject, nil), &Model{}, noProject)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	for name, mutate := range map[string]func(*Model){
		"bad JSON":         func(m *Model) { m.Filters = cfntest.Ptr(`{"type":`) },
		"filters is array": func(m *Model) { m.Filters = cfntest.Ptr(`[]`) },
		"no filters":       func(m *Model) { m.Filters = nil },
		"no assignee":      func(m *Model) { m.Assignee = nil },
		"no assignee id":   func(m *Model) { m.Assignee.Id = nil },
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s (%v)", name, ev.HandlerErrorCode, err)
		}
	}

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
