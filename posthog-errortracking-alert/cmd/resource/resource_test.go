package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const alertsPath = "/api/projects/42/error_tracking/alerts/"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/error_tracking/alerts/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"enabled": true, "throttle_seconds": 0, "filters": map[string]any{},
		},
		// PostHog compiles filter bytecode and adds delivery state to destinations.
		OnCreate: serverFields,
		OnUpdate: serverFields,
	})
	return api, store
}

func serverFields(obj map[string]any) {
	if f, ok := obj["filters"].(map[string]any); ok {
		f["bytecode"] = []any{"_H", 1, 29}
	}
	dests, _ := obj["destinations"].([]any)
	for i, d := range dests {
		dest := d.(map[string]any)
		dest["id"] = "0190a1b2-0000-7000-8000-00000000000" + string(rune('0'+i))
		dest["consecutive_failures"] = 0
		dest["last_error"] = ""
		dest["last_delivered_at"] = nil
	}
}

func desired() *Model {
	return &Model{
		ProjectId: cfntest.Ptr(project),
		Name:      cfntest.Ptr("New issues to #errors"),
		Triggers:  []string{"issue_created", "issue_reopened"},
		Filters:   cfntest.Ptr(`{ "properties": [ {"key": "$exception_types", "value": ["TypeError"], "operator": "exact", "type": "event"} ], "filter_test_accounts": true }`),
		Destinations: []Destination{{
			ChannelType:   cfntest.Ptr("slack"),
			IntegrationId: cfntest.Ptr(12),
			Config:        &SlackConfig{Channel: cfntest.Ptr("C0123ABCD"), ChannelName: cfntest.Ptr("#errors")},
		}},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	// Filters are kept verbatim: the server-compiled bytecode is ignored.
	if created.Filters == nil || *created.Filters != *model.Filters {
		t.Fatalf("Filters = %v", created.Filters)
	}
	// Server defaults are not reported.
	if created.Enabled != nil || created.ThrottleSeconds != nil {
		t.Fatalf("defaults leaked: %+v", created)
	}
	if len(created.Destinations) != 1 || *created.Destinations[0].Config.Channel != "C0123ABCD" ||
		*created.Destinations[0].IntegrationId != 12 || *created.Destinations[0].Config.ChannelName != "#errors" {
		t.Fatalf("destinations = %+v", created.Destinations)
	}
	post := api.CallsTo("POST", alertsPath)[0]
	if _, ok := post.Body["enabled"]; ok {
		t.Fatal("enabled is not part of the create request")
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != *model.Name || len(read.Triggers) != 2 || *read.Filters != *model.Filters {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename, disable, throttle, drop filters (must be cleared).
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id,
		Name:            cfntest.Ptr("Spikes"),
		Enabled:         cfntest.Ptr(false),
		Triggers:        []string{"issue_spiking"},
		ThrottleSeconds: cfntest.Ptr(3600),
		Destinations:    []Destination{{ChannelType: cfntest.Ptr("slack"), IntegrationId: cfntest.Ptr(12), Config: &SlackConfig{Channel: cfntest.Ptr("C999")}}},
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Spikes" || *after.Enabled || *after.ThrottleSeconds != 3600 || after.Filters != nil ||
		len(after.Triggers) != 1 || *after.Destinations[0].Config.Channel != "C999" || after.Destinations[0].Config.ChannelName != nil {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if f := stored["filters"].(map[string]any); f["properties"] != nil {
		t.Fatalf("filters not cleared: %v", f)
	}
	patch := api.CallsTo("PATCH", alertsPath+id+"/")[0]
	if _, ok := patch.Body["filters"].(map[string]any)["bytecode"]; ok {
		t.Fatal("bytecode must never be sent")
	}

	// Re-enable by removing Enabled from the template.
	reenabled := *updated
	reenabled.Enabled = nil
	ev, err = Update(api.Request(t, &reenabled, after), after, &reenabled)
	cfntest.RequireSuccess(t, ev, err)
	if store.Get(parent, id)["enabled"] != true || ev.ResourceModel.(*Model).Enabled != nil {
		t.Fatal("Enabled not reset to true")
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("alert not deleted")
	}
}

func TestCreateDisabled(t *testing.T) {
	api, store := newAPI(t)
	model := desired()
	model.Enabled = cfntest.Ptr(false)
	model.Filters = nil
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Enabled == nil || *created.Enabled || created.Filters != nil {
		t.Fatalf("create returned %+v", created)
	}
	if store.Get(parent, *created.Id)["enabled"] != false {
		t.Fatal("alert not disabled")
	}
	if _, ok := api.CallsTo("POST", alertsPath)[0].Body["filters"]; ok {
		t.Fatal("filters must be omitted on create when unset")
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
		"no project":      func(m *Model) { m.ProjectId = nil },
		"no name":         func(m *Model) { m.Name = nil },
		"no triggers":     func(m *Model) { m.Triggers = nil },
		"no destinations": func(m *Model) { m.Destinations = nil },
		"no channel":      func(m *Model) { m.Destinations[0].Config = &SlackConfig{} },
		"bad JSON":        func(m *Model) { m.Filters = cfntest.Ptr(`{"properties":`) },
		"filters array":   func(m *Model) { m.Filters = cfntest.Ptr(`[]`) },
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
