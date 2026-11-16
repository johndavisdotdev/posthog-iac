package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const content = `{"email": {"subject": "Welcome {{ person.properties.name }}", "text": "Hi there"}}`

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/messaging_templates/", cfntest.CollectionOptions{
		StringIDs:  true,
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"description": "", "tags": []any{}, "type": "email", "message_category": nil,
			"sensitive": false, "transactional_hog_flow_id": nil, "has_draft": false, "draft_content": nil,
		},
		// PostHog fills in the templating language and renders html.
		OnCreate: renderContent,
		OnUpdate: renderContent,
	})
	return api, store
}

func renderContent(obj map[string]any) {
	c, _ := obj["content"].(map[string]any)
	if c == nil {
		return
	}
	if c["templating"] == nil {
		c["templating"] = "liquid"
	}
	if email, ok := c["email"].(map[string]any); ok && email["html"] == nil {
		email["html"] = "<p>rendered</p>"
	}
}

func desired() *Model {
	return &Model{
		ProjectId:   cfntest.Ptr(project),
		Name:        cfntest.Ptr("Welcome email"),
		Description: cfntest.Ptr("Sent after sign-up"),
		Tags:        []string{"onboarding"},
		Content:     cfntest.Ptr(content),
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
	// Fields PostHog adds to content are not reported as drift, and server
	// defaults are left out of the model.
	if *created.Content != content {
		t.Fatalf("Content = %s", *created.Content)
	}
	if created.Type != nil || created.Sensitive != nil || created.MessageCategory != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	id := *created.Id

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Welcome email" || len(read.Tags) != 1 || *read.Content != content {
		t.Fatalf("read returned %+v", read)
	}

	// Content changed outside CloudFormation is reported as drift.
	stored := store.Get(parent, id)
	stored["content"].(map[string]any)["email"].(map[string]any)["subject"] = "Changed in the UI"
	store.Put(parent, stored)
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if *ev.ResourceModel.(*Model).Content == content {
		t.Fatal("content drift not reported")
	}

	// Update: rename, file under a category, mark sensitive, drop description and tags.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Login code"),
		Content:         cfntest.Ptr(`{"email": {"subject": "Your code", "html": "<b>{{ code }}</b>"}}`),
		MessageCategory: cfntest.Ptr("0190a1b2-0000-7000-8000-00000000abcd"),
		Sensitive:       cfntest.Ptr(true),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Login code" || after.Description != nil || after.Tags != nil ||
		*after.Content != *updated.Content || !*after.Sensitive || *after.MessageCategory != *updated.MessageCategory {
		t.Fatalf("update returned %+v", after)
	}
	stored = store.Get(parent, id)
	if stored["description"] != "" || len(stored["tags"].([]any)) != 0 {
		t.Fatalf("description/tags not cleared: %v", stored)
	}

	// Removing MessageCategory and Sensitive clears them.
	cleared := &Model{ProjectId: after.ProjectId, Id: after.Id, Name: after.Name, Content: after.Content}
	ev, err = Update(api.Request(t, cleared, after), after, cleared)
	cfntest.RequireSuccess(t, ev, err)
	stored = store.Get(parent, id)
	if stored["message_category"] != nil || stored["sensitive"] != false {
		t.Fatalf("category/sensitive not cleared: %v", stored)
	}

	// List
	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete soft-deletes.
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, id)["deleted"] != true {
		t.Fatal("template not soft-deleted")
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
		t.Fatalf("deleted template still listed: %+v", ev.ResourceModels)
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
	noProject := desired()
	noProject.ProjectId = nil
	noName := desired()
	noName.Name = nil
	noContent := desired()
	noContent.Content = nil
	badJSON := desired()
	badJSON.Content = cfntest.Ptr(`{"email":`)
	notObject := desired()
	notObject.Content = cfntest.Ptr(`["email"]`)
	for name, m := range map[string]*Model{
		"no project": noProject, "no name": noName, "no content": noContent,
		"invalid JSON": badJSON, "content not an object": notObject,
	} {
		t.Run(name, func(t *testing.T) {
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

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
