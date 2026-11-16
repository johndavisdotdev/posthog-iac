package resource

import (
	"context"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// defaultCategoryType is what PostHog stores when category_type is not sent.
const defaultCategoryType = "marketing"

// messageCategory is the subset of PostHog's MessageCategory object these
// handlers use.
type messageCategory struct {
	ID                posthogcfn.FlexID `json:"id"`
	Key               string            `json:"key"`
	Name              string            `json:"name"`
	Description       string            `json:"description"`
	PublicDescription string            `json:"public_description"`
	CategoryType      string            `json:"category_type"`
	CreatedAt         string            `json:"created_at"`
	UpdatedAt         string            `json:"updated_at"`
	Deleted           bool              `json:"deleted"`
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
	return posthogcfn.Path("/api/projects/%s/messaging_categories/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/messaging_categories/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.Key) == "" {
		return posthogcfn.InvalidRequest("Key is required"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	body := requestBody(currentModel)
	body["key"] = posthogcfn.StringValue(currentModel.Key)
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out messageCategory
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating message category", err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("message category ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
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
		return posthogcfn.NotFound("message category ProjectId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on an archived category succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	// Key is create-only and is not sent on update.
	var out messageCategory
	if err := c.Patch(ctx, itemPath(projectID, id), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("updating message category "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Message
// categories cannot be hard-deleted (DELETE returns 405); they are archived
// with PATCH {"deleted": true}.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("message category ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting message category "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list message categories"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[messageCategory](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing message categories", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Deleted {
			continue
		}
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live category, mapping a 404 or an archived category to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*messageCategory, *handler.ProgressEvent) {
	var out messageCategory
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading message category "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("message category %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared (or reset to the
// PostHog default) in PostHog.
func requestBody(m *Model) map[string]any {
	categoryType := posthogcfn.StringValue(m.CategoryType)
	if categoryType == "" {
		categoryType = defaultCategoryType
	}
	return map[string]any{
		"name":               posthogcfn.StringValue(m.Name),
		"description":        posthogcfn.StringValue(m.Description),
		"public_description": posthogcfn.StringValue(m.PublicDescription),
		"category_type":      categoryType,
	}
}

// fromAPI converts an API category to the model. The PostHog default
// category type is left out unless the template set it, so an omitted
// property does not show as drift.
func fromAPI(projectID string, a *messageCategory, desired *Model) *Model {
	m := &Model{
		ProjectId:         posthogcfn.String(projectID),
		Id:                a.ID.Ptr(),
		Key:               posthogcfn.StringOrNil(a.Key),
		Name:              posthogcfn.StringOrNil(a.Name),
		Description:       posthogcfn.StringOrNil(a.Description),
		PublicDescription: posthogcfn.StringOrNil(a.PublicDescription),
		CreatedAt:         posthogcfn.StringOrNil(a.CreatedAt),
		UpdatedAt:         posthogcfn.StringOrNil(a.UpdatedAt),
	}
	if a.CategoryType != "" && (a.CategoryType != defaultCategoryType || (desired != nil && desired.CategoryType != nil)) {
		m.CategoryType = posthogcfn.String(a.CategoryType)
	}
	return m
}
