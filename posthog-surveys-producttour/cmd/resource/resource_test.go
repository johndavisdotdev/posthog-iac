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

const tourID = "0190a1b2-0000-7000-8000-000000000001"

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/product_tours/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"description": "", "auto_launch": false, "archived": false, "content": map[string]any{},
			"internal_targeting_flag": map[string]any{"id": 77}, "linked_flag": nil,
			"targeting_flag_filters": nil, "has_draft": false,
		},
		WriteOnly: []string{"linked_flag_id"},
		OnCreate:  simulateServer,
		OnUpdate:  simulateServer,
	})
	return api, store
}

// simulateServer mimics PostHog: step ids, a linked_flag object, and
// targeting filters echoed with an extra key.
func simulateServer(obj map[string]any) {
	if content, ok := obj["content"].(map[string]any); ok {
		steps, _ := content["steps"].([]any)
		for i, s := range steps {
			step := s.(map[string]any)
			if step["id"] == nil {
				step["id"] = fmt.Sprintf("step-%d", i)
			}
		}
	}
	if f, ok := obj["targeting_flag_filters"].(map[string]any); ok {
		f["multivariate"] = nil
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
		Name:                 cfntest.Ptr("Onboarding"),
		Description:          cfntest.Ptr("First-run tour"),
		Content:              cfntest.Ptr(`{"steps": [{"type": "element", "selector": "#new-project", "title": "Create a project"}, {"type": "modal", "title": "Done!"}]}`),
		TargetingFlagFilters: cfntest.Ptr(`{"groups": [{"properties": [], "rollout_percentage": 50}]}`),
		LinkedFlagId:         cfntest.Ptr("9"),
		AutoLaunch:           cfntest.Ptr(true),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != tourID || *created.InternalTargetingFlagId != "77" || *created.LinkedFlagId != "9" || !*created.AutoLaunch || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	if *created.Content != *model.Content || *created.TargetingFlagFilters != *model.TargetingFlagFilters {
		t.Fatalf("JSON not preserved: %s / %s", *created.Content, *created.TargetingFlagFilters)
	}
	if created.Archived != nil {
		t.Fatal("server default archived=false leaked into the model")
	}
	if len(api.CallsTo(http.MethodGet, "/api/projects/42/product_tours/"+tourID+"/")) != 1 {
		t.Fatal("create must read the tour back")
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Onboarding" || *read.Content != *model.Content {
		t.Fatalf("read returned %+v", read)
	}

	// Update: drop targeting, linked flag, auto launch and description.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Onboarding v2"),
		Content: cfntest.Ptr(`{"steps": [{"type": "modal", "title": "Welcome"}]}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Onboarding v2" || after.TargetingFlagFilters != nil || after.LinkedFlagId != nil ||
		after.AutoLaunch != nil || after.Description != nil || *after.Content != *updated.Content {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo(http.MethodPatch, "/api/projects/42/product_tours/"+tourID+"/")[0].Body
	if _, ok := patch["targeting_flag_filters"]; !ok || patch["targeting_flag_filters"] != nil || patch["linked_flag_id"] != nil || patch["auto_launch"] != false {
		t.Fatalf("removed properties not cleared: %v", patch)
	}

	// Out-of-band content changes are reported.
	obj := store.Get(parent, tourID)
	obj["content"].(map[string]any)["steps"].([]any)[0].(map[string]any)["title"] = "Changed"
	store.Put(parent, obj)
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if c := *ev.ResourceModel.(*Model).Content; !strings.Contains(c, "Changed") {
		t.Fatalf("drift hidden: %s", c)
	}

	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != tourID {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("product tour not deleted")
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
		"no project":    func(m *Model) { m.ProjectId = nil },
		"no name":       func(m *Model) { m.Name = nil },
		"bad content":   func(m *Model) { m.Content = cfntest.Ptr(`{"steps": [`) },
		"bad targeting": func(m *Model) { m.TargetingFlagFilters = cfntest.Ptr(`{`) },
		"bad flag id":   func(m *Model) { m.LinkedFlagId = cfntest.Ptr("x") },
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
