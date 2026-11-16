package resource

import (
	"context"
	"fmt"
	"time"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// annotation is the subset of PostHog's Annotation object these handlers use.
type annotation struct {
	ID                    posthogcfn.FlexID `json:"id"`
	Content               *string           `json:"content"`
	DateMarker            *string           `json:"date_marker"`
	CreationType          string            `json:"creation_type"`
	DashboardItem         posthogcfn.FlexID `json:"dashboard_item"`
	DashboardID           posthogcfn.FlexID `json:"dashboard_id"`
	Scope                 string            `json:"scope"`
	Emoji                 *string           `json:"emoji"`
	HiddenInUserInterface *bool             `json:"hidden_in_user_interface"`
	CreatedAt             *string           `json:"created_at"`
	UpdatedAt             string            `json:"updated_at"`
	Deleted               bool              `json:"deleted"`
}

// defaultCreationType is what PostHog stores when creation_type is omitted.
const defaultCreationType = "USR"

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
	return posthogcfn.Path("/api/projects/%s/annotations/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/annotations/%s/", projectID, id)
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
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out annotation
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating annotation", err), nil
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
		return posthogcfn.NotFound("annotation ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("annotation ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted annotation succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out annotation
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating annotation "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
// Annotations cannot be hard-deleted (DELETE returns 405); they are
// soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("annotation ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting annotation "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list annotations"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[annotation](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing annotations", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Deleted {
			continue
		}
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live annotation, mapping a 404 or a soft-deleted annotation
// to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*annotation, *handler.ProgressEvent) {
	var out annotation
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading annotation "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("annotation %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Content) == "" {
		return nil, fmt.Errorf("Content is required")
	}
	if _, ok := parseTime(posthogcfn.StringValue(m.DateMarker)); !ok {
		return nil, fmt.Errorf("DateMarker must be an ISO 8601 timestamp such as 2026-05-01T12:00:00Z, got %q", posthogcfn.StringValue(m.DateMarker))
	}
	if posthogcfn.StringValue(m.Scope) == "" {
		return nil, fmt.Errorf("Scope is required")
	}
	insight, err := optionalID("DashboardItem", m.DashboardItem)
	if err != nil {
		return nil, err
	}
	dashboard, err := optionalID("DashboardId", m.DashboardId)
	if err != nil {
		return nil, err
	}
	creationType := posthogcfn.StringValue(m.CreationType)
	if creationType == "" {
		creationType = defaultCreationType
	}
	return map[string]any{
		"content":                  posthogcfn.StringValue(m.Content),
		"date_marker":              posthogcfn.StringValue(m.DateMarker),
		"creation_type":            creationType,
		"scope":                    posthogcfn.StringValue(m.Scope),
		"dashboard_item":           insight,
		"dashboard_id":             dashboard,
		"emoji":                    posthogcfn.StringPtrOrNil(m.Emoji),
		"hidden_in_user_interface": m.HiddenInUserInterface,
	}, nil
}

// optionalID converts a string ID property to the integer PostHog expects,
// or nil when it is unset.
func optionalID(name string, id *string) (any, error) {
	if posthogcfn.StringValue(id) == "" {
		return nil, nil
	}
	n, ok := posthogcfn.IDInt(id)
	if !ok {
		return nil, fmt.Errorf("%s must be a numeric PostHog ID, got %q", name, *id)
	}
	return n, nil
}

// fromAPI converts an API annotation to the model. desired is the model from
// the request: its DateMarker spelling is kept when it denotes the same
// instant, and server defaults are only reported when the template set them.
func fromAPI(projectID string, a *annotation, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:     posthogcfn.String(projectID),
		Id:            a.ID.Ptr(),
		Content:       posthogcfn.StringPtrOrNil(a.Content),
		DateMarker:    posthogcfn.StringPtrOrNil(a.DateMarker),
		Scope:         posthogcfn.StringOrNil(a.Scope),
		DashboardItem: a.DashboardItem.Ptr(),
		DashboardId:   a.DashboardID.Ptr(),
		Emoji:         posthogcfn.StringPtrOrNil(a.Emoji),
		CreatedAt:     posthogcfn.StringPtrOrNil(a.CreatedAt),
		UpdatedAt:     posthogcfn.StringOrNil(a.UpdatedAt),
	}
	if m.DateMarker != nil && desired.DateMarker != nil {
		want, ok1 := parseTime(*desired.DateMarker)
		got, ok2 := parseTime(*m.DateMarker)
		if ok1 && ok2 && want.Equal(got) {
			m.DateMarker = desired.DateMarker
		}
	}
	if a.CreationType != "" && (a.CreationType != defaultCreationType || desired.CreationType != nil) {
		m.CreationType = posthogcfn.String(a.CreationType)
	}
	if a.HiddenInUserInterface != nil && (*a.HiddenInUserInterface || desired.HiddenInUserInterface != nil) {
		m.HiddenInUserInterface = posthogcfn.Bool(*a.HiddenInUserInterface)
	}
	return m
}

var timeLayouts = []string{
	time.RFC3339Nano,
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02T15:04Z07:00",
	"2006-01-02T15:04",
	"2006-01-02",
}

// parseTime parses the ISO 8601 forms PostHog accepts for date_marker.
// Timestamps without a zone are taken as UTC.
func parseTime(s string) (time.Time, bool) {
	for _, layout := range timeLayouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
