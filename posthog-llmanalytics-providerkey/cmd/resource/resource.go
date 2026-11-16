package resource

import (
	"context"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// providerKey is the subset of PostHog's LLMProviderKey object these handlers
// read. The write-only fields (api_key, base_url, ...) are never returned;
// the configuration fields come back as *_display.
type providerKey struct {
	ID                    posthogcfn.FlexID `json:"id"`
	Provider              *string           `json:"provider"`
	Name                  *string           `json:"name"`
	State                 *string           `json:"state"`
	ErrorMessage          *string           `json:"error_message"`
	APIKeyMasked          *string           `json:"api_key_masked"`
	BaseURLDisplay        *string           `json:"base_url_display"`
	SystemOneModelDisplay *string           `json:"system_one_model_display"`
	AzureEndpointDisplay  *string           `json:"azure_endpoint_display"`
	APIVersionDisplay     *string           `json:"api_version_display"`
	CreatedAt             string            `json:"created_at"`
	LastUsedAt            *string           `json:"last_used_at"`
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
	return posthogcfn.Path("/api/projects/%s/llm_analytics/provider_keys/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/llm_analytics/provider_keys/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	if posthogcfn.StringValue(currentModel.Provider) == "" {
		return posthogcfn.InvalidRequest("Provider is required"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	body := requestBody(currentModel)
	body["provider"] = *currentModel.Provider
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out providerKey
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating LLM provider key", err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("LLM provider key ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service.
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
		return posthogcfn.NotFound("LLM provider key ProjectId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH returns 404 for a missing key, which FromError maps to NotFound.
	var out providerKey
	if err := c.Patch(ctx, itemPath(projectID, id), requestBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("updating LLM provider key "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("LLM provider key ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting LLM provider key "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list LLM provider keys"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[providerKey](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing LLM provider keys", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*providerKey, *handler.ProgressEvent) {
	var out providerKey
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading LLM provider key "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. The provider-specific settings
// and the API key are only sent when the template sets them: PostHog keeps
// the stored values otherwise (an empty value is not a valid "unset").
func requestBody(m *Model) map[string]any {
	body := map[string]any{"name": posthogcfn.StringValue(m.Name)}
	for field, v := range map[string]*string{
		"api_key":          m.ApiKey,
		"base_url":         m.BaseUrl,
		"system_one_model": m.SystemOneModel,
		"azure_endpoint":   m.AzureEndpoint,
		"api_version":      m.ApiVersion,
	} {
		if s := posthogcfn.StringValue(v); s != "" {
			body[field] = s
		}
	}
	if posthogcfn.BoolValue(m.SetAsActive) {
		body["set_as_active"] = true
	}
	return body
}

// fromAPI converts an API key to the model. Write-only properties (ApiKey,
// SetAsActive) are never set. The configuration properties are read from the
// *_display fields; the template's value is kept when it matches up to a
// trailing slash, so URL normalisation does not show as drift.
func fromAPI(projectID string, k *providerKey, desired *Model) *Model {
	var want Model
	if desired != nil {
		want = *desired
	}
	return &Model{
		ProjectId:      posthogcfn.String(projectID),
		Id:             k.ID.Ptr(),
		Provider:       posthogcfn.StringPtrOrNil(k.Provider),
		Name:           k.Name,
		BaseUrl:        display(want.BaseUrl, k.BaseURLDisplay),
		SystemOneModel: display(want.SystemOneModel, k.SystemOneModelDisplay),
		AzureEndpoint:  display(want.AzureEndpoint, k.AzureEndpointDisplay),
		ApiVersion:     display(want.ApiVersion, k.APIVersionDisplay),
		ApiKeyMasked:   posthogcfn.StringPtrOrNil(k.APIKeyMasked),
		State:          posthogcfn.StringPtrOrNil(k.State),
		ErrorMessage:   posthogcfn.StringPtrOrNil(k.ErrorMessage),
		CreatedAt:      posthogcfn.StringOrNil(k.CreatedAt),
		LastUsedAt:     posthogcfn.StringPtrOrNil(k.LastUsedAt),
	}
}

func display(desired, api *string) *string {
	got := posthogcfn.StringPtrOrNil(api)
	if got != nil && desired != nil && strings.TrimRight(*desired, "/") == strings.TrimRight(*got, "/") {
		return desired
	}
	return got
}
