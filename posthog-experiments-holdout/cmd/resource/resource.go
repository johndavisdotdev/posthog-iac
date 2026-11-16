package resource

import (
	"context"
	"encoding/json"
	"reflect"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// holdout is the subset of PostHog's ExperimentHoldout object these handlers use.
type holdout struct {
	ID          posthogcfn.FlexID `json:"id"`
	Name        *string           `json:"name"`
	Description *string           `json:"description"`
	Filters     json.RawMessage   `json:"filters"`
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
	return posthogcfn.Path("/api/projects/%s/experiment_holdouts/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/experiment_holdouts/%s/", projectID, id)
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
	body, fail := requestBody(currentModel)
	if fail != nil {
		return *fail, nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out holdout
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating holdout", err), nil
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
		return posthogcfn.NotFound("holdout ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("holdout ProjectId and Id must be set"), nil
	}
	body, fail := requestBody(currentModel)
	if fail != nil {
		return *fail, nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out holdout
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating holdout "+id, err), nil
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
		return posthogcfn.NotFound("holdout ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting holdout "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list holdouts"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[holdout](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing holdouts", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one holdout, mapping a 404 to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*holdout, *handler.ProgressEvent) {
	var out holdout
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading holdout "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody validates the model and builds the create/update body. Every
// writable field is sent so that a removed Description is cleared.
func requestBody(m *Model) (map[string]any, *handler.ProgressEvent) {
	invalid := func(format string, args ...any) (map[string]any, *handler.ProgressEvent) {
		ev := posthogcfn.InvalidRequest(format, args...)
		return nil, &ev
	}
	if posthogcfn.StringValue(m.Name) == "" {
		return invalid("Name is required")
	}
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return invalid("%v", err)
	}
	groups, ok := filters.([]any)
	if !ok || len(groups) == 0 {
		return invalid("Filters must be a non-empty JSON array of release condition groups")
	}
	for _, g := range groups {
		if _, ok := g.(map[string]any); !ok {
			return invalid("each Filters element must be a JSON object")
		}
	}
	return map[string]any{
		"name":        posthogcfn.StringValue(m.Name),
		"description": posthogcfn.StringValue(m.Description),
		"filters":     groups,
	}, nil
}

// fromAPI converts an API holdout to the model. The template's Filters string
// is kept when it matches the API value, ignoring the variant PostHog sets on
// every group and null or empty members it fills in.
func fromAPI(projectID string, h *holdout, desired *Model) *Model {
	m := &Model{
		ProjectId:   posthogcfn.String(projectID),
		Id:          h.ID.Ptr(),
		Name:        h.Name,
		Description: posthogcfn.StringPtrOrNil(h.Description),
		CreatedAt:   posthogcfn.StringOrNil(h.CreatedAt),
		UpdatedAt:   posthogcfn.StringOrNil(h.UpdatedAt),
	}
	var want *string
	if desired != nil {
		want = desired.Filters
	}
	m.Filters = preserveFilters(want, h.Filters)
	return m
}

func preserveFilters(desired *string, api json.RawMessage) *string {
	var got any
	if len(api) == 0 || json.Unmarshal(api, &got) != nil {
		return nil
	}
	groups, ok := got.([]any)
	if !ok || len(groups) == 0 {
		return nil
	}
	got = normalize(groups)
	if desired != nil {
		var w any
		if json.Unmarshal([]byte(*desired), &w) == nil {
			if wg, ok := w.([]any); ok && reflect.DeepEqual(normalize(wg), got) {
				return desired
			}
		}
	}
	// Report the API value without the server-set variant, so that a template
	// written from it matches.
	for _, g := range groups {
		if obj, ok := g.(map[string]any); ok {
			delete(obj, "variant")
		}
	}
	return posthogcfn.ToJSONString(groups)
}

// normalize returns a copy of the groups without variant and without null or
// empty members, for comparison.
func normalize(groups []any) any {
	out := make([]any, len(groups))
	for i, g := range groups {
		obj, ok := g.(map[string]any)
		if !ok {
			out[i] = g
			continue
		}
		c := map[string]any{}
		for k, v := range obj {
			if k == "variant" || isEmpty(v) {
				continue
			}
			c[k] = v
		}
		out[i] = c
	}
	return out
}

func isEmpty(v any) bool {
	switch t := v.(type) {
	case nil:
		return true
	case map[string]any:
		return len(t) == 0
	case []any:
		return len(t) == 0
	}
	return false
}
