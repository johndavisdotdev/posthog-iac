package resource

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/client"
	"github.com/aws/aws-sdk-go/service/secretsmanager"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn/cfntest"
)

const (
	project   = "42"
	secretARN = "arn:aws:secretsmanager:us-east-1:123456789012:secret:posthog/key-AbCdEf"
	keyValue  = "phs_s3cr3tvalueonlyreturnedonce"
)

var parent = map[string]string{"project_id": project}

// fakeSecrets records PutSecretValue calls instead of calling AWS.
type fakeSecrets struct {
	puts []*secretsmanager.PutSecretValueInput
	err  error
}

func (f *fakeSecrets) PutSecretValue(in *secretsmanager.PutSecretValueInput) (*secretsmanager.PutSecretValueOutput, error) {
	if f.err != nil {
		return nil, f.err
	}
	f.puts = append(f.puts, in)
	return &secretsmanager.PutSecretValueOutput{ARN: in.SecretId}, nil
}

func useFakeSecrets(t *testing.T) *fakeSecrets {
	t.Helper()
	fake := &fakeSecrets{}
	orig := posthogcfn.NewSecretWriter
	posthogcfn.NewSecretWriter = func(client.ConfigProvider) posthogcfn.SecretWriter { return fake }
	t.Cleanup(func() { posthogcfn.NewSecretWriter = orig })
	return fake
}

func newAPI(t *testing.T) (*cfntest.API, *cfntest.Collection) {
	t.Helper()
	api := cfntest.NewAPI(t)
	store := api.Collection("/api/projects/{project_id}/project_secret_api_keys/", cfntest.CollectionOptions{
		StringIDs: true,
		Defaults: map[string]any{
			"created_at": "2026-01-01T00:00:00Z", "last_used_at": nil, "last_rolled_at": nil,
		},
		// The fake echoes the value on every response; the handler must
		// still never put it in a model.
		OnCreate: func(obj map[string]any) {
			obj["value"] = keyValue
			obj["mask_value"] = "phs_...once"
		},
	})
	return api, store
}

func desired() *Model {
	return &Model{
		ProjectId:               cfntest.Ptr(project),
		Label:                   cfntest.Ptr("backend"),
		Scopes:                  []string{"feature_flag:read", "query:read"},
		SecretsManagerSecretArn: cfntest.Ptr(secretARN),
	}
}

func requireNoValue(t *testing.T, m any) {
	t.Helper()
	b, _ := json.Marshal(m)
	if strings.Contains(string(b), keyValue) {
		t.Fatalf("key value leaked into the model: %s", b)
	}
}

func TestLifecycle(t *testing.T) {
	api, store := newAPI(t)
	secrets := useFakeSecrets(t)

	// Create writes the value to Secrets Manager and keeps it out of the model.
	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireSuccess(t, ev, err)
	created := ev.ResourceModel.(*Model)
	requireNoValue(t, created)
	if created.Id == nil || created.MaskValue == nil || *created.MaskValue != "phs_...once" || created.CreatedAt == nil {
		t.Fatalf("create returned %+v", created)
	}
	if created.SecretsManagerSecretArn != nil {
		t.Fatal("write-only SecretsManagerSecretArn returned")
	}
	if len(secrets.puts) != 1 || aws.StringValue(secrets.puts[0].SecretId) != secretARN ||
		aws.StringValue(secrets.puts[0].SecretString) != keyValue {
		t.Fatalf("secret not written: %+v", secrets.puts)
	}
	id := *created.Id

	// Read
	ev, err = Read(api.Request(t, created, nil), nil, created)
	cfntest.RequireSuccess(t, ev, err)
	read := ev.ResourceModel.(*Model)
	requireNoValue(t, read)
	if *read.Label != "backend" || len(read.Scopes) != 2 {
		t.Fatalf("read returned %+v", read)
	}

	// Update label and scopes in place.
	updated := &Model{ProjectId: created.ProjectId, Id: created.Id, Label: cfntest.Ptr("backend-v2"),
		Scopes: []string{"feature_flag:read"}, SecretsManagerSecretArn: cfntest.Ptr(secretARN)}
	ev, err = Update(api.Request(t, updated, created), created, updated)
	cfntest.RequireSuccess(t, ev, err)
	after := ev.ResourceModel.(*Model)
	requireNoValue(t, after)
	if *after.Label != "backend-v2" || len(after.Scopes) != 1 {
		t.Fatalf("update returned %+v", after)
	}
	if len(secrets.puts) != 1 {
		t.Fatal("update must not touch the secret")
	}

	// List
	ev, err = List(api.Request(t, &Model{ProjectId: cfntest.Ptr(project)}, nil), nil, &Model{ProjectId: cfntest.Ptr(project)})
	cfntest.RequireSuccess(t, ev, err)
	if len(ev.ResourceModels) != 1 || *ev.ResourceModels[0].(Model).Id != id {
		t.Fatalf("list returned %+v", ev.ResourceModels)
	}
	requireNoValue(t, ev.ResourceModels)

	// Delete
	ev, err = Delete(api.Request(t, after, nil), nil, after)
	cfntest.RequireSuccess(t, ev, err)
	if ev.ResourceModel != nil {
		t.Fatal("delete success must carry no model")
	}
	if store.Len() != 0 {
		t.Fatal("key not deleted")
	}
	ev, err = Read(api.Request(t, after, nil), nil, after)
	cfntest.RequireNotFound(t, ev, err)
}

func TestSecretWriteFailureDeletesKey(t *testing.T) {
	api, store := newAPI(t)
	secrets := useFakeSecrets(t)
	secrets.err = errors.New("AccessDeniedException: not authorized")

	model := desired()
	ev, err := Create(api.Request(t, model, nil), &Model{}, model)
	cfntest.RequireFailed(t, ev, err, "GeneralServiceException")
	if strings.Contains(ev.Message, keyValue) {
		t.Fatalf("failure message leaks the key: %s", ev.Message)
	}
	if store.Len() != 0 {
		t.Fatal("key must be deleted when the secret cannot be stored")
	}
	if len(api.CallsTo("POST", "/api/projects/42/project_secret_api_keys/")) != 1 {
		t.Fatal("expected one create call")
	}
}

func TestMissingResourceIsNotFound(t *testing.T) {
	api, _ := newAPI(t)
	gone := &Model{ProjectId: cfntest.Ptr(project), Id: cfntest.Ptr("nope"), Label: cfntest.Ptr("x"), Scopes: []string{"query:read"}}
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
	secrets := useFakeSecrets(t)
	for name, mutate := range map[string]func(*Model){
		"no project": func(m *Model) { m.ProjectId = nil },
		"no label":   func(m *Model) { m.Label = nil },
		"no scopes":  func(m *Model) { m.Scopes = nil },
		"no secret":  func(m *Model) { m.SecretsManagerSecretArn = nil },
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
	if store.Len() != 0 || len(api.Calls()) != 0 || len(secrets.puts) != 0 {
		t.Fatal("invalid requests must not reach PostHog or Secrets Manager")
	}
}

func TestMissingTypeConfiguration(t *testing.T) {
	m := desired()
	ev, err := Create(cfntest.NewRequest(t, m, nil, nil), &Model{}, m)
	cfntest.RequireFailed(t, ev, err, "InvalidTypeConfiguration")
}
