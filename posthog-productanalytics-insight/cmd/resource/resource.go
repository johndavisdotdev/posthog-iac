package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// insight is the subset of PostHog's Insight object these handlers use.
// Computed fields (result, columns, hogql, cache data, ...) are deliberately
// not decoded.
type insight struct {
	ID            posthogcfn.FlexID    `json:"id"`
	ShortID       string               `json:"short_id"`
	Name          *string              `json:"name"`
	DerivedName   *string              `json:"derived_name"`
	Description   *string              `json:"description"`
	Query         json.RawMessage      `json:"query"`
	Tags          []string             `json:"tags"`
	Favorited     bool                 `json:"favorited"`
	Dashboards    *[]posthogcfn.FlexID `json:"dashboards"`
	DashboardTile []dashboardTile      `json:"dashboard_tiles"`
	CreatedAt     *string              `json:"created_at"`
	Deleted       bool                 `json:"deleted"`
}

type dashboardTile struct {
	DashboardID posthogcfn.FlexID `json:"dashboard_id"`
	Deleted     *bool             `json:"deleted"`
}

// writeQuery asks PostHog to include the deprecated (but still writable)
// dashboards field, which API-key callers otherwise stop receiving.
var writeQuery = url.Values{"include_dashboards": {"true"}}

// readQuery also pins refresh to force_cache so a read never runs the query.
var readQuery = url.Values{"include_dashboards": {"true"}, "refresh": {"force_cache"}}

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
	return posthogcfn.Path("/api/projects/%s/insights/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/insights/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.Query) == "" {
		return posthogcfn.InvalidRequest("Query is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out insight
	if err := c.Do(ctx, http.MethodPost, collectionPath(projectID), writeQuery, body, &out); err != nil {
		return posthogcfn.FromError("creating insight", err), nil
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
		return posthogcfn.NotFound("insight ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("insight ProjectId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Query) == "" {
		return posthogcfn.InvalidRequest("Query is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted insight succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out insight
	if err := c.Do(ctx, http.MethodPatch, itemPath(projectID, id), writeQuery, body, &out); err != nil {
		return posthogcfn.FromError("updating insight "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Insights
// cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("insight ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting insight "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service. Only saved
// insights are listed, in their basic form (no results).
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list insights"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[insight](ctx, c, collectionPath(projectID), url.Values{"basic": {"true"}, "saved": {"true"}})
	if err != nil {
		return posthogcfn.FromError("listing insights", err), nil
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

// get reads one live insight, mapping a 404 or a soft-deleted insight to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*insight, *handler.ProgressEvent) {
	var out insight
	if err := c.Get(ctx, itemPath(projectID, id), readQuery, &out); err != nil {
		ev := posthogcfn.FromError("reading insight "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("insight %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog (an empty
// dashboards list removes the insight from every dashboard).
func requestBody(m *Model) (map[string]any, error) {
	query, err := posthogcfn.ParseJSON("Query", m.Query)
	if err != nil {
		return nil, err
	}
	if _, ok := query.(map[string]any); !ok {
		return nil, fmt.Errorf("Query must be a JSON object")
	}
	dashboards := make([]int64, 0, len(m.Dashboards))
	for _, d := range m.Dashboards {
		n, ok := posthogcfn.IDInt(&d)
		if !ok {
			return nil, fmt.Errorf("Dashboards must contain numeric dashboard IDs, got %q", d)
		}
		dashboards = append(dashboards, n)
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{
		"name":         m.Name,
		"derived_name": m.DerivedName,
		"description":  posthogcfn.StringValue(m.Description),
		"query":        query,
		"tags":         tags,
		"favorited":    posthogcfn.BoolValue(m.Favorited),
		"dashboards":   dashboards,
	}, nil
}

// fromAPI converts an API insight to the model. desired is the model from the
// request; its Query string is kept when the API value matches it.
func fromAPI(projectID string, a *insight, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:   posthogcfn.String(projectID),
		Id:          a.ID.Ptr(),
		ShortId:     posthogcfn.StringOrNil(a.ShortID),
		Name:        posthogcfn.StringPtrOrNil(a.Name),
		DerivedName: posthogcfn.StringPtrOrNil(a.DerivedName),
		Description: posthogcfn.StringPtrOrNil(a.Description),
		Query:       posthogcfn.PreserveJSONSubset(desired.Query, a.Query),
		Tags:        posthogcfn.SliceOrNil(a.Tags),
		Dashboards:  dashboardIDs(a),
		CreatedAt:   posthogcfn.StringPtrOrNil(a.CreatedAt),
	}
	if a.Favorited || desired.Favorited != nil {
		m.Favorited = posthogcfn.Bool(a.Favorited)
	}
	return m
}

// dashboardIDs returns the dashboards the insight is on: the deprecated
// dashboards field when PostHog sends it, otherwise the live dashboard tiles.
func dashboardIDs(a *insight) []string {
	seen := map[string]bool{}
	var out []string
	add := func(id posthogcfn.FlexID) {
		if s := id.String(); s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	if a.Dashboards != nil {
		for _, id := range *a.Dashboards {
			add(id)
		}
	} else {
		for _, t := range a.DashboardTile {
			if !posthogcfn.BoolValue(t.Deleted) {
				add(t.DashboardID)
			}
		}
	}
	sort.Strings(out)
	return out
}
