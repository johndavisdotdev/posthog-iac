package resource

import (
	"context"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// roleMembership is the subset of PostHog's RoleMembership object these
// handlers use. user_uuid is write-only in the API; the user's UUID is read
// back from the nested user object.
type roleMembership struct {
	ID     posthogcfn.FlexID `json:"id"`
	RoleID string            `json:"role_id"`
	User   *struct {
		UUID string `json:"uuid"`
	} `json:"user"`
	JoinedAt  string `json:"joined_at"`
	UpdatedAt string `json:"updated_at"`
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

func collectionPath(orgID, roleID string) string {
	return posthogcfn.Path("/api/organizations/%s/roles/%s/role_memberships/", orgID, roleID)
}

func itemPath(orgID, roleID, id string) string {
	return posthogcfn.Path("/api/organizations/%s/roles/%s/role_memberships/%s/", orgID, roleID, id)
}

// ids returns the composite identifier from m, falling back to prev for Id.
func ids(m, prev *Model) (orgID, roleID, id string) {
	orgID, roleID, id = posthogcfn.StringValue(m.OrganizationId), posthogcfn.StringValue(m.RoleId), posthogcfn.StringValue(m.Id)
	if id == "" && prev != nil {
		id = posthogcfn.StringValue(prev.Id)
	}
	return
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, roleID, _ := ids(currentModel, nil)
	userUUID := posthogcfn.StringValue(currentModel.UserUuid)
	switch {
	case orgID == "":
		return posthogcfn.InvalidRequest("OrganizationId is required"), nil
	case roleID == "":
		return posthogcfn.InvalidRequest("RoleId is required"), nil
	case userUUID == "":
		return posthogcfn.InvalidRequest("UserUuid is required"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out roleMembership
	if err := c.Post(ctx, collectionPath(orgID, roleID), map[string]any{"user_uuid": userUUID}, &out); err != nil {
		return posthogcfn.FromError("creating role membership", err), nil
	}
	return posthogcfn.Success(fromAPI(orgID, roleID, &out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, roleID, id := ids(currentModel, nil)
	if orgID == "" || roleID == "" || id == "" {
		return posthogcfn.NotFound("role membership OrganizationId, RoleId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, roleID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(orgID, roleID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. Role
// memberships have no update endpoint and every writable property is
// create-only, so Update only confirms the membership still exists and that
// nothing create-only changed.
func Update(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, roleID, id := ids(currentModel, prevModel)
	if orgID == "" || roleID == "" || id == "" {
		return posthogcfn.NotFound("role membership OrganizationId, RoleId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, roleID, id)
	if fail != nil {
		return *fail, nil
	}
	if prevModel != nil {
		for name, pair := range map[string][2]*string{
			"OrganizationId": {currentModel.OrganizationId, prevModel.OrganizationId},
			"RoleId":         {currentModel.RoleId, prevModel.RoleId},
			"UserUuid":       {currentModel.UserUuid, prevModel.UserUuid},
		} {
			if pair[1] != nil && !strings.EqualFold(posthogcfn.StringValue(pair[0]), *pair[1]) {
				return posthogcfn.NotUpdatable("%s cannot be changed on an existing role membership", name), nil
			}
		}
	}
	return posthogcfn.Success(fromAPI(orgID, roleID, out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, roleID, id := ids(currentModel, nil)
	if orgID == "" || roleID == "" || id == "" {
		return posthogcfn.NotFound("role membership OrganizationId, RoleId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, orgID, roleID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(orgID, roleID, id)); err != nil {
		return posthogcfn.FromError("deleting role membership "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service. It lists the
// memberships of one role, so both OrganizationId and RoleId are required.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, roleID, _ := ids(currentModel, nil)
	if orgID == "" || roleID == "" {
		return posthogcfn.InvalidRequest("OrganizationId and RoleId are required to list role memberships"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[roleMembership](ctx, c, collectionPath(orgID, roleID), nil)
	if err != nil {
		return posthogcfn.FromError("listing role memberships", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{
			OrganizationId: posthogcfn.String(orgID),
			RoleId:         posthogcfn.String(roleID),
			Id:             items[i].ID.Ptr(),
		})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, orgID, roleID, id string) (*roleMembership, *handler.ProgressEvent) {
	var out roleMembership
	if err := c.Get(ctx, itemPath(orgID, roleID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading role membership "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// fromAPI converts an API membership to the model. The template's UserUuid is
// kept when it is the same UUID in a different case, so it does not drift.
func fromAPI(orgID, roleID string, r *roleMembership, desired *Model) *Model {
	m := &Model{
		OrganizationId: posthogcfn.String(orgID),
		RoleId:         posthogcfn.String(roleID),
		Id:             r.ID.Ptr(),
		JoinedAt:       posthogcfn.StringOrNil(r.JoinedAt),
		UpdatedAt:      posthogcfn.StringOrNil(r.UpdatedAt),
	}
	if desired != nil && desired.RoleId != nil && strings.EqualFold(*desired.RoleId, roleID) {
		m.RoleId = desired.RoleId
	}
	if r.User != nil && r.User.UUID != "" {
		m.UserUuid = posthogcfn.String(r.User.UUID)
		if desired != nil && desired.UserUuid != nil && strings.EqualFold(*desired.UserUuid, r.User.UUID) {
			m.UserUuid = desired.UserUuid
		}
	}
	return m
}
