package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// evaluation is the subset of PostHog's Evaluation object these handlers use.
type evaluation struct {
	ID                 posthogcfn.FlexID   `json:"id"`
	Name               *string             `json:"name"`
	Description        string              `json:"description"`
	DirectoryID        *string             `json:"directory_id"`
	Enabled            bool                `json:"enabled"`
	EvaluationType     *string             `json:"evaluation_type"`
	EvaluationConfig   json.RawMessage     `json:"evaluation_config"`
	OutputType         *string             `json:"output_type"`
	OutputConfig       json.RawMessage     `json:"output_config"`
	Conditions         json.RawMessage     `json:"conditions"`
	Target             *string             `json:"target"`
	TargetConfig       json.RawMessage     `json:"target_config"`
	ModelConfiguration *modelConfiguration `json:"model_configuration"`
	Status             *string             `json:"status"`
	StatusReason       *string             `json:"status_reason"`
	CreatedAt          string              `json:"created_at"`
	UpdatedAt          string              `json:"updated_at"`
	Deleted            bool                `json:"deleted"`
}

type modelConfiguration struct {
	Provider      string  `json:"provider"`
	Model         string  `json:"model"`
	ProviderKeyID *string `json:"provider_key_id"`
}

const (
	llmJudge         = "llm_judge"
	defaultTarget    = "generation"
	defaultSentiment = `{"source":"user_messages"}`
	sentimentType    = "sentiment"
)

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
	return posthogcfn.Path("/api/projects/%s/evaluations/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/evaluations/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.EvaluationType) == llmJudge && currentModel.ModelConfiguration == nil {
		return posthogcfn.InvalidRequest("ModelConfiguration is required for llm_judge evaluations"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out evaluation
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating evaluation", err), nil
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
		return posthogcfn.NotFound("evaluation ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("evaluation ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted evaluation succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out evaluation
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating evaluation "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
// Evaluations cannot be hard-deleted (DELETE returns 405); they are
// soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("evaluation ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting evaluation "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list evaluations"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[evaluation](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing evaluations", err), nil
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

// get reads one live evaluation, mapping a 404 or a soft-deleted evaluation to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*evaluation, *handler.ProgressEvent) {
	var out evaluation
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading evaluation "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("evaluation %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// jsonValue parses a JSON string property that must hold the given kind
// ("object" or "array"), returning empty when unset.
func jsonValue(name string, s *string, kind string) (any, error) {
	v, err := posthogcfn.ParseJSON(name, s)
	if err != nil {
		return nil, err
	}
	switch kind {
	case "object":
		if v == nil {
			return map[string]any{}, nil
		}
		if _, ok := v.(map[string]any); !ok {
			return nil, fmt.Errorf("%s must be a JSON object", name)
		}
	case "array":
		if v == nil {
			return []any{}, nil
		}
		if _, ok := v.([]any); !ok {
			return nil, fmt.Errorf("%s must be a JSON array", name)
		}
	}
	return v, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are reset.
func requestBody(m *Model) (map[string]any, error) {
	evalType := posthogcfn.StringValue(m.EvaluationType)
	if evalType == "" {
		return nil, fmt.Errorf("EvaluationType is required")
	}
	if posthogcfn.StringValue(m.OutputType) == "" {
		return nil, fmt.Errorf("OutputType is required")
	}
	evalConfig, err := jsonValue("EvaluationConfig", m.EvaluationConfig, "object")
	if err != nil {
		return nil, err
	}
	outputConfig, err := jsonValue("OutputConfig", m.OutputConfig, "object")
	if err != nil {
		return nil, err
	}
	conditions, err := jsonValue("Conditions", m.Conditions, "array")
	if err != nil {
		return nil, err
	}
	targetConfig, err := jsonValue("TargetConfig", m.TargetConfig, "object")
	if err != nil {
		return nil, err
	}
	target := posthogcfn.StringValue(m.Target)
	if target == "" {
		target = defaultTarget
	}
	var directory any
	if d := posthogcfn.StringValue(m.DirectoryId); d != "" {
		directory = d
	}
	body := map[string]any{
		"name":              posthogcfn.StringValue(m.Name),
		"description":       posthogcfn.StringValue(m.Description),
		"directory_id":      directory,
		"enabled":           posthogcfn.BoolValue(m.Enabled),
		"evaluation_type":   evalType,
		"evaluation_config": evalConfig,
		"output_type":       *m.OutputType,
		"output_config":     outputConfig,
		"conditions":        conditions,
		"target":            target,
		"target_config":     targetConfig,
	}
	// PostHog keeps the current judge model when model_configuration is
	// omitted and rejects null for llm_judge; other types need null.
	switch mc := m.ModelConfiguration; {
	case mc != nil:
		body["model_configuration"] = modelConfiguration{
			Provider: posthogcfn.StringValue(mc.Provider), Model: posthogcfn.StringValue(mc.Model),
			ProviderKeyID: posthogcfn.StringPtrOrNil(mc.ProviderKeyId),
		}
	case evalType != llmJudge:
		body["model_configuration"] = nil
	}
	return body, nil
}

// fromAPI converts an API evaluation to the model. desired is the model from
// the request; JSON strings are kept when the API value contains them, and
// server-filled defaults are left out unless the template set them, so they
// do not show as drift.
func fromAPI(projectID string, e *evaluation, desired *Model) *Model {
	var want Model
	if desired != nil {
		want = *desired
	}
	m := &Model{
		ProjectId:      posthogcfn.String(projectID),
		Id:             e.ID.Ptr(),
		Name:           e.Name,
		Description:    posthogcfn.StringOrNil(e.Description),
		DirectoryId:    posthogcfn.StringPtrOrNil(e.DirectoryID),
		EvaluationType: posthogcfn.StringPtrOrNil(e.EvaluationType),
		OutputType:     posthogcfn.StringPtrOrNil(e.OutputType),
		Conditions:     jsonOut(want.Conditions, e.Conditions),
		Status:         posthogcfn.StringPtrOrNil(e.Status),
		StatusReason:   posthogcfn.StringPtrOrNil(e.StatusReason),
		CreatedAt:      posthogcfn.StringOrNil(e.CreatedAt),
		UpdatedAt:      posthogcfn.StringOrNil(e.UpdatedAt),
	}
	if e.Enabled || want.Enabled != nil {
		m.Enabled = posthogcfn.Bool(e.Enabled)
	}
	m.EvaluationConfig = jsonOut(want.EvaluationConfig, e.EvaluationConfig)
	if want.EvaluationConfig == nil && m.EvaluationConfig != nil &&
		posthogcfn.StringValue(e.EvaluationType) == sentimentType && posthogcfn.JSONEqual(*m.EvaluationConfig, defaultSentiment) {
		m.EvaluationConfig = nil
	}
	// PostHog fills output_config and target_config with defaults; they are
	// only reported when the template manages them.
	if want.OutputConfig != nil {
		m.OutputConfig = jsonOut(want.OutputConfig, e.OutputConfig)
	}
	if want.TargetConfig != nil {
		m.TargetConfig = jsonOut(want.TargetConfig, e.TargetConfig)
	}
	if t := posthogcfn.StringPtrOrNil(e.Target); t != nil && (want.Target != nil || *t != defaultTarget) {
		m.Target = t
	}
	if mc := e.ModelConfiguration; mc != nil && (mc.Provider != "" || mc.Model != "") {
		m.ModelConfiguration = &ModelConfiguration{
			Provider:      posthogcfn.StringOrNil(mc.Provider),
			Model:         posthogcfn.StringOrNil(mc.Model),
			ProviderKeyId: posthogcfn.StringPtrOrNil(mc.ProviderKeyID),
		}
	}
	return m
}
