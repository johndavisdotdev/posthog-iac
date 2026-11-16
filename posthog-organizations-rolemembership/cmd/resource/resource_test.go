package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const (
	orgID    = "0190a1b2-aaaa-7000-8000-000000000001"
	roleID   = "0190a1b2-bbbb-7000-8000-000000000002"
	userUUID = "0190a1b2-cccc-7000-8000-000000000003"
)

var parent = map[string]string{"organization_id": orgID, "role_id": roleID}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/organizations/{organization_id}/roles/{role_id}/role_memberships/", cfntest.CollectionOptions{
		StringIDs: true,
		NoUpdate:  true,
		WriteOnly: []string{"user_uuid"},
		Defaults:  map[string]any{"joined_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "role_id": roleID},
		// PostHog never echoes user_uuid; it returns the nested user instead.
		OnCreate: func(obj map[string]any) {
			obj["user"] = map[string]any{"uuid": obj["user_uuid"], "email": "jane@example.com"}
		},
	})
	return api, store
}

func desired() *Model {
	return &Model{OrganizationId: cfntest.Ptr(orgID), RoleId: cfntest.Ptr(roleID), UserUuid: cfntest.Ptr(userUUID)}
}

func roleModel() *Model {
	return &Model{OrganizationId: cfntest.Ptr(orgID), RoleId: cfntest.Ptr(roleID)}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.UserUuid != userUUID || *created.RoleId != roleID || *created.OrganizationId != orgID || created.JoinedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	if calls := api.CallsTo("POST", "/api/organizations/"+orgID+"/roles/"+roleID+"/role_memberships/"); len(calls) != 1 || calls[0].Body["user_uuid"] != userUUID {
		t.Fatalf("unexpected create calls %+v", calls)
	}

	// Read takes only the composite identifier and returns UserUuid from the
	// nested user object.
	ident := &Model{OrganizationId: created.OrganizationId, RoleId: created.RoleId, Id: created.Id}
	ev, err = Read(api.Request(t, ident, nil), nil, ident)
	cfntest.RequireSuccess(t, ev, err)
	if read := ev.ResourceModel.(*Model); read.UserUuid == nil || *read.UserUuid != userUUID {
		t.Fatalf("read returned %+v", read)
	}

	// Update with nothing changed re-reads the membership without writing.
	ev, err = Update(api.Request(t, created, created), created, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Id != id {
		t.Fatalf("update returned %+v", ev.ResourceModel)
	}

	ev, err = List(api.Request(t, roleModel(), nil), nil, roleModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}
	if got := ev.ResourceModels[0].(Model); *got.Id != id || *got.RoleId != roleID || *got.OrganizationId != orgID {
		t.Fatalf("list returned %+v", got)
	}

	ev, err = Delete(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("membership not deleted, or delete returned a model")
	}
	ev, err = Read(api.Request(t, ident, nil), nil, ident)
	cfntest.RequireNotFound(t, ev, err)
}

func TestUpdateRejectsCreateOnlyChange(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	changed := *created
	changed.UserUuid = cfntest.Ptr("0190a1b2-dddd-7000-8000-000000000004")
	ev, err = Update(api.Request(t, &changed, created), created, &changed)
	cfntest.RequireFailed(t, ev, err, "NotUpdatable")

	// A different case of the same UUID is not a change.
	sameUser := *created
	sameUser.UserUuid = cfntest.Ptr("0190A1B2-CCCC-7000-8000-000000000003")
	ev, err = Update(api.Request(t, &sameUser, created), created, &sameUser)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).UserUuid != *sameUser.UserUuid {
		t.Fatal("template UserUuid should be kept when it is the same UUID")
	}
	for _, c := range api.Calls() {
		if c.Method == "PATCH" || c.Method == "PUT" {
			t.Fatalf("update must not write: %+v", c)
		}
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
	// Missing any part of the composite identifier is NotFound too.
	noRole := &Model{OrganizationId: cfntest.Ptr(orgID), Id: gone.Id}
	ev, err = Read(api.Request(t, noRole, nil), nil, noRole)
	cfntest.RequireNotFound(t, ev, err)
}

func TestValidation(t *testing.T) {
	api, store := newAPI(t)
	for name, m := range map[string]*Model{
		"no org":  {RoleId: cfntest.Ptr(roleID), UserUuid: cfntest.Ptr(userUUID)},
		"no role": {OrganizationId: cfntest.Ptr(orgID), UserUuid: cfntest.Ptr(userUUID)},
		"no user": roleModel(),
	} {
		t.Run(name, func(t *testing.T) {
			ev, err := Create(api.Request(t, m, nil), &Model{}, m)
			cfntest.RequireFailed(t, ev, err, "InvalidRequest")
		})
	}
	noRole := &Model{OrganizationId: cfntest.Ptr(orgID)}
	ev, err := List(api.Request(t, noRole, nil), nil, noRole)
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
