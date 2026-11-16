package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// defaultSamplingRate is PostHog's default: every matching event is dropped.
const defaultSamplingRate = 1.0

// rule is the subset of PostHog's ErrorTrackingSuppressionRule these handlers use.
type rule struct {
	ID           posthogcfn.FlexID `json:"id"`
	Filters      json.RawMessage   `json:"filters"`
	SamplingRate *float64          `json:"sampling_rate"`
	OrderKey     *int              `json:"order_key"`
	CreatedAt    string            `json:"created_at"`
	UpdatedAt    string            `json:"updated_at"`
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
	return posthogcfn.Path("/api/projects/%s/error_tracking/suppression_rules/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/error_tracking/suppression_rules/%s/", projectID, id)
}

func reorderPath(projectID string) string {
	return posthogcfn.Path("/api/projects/%s/error_tracking/suppression_rules/reorder/", projectID)
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

	var out rule
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating suppression rule", err), nil
	}
	id := out.ID.String()
	// The create request has no order_key; set it with the reorder endpoint.
	if reordered, err := reorder(ctx, c, projectID, id, out.OrderKey, currentModel.OrderKey); err != nil {
		return posthogcfn.FromError("ordering suppression rule "+id, err), nil
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
		return posthogcfn.NotFound("suppression rule ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. PostHog
// answers the PATCH with 204 and no body, so the rule is read back afterwards.
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
		return posthogcfn.NotFound("suppression rule ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	current, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	if err := c.Patch(ctx, itemPath(projectID, id), body, nil); err != nil {
		return posthogcfn.FromError("updating suppression rule "+id, err), nil
	}
	if _, err := reorder(ctx, c, projectID, id, current.OrderKey, currentModel.OrderKey); err != nil {
		return posthogcfn.FromError("ordering suppression rule "+id, err), nil
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
		return posthogcfn.NotFound("suppression rule ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting suppression rule "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list suppression rules"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[rule](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing suppression rules", err), nil
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
		ev := posthogcfn.FromError("reading suppression rule "+id, err)
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

// requestBody builds the create/update body. Both writable fields are always
// sent: no Filters means a match-all rule (empty values) and no SamplingRate
// means PostHog's default of 1.0, so removing them from the template resets them.
func requestBody(m *Model) (map[string]any, error) {
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return nil, err
	}
	if filters == nil {
		filters = map[string]any{"type": "AND", "values": []any{}}
	}
	if _, ok := filters.(map[string]any); !ok {
		return nil, fmt.Errorf("Filters must be a JSON object such as {\"type\": \"AND\", \"values\": [...]}")
	}
	rate := defaultSamplingRate
	if m.SamplingRate != nil {
		rate = *m.SamplingRate
	}
	if rate < 0 || rate > 1 {
		return nil, fmt.Errorf("SamplingRate must be between 0 and 1")
	}
	return map[string]any{"filters": filters, "sampling_rate": rate}, nil
}

// fromAPI converts an API rule to the model. desired is the model from the
// request: its Filters string is kept when JSON-equal to the API value, and
// server defaults (match-all filters, sampling rate 1.0, order) are left out
// unless the template set them.
func fromAPI(projectID string, r *rule, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId: posthogcfn.String(projectID),
		Id:        r.ID.Ptr(),
		CreatedAt: posthogcfn.StringOrNil(r.CreatedAt),
		UpdatedAt: posthogcfn.StringOrNil(r.UpdatedAt),
	}
	if desired.Filters != nil || !matchAll(r.Filters) {
		m.Filters = posthogcfn.PreserveJSON(desired.Filters, r.Filters)
	}
	if r.SamplingRate != nil && (desired.SamplingRate != nil || *r.SamplingRate != defaultSamplingRate) {
		m.SamplingRate = posthogcfn.Float(*r.SamplingRate)
	}
	if desired.OrderKey != nil && r.OrderKey != nil {
		m.OrderKey = posthogcfn.Int(*r.OrderKey)
	}
	return m
}

// matchAll reports whether the API filters match every event (null, {} or a
// group with no values).
func matchAll(raw json.RawMessage) bool {
	var f struct {
		Values []json.RawMessage `json:"values"`
	}
	if len(raw) == 0 || string(raw) == "null" {
		return true
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		return false
	}
	return len(f.Values) == 0
}
