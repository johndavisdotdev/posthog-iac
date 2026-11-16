package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// rule is the subset of PostHog's ErrorTrackingGroupingRule these handlers use.
type rule struct {
	ID          posthogcfn.FlexID `json:"id"`
	Filters     json.RawMessage   `json:"filters"`
	Assignee    *assignee         `json:"assignee"`
	Description *string           `json:"description"`
	OrderKey    *int              `json:"order_key"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   string            `json:"updated_at"`
}

type assignee struct {
	Type string            `json:"type"`
	ID   posthogcfn.FlexID `json:"id"`
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
	return posthogcfn.Path("/api/projects/%s/error_tracking/grouping_rules/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/error_tracking/grouping_rules/%s/", projectID, id)
}

func reorderPath(projectID string) string {
	return posthogcfn.Path("/api/projects/%s/error_tracking/grouping_rules/reorder/", projectID)
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
	filters, err := parseFilters(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	body := map[string]any{"filters": filters}
	if a := currentModel.Assignee; a != nil {
		if posthogcfn.StringValue(a.Type) == "" || posthogcfn.StringValue(a.Id) == "" {
			return posthogcfn.InvalidRequest("Assignee.Type and Assignee.Id are required when Assignee is set"), nil
		}
		body["assignee"] = assignee{Type: *a.Type, ID: posthogcfn.FlexID(*a.Id)}
	}
	if currentModel.Description != nil {
		body["description"] = *currentModel.Description
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out rule
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating grouping rule", err), nil
	}
	id := out.ID.String()
	// The create request has no order_key; set it with the reorder endpoint.
	if reordered, err := reorder(ctx, c, projectID, id, out.OrderKey, currentModel.OrderKey); err != nil {
		return posthogcfn.FromError("ordering grouping rule "+id, err), nil
	} else if reordered {
		r, fail := get(ctx, c, projectID, id)
		if fail != nil {
			return *fail, nil
		}
		out = *r
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
		return posthogcfn.NotFound("grouping rule ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. Only the
// filters (PATCH) and order (reorder endpoint) can change; Assignee and
// Description are create-only. PostHog answers the PATCH with 204 and no
// body, so the rule is read back afterwards.
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
		return posthogcfn.NotFound("grouping rule ProjectId and Id must be set"), nil
	}
	filters, err := parseFilters(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	current, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	if err := c.Patch(ctx, itemPath(projectID, id), map[string]any{"filters": filters}, nil); err != nil {
		return posthogcfn.FromError("updating grouping rule "+id, err), nil
	}
	if _, err := reorder(ctx, c, projectID, id, current.OrderKey, currentModel.OrderKey); err != nil {
		return posthogcfn.FromError("ordering grouping rule "+id, err), nil
	}
	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("grouping rule ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting grouping rule "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service. The list
// endpoint answers {"results": [...]} without pagination, which List handles.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list grouping rules"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[rule](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing grouping rules", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*rule, *handler.ProgressEvent) {
	var out rule
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading grouping rule "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// reorder moves the rule to the desired order_key with PATCH reorder/ when
// the template sets one that differs from the current value.
func reorder(ctx context.Context, c *posthogcfn.Client, projectID, id string, current, want *int) (bool, error) {
	if want == nil || (current != nil && *current == *want) {
		return false, nil
	}
	body := map[string]any{"orders": map[string]int{id: *want}}
	return true, c.Patch(ctx, reorderPath(projectID), body, nil)
}

func parseFilters(m *Model) (any, error) {
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return nil, err
	}
	if filters == nil {
		return nil, fmt.Errorf("Filters is required")
	}
	if _, ok := filters.(map[string]any); !ok {
		return nil, fmt.Errorf("Filters must be a JSON object such as {\"type\": \"AND\", \"values\": [...]}")
	}
	return filters, nil
}

// fromAPI converts an API rule to the model. desired is the model from the
// request; its Filters string is kept when JSON-equal to the API value.
func fromAPI(projectID string, r *rule, desired *Model) *Model {
	m := &Model{
		ProjectId:   posthogcfn.String(projectID),
		Id:          r.ID.Ptr(),
		Description: posthogcfn.StringPtrOrNil(r.Description),
		CreatedAt:   posthogcfn.StringOrNil(r.CreatedAt),
		UpdatedAt:   posthogcfn.StringOrNil(r.UpdatedAt),
	}
	var want *string
	if desired != nil {
		want = desired.Filters
	}
	m.Filters = posthogcfn.PreserveJSON(want, r.Filters)
	if r.Assignee != nil && r.Assignee.ID != "" {
		m.Assignee = &Assignee{Type: posthogcfn.StringOrNil(r.Assignee.Type), Id: r.Assignee.ID.Ptr()}
	}
	// order_key is reported only when the template manages it, so rules
	// reordered in the PostHog UI do not show drift on unmanaged templates.
	if desired != nil && desired.OrderKey != nil && r.OrderKey != nil {
		m.OrderKey = posthogcfn.Int(*r.OrderKey)
	}
	return m
}
