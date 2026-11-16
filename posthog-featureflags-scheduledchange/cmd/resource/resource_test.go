package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/scheduled_changes/", cfntest.CollectionOptions{
		Defaults: map[string]any{
			"team_id": 42, "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"executed_at": nil, "last_executed_at": nil, "failure_reason": nil, "timezone": "UTC",
			"change_request": nil, "is_recurring": false,
		},
		// PostHog returns timestamps in its own format.
		OnCreate: reformat,
		OnUpdate: reformat,
	})
	return api, store
}

func reformat(obj map[string]any) {
	if obj["scheduled_at"] == "2026-06-01T16:00:00+02:00" {
		obj["scheduled_at"] = "2026-06-01T14:00:00Z"
	}
}

const payload = `{ "operation": "update_status", "value": true }`

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		RecordId:    cfntest.Ptr("7"),
		Payload:     cfntest.Ptr(payload),
		ScheduledAt: cfntest.Ptr("2026-06-01T16:00:00+02:00"),
	}
}

func listModel() *Model { return &Model{ProjectId: cfntest.Ptr(project)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || *created.RecordId != "7" || *created.Timezone != "UTC" {
		t.Fatalf("create returned %+v", created)
	}
	// Template strings survive reformatting; defaults are not reported;
	// execution state is unset until the change runs.
	if *created.Payload != payload || *created.ScheduledAt != *model.ScheduledAt {
		t.Fatalf("template values not preserved: %+v", created)
	}
	if created.ModelName != nil || created.IsRecurring != nil || created.ExecutedAt != nil {
		t.Fatalf("defaults leaked into the model: %+v", created)
	}
	stored := store.Get(parent, "1")
	if stored["model_name"] != "FeatureFlag" || stored["payload"].(map[string]any)["operation"] != "update_status" {
		t.Fatalf("stored %v", stored)
	}

	// Read reports execution state once PostHog has run the change.
	stored["executed_at"] = "2026-06-01T14:00:05Z"
	store.Put(parent, stored)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if read.ExecutedAt == nil || *read.ExecutedAt != "2026-06-01T14:00:05Z" || *read.Payload != payload {
		t.Fatalf("read returned %+v", read)
	}

	// Update: make it a recurring disable with an end date.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, RecordId: cfntest.Ptr("7"),
		ModelName:          cfntest.Ptr("FeatureFlag"),
		Payload:            cfntest.Ptr(`{"operation":"update_status","value":false}`),
		ScheduledAt:        cfntest.Ptr("2026-07-01T18:00:00Z"),
		IsRecurring:        cfntest.Ptr(true),
		RecurrenceInterval: cfntest.Ptr("weekly"),
		EndDate:            cfntest.Ptr("2026-12-31T00:00:00Z"),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if !*after.IsRecurring || *after.RecurrenceInterval != "weekly" || *after.ModelName != "FeatureFlag" || *after.EndDate != "2026-12-31T00:00:00Z" {
		t.Fatalf("update returned %+v", after)
	}

	// Removing the recurrence clears it.
	oneOff := desired()
	oneOff.Id = created.Id
	ev, err = Update(api.Request(t, oneOff, after), after, oneOff)
	cfntest.RequireSuccess(t, ev, err)
	final := ev.ResourceModel.(*Model)
	if final.IsRecurring != nil || final.RecurrenceInterval != nil || final.EndDate != nil {
		t.Fatalf("recurrence not cleared: %+v", final)
	}
	if stored := store.Get(parent, "1"); stored["recurrence_interval"] != nil || stored["is_recurring"] != false {
		t.Fatalf("stored %v", stored)
	}

	// List
	ev, err = List(api.Request(t, listModel(), nil), nil, listModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete hard-deletes.
	ev, err = Delete(api.Request(t, final, nil), nil, final)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("scheduled change not deleted")
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
		"no record":         func(m *Model) { m.RecordId = nil },
		"no scheduled_at":   func(m *Model) { m.ScheduledAt = nil },
		"no payload":        func(m *Model) { m.Payload = nil },
		"invalid JSON":      func(m *Model) { m.Payload = cfntest.Ptr(`{"operation":`) },
		"payload not obj":   func(m *Model) { m.Payload = cfntest.Ptr(`["update_status"]`) },
		"no operation":      func(m *Model) { m.Payload = cfntest.Ptr(`{"value": true}`) },
		"recurring no rule": func(m *Model) { m.IsRecurring = cfntest.Ptr(true) },
	}
	for name, mutate := range cases {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %s %v", name, ev.HandlerErrorCode, err)
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
