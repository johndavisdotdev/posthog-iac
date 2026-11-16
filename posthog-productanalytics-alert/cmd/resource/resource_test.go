package resource

import (
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const alertID = "0190a1b2-0000-7000-8000-000000000001"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/alerts/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "enabled": true, "calculation_interval": "daily",
			"config":    map[string]any{"type": "TrendsAlertConfig", "series_index": 0},
			"condition": map[string]any{"type": "absolute_value"},
			"threshold": map[string]any{"configuration": map[string]any{"type": "absolute", "bounds": nil}},
			"state":     "Not firing", "last_checked_at": "2026-01-02T00:00:00Z", "last_value": 12.5,
			"checks":          []any{map[string]any{"id": "c1", "state": "Not firing"}},
			"detector_config": nil, "evaluation_delay_intervals": 0, "schedule_start_time": nil,
			"skip_weekend": false, "schedule_restriction": nil, "investigation_agent_enabled": false,
			"investigation_gates_notifications": false, "investigation_inconclusive_action": "notify",
		},
		OnCreate: expand,
		OnUpdate: expand,
	})
	return api, store
}

// expand mimics PostHog's response serializer: insight and subscribed users
// come back as nested objects and the threshold gains server fields.
func expand(obj map[string]any) {
	if id, ok := obj["insight"].(float64); ok {
		obj["insight"] = map[string]any{"id": id, "short_id": "AbCd1234", "name": "Pageviews"}
		obj["insight_short_id"] = "AbCd1234"
	}
	if users, ok := obj["subscribed_users"].([]any); ok {
		for i, u := range users {
			if id, ok := u.(float64); ok {
				users[i] = map[string]any{"id": id, "email": "user@example.com"}
			}
		}
	}
	if th, ok := obj["threshold"].(map[string]any); ok {
		th["id"] = "0190a1b2-0000-7000-8000-00000000aaaa"
		th["created_at"] = "2026-01-01T00:00:00Z"
	}
}

func desired() *Model {
	return &Model{
		ProjectId:       cfntest.Ptr(project),
		InsightId:       cfntest.Ptr("17"),
		Name:            cfntest.Ptr("Pageviews dropped"),
		SubscribedUsers: []string{"5"},
		Threshold: &Threshold{Configuration: &ThresholdConfiguration{
			Type: cfntest.Ptr("absolute"), Bounds: &Bounds{Lower: cfntest.Ptr(100.0)},
		}},
		CalculationInterval: cfntest.Ptr("hourly"),
		Config:              cfntest.Ptr(`{"type": "TrendsAlertConfig", "series_index": 0, "check_ongoing_interval": false}`),
		ScheduleRestriction: &ScheduleRestriction{BlockedWindows: []BlockedWindow{{Start: cfntest.Ptr("22:00"), End: cfntest.Ptr("07:00")}}},
		SkipWeekend:         cfntest.Ptr(true),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != alertID || *created.InsightId != "17" || *created.InsightShortId != "AbCd1234" {
		t.Fatalf("create returned %+v", created)
	}
	if len(created.SubscribedUsers) != 1 || created.SubscribedUsers[0] != "5" {
		t.Fatalf("SubscribedUsers = %v", created.SubscribedUsers)
	}
	if *created.Threshold.Configuration.Bounds.Lower != 100 || created.Threshold.Configuration.Bounds.Upper != nil {
		t.Fatalf("Threshold = %+v", created.Threshold.Configuration.Bounds)
	}
	if *created.Config != *model.Config || *created.CalculationInterval != "hourly" || !*created.SkipWeekend {
		t.Fatalf("create returned %+v", created)
	}
	// Defaults PostHog filled in are not reported.
	if created.Enabled != nil || created.Condition != nil || created.InvestigationInconclusiveAction != nil || created.EvaluationDelayIntervals != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	post := api.CallsTo("POST", "/api/projects/42/alerts/")[0].Body
	if post["insight"] != float64(17) || post["subscribed_users"].([]any)[0] != float64(5) || post["enabled"] != true {
		t.Fatalf("create body = %v", post)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Pageviews dropped" || len(read.ScheduleRestriction.BlockedWindows) != 1 {
		t.Fatalf("read returned %+v", read)
	}
	if q := api.CallsTo("GET", "/api/projects/42/alerts/"+alertID+"/")[0].Query; !strings.Contains(q, "checks_limit=1") {
		t.Fatalf("read query = %q", q)
	}

	// Update: disable, relative condition, detector, drop quiet hours and users.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, InsightId: cfntest.Ptr("17"), Name: cfntest.Ptr("Pageviews anomaly"),
		Enabled: cfntest.Ptr(false), Condition: &Condition{Type: cfntest.Ptr("relative_decrease")},
		DetectorConfig: cfntest.Ptr(`{"type": "zscore", "threshold": 3}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Pageviews anomaly" || *after.Enabled || *after.Condition.Type != "relative_decrease" || *after.DetectorConfig != *updated.DetectorConfig {
		t.Fatalf("update returned %+v", after)
	}
	if after.ScheduleRestriction != nil || after.SubscribedUsers != nil || after.SkipWeekend != nil {
		t.Fatalf("removed properties still reported: %+v", after)
	}
	s := store.Get(parent, alertID)
	if s["schedule_restriction"] != nil || s["skip_weekend"] != false || len(s["subscribed_users"].([]any)) != 0 {
		t.Fatalf("removed properties not cleared: %v", s)
	}

	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != alertID {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("alert not deleted")
	}

	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999"), InsightId: cfntest.Ptr("1"), Name: cfntest.Ptr("x")}
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
	base := func() *Model {
		return &Model{ProjectId: cfntest.Ptr(project), InsightId: cfntest.Ptr("1"), Name: cfntest.Ptr("x")}
	}
	cases := map[string]func(m *Model){
		"no project":   func(m *Model) { m.ProjectId = nil },
		"no name":      func(m *Model) { m.Name = nil },
		"no insight":   func(m *Model) { m.InsightId = nil },
		"bad insight":  func(m *Model) { m.InsightId = cfntest.Ptr("AbCd1234") },
		"bad user":     func(m *Model) { m.SubscribedUsers = []string{"me@example.com"} },
		"bad config":   func(m *Model) { m.Config = cfntest.Ptr(`{"type":`) },
		"bad detector": func(m *Model) { m.DetectorConfig = cfntest.Ptr(`zscore`) },
		"no threshold type": func(m *Model) {
			m.Threshold = &Threshold{Configuration: &ThresholdConfiguration{Bounds: &Bounds{Upper: cfntest.Ptr(1.0)}}}
		},
	}
	for name, mutate := range cases {
		m := base()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %q (%v)", name, ev.HandlerErrorCode, err)
		}
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 || len(api.Calls()) != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
