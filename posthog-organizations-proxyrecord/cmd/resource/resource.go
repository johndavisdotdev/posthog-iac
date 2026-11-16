package resource

import (
	"context"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// statusDeleting is the status of a proxy whose infrastructure is being torn
// down after a DELETE. Such a record is treated as already deleted.
const statusDeleting = "deleting"

// proxyRecord is the subset of PostHog's ProxyRecord object these handlers use.
type proxyRecord struct {
	ID                    posthogcfn.FlexID `json:"id"`
	Domain                string            `json:"domain"`
	TargetCname           string            `json:"target_cname"`
	RootRedirectURL       *string           `json:"root_redirect_url"`
	RootRedirectSupported bool              `json:"root_redirect_supported"`
	Status                string            `json:"status"`
	Message               *string           `json:"message"`
	CreatedAt             string            `json:"created_at"`
	UpdatedAt             string            `json:"updated_at"`
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
	return posthogcfn.Path("/api/organizations/%s/proxy_records/", orgID)
}

func itemPath(orgID, id string) string {
	return posthogcfn.Path("/api/organizations/%s/proxy_records/%s/", orgID, id)
}

// Create handles the Create event from the CloudFormation service. PostHog
// accepts only the domain on create; a root redirect is set with a follow-up
// PATCH.
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
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out proxyRecord
	if err := c.Post(ctx, collectionPath(orgID), map[string]any{"domain": *currentModel.Domain}, &out); err != nil {
		return posthogcfn.FromError("creating proxy record", err), nil
	}
	if redirect := posthogcfn.StringValue(currentModel.RootRedirectUrl); redirect != "" {
		id := out.ID.String()
		if err := c.Patch(ctx, itemPath(orgID, id), map[string]any{"root_redirect_url": redirect}, &out); err != nil {
			// CloudFormation never learns the ID of a failed create, so remove
			// the half-configured proxy instead of leaking it.
			_ = c.Delete(ctx, itemPath(orgID, id))
			return posthogcfn.FromError("setting the root redirect of proxy record "+id, err), nil
		}
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
		return posthogcfn.NotFound("proxy record OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(orgID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. Only the
// root redirect can change; removing it from the template disables it.
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
		return posthogcfn.NotFound("proxy record OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	if want := posthogcfn.StringValue(currentModel.Domain); want != "" && !strings.EqualFold(want, out.Domain) {
		return posthogcfn.NotUpdatable("Domain cannot be changed on an existing proxy record"), nil
	}
	want := posthogcfn.StringValue(currentModel.RootRedirectUrl)
	// Skip the PATCH when nothing changes: it fails on proxies that do not
	// support a root redirect, even when clearing it.
	if want != posthogcfn.StringValue(out.RootRedirectURL) {
		var redirect any
		if want != "" {
			redirect = want
		}
		if err := c.Patch(ctx, itemPath(orgID, id), map[string]any{"root_redirect_url": redirect}, out); err != nil {
			return posthogcfn.FromError("updating proxy record "+id, err), nil
		}
	}
	return posthogcfn.Success(fromAPI(orgID, out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. For a live
// proxy PostHog starts a clean-up workflow and the record stays visible with
// status "deleting" until it finishes; it is reported as deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("proxy record OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, orgID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(orgID, id)); err != nil {
		return posthogcfn.FromError("deleting proxy record "+id, err), nil
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
		return posthogcfn.InvalidRequest("OrganizationId is required to list proxy records"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// The endpoint returns {"results": [...], "max_proxy_records": n} without
	// pagination, which List reads as a single page.
	items, err := posthogcfn.List[proxyRecord](ctx, c, collectionPath(orgID), nil)
	if err != nil {
		return posthogcfn.FromError("listing proxy records", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Status == statusDeleting {
			continue
		}
		models = append(models, Model{OrganizationId: posthogcfn.String(orgID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one proxy record, mapping a 404 or a record being deleted to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, orgID, id string) (*proxyRecord, *handler.ProgressEvent) {
	var out proxyRecord
	if err := c.Get(ctx, itemPath(orgID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading proxy record "+id, err)
		return nil, &ev
	}
	if out.Status == statusDeleting {
		ev := posthogcfn.NotFound("proxy record %s is being deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// fromAPI converts an API proxy record to the model. The template's Domain is
// kept when it differs only in case.
func fromAPI(orgID string, p *proxyRecord, desired *Model) *Model {
	m := &Model{
		OrganizationId:        posthogcfn.String(orgID),
		Id:                    p.ID.Ptr(),
		Domain:                posthogcfn.StringOrNil(p.Domain),
		RootRedirectUrl:       posthogcfn.StringPtrOrNil(p.RootRedirectURL),
		TargetCname:           posthogcfn.StringOrNil(p.TargetCname),
		Status:                posthogcfn.StringOrNil(p.Status),
		Message:               posthogcfn.StringPtrOrNil(p.Message),
		RootRedirectSupported: posthogcfn.Bool(p.RootRedirectSupported),
		CreatedAt:             posthogcfn.StringOrNil(p.CreatedAt),
		UpdatedAt:             posthogcfn.StringOrNil(p.UpdatedAt),
	}
	if desired != nil && desired.Domain != nil && strings.EqualFold(*desired.Domain, p.Domain) {
		m.Domain = desired.Domain
	}
	return m
}
