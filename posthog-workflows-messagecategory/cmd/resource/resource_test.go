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
	store := api.Collection("/api/projects/{project_id}/messaging_categories/", cfntest.CollectionOptions{
		StringIDs:  true,
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "created_by": 1,
			"description": "", "public_description": "", "category_type": "marketing",
		},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:         cfntest.Ptr(project),
		Key:               cfntest.Ptr("newsletter"),
		Name:              cfntest.Ptr("Newsletter"),
		Description:       cfntest.Ptr("Monthly product newsletter"),
		PublicDescription: cfntest.Ptr("News about the product, once a month"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || *created.Key != "newsletter" {
		t.Fatalf("create returned %+v", created)
	}
	// The server-default category type is not reported when the template omits it.
	if created.CategoryType != nil {
		t.Fatalf("default CategoryType leaked into the model: %v", *created.CategoryType)
	}
	id := *created.Id
	if posts := api.CallsTo("POST", "/api/projects/42/messaging_categories/"); len(posts) != 1 || posts[0].Body["key"] != "newsletter" {
		t.Fatalf("create body: %+v", posts)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Newsletter" || *read.PublicDescription != "News about the product, once a month" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename, make transactional, drop descriptions (must be cleared).
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Key: created.Key,
		Name: cfntest.Ptr("Receipts"), CategoryType: cfntest.Ptr("transactional"),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Receipts" || after.Description != nil || after.PublicDescription != nil ||
		after.CategoryType == nil || *after.CategoryType != "transactional" {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["description"] != "" || stored["public_description"] != "" {
		t.Fatalf("descriptions not cleared: %v", stored)
	}
	patches := api.CallsTo("PATCH", "/api/projects/42/messaging_categories/"+id+"/")
	if _, sent := patches[0].Body["key"]; sent {
		t.Fatal("create-only key must not be sent on update")
	}

	// Removing CategoryType resets it to the PostHog default.
	reset := &Model{ProjectId: after.ProjectId, Id: after.Id, Key: after.Key, Name: after.Name}
	ev, err = Update(api.Request(t, reset, after), after, reset)
	cfntest.RequireSuccess(t, ev, err)
	if store.Get(parent, id)["category_type"] != "marketing" || ev.ResourceModel.(*Model).CategoryType != nil {
		t.Fatalf("category type not reset: %v", store.Get(parent, id)["category_type"])
	}

	// List
	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete archives the category.
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, id)["deleted"] != true {
		t.Fatal("category not soft-deleted")
	}

	// An archived category is gone as far as CloudFormation is concerned.
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("archived category still listed: %+v", ev.ResourceModels)
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
	for name, m := range map[string]*Model{
		"no project": {Key: cfntest.Ptr("k"), Name: cfntest.Ptr("x")},
		"no key":     {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x")},
		"no name":    {ProjectId: cfntest.Ptr(project), Key: cfntest.Ptr("k")},
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
