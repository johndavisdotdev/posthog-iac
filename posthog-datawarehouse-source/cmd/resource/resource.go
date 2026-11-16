package resource

import (
	"context"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// source is the subset of PostHog's ExternalDataSource object these handlers use.
type source struct {
	ID                     posthogcfn.FlexID `json:"id"`
	SourceType             string            `json:"source_type"`
	Prefix                 *string           `json:"prefix"`
	Description            *string           `json:"description"`
	AccessMethod           string            `json:"access_method"`
	DirectQueryEnabled     bool              `json:"direct_query_enabled"`
	AutoSyncNewSchemas     bool              `json:"auto_sync_new_schemas"`
	AutoSyncSchemaPatterns []string          `json:"auto_sync_schema_patterns"`
	Status                 string            `json:"status"`
	LatestError            *string           `json:"latest_error"`
	LastRunAt              *string           `json:"last_run_at"`
	CreatedAt              string            `json:"created_at"`
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
	return posthogcfn.Path("/api/projects/%s/external_data_sources/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/external_data_sources/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service. PostHog's
// create endpoint answers with the new ID only, and does not accept the
// auto-sync settings, so those are PATCHed afterwards and the source is then
// read back.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	if posthogcfn.StringValue(currentModel.SourceType) == "" {
		return posthogcfn.InvalidRequest("SourceType is required"), nil
	}
	payload, err := posthogcfn.ParseJSON("Payload", currentModel.Payload)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if _, ok := payload.(map[string]any); !ok {
		return posthogcfn.InvalidRequest("Payload must be a JSON object"), nil
	}
	body := map[string]any{
		"source_type": posthogcfn.StringValue(currentModel.SourceType),
		"payload":     payload,
	}
	if currentModel.Prefix != nil {
		body["prefix"] = *currentModel.Prefix
	}
	if currentModel.Description != nil {
		body["description"] = *currentModel.Description
	}
	if currentModel.AccessMethod != nil {
		body["access_method"] = *currentModel.AccessMethod
	}
	if currentModel.DirectQueryEnabled != nil {
		body["direct_query_enabled"] = *currentModel.DirectQueryEnabled
	}
	if len(currentModel.DestinationIds) > 0 {
		body["destination_ids"] = currentModel.DestinationIds
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var created struct {
		ID posthogcfn.FlexID `json:"id"`
	}
	if err := c.Post(ctx, collectionPath(projectID), body, &created); err != nil {
		return posthogcfn.FromError("creating data warehouse source", err), nil
	}
	id := created.ID.String()
	if id == "" {
		return posthogcfn.Failed("ServiceInternalError", "PostHog did not return the ID of the created source"), nil
	}

	if posthogcfn.BoolValue(currentModel.AutoSyncNewSchemas) || len(currentModel.AutoSyncSchemaPatterns) > 0 {
		if err := c.Patch(ctx, itemPath(projectID, id), autoSyncBody(currentModel), nil); err != nil {
			// Don't leave a source CloudFormation does not know about.
			_ = c.Delete(ctx, itemPath(projectID, id))
			return posthogcfn.FromError("configuring auto-sync on source "+id, err), nil
		}
	}
	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("source ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("source ProjectId and Id must be set"), nil
	}
	body := autoSyncBody(currentModel)
	body["prefix"] = posthogcfn.StringValue(currentModel.Prefix)
	body["description"] = posthogcfn.StringValue(currentModel.Description)
	body["direct_query_enabled"] = posthogcfn.BoolValue(currentModel.DirectQueryEnabled)

	// Credentials are write-only, so they are only sent when the template
	// changed them. PostHog takes new connection settings as job_inputs.
	var prevPayload *string
	if prevModel != nil {
		prevPayload = prevModel.Payload
	}
	if currentModel.Payload != nil && (prevPayload == nil || !posthogcfn.JSONEqual(*currentModel.Payload, *prevPayload)) {
		payload, err := posthogcfn.ParseJSON("Payload", currentModel.Payload)
		if err != nil {
			return posthogcfn.InvalidRequest("%v", err), nil
		}
		inputs, ok := payload.(map[string]any)
		if !ok {
			return posthogcfn.InvalidRequest("Payload must be a JSON object"), nil
		}
		jobInputs := make(map[string]any, len(inputs))
		for k, v := range inputs {
			if k != "schemas" { // table selection only applies on create
				jobInputs[k] = v
			}
		}
		body["job_inputs"] = jobInputs
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out source
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating source "+id, err), nil
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
		return posthogcfn.NotFound("source ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting source "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list sources"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[source](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing sources", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*source, *handler.ProgressEvent) {
	var out source
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading source "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// autoSyncBody holds the settings PostHog accepts on PATCH only.
func autoSyncBody(m *Model) map[string]any {
	patterns := m.AutoSyncSchemaPatterns
	if patterns == nil {
		patterns = []string{}
	}
	return map[string]any{
		"auto_sync_new_schemas":     posthogcfn.BoolValue(m.AutoSyncNewSchemas),
		"auto_sync_schema_patterns": patterns,
	}
}

// fromAPI converts an API source to the model. Write-only properties
// (Payload, DestinationIds) are never included. Server defaults are left out
// unless the template set the property, so they do not show as drift.
func fromAPI(projectID string, s *source, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:              posthogcfn.String(projectID),
		Id:                     s.ID.Ptr(),
		SourceType:             posthogcfn.StringOrNil(s.SourceType),
		Prefix:                 posthogcfn.StringPtrOrNil(s.Prefix),
		Description:            posthogcfn.StringPtrOrNil(s.Description),
		AutoSyncSchemaPatterns: posthogcfn.SliceOrNil(s.AutoSyncSchemaPatterns),
		Status:                 posthogcfn.StringOrNil(s.Status),
		LatestError:            posthogcfn.StringPtrOrNil(s.LatestError),
		LastRunAt:              posthogcfn.StringPtrOrNil(s.LastRunAt),
		CreatedAt:              posthogcfn.StringOrNil(s.CreatedAt),
	}
	if s.AccessMethod != "" && (desired.AccessMethod != nil || s.AccessMethod != "warehouse") {
		m.AccessMethod = posthogcfn.String(s.AccessMethod)
	}
	if s.DirectQueryEnabled || desired.DirectQueryEnabled != nil {
		m.DirectQueryEnabled = posthogcfn.Bool(s.DirectQueryEnabled)
	}
	if s.AutoSyncNewSchemas || desired.AutoSyncNewSchemas != nil {
		m.AutoSyncNewSchemas = posthogcfn.Bool(s.AutoSyncNewSchemas)
	}
	return m
}
