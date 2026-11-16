package resource

import (
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	// PostHog derives code_name from name.
	codeName := func(obj map[string]any) {
		obj["code_name"] = strings.ReplaceAll(strings.ToLower(obj["name"].(string)), " ", "_")
	}
	store := api.Collection("/api/projects/{project_id}/insight_variables/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "created_by": 1, "default_value": nil,
			"values": nil, "is_multi": false, "values_query": nil, "values_query_connection_id": nil,
		},
		OnCreate: codeName,
		OnUpdate: codeName,
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:    cfntest.Ptr(project),
		Name:         cfntest.Ptr("Min Revenue"),
		Type:         cfntest.Ptr("Number"),
		DefaultValue: cfntest.Ptr("100.0"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create a Number variable: the default is sent as a JSON number and the
	// template's spelling is kept on the way back.
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || created.CodeName == nil || *created.CodeName != "min_revenue" {
		t.Fatalf("create returned %+v", created)
	}
	if *created.DefaultValue != "100.0" || created.IsMulti != nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	if v := store.Get(parent, id)["default_value"]; v != float64(100) {
		t.Fatalf("default_value stored as %#v", v)
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Min Revenue" || *read.Type != "Number" || *read.DefaultValue != "100.0" {
		t.Fatalf("read returned %+v", read)
	}

	// Update to a multi-value List variable with a JSON array default.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Plans"), Type: cfntest.Ptr("List"),
		Values: []string{"free", "pro", "enterprise"}, IsMulti: cfntest.Ptr(true),
		DefaultValue: cfntest.Ptr(`[ "pro", "enterprise" ]`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.CodeName != "plans" || len(after.Values) != 3 || !*after.IsMulti || *after.DefaultValue != *updated.DefaultValue {
		t.Fatalf("update returned %+v", after)
	}

	// Update again: drop values, multi and default (must be cleared).
	plain := &Model{ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Plan"), Type: cfntest.Ptr("String")}
	ev, err = Update(api.Request(t, plain, after), after, plain)
	cfntest.RequireSuccess(t, ev, err)
	cleared := ev.ResourceModel.(*Model)
	if cleared.Values != nil || cleared.IsMulti != nil || cleared.DefaultValue != nil {
		t.Fatalf("update returned %+v", cleared)
	}
	stored := store.Get(parent, id)
	if stored["values"] != nil || stored["default_value"] != nil || stored["is_multi"] != false {
		t.Fatalf("fields not cleared: %+v", stored)
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete
	ev, err = Delete(api.Request(t, cleared, nil), nil, cleared)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("variable not deleted")
	}
	ev, err = Read(api.Request(t, cleared, nil), nil, cleared)
	cfntest.RequireNotFound(t, ev, err)
}

func TestDefaultValueEncoding(t *testing.T) {
	for _, tc := range []struct {
		typ, in string
		want    any
	}{
		{"String", "42", "42"},
		{"Date", "2026-01-01", "2026-01-01"},
		{"Boolean", "true", true},
		{"List", "pro", "pro"},
	} {
		got, err := encodeDefault(tc.typ, &tc.in)
		if err != nil || got != tc.want {
			t.Errorf("encodeDefault(%s, %q) = %#v, %v", tc.typ, tc.in, got, err)
		}
	}
	// A Boolean default read back keeps the template spelling.
	if got := decodeDefault(cfntest.Ptr("True"), []byte("true")); *got != "True" {
		t.Errorf("decodeDefault bool = %s", *got)
	}
	if got := decodeDefault(nil, []byte("7")); *got != "7" {
		t.Errorf("decodeDefault number = %s", *got)
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
		"no project":    func(m *Model) { m.ProjectId = nil },
		"no name":       func(m *Model) { m.Name = nil },
		"no type":       func(m *Model) { m.Type = nil },
		"bad number":    func(m *Model) { m.DefaultValue = cfntest.Ptr("lots") },
		"bad boolean":   func(m *Model) { m.Type = cfntest.Ptr("Boolean"); m.DefaultValue = cfntest.Ptr("maybe") },
		"bad list JSON": func(m *Model) { m.Type = cfntest.Ptr("List"); m.DefaultValue = cfntest.Ptr(`["a",`) },
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
