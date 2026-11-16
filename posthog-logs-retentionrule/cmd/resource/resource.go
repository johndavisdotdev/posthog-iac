package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// retentionRule is the subset of PostHog's LogsRetentionRule these handlers use.
type retentionRule struct {
	ID        posthogcfn.FlexID `json:"id"`
	Name      *string           `json:"name"`
	Enabled   bool              `json:"enabled"`
	Priority  *int              `json:"priority"`
	Config    json.RawMessage   `json:"config"`
	Version   *int              `json:"version"`
	CreatedAt string            `json:"created_at"`
	UpdatedAt *string           `json:"updated_at"`
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
	return posthogcfn.Path("/api/projects/%s/logs/retention_rules/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/logs/retention_rules/%s/", projectID, id)
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
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out retentionRule
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating logs retention rule", err), nil
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
		return posthogcfn.NotFound("logs retention rule ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("logs retention rule ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH returns 404 for a missing rule, which FromError maps to NotFound.
	var out retentionRule
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating logs retention rule "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("logs retention rule ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting logs retention rule "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list logs retention rules"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[retentionRule](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing logs retention rules", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*retentionRule, *handler.ProgressEvent) {
	var out retentionRule
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading logs retention rule "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are reset. Priority is the
// exception: when the template leaves it out, PostHog assigns (or keeps) one.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Config) == "" {
		return nil, fmt.Errorf("Config is required")
	}
	cfg, err := posthogcfn.ParseJSON("Config", m.Config)
	if err != nil {
		return nil, err
	}
	if _, ok := cfg.(map[string]any); !ok {
		return nil, fmt.Errorf("Config must be a JSON object")
	}
	body := map[string]any{
		"name":    posthogcfn.StringValue(m.Name),
		"enabled": posthogcfn.BoolValue(m.Enabled),
		"config":  cfg,
	}
	if m.Priority != nil {
		body["priority"] = *m.Priority
	}
	return body, nil
}

// fromAPI converts an API rule to the model. desired is the model from the
// request; server-assigned values (priority, keys PostHog adds to config) are
// not reported unless the template set them, so they do not show as drift.
func fromAPI(projectID string, r *retentionRule, desired *Model) *Model {
	m := &Model{
		ProjectId: posthogcfn.String(projectID),
		Id:        r.ID.Ptr(),
		Name:      r.Name,
		Version:   r.Version,
		CreatedAt: posthogcfn.StringOrNil(r.CreatedAt),
		UpdatedAt: posthogcfn.StringPtrOrNil(r.UpdatedAt),
	}
	var want Model
	if desired != nil {
		want = *desired
	}
	if r.Enabled || want.Enabled != nil {
		m.Enabled = posthogcfn.Bool(r.Enabled)
	}
	if want.Priority != nil {
		m.Priority = r.Priority
	}
	m.Config = jsonOut(want.Config, r.Config)
	return m
}
