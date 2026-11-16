package resource

import (
	"bytes"
	"context"
	"encoding/json"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// viewLink is the subset of PostHog's ViewLink object these handlers use.
type viewLink struct {
	ID               posthogcfn.FlexID `json:"id"`
	SourceTableName  string            `json:"source_table_name"`
	SourceTableKey   string            `json:"source_table_key"`
	JoiningTableName string            `json:"joining_table_name"`
	JoiningTableKey  string            `json:"joining_table_key"`
	FieldName        string            `json:"field_name"`
	Configuration    json.RawMessage   `json:"configuration"`
	CreatedAt        string            `json:"created_at"`
	Deleted          *bool             `json:"deleted"`
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
	return posthogcfn.Path("/api/projects/%s/warehouse_view_links/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/warehouse_view_links/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	if posthogcfn.StringValue(currentModel.ProjectId) == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out viewLink
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating warehouse join", err), nil
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
		return posthogcfn.NotFound("join ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("join ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out viewLink
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating join "+id, err), nil
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
		return posthogcfn.NotFound("join ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting join "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list joins"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[viewLink](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing joins", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if posthogcfn.BoolValue(items[i].Deleted) {
			continue
		}
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live join, mapping a 404 or a soft-deleted one to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*viewLink, *handler.ProgressEvent) {
	var out viewLink
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading join "+id, err)
		return nil, &ev
	}
	if posthogcfn.BoolValue(out.Deleted) {
		ev := posthogcfn.NotFound("join %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody validates the model and builds the create/update body. Every
// writable field is sent; a removed Configuration is cleared with null.
func requestBody(m *Model) (map[string]any, error) {
	body := map[string]any{}
	for _, f := range []struct {
		name, field string
		value       *string
	}{
		{"SourceTableName", "source_table_name", m.SourceTableName},
		{"SourceTableKey", "source_table_key", m.SourceTableKey},
		{"JoiningTableName", "joining_table_name", m.JoiningTableName},
		{"JoiningTableKey", "joining_table_key", m.JoiningTableKey},
		{"FieldName", "field_name", m.FieldName},
	} {
		if posthogcfn.StringValue(f.value) == "" {
			return nil, errRequired(f.name)
		}
		body[f.field] = *f.value
	}
	cfg, err := posthogcfn.ParseJSON("Configuration", m.Configuration)
	if err != nil {
		return nil, err
	}
	body["configuration"] = cfg
	return body, nil
}

type errRequired string

func (e errRequired) Error() string { return string(e) + " is required" }

// fromAPI converts an API join to the model. An empty configuration ({} or
// null) is left out unless the template set it, so it does not show as drift.
func fromAPI(projectID string, v *viewLink, desired *Model) *Model {
	m := &Model{
		ProjectId:        posthogcfn.String(projectID),
		Id:               v.ID.Ptr(),
		SourceTableName:  posthogcfn.StringOrNil(v.SourceTableName),
		SourceTableKey:   posthogcfn.StringOrNil(v.SourceTableKey),
		JoiningTableName: posthogcfn.StringOrNil(v.JoiningTableName),
		JoiningTableKey:  posthogcfn.StringOrNil(v.JoiningTableKey),
		FieldName:        posthogcfn.StringOrNil(v.FieldName),
		CreatedAt:        posthogcfn.StringOrNil(v.CreatedAt),
	}
	var want *string
	if desired != nil {
		want = desired.Configuration
	}
	raw := bytes.TrimSpace(v.Configuration)
	if len(raw) > 0 && string(raw) != "null" && (want != nil || !posthogcfn.JSONEqual(string(raw), "{}")) {
		m.Configuration = posthogcfn.PreserveJSON(want, v.Configuration)
	}
	return m
}
