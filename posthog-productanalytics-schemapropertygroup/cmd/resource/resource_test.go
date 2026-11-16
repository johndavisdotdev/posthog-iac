package resource

import (
	"fmt"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const collection = "/api/projects/" + project + "/schema_property_groups/"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	next := 0
	// PostHog gives each nested property its own ID and fills in defaults.
	assignIDs := func(obj map[string]any) {
		props, _ := obj["properties"].([]any)
		for _, p := range props {
			prop := p.(map[string]any)
			if prop["id"] == nil || prop["id"] == "" {
				next++
				prop["id"] = fmt.Sprintf("0190a1b2-0000-7000-9000-%012d", next)
			}
			for k, v := range map[string]any{"is_required": false, "is_optional_in_types": false, "description": ""} {
				if _, ok := prop[k]; !ok {
					prop[k] = v
				}
			}
		}
	}
	store := api.Collection("/api/projects/{project_id}/schema_property_groups/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults:  map[string]any{"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "description": "", "properties": []any{}, "events": []any{}},
		OnCreate:  assignIDs,
		OnUpdate:  assignIDs,
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("Checkout"),
		Description: cfntest.Ptr("Properties every checkout event carries"),
		Properties: []Property{
			{Name: cfntest.Ptr("plan"), PropertyType: cfntest.Ptr("String"), IsRequired: cfntest.Ptr(true), Description: cfntest.Ptr("Billing plan")},
			{Name: cfntest.Ptr("amount"), PropertyType: cfntest.Ptr("Numeric")},
		},
	}
}

const groupID = "0190a1b2-0000-7000-8000-000000000001"

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != groupID || created.CreatedAt == nil || len(created.Properties) != 2 {
		t.Fatalf("create returned %+v", created)
	}
	plan, amount := created.Properties[0], created.Properties[1]
	if *plan.IsRequired != true || *plan.Description != "Billing plan" || *amount.PropertyType != "Numeric" {
		t.Fatalf("properties = %+v", created.Properties)
	}
	// Server defaults on nested properties are not reported.
	if amount.IsRequired != nil || amount.IsOptionalInTypes != nil || amount.Description != nil || plan.IsOptionalInTypes != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created.Properties)
	}
	planID := store.Get(parent, groupID)["properties"].([]any)[0].(map[string]any)["id"]

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if read := ev.ResourceModel.(*Model); *read.Name != "Checkout" || len(read.Properties) != 2 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: drop the description and "amount", change "plan", add "coupon".
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Checkout v2"),
		Properties: []Property{
			{Name: cfntest.Ptr("plan"), PropertyType: cfntest.Ptr("String"), IsOptionalInTypes: cfntest.Ptr(true)},
			{Name: cfntest.Ptr("coupon"), PropertyType: cfntest.Ptr("String")},
		},
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Checkout v2" || after.Description != nil || len(after.Properties) != 2 {
		t.Fatalf("update returned %+v", after)
	}
	if p := after.Properties[0]; p.IsRequired != nil || *p.IsOptionalInTypes != true || p.Description != nil {
		t.Fatalf("plan = %+v", p)
	}
	sent := api.CallsTo("PATCH", collection+groupID+"/")[0].Body["properties"].([]any)
	if sent[0].(map[string]any)["id"] != planID {
		t.Fatalf("kept property must carry its ID: %v", sent[0])
	}
	if _, ok := sent[1].(map[string]any)["id"]; ok {
		t.Fatalf("new property must not carry an ID: %v", sent[1])
	}
	if stored := store.Get(parent, groupID); stored["description"] != "" {
		t.Fatalf("description not cleared: %v", stored["description"])
	}

	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != groupID {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("group not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("0190a1b2-0000-7000-8000-999999999999")
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
		"no project":     func(m *Model) { m.ProjectId = nil },
		"no name":        func(m *Model) { m.Name = nil },
		"duplicate prop": func(m *Model) { m.Properties[1].Name = cfntest.Ptr("plan") },
		"no prop type":   func(m *Model) { m.Properties[1].PropertyType = nil },
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s %q (%v)", name, ev.HandlerErrorCode, ev.Message, err)
		}
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if len(api.Calls()) != 0 || store.Len() != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
