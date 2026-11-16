package resource

import (
	"context"
	"encoding/json"
	"time"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

const defaultModelName = "FeatureFlag"

// scheduledChange is the subset of PostHog's ScheduledChange object these
// handlers use.
type scheduledChange struct {
	ID                 posthogcfn.FlexID `json:"id"`
	RecordID           posthogcfn.FlexID `json:"record_id"`
	ModelName          *string           `json:"model_name"`
	Payload            json.RawMessage   `json:"payload"`
	ScheduledAt        *string           `json:"scheduled_at"`
	IsRecurring        bool              `json:"is_recurring"`
	RecurrenceInterval *string           `json:"recurrence_interval"`
	CronExpression     *string           `json:"cron_expression"`
	EndDate            *string           `json:"end_date"`
	ExecutedAt         *string           `json:"executed_at"`
	LastExecutedAt     *string           `json:"last_executed_at"`
	FailureReason      *string           `json:"failure_reason"`
	Timezone           *string           `json:"timezone"`
	CreatedAt          string            `json:"created_at"`
	UpdatedAt          string            `json:"updated_at"`
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
	return posthogcfn.Path("/api/projects/%s/scheduled_changes/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/scheduled_changes/%s/", projectID, id)
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

	var out scheduledChange
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating scheduled change", err), nil
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
		return posthogcfn.NotFound("scheduled change ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("scheduled change ProjectId and Id must be set"), nil
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
	var out scheduledChange
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating scheduled change "+id, err), nil
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
		return posthogcfn.NotFound("scheduled change ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting scheduled change "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list scheduled changes"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[scheduledChange](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing scheduled changes", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one scheduled change, mapping a 404 to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*scheduledChange, *handler.ProgressEvent) {
	var out scheduledChange
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading scheduled change "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody validates the model and builds the create/update body. Every
// writable field is sent so that properties removed from the template are
// cleared in PostHog.
func requestBody(m *Model) (map[string]any, *handler.ProgressEvent) {
	invalid := func(format string, args ...any) (map[string]any, *handler.ProgressEvent) {
		ev := posthogcfn.InvalidRequest(format, args...)
		return nil, &ev
	}
	if posthogcfn.StringValue(m.RecordId) == "" {
		return invalid("RecordId is required")
	}
	if posthogcfn.StringValue(m.ScheduledAt) == "" {
		return invalid("ScheduledAt is required")
	}
	payload, err := posthogcfn.ParseJSON("Payload", m.Payload)
	if err != nil {
		return invalid("%v", err)
	}
	obj, ok := payload.(map[string]any)
	if !ok {
		return invalid("Payload is required and must be a JSON object with an operation and a value")
	}
	if _, ok := obj["operation"]; !ok {
		return invalid("Payload must include an operation")
	}
	if posthogcfn.BoolValue(m.IsRecurring) && m.RecurrenceInterval == nil && m.CronExpression == nil {
		return invalid("RecurrenceInterval or CronExpression is required when IsRecurring is true")
	}
	modelName := defaultModelName
	if m.ModelName != nil {
		modelName = *m.ModelName
	}
	return map[string]any{
		"record_id":           posthogcfn.StringValue(m.RecordId),
		"model_name":          modelName,
		"payload":             obj,
		"scheduled_at":        posthogcfn.StringValue(m.ScheduledAt),
		"is_recurring":        posthogcfn.BoolValue(m.IsRecurring),
		"recurrence_interval": m.RecurrenceInterval,
		"cron_expression":     m.CronExpression,
		"end_date":            m.EndDate,
	}, nil
}

// fromAPI converts an API scheduled change to the model. desired is the model
// from the request: its Payload string and timestamps are kept when they are
// equivalent to the API value, and the ModelName default is left out unless
// the template set it.
func fromAPI(projectID string, s *scheduledChange, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:          posthogcfn.String(projectID),
		Id:                 s.ID.Ptr(),
		RecordId:           s.RecordID.Ptr(),
		Payload:            posthogcfn.PreserveJSON(desired.Payload, s.Payload),
		ScheduledAt:        preserveTime(desired.ScheduledAt, s.ScheduledAt),
		RecurrenceInterval: posthogcfn.StringPtrOrNil(s.RecurrenceInterval),
		CronExpression:     posthogcfn.StringPtrOrNil(s.CronExpression),
		EndDate:            preserveTime(desired.EndDate, s.EndDate),
		ExecutedAt:         posthogcfn.StringPtrOrNil(s.ExecutedAt),
		LastExecutedAt:     posthogcfn.StringPtrOrNil(s.LastExecutedAt),
		FailureReason:      posthogcfn.StringPtrOrNil(s.FailureReason),
		Timezone:           posthogcfn.StringPtrOrNil(s.Timezone),
		CreatedAt:          posthogcfn.StringOrNil(s.CreatedAt),
		UpdatedAt:          posthogcfn.StringOrNil(s.UpdatedAt),
	}
	if name := posthogcfn.StringPtrOrNil(s.ModelName); name != nil && (desired.ModelName != nil || *name != defaultModelName) {
		m.ModelName = name
	}
	if s.IsRecurring || desired.IsRecurring != nil {
		m.IsRecurring = posthogcfn.Bool(s.IsRecurring)
	}
	return m
}

// preserveTime keeps the template's timestamp when it denotes the same
// instant as the API value (PostHog reformats offsets and fractions).
func preserveTime(desired, api *string) *string {
	got := posthogcfn.StringPtrOrNil(api)
	if got == nil || desired == nil {
		return got
	}
	a, errA := parseTime(*desired)
	b, errB := parseTime(*got)
	if errA == nil && errB == nil && a.Equal(b) {
		return desired
	}
	return got
}

func parseTime(s string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.999999999", s)
	}
	return t, err
}
