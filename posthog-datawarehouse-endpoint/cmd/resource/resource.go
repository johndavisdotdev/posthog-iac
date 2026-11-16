package resource

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// defaultFreshness is PostHog's default data_freshness_seconds (24 h).
const defaultFreshness = 86400

// endpoint is the subset of PostHog's EndpointResponse / EndpointVersionResponse
// objects these handlers use.
type endpoint struct {
	ID                          posthogcfn.FlexID `json:"id"`
	Name                        string            `json:"name"`
	Query                       json.RawMessage   `json:"query"`
	Description                 *string           `json:"description"`
	DataFreshnessSeconds        *int              `json:"data_freshness_seconds"`
	IsActive                    *bool             `json:"is_active"`
	EndpointIsActive            *bool             `json:"endpoint_is_active"`
	IsMaterialized              bool              `json:"is_materialized"`
	DerivedFromInsight          *string           `json:"derived_from_insight"`
	BucketOverrides             map[string]string `json:"bucket_overrides"`
	Tags                        []string          `json:"tags"`
	OptionalBreakdownProperties []string          `json:"optional_breakdown_properties"`
	EndpointPath                string            `json:"endpoint_path"`
	URL                         *string           `json:"url"`
	CurrentVersion              *int              `json:"current_version"`
	Materialization             *struct {
		Status string `json:"status"`
	} `json:"materialization"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt *string `json:"updated_at"`
	Deleted   *bool   `json:"deleted"`
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
	return posthogcfn.Path("/api/projects/%s/endpoints/", projectID)
}

// itemPath addresses an endpoint by name: PostHog's item routes use the name,
// not the UUID.
func itemPath(projectID, name string) string {
	return posthogcfn.Path("/api/projects/%s/endpoints/%s/", projectID, name)
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, name := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Name)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	if name == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	query, err := parseQuery(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	body := map[string]any{"name": name, "query": query}
	if currentModel.Description != nil {
		body["description"] = *currentModel.Description
	}
	if currentModel.DataFreshnessSeconds != nil {
		body["data_freshness_seconds"] = *currentModel.DataFreshnessSeconds
	}
	if currentModel.IsActive != nil {
		body["is_active"] = *currentModel.IsActive
	}
	if currentModel.IsMaterialized != nil {
		body["is_materialized"] = *currentModel.IsMaterialized
	}
	if currentModel.DerivedFromInsight != nil {
		body["derived_from_insight"] = *currentModel.DerivedFromInsight
	}
	if len(currentModel.BucketOverrides) > 0 {
		body["bucket_overrides"] = currentModel.BucketOverrides
	}
	if len(currentModel.Tags) > 0 {
		body["tags"] = currentModel.Tags
	}
	if len(currentModel.OptionalBreakdownProperties) > 0 {
		body["optional_breakdown_properties"] = currentModel.OptionalBreakdownProperties
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out endpoint
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating endpoint", err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, name := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Name)
	if projectID == "" || name == "" {
		return posthogcfn.NotFound("endpoint ProjectId and Name must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, name)
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
	projectID, name := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Name)
	if projectID == "" || name == "" {
		return posthogcfn.NotFound("endpoint ProjectId and Name must be set"), nil
	}
	query, err := parseQuery(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	current, fail := get(ctx, c, projectID, name)
	if fail != nil {
		return *fail, nil
	}
	// Every writable property is sent so removed ones go back to PostHog's
	// defaults. Name and DerivedFromInsight are create-only and not sent.
	freshness := defaultFreshness
	if currentModel.DataFreshnessSeconds != nil {
		freshness = *currentModel.DataFreshnessSeconds
	}
	isActive := true
	if currentModel.IsActive != nil {
		isActive = *currentModel.IsActive
	}
	overrides := currentModel.BucketOverrides
	if overrides == nil {
		overrides = map[string]string{}
	}
	body := map[string]any{
		"description":                   posthogcfn.StringValue(currentModel.Description),
		"data_freshness_seconds":        freshness,
		"is_active":                     isActive,
		"is_materialized":               posthogcfn.BoolValue(currentModel.IsMaterialized),
		"bucket_overrides":              overrides,
		"tags":                          nonNil(currentModel.Tags),
		"optional_breakdown_properties": nonNil(currentModel.OptionalBreakdownProperties),
	}
	// A query change creates a new endpoint version, so the query is only
	// sent when it differs from the current one.
	if raw, _ := json.Marshal(query); !posthogcfn.JSONEqual(string(raw), string(current.Query)) {
		body["query"] = query
	}
	var out endpoint
	if err := c.Patch(ctx, itemPath(projectID, name), body, &out); err != nil {
		return posthogcfn.FromError("updating endpoint "+name, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, name := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Name)
	if projectID == "" || name == "" {
		return posthogcfn.NotFound("endpoint ProjectId and Name must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, name); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, name)); err != nil {
		return posthogcfn.FromError("deleting endpoint "+name, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list endpoints"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[endpoint](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing endpoints", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if posthogcfn.BoolValue(items[i].Deleted) || items[i].Name == "" {
			continue
		}
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Name: posthogcfn.String(items[i].Name)})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live endpoint, mapping a 404 or a soft-deleted one to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, name string) (*endpoint, *handler.ProgressEvent) {
	var out endpoint
	if err := c.Get(ctx, itemPath(projectID, name), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading endpoint "+name, err)
		return nil, &ev
	}
	if posthogcfn.BoolValue(out.Deleted) {
		ev := posthogcfn.NotFound("endpoint %s has been deleted", name)
		return nil, &ev
	}
	return &out, nil
}

func parseQuery(m *Model) (any, error) {
	query, err := posthogcfn.ParseJSON("Query", m.Query)
	if err != nil {
		return nil, err
	}
	if _, ok := query.(map[string]any); !ok {
		return nil, errors.New(`Query must be a JSON object with a "kind" key`)
	}
	return query, nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// fromAPI converts an API endpoint to the model. desired is the model from the
// request: its Query string is kept when JSON-equal to the API value, and
// server defaults are only reported when the template set them.
func fromAPI(projectID string, e *endpoint, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:                   posthogcfn.String(projectID),
		Name:                        posthogcfn.StringOrNil(e.Name),
		Id:                          e.ID.Ptr(),
		Query:                       posthogcfn.PreserveJSON(desired.Query, e.Query),
		Description:                 posthogcfn.StringPtrOrNil(e.Description),
		DerivedFromInsight:          posthogcfn.StringPtrOrNil(e.DerivedFromInsight),
		BucketOverrides:             posthogcfn.MapOrNil(e.BucketOverrides),
		Tags:                        posthogcfn.SliceOrNil(e.Tags),
		OptionalBreakdownProperties: posthogcfn.SliceOrNil(e.OptionalBreakdownProperties),
		EndpointPath:                posthogcfn.StringOrNil(e.EndpointPath),
		Url:                         posthogcfn.StringPtrOrNil(e.URL),
		CurrentVersion:              e.CurrentVersion,
		CreatedAt:                   posthogcfn.StringOrNil(e.CreatedAt),
		UpdatedAt:                   posthogcfn.StringPtrOrNil(e.UpdatedAt),
	}
	if m.Name == nil {
		m.Name = desired.Name
	}
	if e.Materialization != nil {
		m.MaterializationStatus = posthogcfn.StringOrNil(e.Materialization.Status)
	}
	if f := e.DataFreshnessSeconds; f != nil && (*f != defaultFreshness || desired.DataFreshnessSeconds != nil) {
		m.DataFreshnessSeconds = posthogcfn.Int(*f)
	}
	// The single-item GET describes the current version; endpoint_is_active
	// is the endpoint-level flag there.
	active := e.IsActive
	if e.EndpointIsActive != nil {
		active = e.EndpointIsActive
	}
	if active != nil && (!*active || desired.IsActive != nil) {
		m.IsActive = posthogcfn.Bool(*active)
	}
	if e.IsMaterialized || desired.IsMaterialized != nil {
		m.IsMaterialized = posthogcfn.Bool(e.IsMaterialized)
	}
	return m
}
