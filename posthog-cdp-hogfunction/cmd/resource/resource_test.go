package resource

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const (
	project    = "42"
	secret     = "s3cret-token-value"
	templateID = "template-webhook"
)

var parent = map[string]string{"project_id": project}

// templateSchema is what the fake API copies from template-webhook.
var templateSchema = []any{
	map[string]any{"key": "url", "type": "string", "required": true},
	map[string]any{"key": "token", "type": "string", "secret": true},
}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/hog_functions/", cfntest.CollectionOptions{
		StringIDs:  true,
		SoftDelete: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
			"description": "", "enabled": false, "hog": "", "inputs_schema": []any{}, "inputs": map[string]any{},
			"filters": map[string]any{}, "mappings": nil, "masking": nil, "icon_url": nil, "template": nil,
			"execution_order": nil, "status": map[string]any{"state": 1, "tokens": 10000},
		},
		WriteOnly: []string{"encrypted_inputs", "template_id"},
		OnCreate:  apply,
		OnUpdate:  apply,
	})
	return api, store
}

// apply mimics PostHog: it applies the template, compiles filters and inputs,
// and moves secret input values to encrypted storage, returning
// {"secret": true} in their place.
func apply(obj map[string]any) {
	if obj["template_id"] == templateID {
		obj["template"] = map[string]any{"id": templateID, "name": "Webhook"}
		if obj["hog"] == nil || obj["hog"] == "" {
			obj["hog"] = "fetch(inputs.url, {'headers': {'Authorization': inputs.token}})"
		}
		if s, _ := obj["inputs_schema"].([]any); len(s) == 0 {
			obj["inputs_schema"] = templateSchema
		}
		if obj["icon_url"] == nil {
			obj["icon_url"] = "/static/services/webhook.png"
		}
	}
	if f, ok := obj["filters"].(map[string]any); ok {
		if f["source"] == nil {
			f["source"] = "events"
		}
		f["bytecode"] = []any{"_H", 1, 29}
	}
	secretKeys := map[string]bool{}
	schema, _ := obj["inputs_schema"].([]any)
	for _, s := range schema {
		if item := s.(map[string]any); item["secret"] == true {
			secretKeys[item["key"].(string)] = true
		}
	}
	encrypted, _ := obj["encrypted_inputs"].(map[string]any)
	if encrypted == nil {
		encrypted = map[string]any{}
	}
	inputs, _ := obj["inputs"].(map[string]any)
	order := 0
	for k, v := range inputs {
		val := v.(map[string]any)
		if secretKeys[k] {
			if val["secret"] != true {
				encrypted[k] = val
			}
			inputs[k] = map[string]any{"secret": true}
			continue
		}
		val["bytecode"] = []any{"_H", 1, 32}
		val["order"] = order
		order++
	}
	obj["encrypted_inputs"] = encrypted
}

func templated() *Model {
	return &Model{
		ProjectId:    cfntest.Ptr(project),
		Type:         cfntest.Ptr("destination"),
		Name:         cfntest.Ptr("Order webhook"),
		Description:  cfntest.Ptr("Posts orders to the fulfilment service"),
		Enabled:      cfntest.Ptr(true),
		TemplateId:   cfntest.Ptr(templateID),
		Inputs:       cfntest.Ptr(`{"url": {"value": "https://example.com/hook"}}`),
		SecretInputs: cfntest.Ptr(`{"token": {"value": "` + secret + `"}}`),
		Filters:      cfntest.Ptr(`{"events": [{"id": "order_placed", "name": "order_placed", "type": "events"}]}`),
	}
}

func requireNoSecret(t *testing.T, v any) {
	t.Helper()
	b, _ := json.Marshal(v)
	if strings.Contains(string(b), secret) {
		t.Fatalf("secret value leaked: %s", b)
	}
}

func TestLifecycleFromTemplate(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := templated()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	requireNoSecret(t, created)
	if created.Id == nil || *created.TemplateId != templateID || *created.Type != "destination" || !*created.Enabled {
		t.Fatalf("create returned %+v", created)
	}
	// Template-provided code, schema and icon are not reported when the
	// template omits them; JSON strings survive PostHog's compiled additions.
	if created.Hog != nil || created.InputsSchema != nil || created.IconUrl != nil {
		t.Fatalf("template defaults leaked into the model: %+v", created)
	}
	if created.SecretInputs != nil || *created.Inputs != *model.Inputs || *created.Filters != *model.Filters {
		t.Fatalf("inputs/filters: %v / %v / %v", created.SecretInputs, *created.Inputs, *created.Filters)
	}
	id := *created.Id
	post := api.CallsTo("POST", "/api/projects/42/hog_functions/")[0].Body
	if post["template_id"] != templateID || post["type"] != "destination" {
		t.Fatalf("create body: %v", post)
	}
	if _, sent := post["hog"]; sent {
		t.Fatal("hog must not be sent when the template provides it")
	}
	if token := post["inputs"].(map[string]any)["token"].(map[string]any); token["value"] != secret {
		t.Fatalf("secret input not sent: %v", token)
	}
	if enc := store.Get(parent, id)["encrypted_inputs"].(map[string]any); enc["token"] == nil {
		t.Fatal("secret input not stored")
	}

	// Read: the request carries no write-only properties; the secret is still
	// left out because the schema marks it secret.
	readModel := &Model{ProjectId: created.ProjectId, Id: created.Id, Inputs: created.Inputs, TemplateId: created.TemplateId}
	ev, err = Read(api.Request(t, readModel, nil), nil, readModel)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	requireNoSecret(t, read)
	if *read.Name != "Order webhook" || *read.Inputs != *model.Inputs || read.SecretInputs != nil {
		t.Fatalf("read returned %+v", read)
	}
	if strings.Contains(*read.Inputs, "token") {
		t.Fatalf("secret input key returned by Read: %s", *read.Inputs)
	}

	// Update: change the URL, disable, drop description. The secret is sent
	// again from the template, and type/template_id are not sent.
	updated := templated()
	updated.Id = created.Id
	updated.Description = nil
	updated.Enabled = nil
	updated.Inputs = cfntest.Ptr(`{"url": {"value": "https://example.com/v2"}}`)
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	requireNoSecret(t, after)
	if after.Description != nil || after.Enabled != nil || *after.Inputs != *updated.Inputs {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/hog_functions/"+id+"/")[0].Body
	for _, f := range []string{"type", "template_id", "hog", "inputs_schema"} {
		if _, sent := patch[f]; sent {
			t.Fatalf("%s must not be sent on update", f)
		}
	}
	if patch["inputs"].(map[string]any)["token"].(map[string]any)["value"] != secret {
		t.Fatal("secret input not re-sent on update")
	}
	if stored := store.Get(parent, id); stored["description"] != "" || stored["enabled"] != false {
		t.Fatalf("fields not cleared: %v", stored)
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
		t.Fatal("function not soft-deleted")
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
		t.Fatalf("deleted function still listed: %+v", ev.ResourceModels)
	}
}

func TestCustomCode(t *testing.T) {
	api, store := newAPI(t)
	model := &Model{
		ProjectId:      cfntest.Ptr(project),
		Type:           cfntest.Ptr("transformation"),
		Name:           cfntest.Ptr("Drop internal"),
		Hog:            cfntest.Ptr("return event"),
		InputsSchema:   cfntest.Ptr(`[{"key": "domain", "type": "string"}, {"key": "api_key", "type": "string", "secret": true}]`),
		Inputs:         cfntest.Ptr(`{"domain": {"value": "example.com"}}`),
		SecretInputs:   cfntest.Ptr(`{"api_key": {"value": "` + secret + `"}}`),
		Masking:        &Masking{Hash: cfntest.Ptr("{person.id}"), Ttl: cfntest.Ptr(3600)},
		IconUrl:        cfntest.Ptr("https://example.com/icon.png"),
		ExecutionOrder: cfntest.Ptr(2),
	}
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	requireNoSecret(t, created)
	if *created.Hog != "return event" || *created.InputsSchema != *model.InputsSchema ||
		*created.Masking.Ttl != 3600 || *created.ExecutionOrder != 2 || *created.IconUrl != *model.IconUrl {
		t.Fatalf("create returned %+v", created)
	}
	// The API filled in default filters; they are not reported.
	if created.Filters != nil || created.TemplateId != nil {
		t.Fatalf("defaults leaked: %v %v", created.Filters, created.TemplateId)
	}

	// Without a template, removing optional properties clears them.
	updated := &Model{
		ProjectId: created.ProjectId, Id: created.Id, Type: created.Type, Name: created.Name,
		Hog: cfntest.Ptr("return null"),
	}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	stored := store.Get(parent, *created.Id)
	if stored["masking"] != nil || stored["icon_url"] != nil || stored["execution_order"] != nil ||
		len(stored["inputs_schema"].([]any)) != 0 || len(stored["inputs"].(map[string]any)) != 0 {
		t.Fatalf("fields not cleared: %v", stored)
	}
	after := ev.ResourceModel.(*Model)
	if after.Masking != nil || after.Inputs != nil || after.InputsSchema != nil {
		t.Fatalf("update returned %+v", after)
	}
}

func TestSecretMarkedInSchemaIsNeverRead(t *testing.T) {
	api, store := newAPI(t)
	// Seed a function whose secret input PostHog returns unredacted.
	store.Put(parent, map[string]any{
		"id": "0190a1b2-0000-7000-8000-000000000077", "type": "destination", "name": "Seeded", "hog": "x",
		"inputs_schema": templateSchema, "deleted": false,
		"inputs": map[string]any{"url": map[string]any{"value": "https://x"}, "token": map[string]any{"value": secret}},
	})
	m := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000077")}
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	requireNoSecret(t, ev.ResourceModel)
	if got := *ev.ResourceModel.(*Model).Inputs; got != `{"url":{"value":"https://x"}}` {
		t.Fatalf("Inputs = %s", got)
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := templated()
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
	cases := map[string]func(m *Model){
		"no project":             func(m *Model) { m.ProjectId = nil },
		"no type":                func(m *Model) { m.Type = nil },
		"no name":                func(m *Model) { m.Name = nil },
		"no hog and no template": func(m *Model) { m.TemplateId = nil },
		"invalid filters JSON":   func(m *Model) { m.Filters = cfntest.Ptr(`{"events":`) },
		"inputs not an object":   func(m *Model) { m.Inputs = cfntest.Ptr(`[]`) },
		"mappings not an array":  func(m *Model) { m.Mappings = cfntest.Ptr(`{}`) },
		"invalid schema JSON":    func(m *Model) { m.InputsSchema = cfntest.Ptr(`[`) },
		"key in both":            func(m *Model) { m.Inputs = cfntest.Ptr(`{"token": {"value": "x"}}`) },
		"masking without ttl":    func(m *Model) { m.Masking = &Masking{Hash: cfntest.Ptr("{person.id}")} },
		"secret not secret in schema": func(m *Model) {
			m.InputsSchema = cfntest.Ptr(`[{"key": "url", "type": "string"}, {"key": "token", "type": "string"}]`)
		},
		"secret schema key in inputs": func(m *Model) {
			m.InputsSchema = cfntest.Ptr(`[{"key": "url", "type": "string", "secret": true}, {"key": "token", "type": "string", "secret": true}]`)
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			m := templated()
			mutate(m)
			ev, err := Create(api.Request(t, m, nil), &Model{}, m)
			cfntest.RequireFailed(t, ev, err, "InvalidRequest")
		})
	}
	// An invalid SecretInputs value is rejected without echoing it.
	m := templated()
	m.SecretInputs = cfntest.Ptr(`{"token": {"value": "` + secret + `"`)
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if strings.Contains(ev.Message, secret) {
		t.Fatalf("error message leaks the secret: %s", ev.Message)
	}

	ev, err = List(api.Request(t, &Model{}, nil), nil, &Model{})
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if store.Len() != 0 {
		t.Fatal("invalid requests must not reach the API")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := templated()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
