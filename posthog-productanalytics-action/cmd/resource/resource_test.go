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
	store := api.Collection("/api/projects/{project_id}/actions/", cfntest.CollectionOptions{
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "description": "", "tags": []any{},
			"post_to_slack": false, "slack_message_format": "", "steps": []any{},
		},
		// PostHog fills in default matching modes for each step.
		OnCreate: fillMatchingDefaults,
		OnUpdate: fillMatchingDefaults,
	})
	return api, store
}

func fillMatchingDefaults(obj map[string]any) {
	steps, _ := obj["steps"].([]any)
	for _, s := range steps {
		step := s.(map[string]any)
		for field, def := range map[string]string{"text_matching": "exact", "href_matching": "exact", "url_matching": "contains"} {
			if step[field] == nil {
				step[field] = def
			}
		}
	}
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("Signed up"),
		Description: cfntest.Ptr("User completed sign-up"),
		Tags:        []string{"growth"},
		Steps: []Step{
			{Event: cfntest.Ptr("$pageview"), Url: cfntest.Ptr("/welcome")},
			{Event: cfntest.Ptr("signed_up"), Properties: cfntest.Ptr(`[ {"key": "plan", "value": "pro", "type": "person"} ]`)},
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
	if created.Id == nil || *created.Id != "1" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// The template's JSON string is kept verbatim when equal to the API value,
	// and API-filled matching defaults are not reported.
	if *created.Steps[1].Properties != *model.Steps[1].Properties {
		t.Fatalf("Properties = %s", *created.Steps[1].Properties)
	}
	if created.Steps[0].UrlMatching != nil || created.Steps[0].TextMatching != nil {
		t.Fatalf("default matching modes leaked into the model: %+v", created.Steps[0])
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Signed up" || len(read.Steps) != 2 || len(read.Tags) != 1 {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename, drop description and tags (must be cleared), one step.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Signed up (v2)"),
		Steps: []Step{{Event: cfntest.Ptr("signed_up"), UrlMatching: cfntest.Ptr("regex"), Url: cfntest.Ptr("^/a")}},
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Signed up (v2)" || after.Description != nil || after.Tags != nil || len(after.Steps) != 1 {
		t.Fatalf("update returned %+v", after)
	}
	if after.Steps[0].UrlMatching == nil || *after.Steps[0].UrlMatching != "regex" {
		t.Fatalf("explicit UrlMatching lost: %+v", after.Steps[0])
	}
	if stored := store.Get(parent, "1"); stored["description"] != "" {
		t.Fatalf("description not cleared: %v", stored["description"])
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete soft-deletes (PostHog refuses a hard DELETE for actions).
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, "1")["deleted"] != true {
		t.Fatal("action not soft-deleted")
	}

	// A soft-deleted action is gone as far as CloudFormation is concerned.
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted action still listed: %+v", ev.ResourceModels)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("999"), Name: cfntest.Ptr("x")}
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
	noProject := &Model{Name: cfntest.Ptr("x")}
	ev, err := Create(api.Request(t, noProject, nil), &Model{}, noProject)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	badJSON := desired()
	badJSON.Steps[1].Properties = cfntest.Ptr(`[{"key":`)
	ev, err = Create(api.Request(t, badJSON, nil), &Model{}, badJSON)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	ev, err = List(api.Request(t, &Model{}, nil), nil, &Model{})
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
