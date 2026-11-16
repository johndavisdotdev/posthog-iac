package resource

import (
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const orgID = "0190a1b2-aaaa-7000-8000-000000000001"

var parent = map[string]string{"organization_id": orgID}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/organizations/{organization_id}/domains/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"is_verified": false, "verified_at": nil, "verification_challenge": "abc123challenge",
			"jit_provisioning_enabled": false, "sso_enforcement": "", "scim_base_url": nil,
		},
		// PostHog lowercases the domain.
		OnCreate: func(obj map[string]any) { obj["domain"] = strings.ToLower(obj["domain"].(string)) },
	})
	return api, store
}

func orgModel() *Model { return &Model{OrganizationId: cfntest.Ptr(orgID)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := &Model{OrganizationId: cfntest.Ptr(orgID), Domain: cfntest.Ptr("Example.com")}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Domain != "Example.com" || *created.VerificationChallenge != "abc123challenge" || *created.IsVerified {
		t.Fatalf("create returned %+v", created)
	}
	// Server defaults the template did not set are not reported.
	if created.JitProvisioningEnabled != nil || created.SsoEnforcement != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	id := *created.Id

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Domain != "Example.com" {
		t.Fatalf("read returned %+v", ev.ResourceModel)
	}

	// Enable JIT and SSO enforcement.
	updated := &Model{OrganizationId: created.OrganizationId, Id: created.Id, Domain: created.Domain,
		JitProvisioningEnabled: cfntest.Ptr(true), SsoEnforcement: cfntest.Ptr("saml")}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if !*after.JitProvisioningEnabled || *after.SsoEnforcement != "saml" {
		t.Fatalf("update returned %+v", after)
	}
	if _, sent := api.CallsTo("PATCH", "/api/organizations/"+orgID+"/domains/"+id+"/")[0].Body["domain"]; sent {
		t.Fatal("create-only Domain must not be sent on update")
	}

	// Removing the settings from the template resets them.
	ev, err = Update(api.Request(t, created, after), after, created)
	cfntest.RequireSuccess(t, ev, err)
	if stored := store.Get(parent, id); stored["jit_provisioning_enabled"] != false || stored["sso_enforcement"] != "" {
		t.Fatalf("settings not reset: %+v", stored)
	}

	// Changing the domain is not an in-place update.
	renamed := *created
	renamed.Domain = cfntest.Ptr("other.com")
	ev, err = Update(api.Request(t, &renamed, created), created, &renamed)
	cfntest.RequireFailed(t, ev, err, "NotUpdatable")

	ev, err = List(api.Request(t, orgModel(), nil), nil, orgModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("domain not deleted, or delete returned a model")
	}
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{OrganizationId: cfntest.Ptr(orgID), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999"), Domain: cfntest.Ptr("x.com")}
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
	noOrg := &Model{Domain: cfntest.Ptr("x.com")}
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
	m := &Model{OrganizationId: cfntest.Ptr(orgID), Domain: cfntest.Ptr("x.com")}
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
