package resource

import (
	"context"
	"encoding/json"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// savedMetric is the subset of PostHog's ExperimentSavedMetric object these
// handlers use.
type savedMetric struct {
	ID          posthogcfn.FlexID `json:"id"`
	Name        *string           `json:"name"`
	Description *string           `json:"description"`
	Query       json.RawMessage   `json:"query"`
	Tags        []string          `json:"tags"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   string            `json:"updated_at"`
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
	return posthogcfn.Path("/api/projects/%s/experiment_saved_metrics/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/experiment_saved_metrics/%s/", projectID, id)
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

	var out savedMetric
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating shared metric", err), nil
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
		return posthogcfn.NotFound("shared metric ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. PATCH
// returns 404 for a missing metric, which maps to NotFound.
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
		return posthogcfn.NotFound("shared metric ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out savedMetric
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating shared metric "+id, err), nil
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
		return posthogcfn.NotFound("shared metric ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting shared metric "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list shared metrics"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[savedMetric](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing shared metrics", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*savedMetric, *handler.ProgressEvent) {
	var out savedMetric
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading shared metric "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, errString("Name is required")
	}
	query, err := posthogcfn.ParseJSON("Query", m.Query)
	if err != nil {
		return nil, err
	}
	if query == nil {
		return nil, errString("Query is required")
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{
		"name":        posthogcfn.StringValue(m.Name),
		"description": posthogcfn.StringValue(m.Description),
		"query":       query,
		"tags":        tags,
	}, nil
}

type errString string

func (e errString) Error() string { return string(e) }

// fromAPI converts an API shared metric to the model, keeping the template's
// Query string when the API value contains it.
func fromAPI(projectID string, s *savedMetric, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	return &Model{
		ProjectId:   posthogcfn.String(projectID),
		Id:          s.ID.Ptr(),
		Name:        s.Name,
		Description: posthogcfn.StringPtrOrNil(s.Description),
		Query:       jsonOut(desired.Query, s.Query),
		Tags:        posthogcfn.SliceOrNil(s.Tags),
		CreatedAt:   posthogcfn.StringOrNil(s.CreatedAt),
		UpdatedAt:   posthogcfn.StringOrNil(s.UpdatedAt),
	}
}
