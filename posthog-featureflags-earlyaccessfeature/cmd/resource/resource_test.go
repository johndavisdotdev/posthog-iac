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
	store := api.Collection("/api/projects/{project_id}/early_access_feature/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "description": "", "documentation_url": "", "image_url": "",
		},
		// feature_flag_id and payload are accepted on create but not echoed.
		WriteOnly: []string{"feature_flag_id", "payload"},
		OnCreate: func(obj map[string]any) {
			flag := map[string]any{"id": 900, "key": "auto-created-flag"}
			if id, ok := obj["feature_flag_id"]; ok {
				flag = map[string]any{"id": id, "key": "existing-flag"}
			}
			obj["feature_flag"] = flag
		},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:        cfntest.Ptr(project),
		Name:             cfntest.Ptr("Dark mode"),
		Description:      cfntest.Ptr("Try the new dark theme"),
		Stage:            cfntest.Ptr("beta"),
		DocumentationUrl: cfntest.Ptr("https://example.com/docs/dark-mode"),
		FeatureFlagId:    cfntest.Ptr("17"),
		Payload:          cfntest.Ptr(`{"theme": "dark"}`),
	}
}

func listModel() *Model { return &Model{ProjectId: cfntest.Ptr(project)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create, linking an existing flag.
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	id := "0190a1b2-0000-7000-8000-000000000001"
	if created.Id == nil || *created.Id != id || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	if *created.FeatureFlagId != "17" || *created.LinkedFeatureFlagId != "17" || *created.FeatureFlagKey != "existing-flag" {
		t.Fatalf("linked flag not reported: %+v", created)
	}
	if created.Payload != nil {
		t.Fatal("write-only Payload must not be returned")
	}
	stored := store.Get(parent, id)
	if stored["feature_flag_id"] != float64(17) || stored["payload"].(map[string]any)["theme"] != "dark" {
		t.Fatalf("create-only fields not sent: %v", stored)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Dark mode" || *read.Stage != "beta" || *read.FeatureFlagId != "17" || read.Payload != nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update: new stage, drop description and documentation URL (cleared).
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Dark mode"),
		Stage: cfntest.Ptr("general-availability"), ImageUrl: cfntest.Ptr("https://example.com/dark.png"),
		FeatureFlagId: cfntest.Ptr("17"), Payload: cfntest.Ptr(`{"theme": "dark"}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Stage != "general-availability" || after.Description != nil || after.DocumentationUrl != nil || *after.ImageUrl != "https://example.com/dark.png" {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/early_access_feature/"+id+"/")
	if len(patch) != 1 {
		t.Fatalf("expected one PATCH, got %d", len(patch))
	}
	for _, f := range []string{"feature_flag_id", "payload"} {
		if _, ok := patch[0].Body[f]; ok {
			t.Fatalf("create-only %s sent on update", f)
		}
	}
	if patch[0].Body["description"] != "" || patch[0].Body["documentation_url"] != "" {
		t.Fatalf("removed properties not cleared: %v", patch[0].Body)
	}

	// List
	ev, err = List(api.Request(t, listModel(), nil), nil, listModel())
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
		t.Fatal("feature not deleted")
	}
	ev, err = List(api.Request(t, listModel(), nil), nil, listModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted feature still listed: %+v", ev.ResourceModels)
	}
}

func TestAutoCreatedFlag(t *testing.T) {
	api, store := newAPI(t)
	model := &Model{ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("Beta search"), Stage: cfntest.Ptr("draft")}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	// The flag PostHog created is exposed read-only; the create-only input
	// stays unset so the model matches the template.
	if created.FeatureFlagId != nil || *created.LinkedFeatureFlagId != "900" || *created.FeatureFlagKey != "auto-created-flag" {
		t.Fatalf("create returned %+v", created)
	}
	if _, ok := store.Get(parent, *created.Id)["feature_flag_id"]; ok {
		t.Fatal("feature_flag_id must not be sent when unset")
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000999"), Name: cfntest.Ptr("x"), Stage: cfntest.Ptr("beta")}
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
	noProject := desired()
	noProject.ProjectId = nil
	ev, err := Create(api.Request(t, noProject, nil), &Model{}, noProject)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noStage := desired()
	noStage.Stage = nil
	ev, err = Create(api.Request(t, noStage, nil), &Model{}, noStage)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noName := desired()
	noName.Name = cfntest.Ptr("")
	ev, err = Create(api.Request(t, noName, nil), &Model{}, noName)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	badFlag := desired()
	badFlag.FeatureFlagId = cfntest.Ptr("my-flag")
	ev, err = Create(api.Request(t, badFlag, nil), &Model{}, badFlag)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	badJSON := desired()
	badJSON.Payload = cfntest.Ptr(`{"theme":`)
	ev, err = Create(api.Request(t, badJSON, nil), &Model{}, badJSON)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	ev, err = List(api.Request(t, &Model{}, nil), nil, &Model{})
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
