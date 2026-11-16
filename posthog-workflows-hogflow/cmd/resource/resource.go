package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// PostHog defaults for fields the template may leave out.
const (
	defaultStatus        = "draft"
	defaultExitCondition = "exit_only_at_end"
)

// hogFlow is the subset of PostHog's HogFlow object these handlers use.
type hogFlow struct {
	ID                    posthogcfn.FlexID `json:"id"`
	Name                  *string           `json:"name"`
	Description           string            `json:"description"`
	Tags                  []string          `json:"tags"`
	Status                string            `json:"status"`
	OriginProduct         *string           `json:"origin_product"`
	Actions               json.RawMessage   `json:"actions"`
	Edges                 json.RawMessage   `json:"edges"`
	Conversion            json.RawMessage   `json:"conversion"`
	ExitCondition         string            `json:"exit_condition"`
	TriggerMasking        *apiMasking       `json:"trigger_masking"`
	EmailSendingRateLimit *apiRateLimit     `json:"email_sending_rate_limit"`
	Variables             json.RawMessage   `json:"variables"`
	Trigger               json.RawMessage   `json:"trigger"`
	Version               *int              `json:"version"`
	CreatedAt             string            `json:"created_at"`
	UpdatedAt             string            `json:"updated_at"`
}

type apiMasking struct {
	Hash      string `json:"hash"`
	TTL       *int   `json:"ttl,omitempty"`
	Threshold *int   `json:"threshold,omitempty"`
}

type apiRateLimit struct {
	Count  int    `json:"count"`
	Period string `json:"period"`
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
	return posthogcfn.Path("/api/projects/%s/hog_flows/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/hog_flows/%s/", projectID, id)
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
	if currentModel.OriginProduct != nil {
		body["origin_product"] = *currentModel.OriginProduct
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out hogFlow
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating workflow", err), nil
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
		return posthogcfn.NotFound("workflow ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("workflow ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a missing workflow 404s by itself, which FromError maps to
	// NotFound. origin_product is create-only and is not sent.
	var out hogFlow
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating workflow "+id, err), nil
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
		return posthogcfn.NotFound("workflow ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting workflow "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list workflows"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[hogFlow](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing workflows", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one workflow, mapping a 404 to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*hogFlow, *handler.ProgressEvent) {
	var out hogFlow
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading workflow "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// parseJSON decodes a JSON string property and checks that it is an array
// (wantArray) or an object.
func parseJSON(name string, s *string, wantArray bool) (any, error) {
	v, err := posthogcfn.ParseJSON(name, s)
	if err != nil || v == nil {
		return v, err
	}
	if _, isArray := v.([]any); wantArray && !isArray {
		return nil, fmt.Errorf("%s must be a JSON array", name)
	}
	if _, isObject := v.(map[string]any); !wantArray && !isObject {
		return nil, fmt.Errorf("%s must be a JSON object", name)
	}
	return v, nil
}

// requestBody validates the model and builds the create/update body. Every
// writable field is sent so that properties removed from the template are
// cleared (or reset to the PostHog default) in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	actions, err := parseJSON("Actions", m.Actions, true)
	if err != nil {
		return nil, err
	}
	if actions == nil {
		return nil, fmt.Errorf("Actions is required")
	}
	edges, err := parseJSON("Edges", m.Edges, true)
	if err != nil {
		return nil, err
	}
	if edges == nil {
		edges = []any{}
	}
	variables, err := parseJSON("Variables", m.Variables, true)
	if err != nil {
		return nil, err
	}
	if variables == nil {
		variables = []any{}
	}
	conversion, err := parseJSON("Conversion", m.Conversion, false)
	if err != nil {
		return nil, err
	}
	var masking *apiMasking
	if tm := m.TriggerMasking; tm != nil {
		if posthogcfn.StringValue(tm.Hash) == "" {
			return nil, fmt.Errorf("TriggerMasking.Hash is required")
		}
		masking = &apiMasking{Hash: *tm.Hash, TTL: tm.Ttl, Threshold: tm.Threshold}
	}
	var rateLimit *apiRateLimit
	if rl := m.EmailSendingRateLimit; rl != nil {
		if rl.Count == nil || posthogcfn.StringValue(rl.Period) == "" {
			return nil, fmt.Errorf("EmailSendingRateLimit.Count and Period are required")
		}
		rateLimit = &apiRateLimit{Count: *rl.Count, Period: *rl.Period}
	}
	status := posthogcfn.StringValue(m.Status)
	if status == "" {
		status = defaultStatus
	}
	exitCondition := posthogcfn.StringValue(m.ExitCondition)
	if exitCondition == "" {
		exitCondition = defaultExitCondition
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{
		"name":                     posthogcfn.StringValue(m.Name),
		"description":              posthogcfn.StringValue(m.Description),
		"tags":                     tags,
		"status":                   status,
		"actions":                  actions,
		"edges":                    edges,
		"variables":                variables,
		"conversion":               conversion,
		"exit_condition":           exitCondition,
		"trigger_masking":          masking,
		"email_sending_rate_limit": rateLimit,
	}, nil
}

// fromAPI converts an API workflow to the model. desired is the model from
// the request: its JSON strings are kept when everything they set matches the
// API value (PostHog adds compiled bytecode and timestamps to actions), and
// server defaults are left out unless the template set them.
func fromAPI(projectID string, a *hogFlow, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:     posthogcfn.String(projectID),
		Id:            a.ID.Ptr(),
		Name:          posthogcfn.StringPtrOrNil(a.Name),
		Description:   posthogcfn.StringOrNil(a.Description),
		Tags:          posthogcfn.SliceOrNil(a.Tags),
		OriginProduct: posthogcfn.StringPtrOrNil(a.OriginProduct),
		Version:       a.Version,
		CreatedAt:     posthogcfn.StringOrNil(a.CreatedAt),
		UpdatedAt:     posthogcfn.StringOrNil(a.UpdatedAt),
	}
	if a.Status != "" && (a.Status != defaultStatus || desired.Status != nil) {
		m.Status = posthogcfn.String(a.Status)
	}
	if a.ExitCondition != "" && (a.ExitCondition != defaultExitCondition || desired.ExitCondition != nil) {
		m.ExitCondition = posthogcfn.String(a.ExitCondition)
	}
	if !posthogcfn.EmptyJSON(a.Actions) {
		m.Actions = posthogcfn.PreserveJSONSubset(desired.Actions, a.Actions)
	}
	if !posthogcfn.EmptyJSON(a.Edges) {
		m.Edges = posthogcfn.PreserveJSONSubset(desired.Edges, a.Edges)
	}
	if !posthogcfn.EmptyJSON(a.Variables) {
		m.Variables = posthogcfn.PreserveJSONSubset(desired.Variables, a.Variables)
	}
	if !posthogcfn.EmptyJSON(a.Conversion) {
		m.Conversion = posthogcfn.PreserveJSONSubset(desired.Conversion, a.Conversion)
	}
	if !posthogcfn.EmptyJSON(a.Trigger) {
		m.Trigger = posthogcfn.ToJSONString(a.Trigger)
	}
	if tm := a.TriggerMasking; tm != nil && tm.Hash != "" {
		m.TriggerMasking = &TriggerMasking{Hash: posthogcfn.String(tm.Hash), Ttl: tm.TTL, Threshold: tm.Threshold}
	}
	if rl := a.EmailSendingRateLimit; rl != nil && rl.Period != "" {
		m.EmailSendingRateLimit = &EmailSendingRateLimit{Count: posthogcfn.Int(rl.Count), Period: posthogcfn.String(rl.Period)}
	}
	return m
}
