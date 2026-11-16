package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const config = `{ "retention_days": 30, "filter_group": {"type": "AND", "values": [{"type": "AND", "values": [{"key": "service.name", "operator": "exact", "value": "api"}]}]} }`

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	next := 0
	store := api.Collection("/api/projects/{project_id}/logs/retention_rules/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": nil, "enabled": false,
			"version": 1, "created_by": 7,
		},
		// PostHog appends rules without a priority after the existing ones.
		OnCreate: func(obj map[string]any) {
			if obj["priority"] == nil {
				obj["priority"] = next
			}
			next++
		},
		OnUpdate: func(obj map[string]any) {
			obj["version"] = obj["version"].(float64) + 1
			obj["updated_at"] = "2026-01-02T00:00:00Z"
		},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId: cfntest.Ptr(project),
		Name:      cfntest.Ptr("Keep API logs 30 days"),
		Enabled:   cfntest.Ptr(true),
		Config:    cfntest.Ptr(config),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || created.Version == nil || *created.Version != 1 {
		t.Fatalf("create returned %+v", created)
	}
	// The template's JSON string is kept verbatim; the server-assigned priority is not reported.
	if *created.Config != config {
		t.Fatalf("Config = %s", *created.Config)
	}
	if created.Priority != nil {
		t.Fatalf("server-assigned priority leaked into the model: %d", *created.Priority)
	}
	if _, sent := api.CallsTo("POST", "/api/projects/42/logs/retention_rules/")[0].Body["priority"]; sent {
		t.Fatal("priority must not be sent when unset")
	}
	id := *created.Id

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Keep API logs 30 days" || read.Enabled == nil || !*read.Enabled || *read.Config != config {
		t.Fatalf("read returned %+v", read)
	}

	// Update: rename, disable by omission, set an explicit priority and new config.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Keep API logs 90 days"),
		Priority: cfntest.Ptr(3), Config: cfntest.Ptr(`{"retention_days": 90, "filter_group": {"type": "AND", "values": []}}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Keep API logs 90 days" || after.Enabled != nil || after.Priority == nil || *after.Priority != 3 || *after.Version != 2 || after.UpdatedAt == nil {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["enabled"] != false || stored["config"].(map[string]any)["retention_days"] != float64(90) {
		t.Fatalf("update not applied: %v", stored)
	}

	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
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
		t.Fatal("rule not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestServerAddedConfigKeysAreNotDrift(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{
		"id": "abc", "name": "r", "enabled": false, "priority": 0, "version": 1, "created_at": "2026-01-01T00:00:00Z",
		"config": map[string]any{"retention_days": 30, "filter_group": map[string]any{"type": "AND", "values": []any{}}, "extra": true},
	})
	want := `{"retention_days":30,"filter_group":{"type":"AND","values":[]}}`
	m := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("abc"), Config: cfntest.Ptr(want)}
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	if got := *ev.ResourceModel.(*Model).Config; got != want {
		t.Fatalf("Config = %s", got)
	}
	// A real difference is reported with the API value.
	m.Config = cfntest.Ptr(`{"retention_days":90}`)
	ev, err = Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	if got := *ev.ResourceModel.(*Model).Config; got == *m.Config {
		t.Fatalf("drift hidden: %s", got)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("nope"), Name: cfntest.Ptr("x"), Config: cfntest.Ptr(config)}
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
		"no project": {Name: cfntest.Ptr("x"), Config: cfntest.Ptr(config)},
		"no name":    {ProjectId: cfntest.Ptr(project), Config: cfntest.Ptr(config)},
		"no config":  {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x")},
		"bad json":   {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x"), Config: cfntest.Ptr(`{"retention_days":`)},
		"not object": {ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("x"), Config: cfntest.Ptr(`[1]`)},
	} {
		ev, err := Create(api.Request(t, m, nil), &Model{}, m)
		if err != nil || ev.HandlerErrorCode != "InvalidRequest" {
			t.Errorf("%s: got %v %v", name, ev.HandlerErrorCode, err)
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
