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
	normalize := func(obj map[string]any) {
		// PostHog returns durations in Django's "D HH:MM:SS" form.
		if obj["expires_after"] == "P7D" {
			obj["expires_after"] = "7 00:00:00"
		}
	}
	store := api.Collection("/api/projects/{project_id}/approval_policies/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"conditions": map[string]any{}, "allow_self_approve": false,
			"bypass_org_membership_levels": []any{}, "bypass_roles": []any{},
			"expires_after": "14 00:00:00", "enabled": true,
		},
		OnCreate: normalize,
		OnUpdate: normalize,
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:      cfntest.Ptr(project),
		ActionKey:      cfntest.Ptr("feature_flag.update"),
		ApproverConfig: cfntest.Ptr(`{ "users": [1, 2], "quorum": 1 }`),
		Conditions:     cfntest.Ptr(`{"flag_keys": ["checkout"]}`),
		BypassRoles:    []string{"0190a1b2-0000-7000-8000-000000000099"},
		ExpiresAfter:   cfntest.Ptr("P7D"),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || created.UpdatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	id := *created.Id
	// Template strings are kept when equivalent to what PostHog returns.
	if *created.ApproverConfig != *model.ApproverConfig || *created.Conditions != *model.Conditions {
		t.Fatalf("JSON not preserved: %+v", created)
	}
	if *created.ExpiresAfter != "P7D" {
		t.Fatalf("ExpiresAfter = %s", *created.ExpiresAfter)
	}
	// Server defaults the template left out are not reported.
	if created.Enabled != nil || created.AllowSelfApprove != nil || created.BypassOrgMembershipLevels != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if stored := store.Get(parent, id); stored["enabled"] != true {
		t.Fatalf("enabled not sent as true: %v", stored["enabled"])
	}

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.ActionKey != "feature_flag.update" || len(read.BypassRoles) != 1 || *read.ExpiresAfter != "P7D" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: disable, allow self approval, drop conditions and bypass roles.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, ActionKey: cfntest.Ptr("feature_flag.update"),
		ApproverConfig:            cfntest.Ptr(`{"users": [3], "quorum": 1}`),
		BypassOrgMembershipLevels: cfntest.Ptr(`[15]`),
		AllowSelfApprove:          cfntest.Ptr(true),
		Enabled:                   cfntest.Ptr(false),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if after.Conditions != nil || after.BypassRoles != nil || *after.Enabled || !*after.AllowSelfApprove ||
		*after.BypassOrgMembershipLevels != `[15]` || after.ExpiresAfter != nil {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if c, _ := stored["conditions"].(map[string]any); len(c) != 0 {
		t.Fatalf("conditions not cleared: %v", stored["conditions"])
	}
	if r, _ := stored["bypass_roles"].([]any); len(r) != 0 {
		t.Fatalf("bypass_roles not cleared: %v", stored["bypass_roles"])
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
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("policy not deleted")
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
	for name, mutate := range map[string]func(*Model){
		"no project":          func(m *Model) { m.ProjectId = nil },
		"no action key":       func(m *Model) { m.ActionKey = nil },
		"no approvers":        func(m *Model) { m.ApproverConfig = nil },
		"approvers not obj":   func(m *Model) { m.ApproverConfig = cfntest.Ptr(`[1]`) },
		"bad conditions":      func(m *Model) { m.Conditions = cfntest.Ptr(`{"a":`) },
		"levels not an array": func(m *Model) { m.BypassOrgMembershipLevels = cfntest.Ptr(`8`) },
		"bad duration":        func(m *Model) { m.ExpiresAfter = cfntest.Ptr("a week") },
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

func TestParseDuration(t *testing.T) {
	for in, want := range map[string]float64{
		"7 00:00:00": 7 * 86400, "P7D": 7 * 86400, "P1W": 7 * 86400, "12:00:00": 43200,
		"PT12H": 43200, "3 days 04:05:06": 3*86400 + 4*3600 + 5*60 + 6, "90": 90, "01:30": 90,
	} {
		got, ok := parseDuration(in)
		if !ok || got != want {
			t.Errorf("parseDuration(%q) = %v, %v; want %v", in, got, ok, want)
		}
	}
	for _, in := range []string{"", "P", "PT", "a week", "7d"} {
		if _, ok := parseDuration(in); ok {
			t.Errorf("parseDuration(%q) accepted", in)
		}
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
