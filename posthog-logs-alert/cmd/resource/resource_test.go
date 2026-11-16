package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const alertsPath = "/api/projects/42/logs/alerts/"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/logs/alerts/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": nil, "created_by": map[string]any{"id": 1},
			"enabled": true, "filters": map[string]any{}, "threshold_count": 100, "threshold_operator": "above",
			"window_minutes": 5, "evaluation_periods": 1, "datapoints_to_alarm": 1, "cooldown_minutes": 0,
			"schedule_restriction": nil, "snooze_until": nil,
			"grouping": map[string]any{"mode": "single", "keys": []any{}, "max_instances": 100, "on_overflow": "degrade_visible"},
			"labels":   map[string]any{}, "annotations": map[string]any{},
			"check_interval_minutes": 1, "platform_owned": false, "state": "not_firing",
			"state_timeline": []any{}, "destination_types": []any{}, "consecutive_failures": 0,
		},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId: cfntest.Ptr(project),
		Name:      cfntest.Ptr("Checkout errors"),
		Filters: &Filters{
			SeverityLevels: []string{"error", "fatal"},
			ServiceNames:   []string{"checkout"},
			FilterGroup:    cfntest.Ptr(`{ "type": "AND", "values": [ {"type": "AND", "values": [ {"key": "message", "type": "log", "operator": "icontains", "value": "timeout"} ]} ] }`),
		},
		ThresholdCount: cfntest.Ptr(10),
		WindowMinutes:  cfntest.Ptr(15),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || created.CheckIntervalMinutes == nil || created.PlatformOwned == nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	if *created.Filters.FilterGroup != *model.Filters.FilterGroup || len(created.Filters.SeverityLevels) != 2 ||
		*created.ThresholdCount != 10 || *created.WindowMinutes != 15 {
		t.Fatalf("create returned %+v", created)
	}
	// Server defaults are not reported.
	if created.Enabled != nil || created.ThresholdOperator != nil || created.EvaluationPeriods != nil ||
		created.CooldownMinutes != nil || created.Grouping != nil || created.Labels != nil || created.ScheduleRestriction != nil {
		t.Fatalf("defaults leaked: %+v", created)
	}
	// Platform-only settings are not sent when the template does not use them.
	post := api.CallsTo("POST", alertsPath)[0]
	for _, k := range []string{"grouping", "labels", "annotations", "schedule_restriction"} {
		if _, ok := post.Body[k]; ok {
			t.Fatalf("%s sent on create without being set", k)
		}
	}
	if f := post.Body["filters"].(map[string]any); f["severityLevels"] == nil || f["filterGroup"] == nil {
		t.Fatalf("filters sent as %v", f)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != *model.Name || *read.Filters.FilterGroup != *model.Filters.FilterGroup {
		t.Fatalf("read returned %+v", read)
	}

	// Update: disable, quiet hours, labels, grouping; drop ThresholdCount
	// and WindowMinutes (reset to defaults) and the filter group.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Checkout errors (v2)"),
		Enabled:             cfntest.Ptr(false),
		Filters:             &Filters{SeverityLevels: []string{"error"}},
		ThresholdOperator:   cfntest.Ptr("below"),
		ScheduleRestriction: &ScheduleRestriction{BlockedWindows: []BlockedWindow{{Start: cfntest.Ptr("22:00"), End: cfntest.Ptr("06:00")}}},
		Grouping:            &Grouping{Mode: cfntest.Ptr("by_result_labels"), Keys: []string{"service_name"}},
		Labels:              map[string]string{"team": "checkout"},
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Enabled || *after.ThresholdOperator != "below" || after.ThresholdCount != nil || after.WindowMinutes != nil ||
		after.Filters.FilterGroup != nil || len(after.ScheduleRestriction.BlockedWindows) != 1 ||
		*after.Grouping.Mode != "by_result_labels" || after.Grouping.MaxInstances != nil || after.Grouping.OnOverflow != nil ||
		after.Labels["team"] != "checkout" {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["threshold_count"] != float64(100) || stored["window_minutes"] != float64(5) {
		t.Fatalf("defaults not restored: %v", stored)
	}

	// Removing grouping, labels and quiet hours resets them.
	reset := &Model{ProjectId: created.ProjectId, Id: created.Id, Name: updated.Name, Filters: updated.Filters}
	ev, err = Update(api.Request(t, reset, after), after, reset)
	cfntest.RequireSuccess(t, ev, err)
	final := ev.ResourceModel.(*Model)
	if final.Grouping != nil || final.Labels != nil || final.ScheduleRestriction != nil || final.Enabled != nil {
		t.Fatalf("reset update returned %+v", final)
	}
	patch := api.CallsTo("PATCH", alertsPath+id+"/")[1]
	if g := patch.Body["grouping"].(map[string]any); g["mode"] != "single" {
		t.Fatalf("grouping not reset: %v", g)
	}
	if l := patch.Body["labels"].(map[string]any); len(l) != 0 {
		t.Fatalf("labels not cleared: %v", l)
	}
	if _, ok := patch.Body["annotations"]; ok {
		t.Fatal("annotations were never set and must not be sent")
	}
	if patch.Body["schedule_restriction"] != nil {
		t.Fatal("quiet hours not cleared")
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete
	ev, err = Delete(api.Request(t, final, nil), nil, final)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("alert not deleted")
	}
}

func TestStringifiedNumbers(t *testing.T) {
	api, _ := newAPI(t)
	// CloudFormation sends numbers as strings; the plugin must accept that.
	raw := map[string]any{
		"ProjectId": project, "Name": "x", "ThresholdCount": "0", "WindowMinutes": "60", "Enabled": "false",
		"Filters": map[string]any{"FilterGroup": `{"type":"AND","values":[]}`},
	}
	req := api.Request(t, raw, nil)
	var m Model
	if err := req.Unmarshal(&m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	ev, err := Create(req, &Model{}, &m)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if *created.ThresholdCount != 0 || *created.WindowMinutes != 60 || *created.Enabled || *created.Filters.FilterGroup != `{"type":"AND","values":[]}` {
		t.Fatalf("create returned %+v", created)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999")
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
	for name, mutate := range map[string]func(*Model){
		"no project":       func(m *Model) { m.ProjectId = nil },
		"no name":          func(m *Model) { m.Name = nil },
		"bad JSON":         func(m *Model) { m.Filters.FilterGroup = cfntest.Ptr(`{"type":`) },
		"group is array":   func(m *Model) { m.Filters.FilterGroup = cfntest.Ptr(`[]`) },
		"grouping no mode": func(m *Model) { m.Grouping = &Grouping{} },
		"window no end": func(m *Model) {
			m.ScheduleRestriction = &ScheduleRestriction{BlockedWindows: []BlockedWindow{{Start: cfntest.Ptr("01:00")}}}
		},
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s (%v)", name, ev.HandlerErrorCode, err)
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
