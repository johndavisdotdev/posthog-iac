package resource

import (
	"context"
	"encoding/json"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// cohort is the subset of PostHog's Cohort object these handlers use.
type cohort struct {
	ID          posthogcfn.FlexID `json:"id"`
	Name        *string           `json:"name"`
	Description string            `json:"description"`
	Filters     json.RawMessage   `json:"filters"`
	Query       json.RawMessage   `json:"query"`
	IsStatic    bool              `json:"is_static"`
	CohortType  *string           `json:"cohort_type"`
	CreatedAt   *string           `json:"created_at"`
	Deleted     bool              `json:"deleted"`
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
	return posthogcfn.Path("/api/projects/%s/cohorts/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/cohorts/%s/", projectID, id)
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
	body["is_static"] = posthogcfn.BoolValue(currentModel.IsStatic)
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out cohort
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating cohort", err), nil
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
		return posthogcfn.NotFound("cohort ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("cohort ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted cohort succeeds, so check it is live first.
	existing, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	if currentModel.IsStatic != nil && *currentModel.IsStatic != existing.IsStatic {
		return posthogcfn.NotUpdatable("IsStatic cannot be changed after the cohort is created"), nil
	}
	var out cohort
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating cohort "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Cohorts
// cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("cohort ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting cohort "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list cohorts"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[cohort](ctx, c, collectionPath(projectID), map[string][]string{"basic": {"true"}})
	if err != nil {
		return posthogcfn.FromError("listing cohorts", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Deleted {
			continue
		}
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live cohort, mapping a 404 or a soft-deleted cohort to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*cohort, *handler.ProgressEvent) {
	var out cohort
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading cohort "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("cohort %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog. is_static
// is create-only and added by Create; cohort_type is only sent when set,
// because PostHog derives it from the filters otherwise.
func requestBody(m *Model) (map[string]any, error) {
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return nil, err
	}
	query, err := posthogcfn.ParseJSON("Query", m.Query)
	if err != nil {
		return nil, err
	}
	body := map[string]any{
		"name":        posthogcfn.StringValue(m.Name),
		"description": posthogcfn.StringValue(m.Description),
		"filters":     filters,
		"query":       query,
	}
	if m.CohortType != nil {
		body["cohort_type"] = *m.CohortType
	}
	return body, nil
}

// fromAPI converts an API cohort to the model. desired is the model from the
// request; its JSON strings are kept when the API value matches them.
func fromAPI(projectID string, a *cohort, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:   posthogcfn.String(projectID),
		Id:          a.ID.Ptr(),
		Name:        a.Name,
		Description: posthogcfn.StringOrNil(a.Description),
		CreatedAt:   posthogcfn.StringPtrOrNil(a.CreatedAt),
	}
	if a.IsStatic || desired.IsStatic != nil {
		m.IsStatic = posthogcfn.Bool(a.IsStatic)
	}
	// PostHog derives cohort_type from the filters; only report it when the
	// template manages it.
	if desired.CohortType != nil {
		m.CohortType = posthogcfn.StringPtrOrNil(a.CohortType)
	}
	if desired.Filters != nil || !emptyFilters(a.Filters) {
		m.Filters = posthogcfn.PreserveJSONSubset(desired.Filters, a.Filters)
	}
	m.Query = posthogcfn.PreserveJSONSubset(desired.Query, a.Query)
	return m
}

// emptyFilters reports whether PostHog's filters value carries no conditions
// (null, {}, or a properties group with no values).
func emptyFilters(raw json.RawMessage) bool {
	var f map[string]any
	if len(raw) == 0 || json.Unmarshal(raw, &f) != nil || len(f) == 0 {
		return true
	}
	props, _ := f["properties"].(map[string]any)
	if len(f) == 1 && props != nil {
		values, _ := props["values"].([]any)
		return len(values) == 0
	}
	return false
}
