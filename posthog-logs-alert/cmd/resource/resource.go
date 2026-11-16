package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// PostHog defaults for optional settings. A value equal to its default is
// left out of the model unless the template set it, so omitted properties do
// not show as drift.
const (
	defaultThresholdCount    = 100
	defaultThresholdOperator = "above"
	defaultWindowMinutes     = 5
	defaultEvaluationPeriods = 1
	defaultDatapointsToAlarm = 1
	defaultCooldownMinutes   = 0
	defaultGroupingMode      = "single"
	defaultMaxInstances      = 100
	defaultOnOverflow        = "degrade_visible"
)

// alert is the subset of PostHog's LogsAlertConfiguration these handlers use.
// Runtime state (state, next_check_at, last_*, state_timeline, snooze_until,
// destination_types, ...) is ignored.
type alert struct {
	ID                   posthogcfn.FlexID    `json:"id"`
	Name                 string               `json:"name"`
	Enabled              *bool                `json:"enabled"`
	Filters              *filters             `json:"filters"`
	ThresholdCount       *int                 `json:"threshold_count"`
	ThresholdOperator    string               `json:"threshold_operator"`
	WindowMinutes        *int                 `json:"window_minutes"`
	EvaluationPeriods    *int                 `json:"evaluation_periods"`
	DatapointsToAlarm    *int                 `json:"datapoints_to_alarm"`
	CooldownMinutes      *int                 `json:"cooldown_minutes"`
	ScheduleRestriction  *scheduleRestriction `json:"schedule_restriction"`
	Grouping             *grouping            `json:"grouping"`
	Labels               map[string]string    `json:"labels"`
	Annotations          map[string]string    `json:"annotations"`
	CheckIntervalMinutes *int                 `json:"check_interval_minutes"`
	PlatformOwned        *bool                `json:"platform_owned"`
	CreatedAt            string               `json:"created_at"`
	UpdatedAt            *string              `json:"updated_at"`
}

type filters struct {
	SeverityLevels []string        `json:"severityLevels,omitempty"`
	ServiceNames   []string        `json:"serviceNames,omitempty"`
	FilterGroup    json.RawMessage `json:"filterGroup,omitempty"`
}

type scheduleRestriction struct {
	BlockedWindows []blockedWindow `json:"blocked_windows"`
}

type blockedWindow struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type grouping struct {
	Mode         string   `json:"mode"`
	Keys         []string `json:"keys"`
	MaxInstances *int     `json:"max_instances,omitempty"`
	OnOverflow   string   `json:"on_overflow,omitempty"`
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
	return posthogcfn.Path("/api/projects/%s/logs/alerts/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/logs/alerts/%s/", projectID, id)
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
	body, err := requestBody(currentModel, nil)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if currentModel.ScheduleRestriction == nil {
		delete(body, "schedule_restriction")
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out alert
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating logs alert", err), nil
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
		return posthogcfn.NotFound("logs alert ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. PATCH on a
// deleted alert returns 404, which maps to NotFound.
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
		return posthogcfn.NotFound("logs alert ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel, prevModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out alert
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating logs alert "+id, err), nil
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
		return posthogcfn.NotFound("logs alert ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting logs alert "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list logs alerts"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[alert](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing logs alerts", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*alert, *handler.ProgressEvent) {
	var out alert
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading logs alert "+id, err)
		return nil, &ev
	}
	return &out, nil
}

func intOr(v *int, def int) int {
	if v == nil {
		return def
	}
	return *v
}

// requestBody builds the create/update body. Every writable setting is sent
// (defaults for omitted ones) so that properties removed from the template
// are reset. Grouping, Labels and Annotations are only accepted by alerts the
// alerts platform evaluates, so they are sent only when the template sets
// them, or when prev (the previous model on update) set them and they must
// now be reset to single / empty.
func requestBody(m, prev *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	f := filters{}
	if m.Filters != nil {
		group, err := posthogcfn.ParseJSON("Filters.FilterGroup", m.Filters.FilterGroup)
		if err != nil {
			return nil, err
		}
		if group != nil {
			if _, ok := group.(map[string]any); !ok {
				return nil, fmt.Errorf("Filters.FilterGroup must be a JSON object such as {\"type\": \"AND\", \"values\": [...]}")
			}
			f.FilterGroup, _ = json.Marshal(group)
		}
		f.SeverityLevels = m.Filters.SeverityLevels
		f.ServiceNames = m.Filters.ServiceNames
	}
	operator := posthogcfn.StringValue(m.ThresholdOperator)
	if operator == "" {
		operator = defaultThresholdOperator
	}
	var schedule any
	if m.ScheduleRestriction != nil {
		windows := make([]blockedWindow, 0, len(m.ScheduleRestriction.BlockedWindows))
		for i, w := range m.ScheduleRestriction.BlockedWindows {
			if posthogcfn.StringValue(w.Start) == "" || posthogcfn.StringValue(w.End) == "" {
				return nil, fmt.Errorf("ScheduleRestriction.BlockedWindows[%d] needs Start and End", i)
			}
			windows = append(windows, blockedWindow{Start: *w.Start, End: *w.End})
		}
		schedule = scheduleRestriction{BlockedWindows: windows}
	}
	body := map[string]any{
		"name":                 *m.Name,
		"enabled":              m.Enabled == nil || *m.Enabled,
		"filters":              f,
		"threshold_count":      intOr(m.ThresholdCount, defaultThresholdCount),
		"threshold_operator":   operator,
		"window_minutes":       intOr(m.WindowMinutes, defaultWindowMinutes),
		"evaluation_periods":   intOr(m.EvaluationPeriods, defaultEvaluationPeriods),
		"datapoints_to_alarm":  intOr(m.DatapointsToAlarm, defaultDatapointsToAlarm),
		"cooldown_minutes":     intOr(m.CooldownMinutes, defaultCooldownMinutes),
		"schedule_restriction": schedule,
	}
	if prev == nil {
		prev = &Model{}
	}
	if g := m.Grouping; g != nil {
		if posthogcfn.StringValue(g.Mode) == "" {
			return nil, fmt.Errorf("Grouping.Mode is required")
		}
		keys := g.Keys
		if keys == nil {
			keys = []string{}
		}
		body["grouping"] = grouping{Mode: *g.Mode, Keys: keys, MaxInstances: g.MaxInstances, OnOverflow: posthogcfn.StringValue(g.OnOverflow)}
	} else if prev.Grouping != nil {
		body["grouping"] = grouping{Mode: defaultGroupingMode, Keys: []string{}}
	}
	if m.Labels != nil || prev.Labels != nil {
		body["labels"] = nonNilMap(m.Labels)
	}
	if m.Annotations != nil || prev.Annotations != nil {
		body["annotations"] = nonNilMap(m.Annotations)
	}
	return body, nil
}

func nonNilMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

// orDefault returns v for the model unless it equals def and the template
// did not set the property.
func orDefault(v *int, def int, desired *int) *int {
	if v == nil || (desired == nil && *v == def) {
		return nil
	}
	return posthogcfn.Int(*v)
}

// fromAPI converts an API alert to the model. desired is the model from the
// request; server defaults are left out unless it set them, and the
// FilterGroup JSON string is kept when JSON-equal to the API value.
func fromAPI(projectID string, a *alert, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:            posthogcfn.String(projectID),
		Id:                   a.ID.Ptr(),
		Name:                 posthogcfn.StringOrNil(a.Name),
		ThresholdCount:       orDefault(a.ThresholdCount, defaultThresholdCount, desired.ThresholdCount),
		WindowMinutes:        orDefault(a.WindowMinutes, defaultWindowMinutes, desired.WindowMinutes),
		EvaluationPeriods:    orDefault(a.EvaluationPeriods, defaultEvaluationPeriods, desired.EvaluationPeriods),
		DatapointsToAlarm:    orDefault(a.DatapointsToAlarm, defaultDatapointsToAlarm, desired.DatapointsToAlarm),
		CooldownMinutes:      orDefault(a.CooldownMinutes, defaultCooldownMinutes, desired.CooldownMinutes),
		Labels:               posthogcfn.MapOrNil(a.Labels),
		Annotations:          posthogcfn.MapOrNil(a.Annotations),
		CheckIntervalMinutes: a.CheckIntervalMinutes,
		PlatformOwned:        a.PlatformOwned,
		CreatedAt:            posthogcfn.StringOrNil(a.CreatedAt),
		UpdatedAt:            posthogcfn.StringPtrOrNil(a.UpdatedAt),
	}
	if a.Enabled != nil && (desired.Enabled != nil || !*a.Enabled) {
		m.Enabled = posthogcfn.Bool(*a.Enabled)
	}
	if a.ThresholdOperator != "" && (desired.ThresholdOperator != nil || a.ThresholdOperator != defaultThresholdOperator) {
		m.ThresholdOperator = posthogcfn.String(a.ThresholdOperator)
	}
	if f := a.Filters; f != nil {
		var want *string
		if desired.Filters != nil {
			want = desired.Filters.FilterGroup
		}
		out := Filters{
			SeverityLevels: posthogcfn.SliceOrNil(f.SeverityLevels),
			ServiceNames:   posthogcfn.SliceOrNil(f.ServiceNames),
		}
		if len(f.FilterGroup) > 0 && string(f.FilterGroup) != "null" {
			out.FilterGroup = posthogcfn.PreserveJSON(want, f.FilterGroup)
		}
		if out.SeverityLevels != nil || out.ServiceNames != nil || out.FilterGroup != nil {
			m.Filters = &out
		}
	}
	if s := a.ScheduleRestriction; s != nil && (desired.ScheduleRestriction != nil || len(s.BlockedWindows) > 0) {
		out := &ScheduleRestriction{}
		for _, w := range s.BlockedWindows {
			out.BlockedWindows = append(out.BlockedWindows, BlockedWindow{Start: posthogcfn.String(w.Start), End: posthogcfn.String(w.End)})
		}
		m.ScheduleRestriction = out
	}
	if g := a.Grouping; g != nil && g.Mode != "" && (desired.Grouping != nil || g.Mode != defaultGroupingMode) {
		var want Grouping
		if desired.Grouping != nil {
			want = *desired.Grouping
		}
		out := &Grouping{
			Mode:         posthogcfn.String(g.Mode),
			Keys:         posthogcfn.SliceOrNil(g.Keys),
			MaxInstances: orDefault(g.MaxInstances, defaultMaxInstances, want.MaxInstances),
		}
		if g.OnOverflow != "" && (want.OnOverflow != nil || g.OnOverflow != defaultOnOverflow) {
			out.OnOverflow = posthogcfn.String(g.OnOverflow)
		}
		m.Grouping = out
	}
	return m
}
