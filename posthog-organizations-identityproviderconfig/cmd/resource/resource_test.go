package resource

import (
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go/aws/client"
	"github.com/aws/aws-sdk-go/service/secretsmanager"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const (
	orgID     = "0190a1b2-aaaa-7000-8000-000000000001"
	domainID  = "0190a1b2-bbbb-7000-8000-000000000002"
	secretARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:posthog-scim-AbCdEf"
	cert      = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"
)

var parent = map[string]string{"organization_id": orgID}

type fakeSecrets struct {
	writes []*secretsmanager.PutSecretValueInput
	err    error
}

func (f *fakeSecrets) PutSecretValue(in *secretsmanager.PutSecretValueInput) (*secretsmanager.PutSecretValueOutput, error) {
	if f.err != nil {
		return nil, f.err
	}
	f.writes = append(f.writes, in)
	return &secretsmanager.PutSecretValueOutput{}, nil
}

func fakeSecretWriter(t *testing.T) *fakeSecrets {
	t.Helper()
	fake := &fakeSecrets{}
	orig := posthogcfn.NewSecretWriter
	posthogcfn.NewSecretWriter = func(client.ConfigProvider) posthogcfn.SecretWriter { return fake }
	t.Cleanup(func() { posthogcfn.NewSecretWriter = orig })
	return fake
}

// scimHook mimics PostHog: enabling SCIM generates a token that is returned
// once; disabling clears it.
func scimHook(obj map[string]any) {
	obj["scim_bearer_token"] = nil
	if obj["scim_enabled"] == true && obj["has_scim"] != true {
		obj["scim_bearer_token"] = "scim_token_value"
	}
	obj["has_scim"] = obj["scim_enabled"] == true
	obj["has_oidc_client_secret"] = obj["oidc_client_secret"] != nil && obj["oidc_client_secret"] != ""
}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/organizations/{organization_id}/identity_provider_configs/", cfntest.CollectionOptions{
		StringIDs: true,
		WriteOnly: []string{"oidc_client_secret"},
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"saml_relay_state": "0190a1b2-eeee-7000-8000-000000000005", "scim_base_url": "https://us.posthog.com/scim/v2/x",
			"scim_enabled": false, "has_saml": false, "has_oidc": false, "has_id_jag": false,
			"domain_scope": "selected", "config_scope": "saml",
		},
		OnCreate: scimHook,
		OnUpdate: scimHook,
	})
	return api, store
}

func desired() *Model {
	return &Model{
		OrganizationId:        cfntest.Ptr(orgID),
		Name:                  cfntest.Ptr("Okta production"),
		ConfigScope:           cfntest.Ptr("saml"),
		DomainScope:           cfntest.Ptr("selected"),
		OrganizationDomainIds: []string{domainID},
		SamlEntityId:          cfntest.Ptr("http://www.okta.com/exk1"),
		SamlAcsUrl:            cfntest.Ptr("https://example.okta.com/app/sso/saml"),
		SamlX509Cert:          cfntest.Ptr(cert),
		OidcClientSecret:      cfntest.Ptr("oidc-secret"),
	}
}

func TestLifecycle(t *testing.T) {
	secrets := fakeSecretWriter(t)
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.SamlEntityId != "http://www.okta.com/exk1" || created.SamlRelayState == nil || len(created.OrganizationDomainIds) != 1 {
		t.Fatalf("create returned %+v", created)
	}
	// Write-only properties are sent but never returned.
	if created.OidcClientSecret != nil || created.SamlX509Cert != nil {
		t.Fatalf("write-only properties returned: %+v", created)
	}
	id := *created.Id
	if stored := store.Get(parent, id); stored["saml_x509_cert"] != cert || stored["oidc_client_secret"] != "oidc-secret" {
		t.Fatalf("write-only values not sent: %+v", stored)
	}
	if _, sent := api.CallsTo("POST", "/api/organizations/"+orgID+"/identity_provider_configs/")[0].Body["scim_enabled"]; sent {
		t.Fatal("scim_enabled should not be sent when SCIM is not enabled")
	}
	if created.ScimEnabled != nil || len(secrets.writes) != 0 {
		t.Fatal("SCIM default leaked or a secret was written")
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if read.SamlX509Cert != nil || read.OidcClientSecret != nil || *read.Name != "Okta production" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: enable SCIM, drop SAML fields and the OIDC secret.
	updated := &Model{
		OrganizationId: created.OrganizationId, Id: created.Id, Name: cfntest.Ptr("Okta"),
		ConfigScope: cfntest.Ptr("scim"), ScimEnabled: cfntest.Ptr(true), ScimBearerTokenSecretArn: cfntest.Ptr(secretARN),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if !*after.ScimEnabled || !*after.HasScim || *after.ScimBearerTokenSecretArn != secretARN || after.SamlEntityId != nil || after.OrganizationDomainIds != nil {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["saml_entity_id"] != nil || stored["saml_x509_cert"] != nil || stored["oidc_client_secret"] != "" {
		t.Fatalf("removed properties not cleared: %+v", stored)
	}
	// The token went to Secrets Manager only.
	if len(secrets.writes) != 1 || *secrets.writes[0].SecretId != secretARN || *secrets.writes[0].SecretString != "scim_token_value" {
		t.Fatalf("secret writes: %+v", secrets.writes)
	}

	// A further update leaves scim_enabled alone, so the token is not rotated.
	again := *updated
	again.Name = cfntest.Ptr("Okta (prod)")
	ev, err = Update(api.Request(t, &again, after), after, &again)
	cfntest.RequireSuccess(t, ev, err)
	patches := api.CallsTo("PATCH", "/api/organizations/"+orgID+"/identity_provider_configs/"+id+"/")
	if _, sent := patches[len(patches)-1].Body["scim_enabled"]; sent || len(secrets.writes) != 1 {
		t.Fatal("unchanged scim_enabled must not be re-sent")
	}

	ev, err = List(api.Request(t, &Model{OrganizationId: cfntest.Ptr(orgID)}, nil), nil, &Model{OrganizationId: cfntest.Ptr(orgID)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, &again, nil), nil, &again)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("config not deleted, or delete returned a model")
	}
	ev, err = Read(api.Request(t, &again, nil), nil, &again)
	cfntest.RequireNotFound(t, ev, err)
}

func TestCreateWithScimWritesToken(t *testing.T) {
	secrets := fakeSecretWriter(t)
	api, _ := newAPI(t)
	m := &Model{OrganizationId: cfntest.Ptr(orgID), Name: cfntest.Ptr("SCIM"), ConfigScope: cfntest.Ptr("scim"),
		ScimEnabled: cfntest.Ptr(true), ScimBearerTokenSecretArn: cfntest.Ptr(secretARN)}
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireSuccess(t, ev, err)
	if len(secrets.writes) != 1 || *secrets.writes[0].SecretString != "scim_token_value" {
		t.Fatalf("secret writes: %+v", secrets.writes)
	}
	if _, sent := api.CallsTo("POST", "/api/organizations/"+orgID+"/identity_provider_configs/")[0].Body["oidc_client_secret"]; sent {
		t.Fatal("unset OIDC secret should not be sent on create")
	}
}

func TestCreateRollsBackWhenSecretWriteFails(t *testing.T) {
	secrets := fakeSecretWriter(t)
	secrets.err = errors.New("AccessDeniedException")
	api, store := newAPI(t)
	m := &Model{OrganizationId: cfntest.Ptr(orgID), Name: cfntest.Ptr("SCIM"),
		ScimEnabled: cfntest.Ptr(true), ScimBearerTokenSecretArn: cfntest.Ptr(secretARN)}
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "GeneralServiceException")
	if store.Len() != 0 {
		t.Fatal("config whose SCIM token could not be stored was not deleted")
	}
}

func TestUpdateDisablesScimWhenSecretWriteFails(t *testing.T) {
	secrets := fakeSecretWriter(t)
	api, store := newAPI(t)
	m := desired()
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	secrets.err = errors.New("AccessDeniedException")
	enable := *m
	enable.Id, enable.ScimEnabled, enable.ScimBearerTokenSecretArn = created.Id, cfntest.Ptr(true), cfntest.Ptr(secretARN)
	ev, err = Update(api.Request(t, &enable, created), created, &enable)
	cfntest.RequireFailed(t, ev, err, "GeneralServiceException")
	if store.Get(parent, *created.Id)["scim_enabled"] != false {
		t.Fatal("SCIM should be disabled again when its token cannot be stored")
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
	noOrg := desired()
	noOrg.OrganizationId = nil
	ev, err := Create(api.Request(t, noOrg, nil), &Model{}, noOrg)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noName := desired()
	noName.Name = nil
	ev, err = Create(api.Request(t, noName, nil), &Model{}, noName)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	// Enabling SCIM without somewhere to store its one-time token is refused.
	noSecret := desired()
	noSecret.ScimEnabled = cfntest.Ptr(true)
	ev, err = Create(api.Request(t, noSecret, nil), &Model{}, noSecret)
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
