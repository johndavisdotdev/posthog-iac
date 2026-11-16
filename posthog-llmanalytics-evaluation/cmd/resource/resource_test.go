package resource

import (
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const project = "42"

var parent = map[string]string{"project_id": project}

const (
	judgeConfig = `{ "prompt": "Is the answer polite?" }`
	conditions  = `[ {"id": "all", "properties": [{"key": "$ai_model", "value": "gpt-4.1", "operator": "exact", "type": "event"}]} ]`
)

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/evaluations/", cfntest.CollectionOptions{
		StringIDs:  true,
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"description": "", "directory_id": nil, "enabled": false, "status": "active", "status_reason": nil,
			"evaluation_config": map[string]any{}, "output_config": map[string]any{}, "conditions": []any{},
			"target": "generation", "target_config": map[string]any{}, "model_configuration": nil,
		},
		OnCreate: fillDefaults,
		OnUpdate: fillDefaults,
	})
	return api, store
}

// fillDefaults mimics PostHog filling in server defaults.
func fillDefaults(obj map[string]any) {
	for _, c := range obj["conditions"].([]any) {
		cond := c.(map[string]any)
		if cond["rollout_percentage"] == nil {
			cond["rollout_percentage"] = 100
		}
	}
	if obj["output_type"] == "boolean" {
		cfg := obj["output_config"].(map[string]any)
		if cfg["allows_na"] == nil {
			cfg["allows_na"] = false
		}
	}
	if mc, ok := obj["model_configuration"].(map[string]any); ok {
		mc["provider_key_name"] = "Team key"
	}
	if obj["evaluation_type"] == "sentiment" {
		obj["evaluation_config"] = map[string]any{"source": "user_messages"}
	}
	if obj["enabled"] == false {
		obj["status"] = "paused"
	} else {
		obj["status"] = "active"
	}
}

func desired() *Model {
	return &Model{
		ProjectId:        cfntest.Ptr(project),
		Name:             cfntest.Ptr("Politeness"),
		Description:      cfntest.Ptr("Checks the assistant stays polite"),
		Enabled:          cfntest.Ptr(true),
		EvaluationType:   cfntest.Ptr("llm_judge"),
		EvaluationConfig: cfntest.Ptr(judgeConfig),
		OutputType:       cfntest.Ptr("boolean"),
		Conditions:       cfntest.Ptr(conditions),
		ModelConfiguration: &ModelConfiguration{
			Provider: cfntest.Ptr("openai"), Model: cfntest.Ptr("gpt-4.1-mini"),
		},
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || created.CreatedAt == nil || *created.Status != "active" {
		t.Fatalf("create returned %+v", created)
	}
	// JSON strings are kept verbatim (rollout_percentage was filled in by the
	// server); server defaults for target and output_config are not reported.
	if *created.EvaluationConfig != judgeConfig || *created.Conditions != conditions {
		t.Fatalf("JSON not preserved: %s / %s", *created.EvaluationConfig, *created.Conditions)
	}
	if created.Target != nil || created.OutputConfig != nil || created.TargetConfig != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if mc := created.ModelConfiguration; mc == nil || *mc.Model != "gpt-4.1-mini" || mc.ProviderKeyId != nil {
		t.Fatalf("ModelConfiguration = %+v", mc)
	}
	id := *created.Id

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Politeness" || *read.Description != "Checks the assistant stays polite" || !*read.Enabled || *read.EvaluationType != "llm_judge" {
		t.Fatalf("read returned %+v", read)
	}

	// Update: switch to a Hog evaluation on traces, drop the description,
	// conditions and judge model (all must be cleared), disable by omission.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Name: cfntest.Ptr("Has answer"),
		EvaluationType: cfntest.Ptr("hog"), EvaluationConfig: cfntest.Ptr(`{"source": "return length(output) > 0"}`),
		OutputType: cfntest.Ptr("boolean"), OutputConfig: cfntest.Ptr(`{"true_is_failure": false}`),
		Target: cfntest.Ptr("trace"), TargetConfig: cfntest.Ptr(`{"strategy": "fixed_window", "window_seconds": 60}`),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.EvaluationType != "hog" || after.Description != nil || after.Conditions != nil || after.ModelConfiguration != nil ||
		after.Enabled != nil || *after.Status != "paused" || *after.Target != "trace" {
		t.Fatalf("update returned %+v", after)
	}
	if *after.OutputConfig != *updated.OutputConfig || *after.TargetConfig != *updated.TargetConfig {
		t.Fatalf("explicit JSON lost: %s / %s", *after.OutputConfig, *after.TargetConfig)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/evaluations/"+id+"/")[0].Body
	if v, sent := patch["model_configuration"]; !sent || v != nil {
		t.Fatalf("model_configuration must be sent as null when leaving llm_judge: %v", patch)
	}
	stored := store.Get(parent, id)
	if stored["description"] != "" || len(stored["conditions"].([]any)) != 0 || stored["enabled"] != false {
		t.Fatalf("fields not cleared: %v", stored)
	}

	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete soft-deletes (PostHog refuses a hard DELETE for evaluations).
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Get(parent, id)["deleted"] != true {
		t.Fatal("evaluation not soft-deleted")
	}

	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, after, after), after, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 0 {
		t.Fatalf("deleted evaluation still listed: %+v", ev.ResourceModels)
	}
}

func TestLLMJudgeUpdateWithoutModelKeepsIt(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)

	updated := desired()
	updated.Id = created.Id
	updated.ModelConfiguration = nil
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	patch := api.CallsTo("PATCH", "/api/projects/42/evaluations/"+*created.Id+"/")[0].Body
	if _, sent := patch["model_configuration"]; sent {
		t.Fatal("model_configuration must be omitted (null is rejected) for llm_judge")
	}
	if ev.ResourceModel.(*Model).ModelConfiguration == nil {
		t.Fatal("judge model lost")
	}
}

func TestSentimentDefaultConfigIsNotDrift(t *testing.T) {
	api, _ := newAPI(t)
	m := &Model{
		ProjectId: cfntest.Ptr(project), Name: cfntest.Ptr("Sentiment"),
		EvaluationType: cfntest.Ptr("sentiment"), OutputType: cfntest.Ptr("sentiment"),
	}
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireSuccess(t, ev, err)
	got := ev.ResourceModel.(*Model)
	if got.EvaluationConfig != nil || got.ModelConfiguration != nil {
		t.Fatalf("server defaults leaked into the model: %+v", got)
	}
	post := api.CallsTo("POST", "/api/projects/42/evaluations/")[0].Body
	if v, sent := post["model_configuration"]; !sent || v != nil {
		t.Fatalf("model_configuration must be null for sentiment: %v", post)
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
		"no project":           mod(func(m *Model) { m.ProjectId = nil }),
		"no name":              mod(func(m *Model) { m.Name = nil }),
		"no evaluation type":   mod(func(m *Model) { m.EvaluationType = nil }),
		"no output type":       mod(func(m *Model) { m.OutputType = nil }),
		"judge without model":  mod(func(m *Model) { m.ModelConfiguration = nil }),
		"bad config":           mod(func(m *Model) { m.EvaluationConfig = cfntest.Ptr(`{"prompt":`) }),
		"config not object":    mod(func(m *Model) { m.EvaluationConfig = cfntest.Ptr(`"x"`) }),
		"bad conditions":       mod(func(m *Model) { m.Conditions = cfntest.Ptr(`[{`) }),
		"conditions not array": mod(func(m *Model) { m.Conditions = cfntest.Ptr(`{}`) }),
		"bad output config":    mod(func(m *Model) { m.OutputConfig = cfntest.Ptr(`nope`) }),
		"bad target config":    mod(func(m *Model) { m.TargetConfig = cfntest.Ptr(`[]`) }),
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
