package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// dashboard is the subset of PostHog's Dashboard object these handlers use.
// Tiles (with their computed insight results) are deliberately not decoded.
type dashboard struct {
	ID               posthogcfn.FlexID `json:"id"`
	Name             *string           `json:"name"`
	Description      string            `json:"description"`
	Pinned           bool              `json:"pinned"`
	Tags             []string          `json:"tags"`
	Filters          json.RawMessage   `json:"filters"`
	BreakdownColors  []breakdownColor  `json:"breakdown_colors"`
	DataColorThemeID posthogcfn.FlexID `json:"data_color_theme_id"`
	QuickFilterIDs   []string          `json:"quick_filter_ids"`
	Customization    *customization    `json:"customization"`
	CreatedAt        string            `json:"created_at"`
	Deleted          bool              `json:"deleted"`
}

type breakdownColor struct {
	BreakdownValue    string  `json:"breakdownValue"`
	ColorToken        *string `json:"colorToken,omitempty"`
	BreakdownType     *string `json:"breakdownType,omitempty"`
	BreakdownProperty *string `json:"breakdownProperty,omitempty"`
	Source            *string `json:"source,omitempty"`
}

type customization struct {
	TileSpacing      *string `json:"tile_spacing"`
	LayoutCompaction *string `json:"layout_compaction"`
	GroupDisplay     *string `json:"group_display"`
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
	return posthogcfn.Path("/api/projects/%s/dashboards/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/dashboards/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	body, filters, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if v := posthogcfn.StringValue(currentModel.UseTemplate); v != "" {
		body["use_template"] = v
	}
	if v := posthogcfn.StringValue(currentModel.UseDashboard); v != "" {
		n, ok := posthogcfn.IDInt(currentModel.UseDashboard)
		if !ok {
			return posthogcfn.InvalidRequest("UseDashboard must be a numeric dashboard ID, got %q", v), nil
		}
		body["use_dashboard"] = n
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out dashboard
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating dashboard", err), nil
	}
	// The create serializer treats filters as read-only; set them with a
	// follow-up PATCH.
	if filters != nil {
		id := out.ID.String()
		if err := c.Patch(ctx, itemPath(projectID, id), map[string]any{"filters": filters}, &out); err != nil {
			return posthogcfn.FromError("setting filters on dashboard "+id, err), nil
		}
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
		return posthogcfn.NotFound("dashboard ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("dashboard ProjectId and Id must be set"), nil
	}
	body, filters, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if filters == nil {
		filters = map[string]any{}
	}
	body["filters"] = filters
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted dashboard succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out dashboard
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating dashboard "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Dashboards
// cannot be hard-deleted (DELETE returns 405); they are soft-deleted. The
// insights on the dashboard are kept.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("dashboard ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting dashboard "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list dashboards"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[dashboard](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing dashboards", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Deleted {
			continue
		}
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live dashboard, mapping a 404 or a soft-deleted dashboard to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*dashboard, *handler.ProgressEvent) {
	var out dashboard
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading dashboard "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("dashboard %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog; the
// display presets (grid spacing, layout compaction, group display) have no
// "unset" value and are only sent when set. The parsed filters are returned
// separately because Create and Update send them differently.
func requestBody(m *Model) (map[string]any, any, error) {
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return nil, nil, err
	}
	var theme any
	if v := posthogcfn.StringValue(m.DataColorThemeId); v != "" {
		n, ok := posthogcfn.IDInt(m.DataColorThemeId)
		if !ok {
			return nil, nil, fmt.Errorf("DataColorThemeId must be a numeric ID, got %q", v)
		}
		theme = n
	}
	colors := make([]breakdownColor, 0, len(m.BreakdownColors))
	for i, bc := range m.BreakdownColors {
		if posthogcfn.StringValue(bc.BreakdownValue) == "" {
			return nil, nil, fmt.Errorf("BreakdownColors[%d].BreakdownValue is required", i)
		}
		colors = append(colors, breakdownColor{
			BreakdownValue: *bc.BreakdownValue, ColorToken: bc.ColorToken,
			BreakdownType: bc.BreakdownType, BreakdownProperty: bc.BreakdownProperty,
		})
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	quickFilters := m.QuickFilterIds
	if quickFilters == nil {
		quickFilters = []string{}
	}
	body := map[string]any{
		"name":                posthogcfn.StringValue(m.Name),
		"description":         posthogcfn.StringValue(m.Description),
		"pinned":              posthogcfn.BoolValue(m.Pinned),
		"tags":                tags,
		"breakdown_colors":    colors,
		"data_color_theme_id": theme,
		"quick_filter_ids":    quickFilters,
	}
	for field, v := range map[string]*string{"grid_spacing": m.GridSpacing, "layout_compaction": m.LayoutCompaction, "group_display": m.GroupDisplay} {
		if v != nil {
			body[field] = *v
		}
	}
	return body, filters, nil
}

// fromAPI converts an API dashboard to the model. desired is the model from
// the request: its JSON strings are kept when the API value matches them, the
// write-only creation options are never returned, and the display presets
// PostHog fills in are only reported when the template sets them.
func fromAPI(projectID string, a *dashboard, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:        posthogcfn.String(projectID),
		Id:               a.ID.Ptr(),
		Name:             a.Name,
		Description:      posthogcfn.StringOrNil(a.Description),
		Tags:             posthogcfn.SliceOrNil(a.Tags),
		DataColorThemeId: a.DataColorThemeID.Ptr(),
		QuickFilterIds:   posthogcfn.SliceOrNil(a.QuickFilterIDs),
		CreatedAt:        posthogcfn.StringOrNil(a.CreatedAt),
	}
	if a.Pinned || desired.Pinned != nil {
		m.Pinned = posthogcfn.Bool(a.Pinned)
	}
	if desired.Filters != nil || !emptyObject(a.Filters) {
		m.Filters = posthogcfn.PreserveJSONSubset(desired.Filters, a.Filters)
	}
	for _, bc := range a.BreakdownColors {
		// Colors the dashboard assigned itself are not managed by the template.
		if posthogcfn.StringValue(bc.Source) == "auto" {
			continue
		}
		m.BreakdownColors = append(m.BreakdownColors, BreakdownColor{
			BreakdownValue: posthogcfn.String(bc.BreakdownValue), ColorToken: posthogcfn.StringPtrOrNil(bc.ColorToken),
			BreakdownType: posthogcfn.StringPtrOrNil(bc.BreakdownType), BreakdownProperty: posthogcfn.StringPtrOrNil(bc.BreakdownProperty),
		})
	}
	if cz := a.Customization; cz != nil {
		if desired.GridSpacing != nil {
			m.GridSpacing = posthogcfn.StringPtrOrNil(cz.TileSpacing)
		}
		if desired.LayoutCompaction != nil {
			m.LayoutCompaction = posthogcfn.StringPtrOrNil(cz.LayoutCompaction)
		}
		if desired.GroupDisplay != nil {
			m.GroupDisplay = posthogcfn.StringPtrOrNil(cz.GroupDisplay)
		}
	}
	return m
}

// emptyObject reports whether raw is null, {} or an object whose values are
// all null, false or empty.
func emptyObject(raw json.RawMessage) bool {
	var obj map[string]any
	if len(raw) == 0 || json.Unmarshal(raw, &obj) != nil {
		return true
	}
	for _, v := range obj {
		switch x := v.(type) {
		case nil:
		case bool:
			if x {
				return false
			}
		case string:
			if x != "" {
				return false
			}
		case []any:
			if len(x) > 0 {
				return false
			}
		case map[string]any:
			if len(x) > 0 {
				return false
			}
		default:
			return false
		}
	}
	return true
}
