package resource

import (
	"context"
	"encoding/json"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// survey is the subset of PostHog's Survey object (GET response) these
// handlers use. Responses, results and computed fields are never read.
type survey struct {
	ID                           posthogcfn.FlexID `json:"id"`
	Name                         *string           `json:"name"`
	Description                  *string           `json:"description"`
	Type                         *string           `json:"type"`
	Schedule                     *string           `json:"schedule"`
	LinkedFlagID                 *int64            `json:"linked_flag_id"`
	LinkedFlag                   *flagRef          `json:"linked_flag"`
	LinkedInsightID              *int64            `json:"linked_insight_id"`
	TargetingFlag                *flagRef          `json:"targeting_flag"`
	Questions                    json.RawMessage   `json:"questions"`
	Conditions                   json.RawMessage   `json:"conditions"`
	Appearance                   json.RawMessage   `json:"appearance"`
	Translations                 json.RawMessage   `json:"translations"`
	StartDate                    *string           `json:"start_date"`
	EndDate                      *string           `json:"end_date"`
	Archived                     bool              `json:"archived"`
	ResponsesLimit               *int              `json:"responses_limit"`
	IterationCount               *int              `json:"iteration_count"`
	IterationFrequencyDays       *int              `json:"iteration_frequency_days"`
	RepeatUntilStopped           *bool             `json:"repeat_until_stopped"`
	EnablePartialResponses       *bool             `json:"enable_partial_responses"`
	EnableIframeEmbedding        *bool             `json:"enable_iframe_embedding"`
	BaseLanguage                 *string           `json:"base_language"`
	ResponseSamplingStartDate    *string           `json:"response_sampling_start_date"`
	ResponseSamplingIntervalType *string           `json:"response_sampling_interval_type"`
	ResponseSamplingInterval     *int              `json:"response_sampling_interval"`
	ResponseSamplingLimit        *int              `json:"response_sampling_limit"`
	CreatedAt                    string            `json:"created_at"`
}

// flagRef is the part of a MinimalFeatureFlag the handlers read.
type flagRef struct {
	ID      posthogcfn.FlexID `json:"id"`
	Filters json.RawMessage   `json:"filters"`
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
	return posthogcfn.Path("/api/projects/%s/surveys/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/surveys/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service. The
// create response omits fields such as linked_flag_id, so the survey is read
// back with GET.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	body, err := requestBody(currentModel, false)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var created struct {
		ID posthogcfn.FlexID `json:"id"`
	}
	if err := c.Post(ctx, collectionPath(projectID), body, &created); err != nil {
		return posthogcfn.FromError("creating survey", err), nil
	}
	out, fail := get(ctx, c, projectID, created.ID.String())
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("survey ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. The survey
// is read first to learn whether targeting has to be removed.
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
		return posthogcfn.NotFound("survey ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	current, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	body, err := requestBody(currentModel, current.TargetingFlag != nil)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if err := c.Patch(ctx, itemPath(projectID, id), body, nil); err != nil {
		return posthogcfn.FromError("updating survey "+id, err), nil
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
		return posthogcfn.NotFound("survey ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting survey "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list surveys"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[survey](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing surveys", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*survey, *handler.ProgressEvent) {
	var out survey
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading survey "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog.
// hasTargeting tells whether the survey currently has a targeting flag, which
// is removed with remove_targeting_flag when the template has no
// TargetingFlagFilters.
func requestBody(m *Model, hasTargeting bool) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, errString("Name is required")
	}
	if posthogcfn.StringValue(m.Type) == "" {
		return nil, errString("Type is required")
	}
	linkedFlag, err := idOrNil("LinkedFlagId", m.LinkedFlagId)
	if err != nil {
		return nil, err
	}
	linkedInsight, err := idOrNil("LinkedInsightId", m.LinkedInsightId)
	if err != nil {
		return nil, err
	}
	baseLanguage := posthogcfn.StringValue(m.BaseLanguage)
	if baseLanguage == "" {
		baseLanguage = "en"
	}
	body := map[string]any{
		"name":                            posthogcfn.StringValue(m.Name),
		"description":                     posthogcfn.StringValue(m.Description),
		"type":                            posthogcfn.StringValue(m.Type),
		"schedule":                        posthogcfn.StringPtrOrNil(m.Schedule),
		"linked_flag_id":                  linkedFlag,
		"linked_insight_id":               linkedInsight,
		"start_date":                      posthogcfn.StringPtrOrNil(m.StartDate),
		"end_date":                        posthogcfn.StringPtrOrNil(m.EndDate),
		"archived":                        posthogcfn.BoolValue(m.Archived),
		"responses_limit":                 m.ResponsesLimit,
		"iteration_count":                 m.IterationCount,
		"iteration_frequency_days":        m.IterationFrequencyDays,
		"repeat_until_stopped":            posthogcfn.BoolValue(m.RepeatUntilStopped),
		"enable_partial_responses":        posthogcfn.BoolValue(m.EnablePartialResponses),
		"enable_iframe_embedding":         posthogcfn.BoolValue(m.EnableIframeEmbedding),
		"base_language":                   baseLanguage,
		"response_sampling_start_date":    posthogcfn.StringPtrOrNil(m.ResponseSamplingStartDate),
		"response_sampling_interval_type": posthogcfn.StringPtrOrNil(m.ResponseSamplingIntervalType),
		"response_sampling_interval":      m.ResponseSamplingInterval,
		"response_sampling_limit":         m.ResponseSamplingLimit,
	}
	if m.Schedule == nil {
		// Let PostHog apply its default schedule.
		delete(body, "schedule")
	}
	for _, f := range []struct {
		name, field string
		value       *string
		empty       any
	}{
		{"Questions", "questions", m.Questions, []any{}},
		{"Conditions", "conditions", m.Conditions, nil},
		{"Appearance", "appearance", m.Appearance, nil},
		{"Translations", "translations", m.Translations, map[string]any{}},
	} {
		v, err := posthogcfn.ParseJSON(f.name, f.value)
		if err != nil {
			return nil, err
		}
		if v == nil {
			v = f.empty
		}
		body[f.field] = v
	}
	targeting, err := posthogcfn.ParseJSON("TargetingFlagFilters", m.TargetingFlagFilters)
	if err != nil {
		return nil, err
	}
	switch {
	case targeting != nil:
		body["targeting_flag_filters"] = targeting
	case hasTargeting:
		body["remove_targeting_flag"] = true
	}
	return body, nil
}

type errString string

func (e errString) Error() string { return string(e) }

// fromAPI converts an API survey to the model. desired is the model from the
// request; its JSON strings are kept when the API value contains them, and
// server defaults are left out unless it set them.
func fromAPI(projectID string, s *survey, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:                    posthogcfn.String(projectID),
		Id:                           s.ID.Ptr(),
		Name:                         s.Name,
		Description:                  posthogcfn.StringPtrOrNil(s.Description),
		Type:                         posthogcfn.StringPtrOrNil(s.Type),
		Schedule:                     optString(s.Schedule, desired.Schedule, "once"),
		LinkedInsightId:              intIDPtr(s.LinkedInsightID),
		Questions:                    jsonOut(desired.Questions, s.Questions),
		Conditions:                   defaultedJSONOut(desired.Conditions, s.Conditions),
		Appearance:                   defaultedJSONOut(desired.Appearance, s.Appearance),
		Translations:                 jsonOut(desired.Translations, s.Translations),
		StartDate:                    posthogcfn.StringPtrOrNil(s.StartDate),
		EndDate:                      posthogcfn.StringPtrOrNil(s.EndDate),
		Archived:                     optBool(s.Archived, desired.Archived),
		ResponsesLimit:               s.ResponsesLimit,
		IterationCount:               s.IterationCount,
		IterationFrequencyDays:       s.IterationFrequencyDays,
		RepeatUntilStopped:           optBoolPtr(s.RepeatUntilStopped, desired.RepeatUntilStopped),
		EnablePartialResponses:       optBoolPtr(s.EnablePartialResponses, desired.EnablePartialResponses),
		EnableIframeEmbedding:        optBoolPtr(s.EnableIframeEmbedding, desired.EnableIframeEmbedding),
		BaseLanguage:                 optString(s.BaseLanguage, desired.BaseLanguage, "en"),
		ResponseSamplingStartDate:    posthogcfn.StringPtrOrNil(s.ResponseSamplingStartDate),
		ResponseSamplingIntervalType: posthogcfn.StringPtrOrNil(s.ResponseSamplingIntervalType),
		ResponseSamplingInterval:     s.ResponseSamplingInterval,
		ResponseSamplingLimit:        s.ResponseSamplingLimit,
		CreatedAt:                    posthogcfn.StringOrNil(s.CreatedAt),
	}
	switch {
	case s.LinkedFlagID != nil:
		m.LinkedFlagId = intIDPtr(s.LinkedFlagID)
	case s.LinkedFlag != nil:
		m.LinkedFlagId = s.LinkedFlag.ID.Ptr()
	}
	if s.TargetingFlag != nil {
		m.TargetingFlagId = s.TargetingFlag.ID.Ptr()
		m.TargetingFlagFilters = jsonOut(desired.TargetingFlagFilters, s.TargetingFlag.Filters)
	}
	return m
}
