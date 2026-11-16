package resource

import (
	"encoding/json"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const (
	actions = `[
  {"id": "trigger_node", "name": "Trigger", "type": "trigger",
   "config": {"type": "event", "filters": {"events": [{"id": "signed_up", "name": "signed_up", "type": "events"}]}}},
  {"id": "exit_node", "name": "Exit", "type": "exit", "config": {"reason": "Default exit"}}
]`
	edges = `[{"from": "trigger_node", "to": "exit_node", "type": "continue"}]`
)

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/hog_flows/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"description": "", "tags": []any{}, "status": "draft", "exit_condition": "exit_only_at_end",
			"edges": []any{}, "variables": []any{}, "conversion": nil, "trigger_masking": nil,
			"email_sending_rate_limit": nil, "origin_product": nil, "version": 0, "draft": nil,
		},
		OnCreate: compute,
		OnUpdate: compute,
	})
	return api, store
}

// compute mimics PostHog: it derives trigger from the trigger action, stamps
// actions with timestamps, compiles masking bytecode and bumps the version.
func compute(obj map[string]any) {
	acts, _ := obj["actions"].([]any)
	for _, a := range acts {
		action := a.(map[string]any)
		action["created_at"] = 1767225600000
		if action["type"] == "trigger" {
			obj["trigger"] = action["config"]
		}
	}
	if m, ok := obj["trigger_masking"].(map[string]any); ok {
		m["bytecode"] = []any{"_H", 1}
	}
	obj["version"] = obj["version"].(float64) + 1
}

func desired() *Model {
	return &Model{
		ProjectId:     cfntest.Ptr(project),
		Name:          cfntest.Ptr("Onboarding"),
		Description:   cfntest.Ptr("Welcome new users"),
		Tags:          []string{"growth"},
		Actions:       cfntest.Ptr(actions),
		Edges:         cfntest.Ptr(edges),
		OriginProduct: cfntest.Ptr("loops"),
		TriggerMasking: &TriggerMasking{
			Hash: cfntest.Ptr("{person.id}"), Ttl: cfntest.Ptr(3600),
		},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.Version == nil || *created.Version != 1 || *created.OriginProduct != "loops" {
		t.Fatalf("create returned %+v", created)
	}
	// Actions/Edges keep the template's strings despite fields PostHog adds;
	// the derived trigger is exposed read-only; defaults are not reported.
	if *created.Actions != actions || *created.Edges != edges {
		t.Fatalf("JSON not preserved: %s / %s", *created.Actions, *created.Edges)
	}
	var trigger map[string]any
	if created.Trigger == nil || json.Unmarshal([]byte(*created.Trigger), &trigger) != nil || trigger["type"] != "event" {
		t.Fatalf("Trigger = %v", created.Trigger)
	}
	if created.Status != nil || created.ExitCondition != nil || created.Variables != nil || created.Conversion != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if created.TriggerMasking == nil || *created.TriggerMasking.Hash != "{person.id}" || *created.TriggerMasking.Ttl != 3600 {
		t.Fatalf("TriggerMasking = %+v", created.TriggerMasking)
	}
	id := *created.Id
	post := api.CallsTo("POST", "/api/projects/42/hog_flows/")[0].Body
	if post["origin_product"] != "loops" || post["status"] != "draft" {
		t.Fatalf("create body: %v", post)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Onboarding" || *read.Actions != actions || len(read.Tags) != 1 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: activate, add conversion, variables and a rate limit; drop
	// description, tags, edges and masking (must be cleared).
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, OriginProduct: created.OriginProduct,
		Name:                  cfntest.Ptr("Onboarding v2"),
		Status:                cfntest.Ptr("active"),
		Actions:               cfntest.Ptr(actions),
		ExitCondition:         cfntest.Ptr("exit_on_conversion"),
		Conversion:            cfntest.Ptr(`{"filters": [], "window": "7d"}`),
		Variables:             cfntest.Ptr(`[{"key": "coupon", "type": "string", "default": "WELCOME"}]`),
		EmailSendingRateLimit: &EmailSendingRateLimit{Count: cfntest.Ptr(100), Period: cfntest.Ptr("hour")},
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Onboarding v2" || *after.Status != "active" || *after.ExitCondition != "exit_on_conversion" ||
		*after.Conversion != *updated.Conversion || *after.Variables != *updated.Variables ||
		*after.EmailSendingRateLimit.Count != 100 || after.Description != nil || after.Tags != nil ||
		after.Edges != nil || after.TriggerMasking != nil {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["description"] != "" || len(stored["edges"].([]any)) != 0 || stored["trigger_masking"] != nil {
		t.Fatalf("fields not cleared: %v", stored)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/hog_flows/"+id+"/")[0].Body
	if _, sent := patch["origin_product"]; sent {
		t.Fatal("create-only origin_product must not be sent on update")
	}

	// List
	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete hard-deletes.
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("workflow not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
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
	cases := map[string]func(m *Model){
		"no project":           func(m *Model) { m.ProjectId = nil },
		"no name":              func(m *Model) { m.Name = nil },
		"no actions":           func(m *Model) { m.Actions = nil },
		"invalid actions JSON": func(m *Model) { m.Actions = cfntest.Ptr(`[{"id":`) },
		"actions not an array": func(m *Model) { m.Actions = cfntest.Ptr(`{"id": "x"}`) },
		"edges not an array":   func(m *Model) { m.Edges = cfntest.Ptr(`{}`) },
		"conversion an array":  func(m *Model) { m.Conversion = cfntest.Ptr(`[]`) },
		"invalid variables":    func(m *Model) { m.Variables = cfntest.Ptr(`nope`) },
		"masking without hash": func(m *Model) { m.TriggerMasking = &TriggerMasking{Ttl: cfntest.Ptr(60)} },
		"rate limit no period": func(m *Model) { m.EmailSendingRateLimit = &EmailSendingRateLimit{Count: cfntest.Ptr(1)} },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			m := desired()
			mutate(m)
			ev, err := Create(api.Request(t, m, nil), &Model{}, m)
			cfntest.RequireFailed(t, ev, err, "InvalidRequest")
		})
	}
	ev, err := List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestDriftInActionsIsReported(t *testing.T) {
	api, store := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	stored := store.Get(parent, *created.Id)
	stored["actions"].([]any)[1].(map[string]any)["name"] = "Renamed in the UI"
	store.Put(parent, stored)

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Actions == actions {
		t.Fatal("drift in actions not reported")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
