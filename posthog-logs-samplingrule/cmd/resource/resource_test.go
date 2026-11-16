package resource

import (
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const config = `{ "logs_per_second": 100, "filter_group": {"type": "AND", "values": [{"type": "AND", "values": [{"key": "service.name", "operator": "exact", "value": "api"}]}]} }`

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	next := 0
	store := api.Collection("/api/projects/{project_id}/logs/sampling_rules/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": nil, "enabled": false, "version": 1,
			"source": "logs", "scope_service": nil, "scope_path_pattern": nil, "scope_attribute_filters": []any{},
		},
		OnCreate: func(obj map[string]any) {
			if obj["priority"] == nil {
				obj["priority"] = next
			}
			next++
			// PostHog fills in the burst default for rate limits.
			if cfg, ok := obj["config"].(map[string]any); ok && cfg["logs_per_second"] != nil && cfg["burst_logs"] == nil {
				cfg["burst_logs"] = cfg["logs_per_second"]
			}
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
		ProjectId:             cfntest.Ptr(project),
		Name:                  cfntest.Ptr("Cap api logs"),
		Enabled:               cfntest.Ptr(true),
		RuleType:              cfntest.Ptr("rate_limit"),
		ScopePathPattern:      cfntest.Ptr("^/health"),
		ScopeAttributeFilters: cfntest.Ptr(`[{"key": "http.route", "op": "eq", "value": "/api"}]`),
		Config:                cfntest.Ptr(config),
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || *created.Version != 1 {
		t.Fatalf("create returned %+v", created)
	}
	// JSON strings are kept verbatim (even with the server-added burst_logs);
	// the default source and server-assigned priority are not reported.
	if *created.Config != config || *created.ScopeAttributeFilters != *model.ScopeAttributeFilters {
		t.Fatalf("JSON not preserved: %s / %s", *created.Config, *created.ScopeAttributeFilters)
	}
	if created.Source != nil || created.Priority != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if _, sent := api.CallsTo("POST", "/api/projects/42/logs/sampling_rules/")[0].Body["source"]; sent {
		t.Fatal("source must not be sent when unset")
	}
	id := *created.Id

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Cap api logs" || *read.RuleType != "rate_limit" || *read.ScopePathPattern != "^/health" || !*read.Enabled {
		t.Fatalf("read returned %+v", read)
	}

	// Update: change rule type, drop scope fields (must be cleared), disable by omission.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Drop health checks"),
		RuleType: cfntest.Ptr("path_drop"), Priority: cfntest.Ptr(0),
		Config: cfntest.Ptr(`{"patterns": ["^/health"], "match_attribute_key": "http.route"}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.RuleType != "path_drop" || after.ScopePathPattern != nil || after.ScopeAttributeFilters != nil || after.Enabled != nil || *after.Priority != 0 || *after.Version != 2 {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, id)
	if stored["scope_path_pattern"] != nil || len(stored["scope_attribute_filters"].([]any)) != 0 || stored["enabled"] != false {
		t.Fatalf("fields not cleared: %v", stored)
	}
	if _, sent := api.CallsTo("PATCH", "/api/projects/42/logs/sampling_rules/"+id+"/")[0].Body["source"]; sent {
		t.Fatal("immutable source must not be sent on update")
	}

	// List reads both record sources and de-duplicates.
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}
	calls := api.CallsTo("GET", "/api/projects/42/logs/sampling_rules/")
	if len(calls) != 2 || !strings.Contains(calls[0].Query, "source=logs") || !strings.Contains(calls[1].Query, "source=spans") {
		t.Fatalf("list calls = %+v", calls)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("rule not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestSpanSourceIsSentAndReported(t *testing.T) {
	api, _ := newAPI(t)
	m := desired()
	m.Source = cfntest.Ptr("spans")
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireSuccess(t, ev, err)
	if got := ev.ResourceModel.(*Model).Source; got == nil || *got != "spans" {
		t.Fatalf("Source = %v", got)
	}
	// A non-default source is reported even when the template omits it (e.g. on import).
	read := &Model{ProjectId: cfntest.Ptr(project), Id: ev.ResourceModel.(*Model).Id}
	ev, err = Read(api.Request(t, read, nil), nil, read)
	cfntest.RequireSuccess(t, ev, err)
	if got := ev.ResourceModel.(*Model).Source; got == nil || *got != "spans" {
		t.Fatalf("Source = %v", got)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := desired()
	gone.Id = cfntest.Ptr("nope")
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
	mod := func(f func(*Model)) *Model { m := desired(); f(m); return m }
	for name, m := range map[string]*Model{
		"no project":        mod(func(m *Model) { m.ProjectId = nil }),
		"no name":           mod(func(m *Model) { m.Name = nil }),
		"no rule type":      mod(func(m *Model) { m.RuleType = nil }),
		"no config":         mod(func(m *Model) { m.Config = nil }),
		"bad config":        mod(func(m *Model) { m.Config = cfntest.Ptr(`{"a":`) }),
		"config not object": mod(func(m *Model) { m.Config = cfntest.Ptr(`[]`) }),
		"bad filters":       mod(func(m *Model) { m.ScopeAttributeFilters = cfntest.Ptr(`[{`) }),
		"filters not array": mod(func(m *Model) { m.ScopeAttributeFilters = cfntest.Ptr(`{}`) }),
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
