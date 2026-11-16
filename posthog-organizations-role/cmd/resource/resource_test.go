package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const orgID = "0190a1b2-aaaa-7000-8000-000000000001"

var parent = map[string]string{"organization_id": orgID}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/organizations/{organization_id}/roles/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults:  map[string]any{"created_at": "2026-01-01T00:00:00Z", "is_default": false, "members": []any{}},
	})
	return api, store
}

func orgModel() *Model { return &Model{OrganizationId: cfntest.Ptr(orgID)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := &Model{OrganizationId: cfntest.Ptr(orgID), Name: cfntest.Ptr("Engineers")}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || *created.OrganizationId != orgID || created.IsDefault == nil || *created.IsDefault {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Name != "Engineers" {
		t.Fatalf("read returned %+v", ev.ResourceModel)
	}

	updated := &Model{OrganizationId: created.OrganizationId, Id: created.Id, Name: cfntest.Ptr("Platform engineers")}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Name != "Platform engineers" || store.Get(parent, id)["name"] != "Platform engineers" {
		t.Fatalf("update returned %+v", ev.ResourceModel)
	}

	ev, err = List(api.Request(t, orgModel(), nil), nil, orgModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id || *ev.ResourceModels[0].(Model).OrganizationId != orgID {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, updated, nil), nil, updated)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("role not deleted, or delete returned a model")
	}

	ev, err = Read(api.Request(t, updated, nil), nil, updated)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{OrganizationId: cfntest.Ptr(orgID), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999"), Name: cfntest.Ptr("x")}
	ev, err := Read(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, gone, gone), gone, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	if len(api.CallsTo("DELETE", "/api/organizations/"+orgID+"/roles/0190a1b2-0000-7000-8000-000000000999/")) != 0 {
		t.Fatal("delete of a missing role must not send DELETE")
	}
	empty := &Model{}
	ev, err = Read(api.Request(t, empty, nil), nil, empty)
	cfntest.RequireNotFound(t, ev, err)
}

func TestValidation(t *testing.T) {
	api, store := newAPI(t)
	noOrg := &Model{Name: cfntest.Ptr("x")}
	ev, err := Create(api.Request(t, noOrg, nil), &Model{}, noOrg)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noName := orgModel()
	ev, err = Create(api.Request(t, noName, nil), &Model{}, noName)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	ev, err = List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 || len(api.Calls()) != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := &Model{OrganizationId: cfntest.Ptr(orgID), Name: cfntest.Ptr("x")}
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
