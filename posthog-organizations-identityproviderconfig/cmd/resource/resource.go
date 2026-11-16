package resource

import (
	"context"
	"log"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/aws/aws-sdk-go/service/cloudformation"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// idpConfig is the subset of PostHog's IdentityProviderConfig object these
// handlers use. oidc_client_secret is write-only in the API, and
// saml_x509_cert is deliberately never read back (it is write-only in the
// resource schema).
type idpConfig struct {
	ID                    posthogcfn.FlexID `json:"id"`
	Name                  string            `json:"name"`
	DomainScope           *string           `json:"domain_scope"`
	ConfigScope           *string           `json:"config_scope"`
	OrganizationDomainIDs []string          `json:"organization_domain_ids"`
	OidcIssuerURL         string            `json:"oidc_issuer_url"`
	OidcClientID          string            `json:"oidc_client_id"`
	SamlRelayState        string            `json:"saml_relay_state"`
	SamlEntityID          *string           `json:"saml_entity_id"`
	SamlAcsURL            *string           `json:"saml_acs_url"`
	ScimEnabled           bool              `json:"scim_enabled"`
	ScimBaseURL           string            `json:"scim_base_url"`
	// ScimBearerToken is returned only once, right after SCIM is enabled. It
	// is written to Secrets Manager and never put in the model.
	ScimBearerToken     *string  `json:"scim_bearer_token"`
	IDJagIssuerURL      *string  `json:"id_jag_issuer_url"`
	IDJagJwksURL        *string  `json:"id_jag_jwks_url"`
	IDJagAllowedClients []string `json:"id_jag_allowed_clients"`
	HasSaml             bool     `json:"has_saml"`
	HasOidc             bool     `json:"has_oidc"`
	HasOidcClientSecret bool     `json:"has_oidc_client_secret"`
	HasScim             bool     `json:"has_scim"`
	HasIDJag            bool     `json:"has_id_jag"`
	CreatedAt           string   `json:"created_at"`
	UpdatedAt           string   `json:"updated_at"`
}

// newClient builds the PostHog client from the registered type configuration.
// On failure it returns the progress event the handler should return.
func newClient(req handler.Request) (*posthogcfn.Client, *handler.ProgressEvent) {
	cfg, err := Configuration(req)
	if err != nil {
		ev := posthogcfn.ConfigError(err)
		return nil, &ev
	}
	c, err := posthogcfn.NewClient(cfg.ApiKey, cfg.BaseUrl)
	if err != nil {
		ev := posthogcfn.ConfigError(err)
		return nil, &ev
	}
	return c, nil
}

func collectionPath(orgID string) string {
	return posthogcfn.Path("/api/organizations/%s/identity_provider_configs/", orgID)
}

func itemPath(orgID, id string) string {
	return posthogcfn.Path("/api/organizations/%s/identity_provider_configs/%s/", orgID, id)
}

func validate(m *Model, enablingScim bool) *handler.ProgressEvent {
	var ev handler.ProgressEvent
	switch {
	case posthogcfn.StringValue(m.Name) == "":
		ev = posthogcfn.InvalidRequest("Name is required")
	case enablingScim && posthogcfn.StringValue(m.ScimBearerTokenSecretArn) == "":
		ev = posthogcfn.InvalidRequest("ScimBearerTokenSecretArn is required when ScimEnabled is true: PostHog returns the SCIM bearer token only once")
	default:
		return nil
	}
	return &ev
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID := posthogcfn.StringValue(currentModel.OrganizationId)
	if orgID == "" {
		return posthogcfn.InvalidRequest("OrganizationId is required"), nil
	}
	enablingScim := posthogcfn.BoolValue(currentModel.ScimEnabled)
	if fail := validate(currentModel, enablingScim); fail != nil {
		return *fail, nil
	}
	body := requestBody(currentModel)
	if currentModel.OidcClientSecret == nil {
		// Nothing to remove on a new configuration.
		delete(body, "oidc_client_secret")
	}
	if enablingScim {
		body["scim_enabled"] = true
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out idpConfig
	if err := c.Post(ctx, collectionPath(orgID), body, &out); err != nil {
		return posthogcfn.FromError("creating identity provider config", err), nil
	}
	if err := storeScimToken(req, currentModel, &out); err != nil {
		// CloudFormation never learns the ID of a failed create, and the SCIM
		// token cannot be retrieved again, so remove the new configuration.
		_ = c.Delete(ctx, itemPath(orgID, out.ID.String()))
		return posthogcfn.Failed(cloudformation.HandlerErrorCodeGeneralServiceException, "storing the SCIM bearer token: %v", err), nil
	}
	return posthogcfn.Success(fromAPI(orgID, &out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("identity provider config OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(orgID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. Every
// writable property is sent, so removed properties are cleared (including the
// OIDC client secret). scim_enabled is sent only when it changes, because
// setting it to true again would regenerate the SCIM bearer token.
func Update(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if id == "" && prevModel != nil {
		id = posthogcfn.StringValue(prevModel.Id)
	}
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("identity provider config OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	cur, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	wantScim := posthogcfn.BoolValue(currentModel.ScimEnabled)
	enablingScim := wantScim && !cur.ScimEnabled
	if fail := validate(currentModel, enablingScim); fail != nil {
		return *fail, nil
	}
	body := requestBody(currentModel)
	if wantScim != cur.ScimEnabled {
		body["scim_enabled"] = wantScim
	}
	var out idpConfig
	if err := c.Patch(ctx, itemPath(orgID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating identity provider config "+id, err), nil
	}
	if err := storeScimToken(req, currentModel, &out); err != nil {
		// Turn SCIM back off so that the next update generates a new token
		// instead of leaving one nobody can read.
		if perr := c.Patch(ctx, itemPath(orgID, id), map[string]any{"scim_enabled": false}, nil); perr != nil {
			log.Printf("posthog: disabling SCIM on identity provider config %s after a failed secret write: %v", id, perr)
		}
		return posthogcfn.Failed(cloudformation.HandlerErrorCodeGeneralServiceException, "storing the SCIM bearer token: %v", err), nil
	}
	return posthogcfn.Success(fromAPI(orgID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("identity provider config OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, orgID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(orgID, id)); err != nil {
		return posthogcfn.FromError("deleting identity provider config "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID := posthogcfn.StringValue(currentModel.OrganizationId)
	if orgID == "" {
		return posthogcfn.InvalidRequest("OrganizationId is required to list identity provider configs"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[idpConfig](ctx, c, collectionPath(orgID), nil)
	if err != nil {
		return posthogcfn.FromError("listing identity provider configs", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{OrganizationId: posthogcfn.String(orgID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, orgID, id string) (*idpConfig, *handler.ProgressEvent) {
	var out idpConfig
	if err := c.Get(ctx, itemPath(orgID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading identity provider config "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// storeScimToken writes a SCIM bearer token returned by PostHog to the
// configured secret, then forgets it.
func storeScimToken(req handler.Request, m *Model, out *idpConfig) error {
	token := posthogcfn.StringValue(out.ScimBearerToken)
	out.ScimBearerToken = nil
	if token == "" {
		return nil
	}
	return posthogcfn.PutSecret(req.Session, posthogcfn.StringValue(m.ScimBearerTokenSecretArn), token)
}

// requestBody returns every writable property except scim_enabled. Unset
// properties get the value PostHog treats as "not configured".
func requestBody(m *Model) map[string]any {
	domainIDs, allowed := m.OrganizationDomainIds, m.IdJagAllowedClients
	if domainIDs == nil {
		domainIDs = []string{}
	}
	if allowed == nil {
		allowed = []string{}
	}
	return map[string]any{
		"name":                    posthogcfn.StringValue(m.Name),
		"domain_scope":            nullable(m.DomainScope),
		"config_scope":            nullable(m.ConfigScope),
		"organization_domain_ids": domainIDs,
		"oidc_issuer_url":         posthogcfn.StringValue(m.OidcIssuerUrl),
		"oidc_client_id":          posthogcfn.StringValue(m.OidcClientId),
		// An empty string removes the saved secret.
		"oidc_client_secret":     posthogcfn.StringValue(m.OidcClientSecret),
		"saml_entity_id":         nullable(m.SamlEntityId),
		"saml_acs_url":           nullable(m.SamlAcsUrl),
		"saml_x509_cert":         nullable(m.SamlX509Cert),
		"id_jag_issuer_url":      nullable(m.IdJagIssuerUrl),
		"id_jag_jwks_url":        nullable(m.IdJagJwksUrl),
		"id_jag_allowed_clients": allowed,
	}
}

// nullable returns nil (JSON null) for an unset or empty string.
func nullable(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

// fromAPI converts an API configuration to the model. Write-only properties
// (OidcClientSecret, SamlX509Cert) are never returned. ScimBearerTokenSecretArn
// is not stored by PostHog and is carried over from the template.
func fromAPI(orgID string, p *idpConfig, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	// An identifier-only read (import, List follow-up) reports everything.
	all := desired.Name == nil
	m := &Model{
		OrganizationId:           posthogcfn.String(orgID),
		Id:                       p.ID.Ptr(),
		Name:                     posthogcfn.StringOrNil(p.Name),
		OrganizationDomainIds:    posthogcfn.SliceOrNil(p.OrganizationDomainIDs),
		OidcIssuerUrl:            posthogcfn.StringOrNil(p.OidcIssuerURL),
		OidcClientId:             posthogcfn.StringOrNil(p.OidcClientID),
		SamlEntityId:             posthogcfn.StringPtrOrNil(p.SamlEntityID),
		SamlAcsUrl:               posthogcfn.StringPtrOrNil(p.SamlAcsURL),
		IdJagIssuerUrl:           posthogcfn.StringPtrOrNil(p.IDJagIssuerURL),
		IdJagJwksUrl:             posthogcfn.StringPtrOrNil(p.IDJagJwksURL),
		IdJagAllowedClients:      posthogcfn.SliceOrNil(p.IDJagAllowedClients),
		ScimBearerTokenSecretArn: desired.ScimBearerTokenSecretArn,
		SamlRelayState:           posthogcfn.StringOrNil(p.SamlRelayState),
		ScimBaseUrl:              posthogcfn.StringOrNil(p.ScimBaseURL),
		HasSaml:                  posthogcfn.Bool(p.HasSaml),
		HasOidc:                  posthogcfn.Bool(p.HasOidc),
		HasOidcClientSecret:      posthogcfn.Bool(p.HasOidcClientSecret),
		HasScim:                  posthogcfn.Bool(p.HasScim),
		HasIdJag:                 posthogcfn.Bool(p.HasIDJag),
		CreatedAt:                posthogcfn.StringOrNil(p.CreatedAt),
		UpdatedAt:                posthogcfn.StringOrNil(p.UpdatedAt),
	}
	// PostHog may fill in the scopes; report them only when the template set
	// them, so a server default is not seen as drift.
	if all || desired.DomainScope != nil {
		m.DomainScope = posthogcfn.StringPtrOrNil(p.DomainScope)
	}
	if all || desired.ConfigScope != nil {
		m.ConfigScope = posthogcfn.StringPtrOrNil(p.ConfigScope)
	}
	if p.ScimEnabled || desired.ScimEnabled != nil {
		m.ScimEnabled = posthogcfn.Bool(p.ScimEnabled)
	}
	return m
}
