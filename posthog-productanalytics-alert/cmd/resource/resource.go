package resource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// alert is the subset of PostHog's Alert object these handlers use. Runtime
// state (state, last_checked_at, last_value, checks, ...) is not decoded.
type alert struct {
	ID                              posthogcfn.FlexID `json:"id"`
	Insight                         idRef             `json:"insight"`
	InsightShortID                  string            `json:"insight_short_id"`
	Name                            *string           `json:"name"`
	SubscribedUsers                 []idRef           `json:"subscribed_users"`
	Threshold                       *apiThreshold     `json:"threshold"`
	Condition                       *apiCondition     `json:"condition"`
	Enabled                         *bool             `json:"enabled"`
	CalculationInterval             *string           `json:"calculation_interval"`
	Config                          json.RawMessage   `json:"config"`
	DetectorConfig                  json.RawMessage   `json:"detector_config"`
	EvaluationDelayIntervals        int               `json:"evaluation_delay_intervals"`
	ScheduleStartTime               *string           `json:"schedule_start_time"`
	SkipWeekend                     *bool             `json:"skip_weekend"`
	ScheduleRestriction             *apiRestriction   `json:"schedule_restriction"`
	InvestigationAgentEnabled       bool              `json:"investigation_agent_enabled"`
	InvestigationGatesNotifications bool              `json:"investigation_gates_notifications"`
	InvestigationInconclusiveAction *string           `json:"investigation_inconclusive_action"`
	CreatedAt                       string            `json:"created_at"`
}

type apiThreshold struct {
	Name          string `json:"name,omitempty"`
	Configuration struct {
		Type   string     `json:"type"`
		Bounds *apiBounds `json:"bounds"`
	} `json:"configuration"`
}

type apiBounds struct {
	Lower *float64 `json:"lower"`
	Upper *float64 `json:"upper"`
}

type apiCondition struct {
	Type string `json:"type"`
}

type apiRestriction struct {
	BlockedWindows []apiWindow `json:"blocked_windows"`
}

type apiWindow struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// idRef is an ID that PostHog writes as a plain ID but reads back as a
// nested object with an "id" field (insight, subscribed users).
type idRef posthogcfn.FlexID

func (r *idRef) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) > 0 && b[0] == '{' {
		var obj struct {
			ID posthogcfn.FlexID `json:"id"`
		}
		if err := json.Unmarshal(b, &obj); err != nil {
			return err
		}
		*r = idRef(obj.ID)
		return nil
	}
	var id posthogcfn.FlexID
	if err := json.Unmarshal(b, &id); err != nil {
		return err
	}
	*r = idRef(id)
	return nil
}

// readQuery keeps the check history in the GET response to a single entry.
var readQuery = url.Values{"checks_limit": {"1"}}

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
	return posthogcfn.Path("/api/projects/%s/alerts/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/alerts/%s/", projectID, id)
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

	var out alert
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating alert", err), nil
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
		return posthogcfn.NotFound("alert ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("alert ProjectId and Id must be set"), nil
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

	var out alert
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating alert "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Alerts are
// hard-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("alert ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting alert "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list alerts"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[alert](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing alerts", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one alert, mapping a 404 to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*alert, *handler.ProgressEvent) {
	var out alert
	if err := c.Get(ctx, itemPath(projectID, id), readQuery, &out); err != nil {
		ev := posthogcfn.FromError("reading alert "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field with an
// "unset" value is sent so that properties removed from the template are
// cleared in PostHog. Threshold, Config and CalculationInterval have no unset
// value (PostHog keeps or defaults them) and are only sent when set.
func requestBody(m *Model) (map[string]any, error) {
	insightID, ok := posthogcfn.IDInt(m.InsightId)
	if !ok {
		return nil, fmt.Errorf("InsightId must be a numeric insight ID, got %q", posthogcfn.StringValue(m.InsightId))
	}
	users := make([]int64, 0, len(m.SubscribedUsers))
	for _, u := range m.SubscribedUsers {
		n, ok := posthogcfn.IDInt(&u)
		if !ok {
			return nil, fmt.Errorf("SubscribedUsers must contain numeric user IDs, got %q", u)
		}
		users = append(users, n)
	}
	config, err := posthogcfn.ParseJSON("Config", m.Config)
	if err != nil {
		return nil, err
	}
	detector, err := posthogcfn.ParseJSON("DetectorConfig", m.DetectorConfig)
	if err != nil {
		return nil, err
	}
	enabled := true
	if m.Enabled != nil {
		enabled = *m.Enabled
	}
	body := map[string]any{
		"insight":                           insightID,
		"name":                              posthogcfn.StringValue(m.Name),
		"subscribed_users":                  users,
		"enabled":                           enabled,
		"detector_config":                   detector,
		"evaluation_delay_intervals":        posthogcfn.IntValue(m.EvaluationDelayIntervals),
		"schedule_start_time":               m.ScheduleStartTime,
		"skip_weekend":                      posthogcfn.BoolValue(m.SkipWeekend),
		"investigation_agent_enabled":       posthogcfn.BoolValue(m.InvestigationAgentEnabled),
		"investigation_gates_notifications": posthogcfn.BoolValue(m.InvestigationGatesNotifications),
		"investigation_inconclusive_action": "notify",
		"condition":                         nil,
		"schedule_restriction":              nil,
	}
	if m.InvestigationInconclusiveAction != nil {
		body["investigation_inconclusive_action"] = *m.InvestigationInconclusiveAction
	}
	if m.Condition != nil && m.Condition.Type != nil {
		body["condition"] = map[string]any{"type": *m.Condition.Type}
	}
	if r := m.ScheduleRestriction; r != nil {
		windows := make([]apiWindow, 0, len(r.BlockedWindows))
		for _, w := range r.BlockedWindows {
			windows = append(windows, apiWindow{Start: posthogcfn.StringValue(w.Start), End: posthogcfn.StringValue(w.End)})
		}
		body["schedule_restriction"] = apiRestriction{BlockedWindows: windows}
	}
	if t := m.Threshold; t != nil {
		th := apiThreshold{Name: posthogcfn.StringValue(t.Name)}
		if t.Configuration != nil {
			th.Configuration.Type = posthogcfn.StringValue(t.Configuration.Type)
			if b := t.Configuration.Bounds; b != nil {
				th.Configuration.Bounds = &apiBounds{Lower: b.Lower, Upper: b.Upper}
			}
		}
		if th.Configuration.Type == "" {
			return nil, fmt.Errorf("Threshold.Configuration.Type is required")
		}
		body["threshold"] = th
	}
	if config != nil {
		body["config"] = config
	}
	if m.CalculationInterval != nil {
		body["calculation_interval"] = *m.CalculationInterval
	}
	return body, nil
}

// fromAPI converts an API alert to the model. Values PostHog fills in when the
// template leaves them out (enabled, the default config, interval and
// absolute_value condition, an empty threshold, notify on inconclusive) are only reported when the template sets
// them or they differ from the default.
func fromAPI(projectID string, a *alert, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:         posthogcfn.String(projectID),
		Id:                a.ID.Ptr(),
		InsightId:         posthogcfn.FlexID(a.Insight).Ptr(),
		InsightShortId:    posthogcfn.StringOrNil(a.InsightShortID),
		Name:              posthogcfn.StringPtrOrNil(a.Name),
		ScheduleStartTime: posthogcfn.StringPtrOrNil(a.ScheduleStartTime),
		CreatedAt:         posthogcfn.StringOrNil(a.CreatedAt),
		DetectorConfig:    posthogcfn.PreserveJSON(desired.DetectorConfig, a.DetectorConfig),
	}
	for _, u := range a.SubscribedUsers {
		if id := posthogcfn.FlexID(u).String(); id != "" {
			m.SubscribedUsers = append(m.SubscribedUsers, id)
		}
	}
	if desired.Config != nil {
		m.Config = posthogcfn.PreserveJSON(desired.Config, a.Config)
	}
	if desired.CalculationInterval != nil {
		m.CalculationInterval = posthogcfn.StringPtrOrNil(a.CalculationInterval)
	}
	if enabled := posthogcfn.BoolValue(a.Enabled); a.Enabled != nil && (!enabled || desired.Enabled != nil) {
		m.Enabled = posthogcfn.Bool(enabled)
	}
	if a.EvaluationDelayIntervals != 0 || desired.EvaluationDelayIntervals != nil {
		m.EvaluationDelayIntervals = posthogcfn.Int(a.EvaluationDelayIntervals)
	}
	if posthogcfn.BoolValue(a.SkipWeekend) || desired.SkipWeekend != nil {
		m.SkipWeekend = posthogcfn.Bool(posthogcfn.BoolValue(a.SkipWeekend))
	}
	if a.InvestigationAgentEnabled || desired.InvestigationAgentEnabled != nil {
		m.InvestigationAgentEnabled = posthogcfn.Bool(a.InvestigationAgentEnabled)
	}
	if a.InvestigationGatesNotifications || desired.InvestigationGatesNotifications != nil {
		m.InvestigationGatesNotifications = posthogcfn.Bool(a.InvestigationGatesNotifications)
	}
	if v := posthogcfn.StringValue(a.InvestigationInconclusiveAction); desired.InvestigationInconclusiveAction != nil || (v != "" && v != "notify") {
		m.InvestigationInconclusiveAction = posthogcfn.StringOrNil(v)
	}
	if a.Condition != nil && a.Condition.Type != "" && (desired.Condition != nil || a.Condition.Type != "absolute_value") {
		m.Condition = &Condition{Type: posthogcfn.String(a.Condition.Type)}
	}
	if r := a.ScheduleRestriction; r != nil && (len(r.BlockedWindows) > 0 || desired.ScheduleRestriction != nil) {
		sr := &ScheduleRestriction{}
		for _, w := range r.BlockedWindows {
			sr.BlockedWindows = append(sr.BlockedWindows, BlockedWindow{Start: posthogcfn.String(w.Start), End: posthogcfn.String(w.End)})
		}
		m.ScheduleRestriction = sr
	}
	if t := a.Threshold; t != nil {
		hasBounds := t.Configuration.Bounds != nil && (t.Configuration.Bounds.Lower != nil || t.Configuration.Bounds.Upper != nil)
		if desired.Threshold != nil || hasBounds || t.Name != "" {
			th := &Threshold{Name: posthogcfn.StringOrNil(t.Name), Configuration: &ThresholdConfiguration{Type: posthogcfn.StringOrNil(t.Configuration.Type)}}
			if hasBounds {
				th.Configuration.Bounds = &Bounds{Lower: t.Configuration.Bounds.Lower, Upper: t.Configuration.Bounds.Upper}
			}
			m.Threshold = th
		}
	}
	return m
}
