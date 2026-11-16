package resource

import (
	"context"
	"log"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/aws/aws-sdk-go/service/cloudformation"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// secretAPIKey is the subset of PostHog's ProjectSecretAPIKey object these
// handlers use. The key value is deliberately absent: it is decoded only from
// the create response (createResponse) and never stored in the model.
type secretAPIKey struct {
	ID        posthogcfn.FlexID `json:"id"`
	Label     string            `json:"label"`
	Scopes    []string          `json:"scopes"`
	MaskValue *string           `json:"mask_value"`
	CreatedAt string            `json:"created_at"`
}

// createResponse is the POST response, the only one that carries the value.
type createResponse struct {
	secretAPIKey
	Value string `json:"value"`
}

// newClient builds the PostHog client from the registered type configuration.
// On failure it returns the progress event the handler should return.
func newClient(req handler.Request) (*posthogcfn.Client, *handler.ProgressEvent) {
	cfg, err := Configuration(req)
	if err != nil {
		ev := posthogcfn.ConfigError(err)
		return nil, &ev
	}
	c, err := posthogcfn.NewClient(cfg.ApiKey, cfg.BaseUrl)
	if err != nil {
		ev := posthogcfn.ConfigError(err)
		return nil, &ev
	}
	return c, nil
}

func collectionPath(projectID string) string {
	return posthogcfn.Path("/api/projects/%s/project_secret_api_keys/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/project_secret_api_keys/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service. PostHog
// returns the key value only in the create response, so it is written to the
// Secrets Manager secret named by SecretsManagerSecretArn. If that write
// fails the new key is deleted again, so no unusable key is left behind.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	if posthogcfn.StringValue(currentModel.Label) == "" {
		return posthogcfn.InvalidRequest("Label is required"), nil
	}
	if len(currentModel.Scopes) == 0 {
		return posthogcfn.InvalidRequest("Scopes must contain at least one scope"), nil
	}
	secretARN := posthogcfn.StringValue(currentModel.SecretsManagerSecretArn)
	if secretARN == "" {
		return posthogcfn.InvalidRequest("SecretsManagerSecretArn is required: PostHog returns the key value only once and it must be stored somewhere"), nil
	}
	if req.Session == nil {
		return posthogcfn.InvalidRequest("no AWS session is available to write the key to Secrets Manager; check the resource type's execution role"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out createResponse
	if err := c.Post(ctx, collectionPath(projectID), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("creating project secret API key", err), nil
	}
	id := out.ID.String()
	if out.Value == "" {
		cleanup(ctx, c, projectID, id)
		return posthogcfn.Failed(cloudformation.HandlerErrorCodeServiceInternalError,
			"PostHog did not return the value of the new secret API key; the key was deleted again"), nil
	}
	if err := posthogcfn.PutSecret(req.Session, secretARN, out.Value); err != nil {
		cleanup(ctx, c, projectID, id)
		return posthogcfn.Failed(cloudformation.HandlerErrorCodeGeneralServiceException,
			"storing the secret API key in Secrets Manager failed, so the key was deleted again: %v", err), nil
	}
	m := fromAPI(projectID, &out.secretAPIKey)
	return posthogcfn.Success(m), nil
}

// cleanup deletes a key created by a Create that cannot complete.
func cleanup(ctx context.Context, c *posthogcfn.Client, projectID, id string) {
	if id == "" {
		return
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil && !posthogcfn.IsNotFound(err) {
		log.Printf("posthog: deleting secret API key %s after a failed create failed: %v", id, err)
	}
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("secret API key ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out secretAPIKey
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading secret API key "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out)), nil
}

// Update handles the Update event from the CloudFormation service. Label and
// Scopes are updated in place; the key value is unchanged.
func Update(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if id == "" && prevModel != nil {
		id = posthogcfn.StringValue(prevModel.Id)
	}
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("secret API key ProjectId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Label) == "" {
		return posthogcfn.InvalidRequest("Label is required"), nil
	}
	if len(currentModel.Scopes) == 0 {
		return posthogcfn.InvalidRequest("Scopes must contain at least one scope"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a deleted key returns 404, which FromError maps to NotFound.
	var out secretAPIKey
	if err := c.Patch(ctx, itemPath(projectID, id), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("updating secret API key "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out)), nil
}

// Delete handles the Delete event from the CloudFormation service. The
// Secrets Manager secret is left alone: it belongs to the template author.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("secret API key ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out secretAPIKey
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading secret API key "+id, err), nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting secret API key "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list secret API keys"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[secretAPIKey](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing secret API keys", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// requestBody builds the create/update body. Both writable fields are always
// sent.
func requestBody(m *Model) map[string]any {
	return map[string]any{
		"label":  posthogcfn.StringValue(m.Label),
		"scopes": m.Scopes,
	}
}

// fromAPI converts an API key to the model. SecretsManagerSecretArn is
// write-only and the key value is never part of the model.
func fromAPI(projectID string, k *secretAPIKey) *Model {
	return &Model{
		ProjectId: posthogcfn.String(projectID),
		Id:        k.ID.Ptr(),
		Label:     posthogcfn.StringOrNil(k.Label),
		Scopes:    posthogcfn.SliceOrNil(k.Scopes),
		MaskValue: posthogcfn.StringPtrOrNil(k.MaskValue),
		CreatedAt: posthogcfn.StringOrNil(k.CreatedAt),
	}
}
