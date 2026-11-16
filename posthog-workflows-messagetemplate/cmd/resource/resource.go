package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// defaultType is the message channel PostHog stores when type is not sent.
const defaultType = "email"

// messageTemplate is the subset of PostHog's MessageTemplate object these
// handlers use.
type messageTemplate struct {
	ID                     posthogcfn.FlexID `json:"id"`
	Name                   string            `json:"name"`
	Description            string            `json:"description"`
	Tags                   []string          `json:"tags"`
	Type                   string            `json:"type"`
	Content                json.RawMessage   `json:"content"`
	MessageCategory        *string           `json:"message_category"`
	Sensitive              bool              `json:"sensitive"`
	TransactionalHogFlowID *string           `json:"transactional_hog_flow_id"`
	CreatedAt              string            `json:"created_at"`
	UpdatedAt              string            `json:"updated_at"`
	Deleted                bool              `json:"deleted"`
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
	return posthogcfn.Path("/api/projects/%s/messaging_templates/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/messaging_templates/%s/", projectID, id)
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
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out messageTemplate
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating message template", err), nil
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
		return posthogcfn.NotFound("message template ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("message template ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted template succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out messageTemplate
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating message template "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Templates
// cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("message template ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting message template "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list message templates"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[messageTemplate](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing message templates", err), nil
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

// get reads one live template, mapping a 404 or a soft-deleted template to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*messageTemplate, *handler.ProgressEvent) {
	var out messageTemplate
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading message template "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("message template %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody validates the model and builds the create/update body. Every
// writable field is sent so that properties removed from the template are
// cleared (or reset to the PostHog default) in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	content, err := posthogcfn.ParseJSON("Content", m.Content)
	if err != nil {
		return nil, err
	}
	if _, ok := content.(map[string]any); !ok {
		return nil, fmt.Errorf("Content is required and must be a JSON object")
	}
	typ := posthogcfn.StringValue(m.Type)
	if typ == "" {
		typ = defaultType
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{
		"name":             posthogcfn.StringValue(m.Name),
		"description":      posthogcfn.StringValue(m.Description),
		"tags":             tags,
		"type":             typ,
		"content":          content,
		"message_category": posthogcfn.StringPtrOrNil(m.MessageCategory),
		"sensitive":        posthogcfn.BoolValue(m.Sensitive),
	}, nil
}

// fromAPI converts an API template to the model. desired is the model from
// the request: its Content string is kept when everything it sets matches
// the API value (PostHog adds fields such as the rendered html), and
// server defaults are left out unless the template set them.
func fromAPI(projectID string, a *messageTemplate, desired *Model) *Model {
	m := &Model{
		ProjectId:              posthogcfn.String(projectID),
		Id:                     a.ID.Ptr(),
		Name:                   posthogcfn.StringOrNil(a.Name),
		Description:            posthogcfn.StringOrNil(a.Description),
		Tags:                   posthogcfn.SliceOrNil(a.Tags),
		MessageCategory:        posthogcfn.StringPtrOrNil(a.MessageCategory),
		TransactionalHogFlowId: posthogcfn.StringPtrOrNil(a.TransactionalHogFlowID),
		CreatedAt:              posthogcfn.StringOrNil(a.CreatedAt),
		UpdatedAt:              posthogcfn.StringOrNil(a.UpdatedAt),
	}
	if desired == nil {
		desired = &Model{}
	}
	if a.Type != "" && (a.Type != defaultType || desired.Type != nil) {
		m.Type = posthogcfn.String(a.Type)
	}
	if a.Sensitive || desired.Sensitive != nil {
		m.Sensitive = posthogcfn.Bool(a.Sensitive)
	}
	if !posthogcfn.EmptyJSON(a.Content) {
		m.Content = posthogcfn.PreserveJSONSubset(desired.Content, a.Content)
	}
	return m
}
