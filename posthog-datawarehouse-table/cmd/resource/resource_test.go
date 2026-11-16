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
	store := api.Collection("/api/projects/{project_id}/warehouse_tables/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults:  map[string]any{"created_at": "2026-01-01T00:00:00Z", "options": map[string]any{}, "deleted": false},
		OnCreate:  func(obj map[string]any) { obj["hogql_name"] = obj["name"] },
		OnUpdate:  func(obj map[string]any) { obj["hogql_name"] = obj["name"] },
		// PostHog never returns the bucket credential.
		WriteOnly: []string{"credential"},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:  cfntest.Ptr(project),
		Name:       cfntest.Ptr("orders"),
		Format:     cfntest.Ptr("Parquet"),
		UrlPattern: cfntest.Ptr("https://my-bucket.s3.amazonaws.com/orders/*.parquet"),
		Credential: &Credential{AccessKey: cfntest.Ptr("AKIAEXAMPLE"), AccessSecret: cfntest.Ptr("secret-1")},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.HogqlName != "orders" || *created.Format != "Parquet" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	if created.Credential != nil {
		t.Fatal("credential must not be returned")
	}
	if created.Options != nil {
		t.Fatalf("default options leaked into the model: %+v", created.Options)
	}
	id := *created.Id
	if cred := store.Get(parent, id)["credential"].(map[string]any); cred["access_secret"] != "secret-1" {
		t.Fatalf("credential not sent: %v", cred)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	if read := ev.ResourceModel.(*Model); *read.UrlPattern != *model.UrlPattern || read.Credential != nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update without changing the credential: it is not resent.
	updated := desired()
	updated.Id = created.Id
	updated.Format = cfntest.Ptr("CSVWithNames")
	updated.UrlPattern = cfntest.Ptr("https://my-bucket.s3.amazonaws.com/orders/*.csv")
	updated.Options = &Options{CsvAllowDoubleQuotes: cfntest.Ptr(true)}
	ev, err = Update(api.Request(t, updated, model), model, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Format != "CSVWithNames" || after.Options == nil || !*after.Options.CsvAllowDoubleQuotes {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/warehouse_tables/"+id+"/")[0].Body
	if _, ok := patch["credential"]; ok {
		t.Fatal("unchanged credential must not be resent")
	}

	// Rotating the secret sends the credential; removing Options clears them.
	rotated := desired()
	rotated.Id = created.Id
	rotated.Credential.AccessSecret = cfntest.Ptr("secret-2")
	ev, err = Update(api.Request(t, rotated, updated), updated, rotated)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel.(*Model).Options != nil {
		t.Fatal("options not cleared")
	}
	stored := store.Get(parent, id)
	if stored["credential"].(map[string]any)["access_secret"] != "secret-2" {
		t.Fatalf("credential not rotated: %v", stored["credential"])
	}
	if len(stored["options"].(map[string]any)) != 0 {
		t.Fatalf("options not cleared: %v", stored["options"])
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
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("delete must remove the table and carry no model")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestExplicitFalseOptionIsReported(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	model.Options = &Options{CsvAllowDoubleQuotes: cfntest.Ptr(false)}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	if o := ev.ResourceModel.(*Model).Options; o == nil || *o.CsvAllowDoubleQuotes {
		t.Fatalf("Options = %+v", o)
	}
}

func TestSoftDeletedIsNotFound(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{"id": "abc", "name": "old", "format": "CSV", "url_pattern": "https://x/*.csv", "deleted": true})
	m := desired()
	m.Id = cfntest.Ptr("abc")
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, m, m), m, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, m, nil), nil, m)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("soft-deleted table listed: %+v", ev.ResourceModels)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("missing")
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
	noFormat := desired()
	noFormat.Format = nil
	noURL := desired()
	noURL.UrlPattern = nil
	noCred := desired()
	noCred.Credential = nil
	noSecret := desired()
	noSecret.Credential.AccessSecret = nil
	for name, m := range map[string]*Model{"no project": noProject, "no name": noName, "no format": noFormat, "no url": noURL, "no credential": noCred, "no secret": noSecret} {
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %q", name, ev.HandlerErrorCode)
		}
		cfntest.RequireFailed(t, ev, err, "InvalidRequest")
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
