package resource

import (
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const collection = "/api/projects/" + project + "/subscriptions/"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/subscriptions/", cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "summary": "sent daily", "next_delivery_date": "2026-01-06T09:00:00Z",
			"enabled": true, "interval": 1, "summary_enabled": false, "summary_prompt_guide": "",
			"delivery_config":           map[string]any{"post_all_insights_in_main_message": false},
			"dashboard_export_insights": []any{}, "contexts": []any{}, "byweekday": nil, "count": nil,
		},
		WriteOnly: []string{"send_test_now", "invite_message"},
		OnCreate:  normalise,
		OnUpdate:  normalise,
	})
	return api, store
}

// normalise imitates what PostHog does to a stored subscription: derive the
// resource type, reformat timestamps and only return the host of a Teams URL.
func normalise(obj map[string]any) {
	switch {
	case obj["prompt"] != nil:
		obj["resource_type"] = "ai_prompt"
		if obj["ai_prompt_config"] == nil {
			obj["ai_prompt_config"] = map[string]any{"window": map[string]any{"mode": "since_last_sent"}}
		}
	case obj["dashboard"] != nil:
		obj["resource_type"] = "dashboard"
	default:
		obj["resource_type"] = "insight"
		obj["insight_short_id"] = "abc123"
	}
	if s, ok := obj["start_date"].(string); ok {
		if ts, err := time.Parse(time.RFC3339, s); err == nil {
			obj["start_date"] = ts.UTC().Format("2006-01-02T15:04:05Z")
		}
	}
	if obj["target_type"] == "teams" {
		if u, err := url.Parse(obj["target_value"].(string)); err == nil && u.Host != "" {
			obj["target_value"] = u.Host
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Title:       cfntest.Ptr("Weekly signups"),
		Insight:     cfntest.Ptr("7"),
		TargetType:  cfntest.Ptr("email"),
		TargetValue: cfntest.Ptr("a@example.com,b@example.com"),
		Frequency:   cfntest.Ptr("weekly"),
		Interval:    cfntest.Ptr(2),
		Byweekday:   []string{"monday"},
		StartDate:   cfntest.Ptr("2026-01-05T10:00:00+01:00"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || *created.ResourceType != "insight" || *created.InsightShortId != "abc123" {
		t.Fatalf("create returned %+v", created)
	}
	// The equivalent timestamp from the template is kept, and server defaults
	// (enabled, delivery_config, summary_enabled) are not reported.
	if *created.StartDate != *model.StartDate {
		t.Fatalf("StartDate = %s", *created.StartDate)
	}
	if created.Enabled != nil || created.DeliveryConfig != nil || created.SummaryEnabled != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if *created.Insight != "7" || *created.Interval != 2 {
		t.Fatalf("create returned %+v", created)
	}
	post := api.CallsTo("POST", collection)[0].Body
	if post["send_test_now"] != false || post["insight"] != float64(7) {
		t.Fatalf("create body = %v", post)
	}
	if _, ok := post["prompt"]; ok {
		t.Fatalf("prompt sent for an insight subscription: %v", post)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Title != "Weekly signups" || len(read.Byweekday) != 1 || *read.StartDate != *model.StartDate {
		t.Fatalf("read returned %+v", read)
	}

	// Update: drop title, weekdays and interval (cleared), pause it.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Insight: created.Insight,
		TargetType: cfntest.Ptr("email"), TargetValue: cfntest.Ptr("a@example.com"),
		Frequency: cfntest.Ptr("daily"), StartDate: cfntest.Ptr("2026-01-05T09:00:00Z"),
		Enabled: cfntest.Ptr(false),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.Title != nil || after.Byweekday != nil || after.Interval != nil || *after.Enabled != false || *after.Frequency != "daily" {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, "1")
	if stored["title"] != nil || stored["byweekday"] != nil || stored["interval"] != float64(1) {
		t.Fatalf("fields not cleared: %v", stored)
	}
	patch := api.CallsTo("PATCH", collection+"1/")[0].Body
	if _, ok := patch["insight"]; ok {
		t.Fatalf("create-only insight sent on update: %v", patch)
	}

	// List
	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete soft-deletes.
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1")["deleted"] != true {
		t.Fatal("subscription not soft-deleted")
	}

	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted subscription still listed: %+v", ev.ResourceModels)
	}
}

func TestAIPromptSubscription(t *testing.T) {
	api, store := newAPI(t)
	model := &Model{
		ProjectId:      cfntest.Ptr(project),
		Prompt:         cfntest.Ptr("Summarise last week's activation funnel"),
		AiPromptConfig: &AiPromptConfig{Window: &Window{Mode: cfntest.Ptr("last_n_days"), StartDaysAgo: cfntest.Ptr(7)}},
		Contexts:       []Context{{DashboardId: cfntest.Ptr("3")}, {InsightId: cfntest.Ptr("9")}},
		TargetType:     cfntest.Ptr("slack"),
		TargetValue:    cfntest.Ptr("#growth"),
		IntegrationId:  cfntest.Ptr("5"),
		Frequency:      cfntest.Ptr("weekly"),
		StartDate:      cfntest.Ptr("2026-01-05T09:00:00Z"),
		DeliveryConfig: &DeliveryConfig{IncludeFeedback: cfntest.Ptr(false)},
		SendTestNow:    cfntest.Ptr(true),
		InviteMessage:  cfntest.Ptr("hello"),
	}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	got := ev.ResourceModel.(*Model)
	if *got.ResourceType != "ai_prompt" || len(got.Contexts) != 2 || *got.Contexts[0].DashboardId != "3" || *got.Contexts[1].InsightId != "9" {
		t.Fatalf("create returned %+v", got)
	}
	if got.AiPromptConfig == nil || *got.AiPromptConfig.Window.Mode != "last_n_days" || *got.AiPromptConfig.Window.StartDaysAgo != 7 {
		t.Fatalf("AiPromptConfig = %+v", got.AiPromptConfig)
	}
	if got.DeliveryConfig == nil || *got.DeliveryConfig.IncludeFeedback != false || got.DeliveryConfig.PostAllInsightsInMainMessage != nil {
		t.Fatalf("DeliveryConfig = %+v", got.DeliveryConfig)
	}
	if got.SendTestNow != nil || got.InviteMessage != nil {
		t.Fatal("write-only properties returned")
	}
	if *got.IntegrationId != "5" {
		t.Fatalf("IntegrationId = %v", got.IntegrationId)
	}
	post := api.CallsTo("POST", collection)[0].Body
	if post["send_test_now"] != true || post["invite_message"] != "hello" || post["integration_id"] != float64(5) {
		t.Fatalf("create body = %v", post)
	}
	for _, f := range []string{"summary_enabled", "summary_prompt_guide", "insight", "dashboard", "dashboard_export_insights"} {
		if _, ok := post[f]; ok {
			t.Fatalf("%s sent for an AI report subscription", f)
		}
	}

	// Removing DeliveryConfig and the window clears them.
	updated := *model
	updated.Id = got.Id
	updated.DeliveryConfig, updated.AiPromptConfig, updated.SendTestNow, updated.InviteMessage = nil, nil, nil, nil
	ev, err = Update(api.Request(t, &updated, got), got, &updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.DeliveryConfig != nil || after.AiPromptConfig != nil {
		t.Fatalf("update returned %+v", after)
	}
	if dc := store.Get(parent, "1")["delivery_config"].(map[string]any); len(dc) != 0 {
		t.Fatalf("delivery_config not cleared: %v", dc)
	}
	patch := api.CallsTo("PATCH", collection+"1/")[0].Body
	if patch["send_test_now"] != false {
		t.Fatalf("send_test_now = %v", patch["send_test_now"])
	}
}

func TestDashboardSubscription(t *testing.T) {
	api, _ := newAPI(t)
	model := &Model{
		ProjectId: cfntest.Ptr(project), Dashboard: cfntest.Ptr("3"), DashboardExportInsights: []string{"10", "11"},
		TargetType: cfntest.Ptr("email"), TargetValue: cfntest.Ptr("a@example.com"),
		Frequency: cfntest.Ptr("monthly"), Bysetpos: cfntest.Ptr(-1), Byweekday: []string{"friday"},
		StartDate: cfntest.Ptr("2026-01-05T09:00:00Z"), SummaryEnabled: cfntest.Ptr(true),
	}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	got := ev.ResourceModel.(*Model)
	if *got.Dashboard != "3" || len(got.DashboardExportInsights) != 2 || *got.Bysetpos != -1 || *got.SummaryEnabled != true {
		t.Fatalf("create returned %+v", got)
	}
	post := api.CallsTo("POST", collection)[0].Body
	ins := post["dashboard_export_insights"].([]any)
	if post["dashboard"] != float64(3) || ins[0] != float64(10) {
		t.Fatalf("create body = %v", post)
	}
}

func TestTeamsWebhookURLKept(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	model.TargetType = cfntest.Ptr("teams")
	model.TargetValue = cfntest.Ptr("https://example.webhook.office.com/webhookb2/secret-token")
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	got := ev.ResourceModel.(*Model)
	if *got.TargetValue != *model.TargetValue {
		t.Fatalf("TargetValue = %s", *got.TargetValue)
	}
	// Without the template value (e.g. after import), the host is reported.
	bare := &Model{ProjectId: got.ProjectId, Id: got.Id}
	ev, err = Read(api.Request(t, bare, nil), nil, bare)
	cfntest.RequireSuccess(t, ev, err)
	if v := *ev.ResourceModel.(*Model).TargetValue; strings.Contains(v, "secret") {
		t.Fatalf("TargetValue = %s", v)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("999")
	ev, err := Read(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, gone, gone), gone, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	empty := &Model{}
	ev, err = Read(api.Request(t, empty, nil), nil, empty)
	cfntest.RequireNotFound(t, ev, err)
}

func TestValidation(t *testing.T) {
	api, store := newAPI(t)
	cases := map[string]func(m *Model){
		"no project":        func(m *Model) { m.ProjectId = nil },
		"no source":         func(m *Model) { m.Insight = nil },
		"two sources":       func(m *Model) { m.Dashboard = cfntest.Ptr("3") },
		"non-numeric id":    func(m *Model) { m.Insight = cfntest.Ptr("abc") },
		"no target":         func(m *Model) { m.TargetValue = nil },
		"bad integration":   func(m *Model) { m.IntegrationId = cfntest.Ptr("x") },
		"ambiguous context": func(m *Model) { m.Insight, m.Prompt, m.Contexts = nil, cfntest.Ptr("p"), []Context{{}} },
	}
	for name, mutate := range cases {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s %q", name, ev.HandlerErrorCode, ev.Message)
		}
		if err != nil {
			t.Errorf("%s: err %v", name, err)
		}
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
