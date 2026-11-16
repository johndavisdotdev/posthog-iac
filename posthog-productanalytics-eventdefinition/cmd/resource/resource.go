package resource

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// eventDefinition is the subset of PostHog's EnterpriseEventDefinition object
// these handlers use. Usage statistics (last_seen_at, volumes, ...) are left out.
type eventDefinition struct {
	ID              posthogcfn.FlexID `json:"id"`
	Name            string            `json:"name"`
	Owner           json.RawMessage   `json:"owner"`
	Description     *string           `json:"description"`
	Tags            []string          `json:"tags"`
	Verified        bool              `json:"verified"`
	Hidden          *bool             `json:"hidden"`
	EnforcementMode string            `json:"enforcement_mode"`
	PrimaryProperty *string           `json:"primary_property"`
	PostToSlack     bool              `json:"post_to_slack"`
	DefaultColumns  []string          `json:"default_columns"`
	CreatedAt       *string           `json:"created_at"`
}

// ownerID returns the owner's user ID. Responses carry the owner as a user
// object ({"id": 1, ...}); a bare ID is accepted too.
func (e *eventDefinition) ownerID() *string {
	raw := strings.TrimSpace(string(e.Owner))
	if raw == "" || raw == "null" {
		return nil
	}
	var id posthogcfn.FlexID
	if strings.HasPrefix(raw, "{") {
		var u struct {
			ID posthogcfn.FlexID `json:"id"`
		}
		if json.Unmarshal(e.Owner, &u) != nil {
			return nil
		}
		id = u.ID
	} else if json.Unmarshal(e.Owner, &id) != nil {
		return nil
	}
	return id.Ptr()
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
	return posthogcfn.Path("/api/projects/%s/event_definitions/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/event_definitions/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service. Event
// definitions are usually created automatically when PostHog ingests an event
// for the first time; if one with this name exists, Create fails with
// AlreadyExists (import it into the stack instead).
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required"), nil
	}
	name := posthogcfn.StringValue(currentModel.Name)
	if name == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	body["name"] = name
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	existing, err := posthogcfn.Find[eventDefinition](ctx, c, collectionPath(projectID), url.Values{"names": {name}},
		func(e *eventDefinition) bool { return e.Name == name })
	if err != nil {
		return posthogcfn.FromError("looking up event definition "+name, err), nil
	}
	if existing != nil {
		return posthogcfn.AlreadyExists("event definition %q already exists in project %s with Id %s (it may have been created by event ingestion); import it instead", name, projectID, existing.ID), nil
	}

	var out eventDefinition
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		if isNameConflict(err) {
			return posthogcfn.AlreadyExists("event definition %q already exists in project %s: %v", name, projectID, err), nil
		}
		return posthogcfn.FromError("creating event definition", err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// isNameConflict reports whether a create error is PostHog refusing a
// duplicate name (409, or a 400 unique-constraint validation error).
func isNameConflict(err error) bool {
	switch posthogcfn.StatusCode(err) {
	case http.StatusConflict:
		return true
	case http.StatusBadRequest:
		msg := strings.ToLower(err.Error())
		return strings.Contains(msg, "unique") || strings.Contains(msg, "already exists")
	}
	return false
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("event definition ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("event definition ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH returns 404 for a missing event definition, which maps to NotFound.
	var out eventDefinition
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating event definition "+id, err), nil
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
		return posthogcfn.NotFound("event definition ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting event definition "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list event definitions"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[eventDefinition](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing event definitions", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{
			ProjectId: posthogcfn.String(projectID),
			Id:        items[i].ID.Ptr(),
			Name:      posthogcfn.StringOrNil(items[i].Name),
		})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*eventDefinition, *handler.ProgressEvent) {
	var out eventDefinition
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading event definition "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body (without name, which is
// create-only). Every writable field is sent so that properties removed from
// the template are cleared in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	var owner any
	if posthogcfn.StringValue(m.Owner) != "" {
		n, ok := posthogcfn.IDInt(m.Owner)
		if !ok {
			return nil, &validationError{"Owner must be a numeric user ID"}
		}
		owner = n
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	columns := m.DefaultColumns
	if columns == nil {
		columns = []string{}
	}
	mode := posthogcfn.StringValue(m.EnforcementMode)
	if mode == "" {
		mode = "allow"
	}
	return map[string]any{
		"description":      posthogcfn.StringValue(m.Description),
		"tags":             tags,
		"owner":            owner,
		"verified":         posthogcfn.BoolValue(m.Verified),
		"hidden":           posthogcfn.BoolValue(m.Hidden),
		"enforcement_mode": mode,
		"primary_property": posthogcfn.StringPtrOrNil(m.PrimaryProperty),
		"post_to_slack":    posthogcfn.BoolValue(m.PostToSlack),
		"default_columns":  columns,
	}, nil
}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }

// fromAPI converts an API event definition to the model. Server defaults
// (false booleans, enforcement mode "allow") are reported only when the
// template set the property, so an omitted property does not show as drift.
func fromAPI(projectID string, e *eventDefinition, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:       posthogcfn.String(projectID),
		Id:              e.ID.Ptr(),
		Name:            posthogcfn.StringOrNil(e.Name),
		Description:     posthogcfn.StringPtrOrNil(e.Description),
		Tags:            posthogcfn.SliceOrNil(e.Tags),
		Owner:           e.ownerID(),
		PrimaryProperty: posthogcfn.StringPtrOrNil(e.PrimaryProperty),
		DefaultColumns:  posthogcfn.SliceOrNil(e.DefaultColumns),
		CreatedAt:       posthogcfn.StringPtrOrNil(e.CreatedAt),
	}
	if e.Verified || desired.Verified != nil {
		m.Verified = posthogcfn.Bool(e.Verified)
	}
	hidden := posthogcfn.BoolValue(e.Hidden)
	if hidden || desired.Hidden != nil {
		m.Hidden = posthogcfn.Bool(hidden)
	}
	if e.PostToSlack || desired.PostToSlack != nil {
		m.PostToSlack = posthogcfn.Bool(e.PostToSlack)
	}
	if e.EnforcementMode != "" && (e.EnforcementMode != "allow" || desired.EnforcementMode != nil) {
		m.EnforcementMode = posthogcfn.String(e.EnforcementMode)
	}
	return m
}
