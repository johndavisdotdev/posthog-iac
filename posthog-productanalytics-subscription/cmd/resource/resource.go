package resource

import (
	"context"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// subscription is the subset of PostHog's Subscription object these handlers use.
type subscription struct {
	ID                      posthogcfn.FlexID   `json:"id"`
	ResourceType            string              `json:"resource_type"`
	Dashboard               posthogcfn.FlexID   `json:"dashboard"`
	Insight                 posthogcfn.FlexID   `json:"insight"`
	InsightShortID          *string             `json:"insight_short_id"`
	DashboardExportInsights []posthogcfn.FlexID `json:"dashboard_export_insights"`
	Prompt                  *string             `json:"prompt"`
	AIPromptConfig          *apiAIPromptConfig  `json:"ai_prompt_config"`
	Contexts                []apiContext        `json:"contexts"`
	TargetType              string              `json:"target_type"`
	TargetValue             string              `json:"target_value"`
	Frequency               string              `json:"frequency"`
	Interval                *int                `json:"interval"`
	Byweekday               []string            `json:"byweekday"`
	Bysetpos                *int                `json:"bysetpos"`
	Count                   *int                `json:"count"`
	StartDate               string              `json:"start_date"`
	UntilDate               *string             `json:"until_date"`
	CreatedAt               string              `json:"created_at"`
	Deleted                 bool                `json:"deleted"`
	Enabled                 *bool               `json:"enabled"`
	Title                   *string             `json:"title"`
	Summary                 string              `json:"summary"`
	NextDeliveryDate        *string             `json:"next_delivery_date"`
	IntegrationID           posthogcfn.FlexID   `json:"integration_id"`
	SummaryEnabled          bool                `json:"summary_enabled"`
	SummaryPromptGuide      string              `json:"summary_prompt_guide"`
	DeliveryConfig          *apiDeliveryConfig  `json:"delivery_config"`
}

type apiAIPromptConfig struct {
	Window *apiWindow `json:"window,omitempty"`
}

type apiWindow struct {
	Mode         *string `json:"mode,omitempty"`
	StartDaysAgo *int    `json:"start_days_ago,omitempty"`
	EndDaysAgo   *int    `json:"end_days_ago,omitempty"`
}

type apiContext struct {
	DashboardID posthogcfn.FlexID `json:"dashboard_id,omitempty"`
	InsightID   posthogcfn.FlexID `json:"insight_id,omitempty"`
}

type apiDeliveryConfig struct {
	PostAllInsightsInMainMessage *bool `json:"post_all_insights_in_main_message,omitempty"`
	IncludeImages                *bool `json:"include_images,omitempty"`
	IncludeFeedback              *bool `json:"include_feedback,omitempty"`
	IncludeManageLink            *bool `json:"include_manage_link,omitempty"`
	IncludePosthogHint           *bool `json:"include_posthog_hint,omitempty"`
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
	return posthogcfn.Path("/api/projects/%s/subscriptions/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/subscriptions/%s/", projectID, id)
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
	body, err := requestBody(currentModel, nil, true)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out subscription
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating subscription", err), nil
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
		return posthogcfn.NotFound("subscription ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("subscription ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel, prevModel, false)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted subscription succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out subscription
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating subscription "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
// Subscriptions cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("subscription ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting subscription "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list subscriptions"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[subscription](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing subscriptions", err), nil
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

// get reads one live subscription, mapping a 404 or a soft-deleted one to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*subscription, *handler.ProgressEvent) {
	var out subscription
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading subscription "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("subscription %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// kind is what the subscription delivers, derived from the model.
func kind(m *Model) string {
	switch {
	case posthogcfn.StringValue(m.Prompt) != "":
		return "ai_prompt"
	case posthogcfn.StringValue(m.Dashboard) != "":
		return "dashboard"
	default:
		return "insight"
	}
}

// intID parses a numeric ID property; nil/"" gives (nil, nil).
func intID(name string, s *string) (any, error) {
	if posthogcfn.StringValue(s) == "" {
		return nil, nil
	}
	n, ok := posthogcfn.IDInt(s)
	if !ok {
		return nil, &validationError{name + " must be a numeric ID"}
	}
	return n, nil
}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }

// requestBody builds the create (create=true) or update body. Every writable
// field that applies to the subscription's kind is sent so that properties
// removed from the template are cleared in PostHog. Fields that only apply to
// another kind are left out, because PostHog rejects some of them.
func requestBody(m, prev *Model, create bool) (map[string]any, error) {
	set := 0
	for _, s := range []*string{m.Insight, m.Dashboard, m.Prompt} {
		if posthogcfn.StringValue(s) != "" {
			set++
		}
	}
	if set != 1 {
		return nil, &validationError{"exactly one of Insight, Dashboard and Prompt must be set"}
	}
	for name, v := range map[string]*string{"TargetType": m.TargetType, "TargetValue": m.TargetValue, "Frequency": m.Frequency, "StartDate": m.StartDate} {
		if posthogcfn.StringValue(v) == "" {
			return nil, &validationError{name + " is required"}
		}
	}
	integrationID, err := intID("IntegrationId", m.IntegrationId)
	if err != nil {
		return nil, err
	}
	interval := 1
	if m.Interval != nil {
		interval = *m.Interval
	}
	body := map[string]any{
		"title":          posthogcfn.StringPtrOrNil(m.Title),
		"target_type":    posthogcfn.StringValue(m.TargetType),
		"target_value":   posthogcfn.StringValue(m.TargetValue),
		"integration_id": integrationID,
		"frequency":      posthogcfn.StringValue(m.Frequency),
		"interval":       interval,
		"byweekday":      nilIfEmpty(m.Byweekday),
		"bysetpos":       m.Bysetpos,
		"count":          m.Count,
		"start_date":     posthogcfn.StringValue(m.StartDate),
		"until_date":     posthogcfn.StringPtrOrNil(m.UntilDate),
		"enabled":        m.Enabled == nil || *m.Enabled,
		// PostHog sends a test delivery on create unless told otherwise; a
		// stack operation should not, unless the template asks for it.
		"send_test_now": posthogcfn.BoolValue(m.SendTestNow),
	}
	if m.InviteMessage != nil {
		body["invite_message"] = *m.InviteMessage
	}
	switch {
	case m.DeliveryConfig != nil:
		body["delivery_config"] = toAPIDeliveryConfig(m.DeliveryConfig)
	case !create && prev != nil && prev.DeliveryConfig != nil:
		body["delivery_config"] = map[string]any{}
	}

	switch kind(m) {
	case "ai_prompt":
		body["prompt"] = *m.Prompt
		body["ai_prompt_config"] = toAPIAIPromptConfig(m.AiPromptConfig)
		contexts := make([]map[string]any, 0, len(m.Contexts))
		for i, ctx := range m.Contexts {
			dash, err := intID("Contexts["+strconv.Itoa(i)+"].DashboardId", ctx.DashboardId)
			if err != nil {
				return nil, err
			}
			ins, err := intID("Contexts["+strconv.Itoa(i)+"].InsightId", ctx.InsightId)
			if err != nil {
				return nil, err
			}
			switch {
			case dash != nil && ins == nil:
				contexts = append(contexts, map[string]any{"dashboard_id": dash})
			case ins != nil && dash == nil:
				contexts = append(contexts, map[string]any{"insight_id": ins})
			default:
				return nil, &validationError{"Contexts[" + strconv.Itoa(i) + "] must set exactly one of DashboardId and InsightId"}
			}
		}
		body["contexts"] = contexts
	case "dashboard":
		dash, err := intID("Dashboard", m.Dashboard)
		if err != nil {
			return nil, err
		}
		insights := make([]int64, 0, len(m.DashboardExportInsights))
		for i, s := range m.DashboardExportInsights {
			n, ok := posthogcfn.IDInt(&s)
			if !ok {
				return nil, &validationError{"DashboardExportInsights[" + strconv.Itoa(i) + "] must be a numeric insight ID"}
			}
			insights = append(insights, n)
		}
		if create {
			body["dashboard"] = dash
		}
		body["dashboard_export_insights"] = insights
		body["summary_enabled"] = posthogcfn.BoolValue(m.SummaryEnabled)
		body["summary_prompt_guide"] = posthogcfn.StringValue(m.SummaryPromptGuide)
	default:
		ins, err := intID("Insight", m.Insight)
		if err != nil {
			return nil, err
		}
		if create {
			body["insight"] = ins
		}
		body["summary_enabled"] = posthogcfn.BoolValue(m.SummaryEnabled)
		body["summary_prompt_guide"] = posthogcfn.StringValue(m.SummaryPromptGuide)
	}
	return body, nil
}

func nilIfEmpty(s []string) []string {
	if len(s) == 0 {
		return nil
	}
	return s
}

func toAPIAIPromptConfig(c *AiPromptConfig) map[string]any {
	out := map[string]any{}
	if c == nil || c.Window == nil {
		return out
	}
	w := map[string]any{}
	if c.Window.Mode != nil {
		w["mode"] = *c.Window.Mode
	}
	if c.Window.StartDaysAgo != nil {
		w["start_days_ago"] = *c.Window.StartDaysAgo
	}
	if c.Window.EndDaysAgo != nil {
		w["end_days_ago"] = *c.Window.EndDaysAgo
	}
	out["window"] = w
	return out
}

func toAPIDeliveryConfig(d *DeliveryConfig) apiDeliveryConfig {
	return apiDeliveryConfig{
		PostAllInsightsInMainMessage: d.PostAllInsightsInMainMessage,
		IncludeImages:                d.IncludeImages,
		IncludeFeedback:              d.IncludeFeedback,
		IncludeManageLink:            d.IncludeManageLink,
		IncludePosthogHint:           d.IncludePosthogHint,
	}
}

// fromAPI converts an API subscription to the model. desired is the model from
// the request; it decides whether server defaults are reported and lets
// equivalent template values (timestamps, Teams webhook URLs) be kept verbatim.
func fromAPI(projectID string, s *subscription, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:          posthogcfn.String(projectID),
		Id:                 s.ID.Ptr(),
		Title:              posthogcfn.StringPtrOrNil(s.Title),
		Insight:            s.Insight.Ptr(),
		Dashboard:          s.Dashboard.Ptr(),
		Prompt:             posthogcfn.StringPtrOrNil(s.Prompt),
		TargetType:         posthogcfn.StringOrNil(s.TargetType),
		TargetValue:        targetValue(s.TargetType, s.TargetValue, desired.TargetValue),
		IntegrationId:      s.IntegrationID.Ptr(),
		Frequency:          posthogcfn.StringOrNil(s.Frequency),
		Byweekday:          posthogcfn.SliceOrNil(s.Byweekday),
		Bysetpos:           s.Bysetpos,
		Count:              s.Count,
		StartDate:          sameTime(desired.StartDate, s.StartDate),
		UntilDate:          sameTime(desired.UntilDate, posthogcfn.StringValue(s.UntilDate)),
		SummaryPromptGuide: posthogcfn.StringOrNil(s.SummaryPromptGuide),
		ResourceType:       posthogcfn.StringOrNil(s.ResourceType),
		InsightShortId:     posthogcfn.StringPtrOrNil(s.InsightShortID),
		Summary:            posthogcfn.StringOrNil(s.Summary),
		NextDeliveryDate:   posthogcfn.StringPtrOrNil(s.NextDeliveryDate),
		CreatedAt:          posthogcfn.StringOrNil(s.CreatedAt),
	}
	for _, id := range s.DashboardExportInsights {
		if id != "" {
			m.DashboardExportInsights = append(m.DashboardExportInsights, id.String())
		}
	}
	// Interval defaults to 1; enabled defaults to true; summary_enabled to false.
	if s.Interval != nil && (*s.Interval != 1 || desired.Interval != nil) {
		m.Interval = s.Interval
	}
	if s.Enabled != nil && (!*s.Enabled || desired.Enabled != nil) {
		m.Enabled = s.Enabled
	}
	if s.SummaryEnabled || desired.SummaryEnabled != nil {
		m.SummaryEnabled = posthogcfn.Bool(s.SummaryEnabled)
	}
	if s.ResourceType == "ai_prompt" {
		for _, c := range s.Contexts {
			m.Contexts = append(m.Contexts, Context{DashboardId: c.DashboardID.Ptr(), InsightId: c.InsightID.Ptr()})
		}
		m.AiPromptConfig = aiPromptConfig(s.AIPromptConfig, desired.AiPromptConfig)
	}
	m.DeliveryConfig = deliveryConfig(s.DeliveryConfig, desired.DeliveryConfig)
	return m
}

// targetValue keeps the template's Microsoft Teams webhook URL when PostHog
// returns only its host (the URL is a credential and is never echoed back).
func targetValue(targetType, api string, desired *string) *string {
	if targetType == "teams" && desired != nil && api != "" && api != *desired {
		if u, err := url.Parse(*desired); err == nil && u.Host != "" {
			if api == u.Host || api == u.Scheme+"://"+u.Host || strings.TrimSuffix(api, "/") == u.Scheme+"://"+u.Host {
				return desired
			}
		}
	}
	return posthogcfn.StringOrNil(api)
}

var timeLayouts = []string{time.RFC3339Nano, "2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02"}

func parseTime(s string) (time.Time, bool) {
	for _, l := range timeLayouts {
		if t, err := time.Parse(l, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// sameTime returns the template's timestamp when it denotes the same instant
// as the API's (PostHog normalises the format), otherwise the API value.
func sameTime(desired *string, api string) *string {
	if api == "" {
		return nil
	}
	if desired != nil {
		d, ok1 := parseTime(*desired)
		a, ok2 := parseTime(api)
		if ok1 && ok2 && d.Equal(a) {
			return desired
		}
	}
	return &api
}

// aiPromptConfig reports the window unless it is the default and the template
// did not set one.
func aiPromptConfig(api *apiAIPromptConfig, desired *AiPromptConfig) *AiPromptConfig {
	if api == nil || api.Window == nil {
		if desired != nil {
			return &AiPromptConfig{}
		}
		return nil
	}
	w := api.Window
	isDefault := (w.Mode == nil || *w.Mode == "since_last_sent") && w.StartDaysAgo == nil && w.EndDaysAgo == nil
	if desired == nil && isDefault {
		return nil
	}
	if desired != nil && desired.Window == nil && isDefault {
		return &AiPromptConfig{}
	}
	out := &Window{StartDaysAgo: w.StartDaysAgo, EndDaysAgo: w.EndDaysAgo}
	if w.Mode != nil && (*w.Mode != "since_last_sent" || (desired != nil && desired.Window != nil && desired.Window.Mode != nil)) {
		out.Mode = w.Mode
	}
	return &AiPromptConfig{Window: out}
}

// deliveryConfig reports the options the template set, plus any non-default
// option PostHog holds, so server defaults do not show as drift.
func deliveryConfig(api *apiDeliveryConfig, desired *DeliveryConfig) *DeliveryConfig {
	if api == nil {
		api = &apiDeliveryConfig{}
	}
	if desired == nil {
		desired = &DeliveryConfig{}
	}
	pick := func(v, want *bool, def bool) *bool {
		if v == nil {
			return nil
		}
		if want != nil || *v != def {
			return v
		}
		return nil
	}
	out := &DeliveryConfig{
		PostAllInsightsInMainMessage: pick(api.PostAllInsightsInMainMessage, desired.PostAllInsightsInMainMessage, false),
		IncludeImages:                pick(api.IncludeImages, desired.IncludeImages, true),
		IncludeFeedback:              pick(api.IncludeFeedback, desired.IncludeFeedback, true),
		IncludeManageLink:            pick(api.IncludeManageLink, desired.IncludeManageLink, true),
		IncludePosthogHint:           pick(api.IncludePosthogHint, desired.IncludePosthogHint, true),
	}
	if *out == (DeliveryConfig{}) {
		return nil
	}
	return out
}
