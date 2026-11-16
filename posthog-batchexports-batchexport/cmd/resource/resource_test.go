package resource

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const (
	project   = "42"
	secretKey = "wJalrXUtnFEMI-secret-access-key"
	s3Config  = `{"bucket_name": "acme-posthog-export", "region": "eu-west-1", "prefix": "events/"}`
)

var parent = map[string]string{"project_id": project}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/batch_exports/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "last_updated_at": "2026-01-01T00:00:00Z", "team_id": 42,
			"model": "events", "paused": false, "timezone": "UTC", "latest_runs": []any{}, "schema": nil,
			"hogql_query": nil, "hogql_modifiers": nil, "primary_key": nil, "version_key": nil,
			"incremental_mode": nil, "filters": nil, "offset_day": nil, "offset_hour": nil,
			"start_at": nil, "end_at": nil, "last_paused_at": nil,
		},
		WriteOnly: []string{"stored_secrets"},
		OnCreate:  storeDestination,
		OnUpdate:  storeDestination,
	})
	// pause/unpause flip the paused flag.
	for action, paused := range map[string]bool{"pause": true, "unpause": false} {
		paused := paused
		api.Handle("POST /api/projects/{project_id}/batch_exports/{id}/"+action+"/", func(w http.ResponseWriter, r *http.Request) {
			obj := store.Get(parent, r.PathValue("id"))
			if obj == nil {
				cfntest.NotFound(w)
				return
			}
			obj["paused"] = paused
			store.Put(parent, obj)
			cfntest.JSON(w, http.StatusOK, map[string]any{"paused": paused})
		})
	}
	return api, store
}

// storeDestination mimics PostHog: integration_id becomes integration,
// config defaults are filled in, and credentials are stored but stripped from
// responses. Like PostHog, a PATCHed config is merged into the stored one.
func storeDestination(obj map[string]any) {
	dest, _ := obj["destination"].(map[string]any)
	if dest == nil {
		return
	}
	if id, ok := dest["integration_id"]; ok {
		dest["integration"] = id
		delete(dest, "integration_id")
	}
	config, _ := dest["config"].(map[string]any)
	if config["file_format"] == nil {
		config["file_format"] = "JSONLines"
	}
	secrets, _ := obj["stored_secrets"].(map[string]any)
	if secrets == nil {
		secrets = map[string]any{}
	}
	for _, k := range []string{"aws_access_key_id", "aws_secret_access_key"} {
		if v, ok := config[k]; ok {
			secrets[k] = v
			delete(config, k)
		}
	}
	obj["stored_secrets"] = secrets
}

func desired() *Model {
	return &Model{
		ProjectId:                cfntest.Ptr(project),
		Name:                     cfntest.Ptr("Events to S3"),
		Interval:                 cfntest.Ptr("hour"),
		DestinationType:          cfntest.Ptr("AwsS3"),
		DestinationIntegrationId: cfntest.Ptr("17"),
		DestinationConfig:        cfntest.Ptr(s3Config),
		DestinationSecretConfig:  cfntest.Ptr(`{"aws_access_key_id": "AKIAEXAMPLE", "aws_secret_access_key": "` + secretKey + `"}`),
		Filters:                  cfntest.Ptr(`[{"key": "$browser", "operator": "exact", "type": "event", "value": ["Firefox"]}]`),
		StartAt:                  cfntest.Ptr("2026-02-01T00:00:00Z"),
	}
}

func requireNoSecret(t *testing.T, v any) {
	t.Helper()
	b, _ := json.Marshal(v)
	if strings.Contains(string(b), secretKey) || strings.Contains(string(b), "AKIAEXAMPLE") {
		t.Fatalf("credential leaked: %s", b)
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	// Create
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	requireNoSecret(t, created)
	if created.Id == nil || *created.DestinationType != "AwsS3" || *created.DestinationIntegrationId != "17" {
		t.Fatalf("create returned %+v", created)
	}
	// Config defaults PostHog adds are not drift; server defaults are not
	// reported; the secret config is write-only.
	if *created.DestinationConfig != s3Config || *created.Filters != *model.Filters || created.DestinationSecretConfig != nil {
		t.Fatalf("destination/filters: %+v", created)
	}
	if created.Model != nil || created.Timezone != nil || created.Paused != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	id := *created.Id
	post := api.CallsTo("POST", "/api/projects/42/batch_exports/")[0].Body
	dest := post["destination"].(map[string]any)
	if dest["integration_id"] != float64(17) || dest["config"].(map[string]any)["aws_secret_access_key"] != secretKey {
		t.Fatalf("create destination body: %v", dest)
	}
	if store.Get(parent, id)["stored_secrets"].(map[string]any)["aws_secret_access_key"] != secretKey {
		t.Fatal("credentials not stored")
	}

	// Read without write-only properties in the request.
	readModel := &Model{ProjectId: created.ProjectId, Id: created.Id}
	ev, err = Read(api.Request(t, readModel, nil), nil, readModel)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	requireNoSecret(t, read)
	if *read.Name != "Events to S3" || *read.Interval != "hour" || read.DestinationConfig == nil {
		t.Fatalf("read returned %+v", read)
	}

	// Update: switch to a daily HogQL export, pause it, drop filters and start time.
	updated := desired()
	updated.Id = created.Id
	updated.Name = cfntest.Ptr("Daily orders to S3")
	updated.Interval = cfntest.Ptr("day")
	updated.Model = cfntest.Ptr("hogql")
	updated.HogqlQuery = cfntest.Ptr("SELECT event, timestamp FROM events WHERE event = 'order_placed'")
	updated.HogqlModifiers = cfntest.Ptr(`{"convertToProjectTimezone": true}`)
	updated.PrimaryKey = []string{"event", "timestamp"}
	updated.IncrementalMode = cfntest.Ptr("MERGE")
	updated.Timezone = cfntest.Ptr("Europe/London")
	updated.OffsetHour = cfntest.Ptr(3)
	updated.Paused = cfntest.Ptr(true)
	updated.Filters = nil
	updated.StartAt = nil
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	requireNoSecret(t, after)
	if *after.Name != "Daily orders to S3" || *after.Model != "hogql" || *after.Timezone != "Europe/London" ||
		*after.OffsetHour != 3 || !*after.Paused || *after.IncrementalMode != "MERGE" || len(after.PrimaryKey) != 2 ||
		*after.HogqlModifiers != *updated.HogqlModifiers || after.Filters != nil || after.StartAt != nil {
		t.Fatalf("update returned %+v", after)
	}
	patch := api.CallsTo("PATCH", "/api/projects/42/batch_exports/"+id+"/")[0].Body
	if _, sent := patch["paused"]; sent {
		t.Fatal("paused must go through the pause endpoint, not PATCH")
	}
	if len(api.CallsTo("POST", "/api/projects/42/batch_exports/"+id+"/pause/")) != 1 {
		t.Fatal("pause endpoint not called")
	}
	stored := store.Get(parent, id)
	if stored["start_at"] != nil || len(stored["filters"].([]any)) != 0 {
		t.Fatalf("fields not cleared: %v", stored)
	}

	// Unpausing by removing Paused from the template.
	resumed := desired()
	resumed.Id = created.Id
	ev, err = Update(api.Request(t, resumed, after), after, resumed)
	cfntest.RequireSuccess(t, ev, err)
	if len(api.CallsTo("POST", "/api/projects/42/batch_exports/"+id+"/unpause/")) != 1 || store.Get(parent, id)["paused"] != false {
		t.Fatal("not unpaused")
	}

	// List
	listModel := &Model{ProjectId: cfntest.Ptr(project)}
	ev, err = List(api.Request(t, listModel, nil), nil, listModel)
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	// Delete hard-deletes.
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("batch export not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestCredentialsReturnedByAPIAreStripped(t *testing.T) {
	api, store := newAPI(t)
	store.Put(parent, map[string]any{
		"id": "0190a1b2-0000-7000-8000-000000000077", "name": "Legacy", "interval": "hour", "model": "events",
		"destination": map[string]any{"type": "Redshift", "integration": nil, "config": map[string]any{
			"database": "dev", "user": "posthog", "password": secretKey,
			"copy_inputs": map[string]any{"s3_bucket": "staging", "aws_secret_access_key": secretKey},
		}},
	})
	m := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("0190a1b2-0000-7000-8000-000000000077")}
	ev, err := Read(api.Request(t, m, nil), nil, m)
	cfntest.RequireSuccess(t, ev, err)
	requireNoSecret(t, ev.ResourceModel)
	if got := *ev.ResourceModel.(*Model).DestinationConfig; !strings.Contains(got, `"s3_bucket":"staging"`) {
		t.Fatalf("DestinationConfig = %s", got)
	}
}

func TestDestinationTypeIsNotUpdatable(t *testing.T) {
	api, _ := newAPI(t)
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	changed := desired()
	changed.Id = created.Id
	changed.DestinationType = cfntest.Ptr("Snowflake")
	ev, err = Update(api.Request(t, changed, created), created, changed)
	cfntest.RequireFailed(t, ev, err, "NotUpdatable")
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
	cases := map[string]func(m *Model){
		"no project":              func(m *Model) { m.ProjectId = nil },
		"no name":                 func(m *Model) { m.Name = nil },
		"no interval":             func(m *Model) { m.Interval = nil },
		"no destination type":     func(m *Model) { m.DestinationType = nil },
		"no destination config":   func(m *Model) { m.DestinationConfig = nil },
		"invalid config JSON":     func(m *Model) { m.DestinationConfig = cfntest.Ptr(`{"bucket_name":`) },
		"config not an object":    func(m *Model) { m.DestinationConfig = cfntest.Ptr(`[]`) },
		"invalid filters":         func(m *Model) { m.Filters = cfntest.Ptr(`{}`) },
		"invalid modifiers":       func(m *Model) { m.HogqlModifiers = cfntest.Ptr(`nope`) },
		"non-numeric integration": func(m *Model) { m.DestinationIntegrationId = cfntest.Ptr("abc") },
		"field in both configs":   func(m *Model) { m.DestinationConfig = cfntest.Ptr(`{"bucket_name": "b", "aws_access_key_id": "x"}`) },
		"credential in plain config": func(m *Model) {
			m.DestinationSecretConfig = nil
			m.DestinationConfig = cfntest.Ptr(`{"bucket_name": "b", "aws_secret_access_key": "x"}`)
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			m := desired()
			mutate(m)
			ev, err := Create(api.Request(t, m, nil), &Model{}, m)
			cfntest.RequireFailed(t, ev, err, "InvalidRequest")
		})
	}
	// Invalid secret config is rejected without echoing it.
	m := desired()
	m.DestinationSecretConfig = cfntest.Ptr(`{"aws_secret_access_key": "` + secretKey + `"`)
	ev, err := Create(api.Request(t, m, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")
	if strings.Contains(ev.Message, secretKey) {
		t.Fatalf("error message leaks the secret: %s", ev.Message)
	}

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
