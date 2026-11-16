package resource

import (
	"net/http"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const orgID = "0190a1b2-aaaa-7000-8000-000000000001"

var parent = map[string]string{"organization_id": orgID}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/organizations/{organization_id}/proxy_records/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"target_cname": "abc123.proxy-us.posthog.com", "root_redirect_url": nil, "root_redirect_supported": true,
			"status": "waiting", "message": nil, "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "created_by": 1,
		},
	})
	return api, store
}

func desired() *Model {
	return &Model{OrganizationId: cfntest.Ptr(orgID), Domain: cfntest.Ptr("e.example.com")}
}

func orgModel() *Model { return &Model{OrganizationId: cfntest.Ptr(orgID)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	model.RootRedirectUrl = cfntest.Ptr("https://www.example.com")
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.TargetCname != "abc123.proxy-us.posthog.com" || *created.Status != "waiting" || *created.RootRedirectUrl != "https://www.example.com" {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	if post := api.CallsTo("POST", "/api/organizations/"+orgID+"/proxy_records/"); len(post) != 1 || len(post[0].Body) != 1 {
		t.Fatalf("create should send only the domain: %+v", post)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Domain != "e.example.com" {
		t.Fatalf("read returned %+v", ev.ResourceModel)
	}

	// Removing the redirect from the template disables it.
	updated := desired()
	updated.Id = created.Id
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel.(*Model).RootRedirectUrl != nil || store.Get(parent, id)["root_redirect_url"] != nil {
		t.Fatalf("redirect not cleared: %+v", store.Get(parent, id))
	}
	// An update with no change does not PATCH.
	patches := len(api.CallsTo("PATCH", "/api/organizations/"+orgID+"/proxy_records/"+id+"/"))
	ev, err = Update(api.Request(t, updated, updated), updated, updated)
	cfntest.RequireSuccess(t, ev, err)
	if got := len(api.CallsTo("PATCH", "/api/organizations/"+orgID+"/proxy_records/"+id+"/")); got != patches {
		t.Fatal("no-op update should not PATCH")
	}

	renamed := desired()
	renamed.Id, renamed.Domain = created.Id, cfntest.Ptr("t.example.com")
	ev, err = Update(api.Request(t, renamed, created), created, renamed)
	cfntest.RequireFailed(t, ev, err, "NotUpdatable")

	ev, err = List(api.Request(t, orgModel(), nil), nil, orgModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, updated, nil), nil, updated)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("proxy record not deleted, or delete returned a model")
	}
	ev, err = Read(api.Request(t, updated, nil), nil, updated)
	cfntest.RequireNotFound(t, ev, err)
}

func TestDeletingProxyIsNotFound(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{"id": "p1", "domain": "e.example.com", "status": "deleting"})
	store.Put(parent, map[string]any{"id": "p2", "domain": "f.example.com", "status": "valid"})
	m := &Model{OrganizationId: cfntest.Ptr(orgID), Id: cfntest.Ptr("p1"), Domain: cfntest.Ptr("e.example.com")}
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, m, m), m, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, orgModel(), nil), nil, orgModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "p2" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}
}

func TestCreateCleansUpWhenRedirectFails(t *testing.T) {
	api := cfntest.NewAPI(t)
	var deleted bool
	api.Handle("POST /api/organizations/{org}/proxy_records/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.JSON(w, http.StatusCreated, map[string]any{"id": "p1", "domain": "e.example.com", "status": "waiting"})
	})
	api.Handle("PATCH /api/organizations/{org}/proxy_records/p1/", func(w http.ResponseWriter, r *http.Request) {
		cfntest.Error(w, http.StatusBadRequest, "validation_error", "invalid", "Root redirect is not supported for this proxy.")
	})
	api.Handle("DELETE /api/organizations/{org}/proxy_records/p1/", func(w http.ResponseWriter, r *http.Request) {
		deleted = true
		cfntest.NoContent(w)
	})
	m := desired()
	m.RootRedirectUrl = cfntest.Ptr("https://www.example.com")
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if !deleted {
		t.Fatal("half-created proxy record was not deleted")
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
	noOrg := &Model{Domain: cfntest.Ptr("e.example.com")}
	ev, err := Create(api.Request(t, noOrg, nil), &Model{}, noOrg)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	noDomain := orgModel()
	ev, err = Create(api.Request(t, noDomain, nil), &Model{}, noDomain)
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
