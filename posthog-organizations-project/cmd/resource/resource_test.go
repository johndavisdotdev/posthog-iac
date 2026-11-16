package resource

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const (
	orgID      = "0190a1b2-aaaa-7000-8000-000000000001"
	otherOrgID = "0190a1b2-ffff-7000-8000-000000000009"
)

var parent = map[string]string{"organization_id": orgID}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/organizations/{organization_id}/projects/", cfntest.CollectionOptions{
		Defaults: map[string]any{
			"uuid": "0190a1b2-1111-7000-8000-000000000001", "organization": orgID,
			"api_token": "phc_public", "api_host": "https://us.i.posthog.com",
			"secret_api_token": "phs_secret_must_not_leak", "created_at": "2026-01-01T00:00:00Z",
			"timezone": "UTC", "base_currency": "USD", "anonymize_ips": false, "session_recording_opt_in": false,
			"session_recording_retention_period": "30d", "capture_performance_opt_in": true,
			"data_attributes": []any{"data-attr"}, "tags": []any{}, "app_urls": []any{}, "recording_domains": []any{},
			"test_account_filters": []any{}, "path_cleaning_filters": []any{}, "is_pending_deletion": false,
		},
		OnCreate: normalise,
		OnUpdate: normalise,
	})
	return api, store
}

// normalise mimics PostHog: tags are lowercased and the sample rate is
// returned with two decimals.
func normalise(obj map[string]any) {
	if tags, ok := obj["tags"].([]any); ok {
		for i, tag := range tags {
			tags[i] = strings.ToLower(tag.(string))
		}
	}
	if obj["session_recording_sample_rate"] == "0.1" {
		obj["session_recording_sample_rate"] = "0.10"
	}
}

func desired() *Model {
	return &Model{
		OrganizationId:             cfntest.Ptr(orgID),
		Name:                       cfntest.Ptr("Production"),
		ProductDescription:         cfntest.Ptr("Our web app"),
		Tags:                       []string{"Prod", "web"},
		Timezone:                   cfntest.Ptr("Europe/London"),
		WeekStartDay:               cfntest.Ptr(1),
		AnonymizeIps:               cfntest.Ptr(true),
		SessionRecordingOptIn:      cfntest.Ptr(true),
		SessionRecordingSampleRate: cfntest.Ptr("0.1"),
		RecordingDomains:           []string{"https://app.example.com"},
		TestAccountFilters:         cfntest.Ptr(`[ {"key": "email", "value": "@example.com", "operator": "not_icontains", "type": "person"} ]`),
	}
}

func orgModel() *Model { return &Model{OrganizationId: cfntest.Ptr(orgID)} }

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	if created.Id == nil || *created.Id != "1" || *created.ApiToken != "phc_public" || created.Uuid == nil || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	// Normalised values are reported as the template wrote them.
	if *created.TestAccountFilters != *model.TestAccountFilters || *created.SessionRecordingSampleRate != "0.1" || created.Tags[0] != "Prod" {
		t.Fatalf("template values not preserved: %+v", created)
	}
	// Server defaults the template did not set are not reported.
	if created.CapturePerformanceOptIn != nil || created.BaseCurrency != nil || created.DataAttributes != nil {
		t.Fatalf("server defaults leaked into the model: %+v", created)
	}
	if body := api.CallsTo("POST", "/api/organizations/"+orgID+"/projects/")[0].Body; len(body) != 10 {
		t.Fatalf("create should send only template properties, sent %v", body)
	}

	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	if *read.Name != "Production" || *read.Timezone != "Europe/London" || *read.WeekStartDay != 1 {
		t.Fatalf("read returned %+v", read)
	}

	// An identifier-only read (import) reports every setting.
	ident := &Model{OrganizationId: cfntest.Ptr(orgID), Id: created.Id}
	ev, err = Read(api.Request(t, ident, nil), nil, ident)
	cfntest.RequireSuccess(t, ev, err)
	if full := ev.ResourceModel.(*Model); full.BaseCurrency == nil || full.CapturePerformanceOptIn == nil || full.TestAccountFilters == nil {
		t.Fatalf("identifier-only read returned %+v", full)
	}

	// Update: rename, drop description, tags, timezone and filters.
	updated := &Model{OrganizationId: created.OrganizationId, Id: created.Id, Name: cfntest.Ptr("Production EU"),
		AnonymizeIps: cfntest.Ptr(false), SessionRecordingOptIn: cfntest.Ptr(true)}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	if *after.Name != "Production EU" || after.ProductDescription != nil || after.Tags != nil || *after.AnonymizeIps {
		t.Fatalf("update returned %+v", after)
	}
	stored := store.Get(parent, "1")
	if stored["product_description"] != nil || len(stored["tags"].([]any)) != 0 || stored["timezone"] != "UTC" ||
		stored["week_start_day"] != nil || len(stored["test_account_filters"].([]any)) != 0 || len(stored["recording_domains"].([]any)) != 0 {
		t.Fatalf("removed properties not reset: %+v", stored)
	}
	// Settings never managed by the template are left alone.
	patch := api.CallsTo("PATCH", "/api/organizations/"+orgID+"/projects/1/")[0].Body
	if _, sent := patch["capture_performance_opt_in"]; sent {
		t.Fatalf("unmanaged setting sent: %v", patch)
	}

	ev, err = List(api.Request(t, orgModel(), nil), nil, orgModel())
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != "1" {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}

	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil || store.Len() != 0 {
		t.Fatal("project not deleted, or delete returned a model")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestSecretTokenNeverInModel(t *testing.T) {
	api, _ := newAPI(t)
	ident := &Model{OrganizationId: cfntest.Ptr(orgID)}
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	ident.Id = ev.ResourceModel.(*Model).Id
	ev, err = Read(api.Request(t, ident, nil), nil, ident)
	cfntest.RequireSuccess(t, ev, err)
	if strings.Contains(toJSON(t, ev.ResourceModel), "phs_secret") {
		t.Fatal("secret API token leaked into the model")
	}
}

func TestDeleteSafety(t *testing.T) {
	api, store := newAPI(t)
	// Pending deletion: already gone as far as CloudFormation is concerned.
	store.Put(parent, map[string]any{"id": 5, "name": "Old", "organization": orgID, "is_pending_deletion": true})
	// Returned under this organization's path but owned by another one.
	store.Put(parent, map[string]any{"id": 6, "name": "Other", "organization": otherOrgID})

	for _, id := range []string{"5", "6", "999", "../7", "abc"} {
		m := &Model{OrganizationId: cfntest.Ptr(orgID), Id: cfntest.Ptr(id), Name: cfntest.Ptr("x")}
		ev, err := Delete(api.Request(t, m, nil), nil, m)
		cfntest.RequireNotFound(t, ev, err)
		ev, err = Read(api.Request(t, m, nil), nil, m)
		cfntest.RequireNotFound(t, ev, err)
		ev, err = Update(api.Request(t, m, m), m, m)
		cfntest.RequireNotFound(t, ev, err)
	}
	for _, c := range api.Calls() {
		if c.Method == http.MethodDelete || c.Method == http.MethodPatch {
			t.Fatalf("unsafe request sent: %s %s", c.Method, c.Path)
		}
	}
	if store.Len() != 2 {
		t.Fatal("projects were deleted")
	}
	ev, err := List(api.Request(t, orgModel(), nil), nil, orgModel())
	cfntest.RequireSuccess(t, ev, err)
	for _, m := range ev.ResourceModels {
		if *m.(Model).Id == "5" {
			t.Fatal("project pending deletion was listed")
		}
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{OrganizationId: cfntest.Ptr(orgID), Id: cfntest.Ptr("999"), Name: cfntest.Ptr("x")}
	ev, err := Read(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Update(api.Request(t, gone, gone), gone, gone)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, gone, nil), nil, gone)
	cfntest.RequireNotFound(t, ev, err)
	empty := &Model{}
	ev, err = Read(api.Request(t, empty, nil), nil, empty)
	cfntest.RequireNotFound(t, ev, err)
	ev, err = Delete(api.Request(t, empty, nil), nil, empty)
	cfntest.RequireNotFound(t, ev, err)
}

func TestValidation(t *testing.T) {
	api, store := newAPI(t)
	noOrg := desired()
	noOrg.OrganizationId = nil
	ev, err := Create(api.Request(t, noOrg, nil), &Model{}, noOrg)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	noName := desired()
	noName.Name = nil
	ev, err = Create(api.Request(t, noName, nil), &Model{}, noName)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	badJSON := desired()
	badJSON.PathCleaningFilters = cfntest.Ptr(`[{"regex":`)
	ev, err = Create(api.Request(t, badJSON, nil), &Model{}, badJSON)
	cfntest.RequireFailed(t, ev, err, "InvalidRequest")

	ev, err = List(api.Request(t, &Model{}, nil), nil, &Model{})
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

func toJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
