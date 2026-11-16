package resource

import (
	"context"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// domain is the subset of PostHog's OrganizationDomain object these handlers use.
type domain struct {
	ID                     posthogcfn.FlexID `json:"id"`
	Domain                 string            `json:"domain"`
	IsVerified             bool              `json:"is_verified"`
	VerifiedAt             *string           `json:"verified_at"`
	VerificationChallenge  string            `json:"verification_challenge"`
	JitProvisioningEnabled bool              `json:"jit_provisioning_enabled"`
	SsoEnforcement         string            `json:"sso_enforcement"`
	ScimBaseURL            *string           `json:"scim_base_url"`
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
	return posthogcfn.Path("/api/organizations/%s/domains/", orgID)
}

func itemPath(orgID, id string) string {
	return posthogcfn.Path("/api/organizations/%s/domains/%s/", orgID, id)
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
	if posthogcfn.StringValue(currentModel.Domain) == "" {
		return posthogcfn.InvalidRequest("Domain is required"), nil
	}
	body := settingsBody(currentModel)
	body["domain"] = posthogcfn.StringValue(currentModel.Domain)
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out domain
	if err := c.Post(ctx, collectionPath(orgID), body, &out); err != nil {
		return posthogcfn.FromError("creating organization domain", err), nil
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
		return posthogcfn.NotFound("organization domain OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(orgID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. Domain is
// create-only, so only the SSO settings are sent.
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
		return posthogcfn.NotFound("organization domain OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	cur, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	if want := posthogcfn.StringValue(currentModel.Domain); want != "" && !strings.EqualFold(want, cur.Domain) {
		return posthogcfn.NotUpdatable("Domain cannot be changed on an existing organization domain"), nil
	}
	var out domain
	if err := c.Patch(ctx, itemPath(orgID, id), settingsBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("updating organization domain "+id, err), nil
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
		return posthogcfn.NotFound("organization domain OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, orgID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(orgID, id)); err != nil {
		return posthogcfn.FromError("deleting organization domain "+id, err), nil
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
		return posthogcfn.InvalidRequest("OrganizationId is required to list organization domains"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[domain](ctx, c, collectionPath(orgID), nil)
	if err != nil {
		return posthogcfn.FromError("listing organization domains", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{OrganizationId: posthogcfn.String(orgID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, orgID, id string) (*domain, *handler.ProgressEvent) {
	var out domain
	if err := c.Get(ctx, itemPath(orgID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading organization domain "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// settingsBody returns every writable setting, so that settings removed from
// the template are reset (JIT provisioning off, no SSO enforcement).
func settingsBody(m *Model) map[string]any {
	return map[string]any{
		"jit_provisioning_enabled": posthogcfn.BoolValue(m.JitProvisioningEnabled),
		"sso_enforcement":          posthogcfn.StringValue(m.SsoEnforcement),
	}
}

// fromAPI converts an API domain to the model. The template's Domain is kept
// when it differs only in case (PostHog stores domains lowercased).
func fromAPI(orgID string, d *domain, desired *Model) *Model {
	m := &Model{
		OrganizationId:        posthogcfn.String(orgID),
		Id:                    d.ID.Ptr(),
		Domain:                posthogcfn.StringOrNil(d.Domain),
		SsoEnforcement:        posthogcfn.StringOrNil(d.SsoEnforcement),
		IsVerified:            posthogcfn.Bool(d.IsVerified),
		VerifiedAt:            posthogcfn.StringPtrOrNil(d.VerifiedAt),
		VerificationChallenge: posthogcfn.StringOrNil(d.VerificationChallenge),
		ScimBaseUrl:           posthogcfn.StringPtrOrNil(d.ScimBaseURL),
	}
	if desired != nil && desired.Domain != nil && strings.EqualFold(*desired.Domain, d.Domain) {
		m.Domain = desired.Domain
	}
	// false is PostHog's default; report it only when the template set it.
	if d.JitProvisioningEnabled || (desired != nil && desired.JitProvisioningEnabled != nil) {
		m.JitProvisioningEnabled = posthogcfn.Bool(d.JitProvisioningEnabled)
	}
	return m
}
