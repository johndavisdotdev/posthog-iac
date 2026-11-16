package resource

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/surveys/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "description": "", "archived": false,
			"schedule": "once", "base_language": "en", "questions": []any{},
			"appearance": map[string]any{"position": "right"}, "conditions": nil,
			"linked_flag": nil, "targeting_flag": nil, "internal_targeting_flag": map[string]any{"id": 99},
			"enable_partial_responses": false,
		},
		WriteOnly: []string{"targeting_flag_filters", "remove_targeting_flag"},
		OnCreate:  simulateServer,
		OnUpdate:  simulateServer,
	})
	return api, store
}

// simulateServer mimics PostHog: question ids, a managed targeting flag built
// from targeting_flag_filters, and the linked_flag object.
func simulateServer(obj map[string]any) {
	questions, _ := obj["questions"].([]any)
	for i, q := range questions {
		question := q.(map[string]any)
		if question["id"] == nil {
			question["id"] = fmt.Sprintf("q-%d", i)
		}
	}
	if f, ok := obj["targeting_flag_filters"].(map[string]any); ok {
		filters := map[string]any{"multivariate": nil}
		for k, v := range f {
			filters[k] = v
		}
		obj["targeting_flag"] = map[string]any{"id": 55, "key": "survey-targeting", "filters": filters}
		delete(obj, "targeting_flag_filters")
	}
	if obj["remove_targeting_flag"] == true {
		obj["targeting_flag"] = nil
		delete(obj, "remove_targeting_flag")
	}
	if id, ok := obj["linked_flag_id"]; ok && id != nil {
		obj["linked_flag"] = map[string]any{"id": id, "key": "linked"}
	} else {
		obj["linked_flag"] = nil
	}
}

func desired() *Model {
	return &Model{
		ProjectId:            cfntest.Ptr(project),
		Name:                 cfntest.Ptr("NPS"),
		Description:          cfntest.Ptr("Quarterly NPS"),
		Type:                 cfntest.Ptr("popover"),
		Questions:            cfntest.Ptr(`[{"type": "rating", "question": "How likely are you to recommend us?", "scale": 10, "display": "number", "isNpsQuestion": true}]`),
		Conditions:           cfntest.Ptr(`{"url": "/app", "urlMatchType": "icontains"}`),
		TargetingFlagFilters: cfntest.Ptr(`{"groups": [{"properties": [{"key": "plan", "value": ["pro"], "operator": "exact", "type": "person"}], "rollout_percentage": 100}]}`),
		LinkedFlagId:         cfntest.Ptr("12"),
		ResponsesLimit:       cfntest.Ptr(500),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	id := "0190a1b2-0000-7000-8000-000000000001"
	if created.Id == nil || *created.Id != id || created.CreatedAt == nil || *created.TargetingFlagId != "55" || *created.LinkedFlagId != "12" || *created.ResponsesLimit != 500 {
		t.Fatalf("create returned %+v", created)
	}
	// Server-assigned question ids and extra flag keys don't change the
	// template's JSON strings.
	if *created.Questions != *model.Questions || *created.TargetingFlagFilters != *model.TargetingFlagFilters || *created.Conditions != *model.Conditions {
		t.Fatalf("JSON not preserved: %s / %s", *created.Questions, *created.TargetingFlagFilters)
	}
	// Server defaults the template did not set are not reported.
	if created.Schedule != nil || created.BaseLanguage != nil || created.Appearance != nil || created.Archived != nil || created.EnablePartialResponses != nil {
		t.Fatalf("server defaults leaked: %+v", created)
	}
	if post := api.CallsTo(http.MethodPost, "/api/projects/42/surveys/")[0].Body; post["linked_flag_id"] != float64(12) || post["targeting_flag_filters"] == nil {
		t.Fatalf("create body: %v", post)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "NPS" || *read.Questions != *model.Questions || *read.Type != "popover" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: drop targeting, linked flag, conditions, description and the
	// responses limit; set the schedule explicitly.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("NPS v2"), Type: cfntest.Ptr("widget"),
		Questions: created.Questions, Schedule: cfntest.Ptr("once"), Archived: cfntest.Ptr(false),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "NPS v2" || after.TargetingFlagFilters != nil || after.TargetingFlagId != nil || after.LinkedFlagId != nil ||
		after.Conditions != nil || after.Description != nil || after.ResponsesLimit != nil {
		t.Fatalf("update returned %+v", after)
	}
	if after.Schedule == nil || *after.Schedule != "once" || after.Archived == nil || *after.Archived {
		t.Fatalf("explicit defaults lost: %+v", after)
	}
	patch := api.CallsTo(http.MethodPatch, "/api/projects/42/surveys/"+id+"/")[0].Body
	if patch["remove_targeting_flag"] != true || patch["linked_flag_id"] != nil || patch["description"] != "" || patch["conditions"] != nil {
		t.Fatalf("removed properties not cleared: %v", patch)
	}

	// A second update without targeting does not send remove_targeting_flag.
	ev, err = Update(api.Request(t, updated, after), after, updated)
	cfntest.RequireSuccess(t, ev, err)
	if p := api.CallsTo(http.MethodPatch, "/api/projects/42/surveys/"+id+"/")[1].Body; p["remove_targeting_flag"] != nil {
		t.Fatalf("unexpected remove_targeting_flag: %v", p)
	}

	// Out-of-band question changes are reported.
	obj := store.Get(parent, id)
	obj["questions"].([]any)[0].(map[string]any)["scale"] = 5
	store.Put(parent, obj)
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if q := *ev.ResourceModel.(*Model).Questions; !strings.Contains(q, `"scale":5`) {
		t.Fatalf("drift hidden: %s", q)
	}

	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("survey not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("0190a1b2-0000-7000-8000-999999999999")
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
		"no project":     func(m *Model) { m.ProjectId = nil },
		"no name":        func(m *Model) { m.Name = nil },
		"no type":        func(m *Model) { m.Type = nil },
		"bad questions":  func(m *Model) { m.Questions = cfntest.Ptr(`[{`) },
		"bad appearance": func(m *Model) { m.Appearance = cfntest.Ptr(`{`) },
		"bad targeting":  func(m *Model) { m.TargetingFlagFilters = cfntest.Ptr(`{`) },
		"bad flag id":    func(m *Model) { m.LinkedFlagId = cfntest.Ptr("flag") },
	} {
		m := desired()
		mutate(m)
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Fatalf("%s: got %+v, %v", name, ev, err)
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
