package resource

import (
	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// colorTheme is the subset of PostHog's DataColorTheme object these handlers
// use.
type colorTheme struct {
	ID        posthogcfn.FlexID `json:"id"`
	Name      string            `json:"name"`
	Colors    []string          `json:"colors"`
	IsGlobal  bool              `json:"is_global"`
	CreatedAt *string           `json:"created_at"`
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

func collectionPath(projectID string) string {
	return posthogcfn.Path("/api/projects/%s/data_color_themes/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/data_color_themes/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out colorTheme
	if err := c.Post(ctx, collectionPath(projectID), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("creating data color theme", err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("data color theme ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out colorTheme
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading data color theme "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out)), nil
}

// Update handles the Update event from the CloudFormation service.
func Update(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if id == "" && prevModel != nil {
		id = posthogcfn.StringValue(prevModel.Id)
	}
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("data color theme ProjectId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a deleted theme returns 404, which FromError maps to NotFound.
	var out colorTheme
	if err := c.Patch(ctx, itemPath(projectID, id), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("updating data color theme "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("data color theme ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out colorTheme
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading data color theme "+id, err), nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting data color theme "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service. PostHog's
// built-in global themes are listed alongside project themes; they are not
// project resources and are skipped.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list data color themes"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[colorTheme](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing data color themes", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].IsGlobal {
			continue
		}
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// requestBody builds the create/update body. Both writable fields are always
// sent, so removing Colors from the template clears the palette.
func requestBody(m *Model) map[string]any {
	colors := m.Colors
	if colors == nil {
		colors = []string{}
	}
	return map[string]any{
		"name":   posthogcfn.StringValue(m.Name),
		"colors": colors,
	}
}

// fromAPI converts an API theme to the model.
func fromAPI(projectID string, t *colorTheme) *Model {
	return &Model{
		ProjectId: posthogcfn.String(projectID),
		Id:        t.ID.Ptr(),
		Name:      posthogcfn.StringOrNil(t.Name),
		Colors:    posthogcfn.SliceOrNil(t.Colors),
		CreatedAt: posthogcfn.StringPtrOrNil(t.CreatedAt),
	}
}
