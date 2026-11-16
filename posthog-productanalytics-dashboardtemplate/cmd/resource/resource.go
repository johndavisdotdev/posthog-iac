package resource

import (
	"context"
	"encoding/json"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// template is the subset of PostHog's DashboardTemplate object these
// handlers use.
type template struct {
	ID                   posthogcfn.FlexID `json:"id"`
	TemplateName         *string           `json:"template_name"`
	DashboardDescription *string           `json:"dashboard_description"`
	DashboardFilters     json.RawMessage   `json:"dashboard_filters"`
	Tiles                json.RawMessage   `json:"tiles"`
	Variables            json.RawMessage   `json:"variables"`
	Tags                 []string          `json:"tags"`
	ImageURL             *string           `json:"image_url"`
	Scope                *string           `json:"scope"`
	AvailabilityContexts []string          `json:"availability_contexts"`
	Customization        *customization    `json:"customization"`
	CreatedAt            *string           `json:"created_at"`
	Deleted              *bool             `json:"deleted"`
}

type customization struct {
	TileSpacing      *string         `json:"tile_spacing,omitempty"`
	LayoutCompaction *string         `json:"layout_compaction,omitempty"`
	GroupDisplay     *string         `json:"group_display,omitempty"`
	Groups           json.RawMessage `json:"groups,omitempty"`
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
	return posthogcfn.Path("/api/projects/%s/dashboard_templates/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/dashboard_templates/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.TemplateName) == "" {
		return posthogcfn.InvalidRequest("TemplateName is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out template
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating dashboard template", err), nil
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
		return posthogcfn.NotFound("dashboard template ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("dashboard template ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted template succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out template
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating dashboard template "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Dashboard
// templates cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("dashboard template ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting dashboard template "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service. The list
// endpoint also returns PostHog's official templates (scope global or
// feature_flag); those are not project resources and are skipped.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list dashboard templates"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[template](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing dashboard templates", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if posthogcfn.BoolValue(items[i].Deleted) {
			continue
		}
		if s := posthogcfn.StringValue(items[i].Scope); s == "global" || s == "feature_flag" {
			continue
		}
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live template, mapping a 404 or a soft-deleted template to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*template, *handler.ProgressEvent) {
	var out template
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading dashboard template "+id, err)
		return nil, &ev
	}
	if posthogcfn.BoolValue(out.Deleted) {
		ev := posthogcfn.NotFound("dashboard template %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog. scope is
// only sent when set (PostHog defaults it to team).
func requestBody(m *Model) (map[string]any, error) {
	filters, err := posthogcfn.ParseJSON("DashboardFilters", m.DashboardFilters)
	if err != nil {
		return nil, err
	}
	tiles, err := posthogcfn.ParseJSON("Tiles", m.Tiles)
	if err != nil {
		return nil, err
	}
	if tiles == nil {
		tiles = []any{}
	}
	if _, ok := tiles.([]any); !ok {
		return nil, errorString("Tiles must be a JSON array")
	}
	variables, err := posthogcfn.ParseJSON("Variables", m.Variables)
	if err != nil {
		return nil, err
	}
	if variables == nil {
		variables = []any{}
	}
	if _, ok := variables.([]any); !ok {
		return nil, errorString("Variables must be a JSON array")
	}
	var cz any
	if m.Customization != nil {
		groups, err := posthogcfn.ParseJSON("Customization.Groups", m.Customization.Groups)
		if err != nil {
			return nil, err
		}
		obj := map[string]any{}
		for field, v := range map[string]*string{
			"tile_spacing": m.Customization.TileSpacing, "layout_compaction": m.Customization.LayoutCompaction,
			"group_display": m.Customization.GroupDisplay,
		} {
			if v != nil {
				obj[field] = *v
			}
		}
		if groups != nil {
			obj["groups"] = groups
		}
		cz = obj
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	contexts := m.AvailabilityContexts
	if contexts == nil {
		contexts = []string{}
	}
	body := map[string]any{
		"template_name":         posthogcfn.StringValue(m.TemplateName),
		"dashboard_description": posthogcfn.StringValue(m.DashboardDescription),
		"dashboard_filters":     filters,
		"tiles":                 tiles,
		"variables":             variables,
		"tags":                  tags,
		"image_url":             m.ImageUrl,
		"availability_contexts": contexts,
		"customization":         cz,
	}
	if m.Scope != nil {
		body["scope"] = *m.Scope
	}
	return body, nil
}

type errorString string

func (e errorString) Error() string { return string(e) }

// fromAPI converts an API template to the model. desired is the model from
// the request: its JSON strings are kept when the API value matches them, and
// values PostHog fills in (scope team, empty filters, tiles and variables,
// customization presets) are only reported when the template sets them.
func fromAPI(projectID string, a *template, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:            posthogcfn.String(projectID),
		Id:                   a.ID.Ptr(),
		TemplateName:         a.TemplateName,
		DashboardDescription: posthogcfn.StringPtrOrNil(a.DashboardDescription),
		Tags:                 posthogcfn.SliceOrNil(a.Tags),
		ImageUrl:             posthogcfn.StringPtrOrNil(a.ImageURL),
		AvailabilityContexts: posthogcfn.SliceOrNil(a.AvailabilityContexts),
		CreatedAt:            posthogcfn.StringPtrOrNil(a.CreatedAt),
	}
	if s := posthogcfn.StringValue(a.Scope); desired.Scope != nil || (s != "" && s != "team") {
		m.Scope = posthogcfn.StringOrNil(s)
	}
	if desired.DashboardFilters != nil || !posthogcfn.EmptyJSON(a.DashboardFilters) {
		m.DashboardFilters = posthogcfn.PreserveJSONSubset(desired.DashboardFilters, a.DashboardFilters)
	}
	if desired.Tiles != nil || !posthogcfn.EmptyJSON(a.Tiles) {
		m.Tiles = posthogcfn.PreserveJSONSubset(desired.Tiles, a.Tiles)
	}
	if desired.Variables != nil || !posthogcfn.EmptyJSON(a.Variables) {
		m.Variables = posthogcfn.PreserveJSONSubset(desired.Variables, a.Variables)
	}
	if want, got := desired.Customization, a.Customization; want != nil && got != nil {
		cz := &Customization{}
		if want.TileSpacing != nil {
			cz.TileSpacing = posthogcfn.StringPtrOrNil(got.TileSpacing)
		}
		if want.LayoutCompaction != nil {
			cz.LayoutCompaction = posthogcfn.StringPtrOrNil(got.LayoutCompaction)
		}
		if want.GroupDisplay != nil {
			cz.GroupDisplay = posthogcfn.StringPtrOrNil(got.GroupDisplay)
		}
		if want.Groups != nil {
			cz.Groups = posthogcfn.PreserveJSONSubset(want.Groups, got.Groups)
		}
		if *cz != (Customization{}) {
			m.Customization = cz
		}
	}
	return m
}
