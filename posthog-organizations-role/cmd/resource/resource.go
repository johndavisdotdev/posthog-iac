package resource

import (
	"context"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// role is the subset of PostHog's Role object these handlers use.
type role struct {
	ID        posthogcfn.FlexID `json:"id"`
	Name      *string           `json:"name"`
	IsDefault bool              `json:"is_default"`
	CreatedAt string            `json:"created_at"`
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
	return posthogcfn.Path("/api/organizations/%s/roles/", orgID)
}

func itemPath(orgID, id string) string {
	return posthogcfn.Path("/api/organizations/%s/roles/%s/", orgID, id)
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
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out role
	if err := c.Post(ctx, collectionPath(orgID), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("creating role", err), nil
	}
	return posthogcfn.Success(fromAPI(orgID, &out)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("role OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(orgID, out)), nil
}

// Update handles the Update event from the CloudFormation service.
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
		return posthogcfn.NotFound("role OrganizationId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a missing role returns 404, which FromError maps to NotFound.
	var out role
	if err := c.Patch(ctx, itemPath(orgID, id), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("updating role "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(orgID, &out)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("role OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, orgID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(orgID, id)); err != nil {
		return posthogcfn.FromError("deleting role "+id, err), nil
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
		return posthogcfn.InvalidRequest("OrganizationId is required to list roles"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[role](ctx, c, collectionPath(orgID), nil)
	if err != nil {
		return posthogcfn.FromError("listing roles", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{OrganizationId: posthogcfn.String(orgID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, orgID, id string) (*role, *handler.ProgressEvent) {
	var out role
	if err := c.Get(ctx, itemPath(orgID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading role "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body (name is the only writable field).
func requestBody(m *Model) map[string]any {
	return map[string]any{"name": posthogcfn.StringValue(m.Name)}
}

func fromAPI(orgID string, r *role) *Model {
	return &Model{
		OrganizationId: posthogcfn.String(orgID),
		Id:             r.ID.Ptr(),
		Name:           r.Name,
		IsDefault:      posthogcfn.Bool(r.IsDefault),
		CreatedAt:      posthogcfn.StringOrNil(r.CreatedAt),
	}
}
