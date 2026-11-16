package resource

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// alert is the subset of PostHog's ErrorTrackingAlert these handlers use.
type alert struct {
	ID              posthogcfn.FlexID `json:"id"`
	Name            string            `json:"name"`
	Enabled         *bool             `json:"enabled"`
	Triggers        []string          `json:"triggers"`
	Filters         json.RawMessage   `json:"filters"`
	ThrottleSeconds *int              `json:"throttle_seconds"`
	Destinations    []destination     `json:"destinations"`
	CreatedAt       string            `json:"created_at"`
	UpdatedAt       string            `json:"updated_at"`
}

// destination is both the request and (writable subset of the) response
// shape. Delivery state (id, last_delivered_at, last_error, ...) is ignored.
type destination struct {
	ChannelType   string      `json:"channel_type"`
	IntegrationID *int        `json:"integration_id"`
	Config        slackConfig `json:"config"`
}

type slackConfig struct {
	Channel     string `json:"channel"`
	ChannelName string `json:"channel_name,omitempty"`
}

// serverFilterKeys are filter keys PostHog computes on save. They are removed
// from the API value before it is compared with or reported as Filters.
var serverFilterKeys = []string{"bytecode", "bytecode_error"}

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
	return posthogcfn.Path("/api/projects/%s/error_tracking/alerts/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/error_tracking/alerts/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service. The create
// request has no "enabled" field, so a disabled alert is created and then
// disabled with a PATCH.
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
	if currentModel.Filters == nil {
		delete(body, "filters")
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out alert
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating error tracking alert", err), nil
	}
	if currentModel.Enabled != nil && !*currentModel.Enabled {
		id := out.ID.String()
		if err := c.Patch(ctx, itemPath(projectID, id), map[string]any{"enabled": false}, &out); err != nil {
			return posthogcfn.FromError("disabling error tracking alert "+id, err), nil
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
		return posthogcfn.NotFound("error tracking alert ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. PATCH on a
// deleted alert returns 404, which maps to NotFound.
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
		return posthogcfn.NotFound("error tracking alert ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	body["enabled"] = currentModel.Enabled == nil || *currentModel.Enabled
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out alert
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating error tracking alert "+id, err), nil
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
		return posthogcfn.NotFound("error tracking alert ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting error tracking alert "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list error tracking alerts"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[alert](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing error tracking alerts", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*alert, *handler.ProgressEvent) {
	var out alert
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading error tracking alert "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are reset (no filters, no throttle).
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	if len(m.Triggers) == 0 {
		return nil, fmt.Errorf("Triggers must contain at least one trigger")
	}
	if len(m.Destinations) == 0 {
		return nil, fmt.Errorf("Destinations must contain at least one destination")
	}
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return nil, err
	}
	if filters == nil {
		filters = map[string]any{}
	}
	fm, ok := filters.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("Filters must be a JSON object such as {\"properties\": [...]}")
	}
	for _, k := range serverFilterKeys {
		delete(fm, k)
	}
	dests := make([]destination, 0, len(m.Destinations))
	for i, d := range m.Destinations {
		if d.Config == nil || posthogcfn.StringValue(d.Config.Channel) == "" {
			return nil, fmt.Errorf("Destinations[%d].Config.Channel is required", i)
		}
		channelType := posthogcfn.StringValue(d.ChannelType)
		if channelType == "" {
			channelType = "slack"
		}
		dests = append(dests, destination{
			ChannelType:   channelType,
			IntegrationID: d.IntegrationId,
			Config:        slackConfig{Channel: *d.Config.Channel, ChannelName: posthogcfn.StringValue(d.Config.ChannelName)},
		})
	}
	throttle := 0
	if m.ThrottleSeconds != nil {
		throttle = *m.ThrottleSeconds
	}
	return map[string]any{
		"name":             *m.Name,
		"triggers":         m.Triggers,
		"filters":          fm,
		"throttle_seconds": throttle,
		"destinations":     dests,
	}, nil
}

// fromAPI converts an API alert to the model. desired is the model from the
// request: its Filters string is kept when JSON-equal to the API value (minus
// the server-compiled bytecode), and server defaults (enabled, no throttle,
// empty filters) are left out unless the template set them.
func fromAPI(projectID string, a *alert, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId: posthogcfn.String(projectID),
		Id:        a.ID.Ptr(),
		Name:      posthogcfn.StringOrNil(a.Name),
		Triggers:  posthogcfn.SliceOrNil(a.Triggers),
		CreatedAt: posthogcfn.StringOrNil(a.CreatedAt),
		UpdatedAt: posthogcfn.StringOrNil(a.UpdatedAt),
	}
	if a.Enabled != nil && (desired.Enabled != nil || !*a.Enabled) {
		m.Enabled = posthogcfn.Bool(*a.Enabled)
	}
	if a.ThrottleSeconds != nil && (desired.ThrottleSeconds != nil || *a.ThrottleSeconds != 0) {
		m.ThrottleSeconds = posthogcfn.Int(*a.ThrottleSeconds)
	}
	if filters, empty := userFilters(a.Filters); desired.Filters != nil || !empty {
		m.Filters = posthogcfn.PreserveJSON(desired.Filters, filters)
	}
	for _, d := range a.Destinations {
		m.Destinations = append(m.Destinations, Destination{
			ChannelType:   posthogcfn.StringOrNil(d.ChannelType),
			IntegrationId: d.IntegrationID,
			Config: &SlackConfig{
				Channel:     posthogcfn.StringOrNil(d.Config.Channel),
				ChannelName: posthogcfn.StringOrNil(d.Config.ChannelName),
			},
		})
	}
	return m
}

// userFilters returns the API filters without server-computed keys, and
// whether what is left is empty (no keys, or only empty arrays, false and null).
func userFilters(raw json.RawMessage) (map[string]any, bool) {
	var f map[string]any
	if len(raw) == 0 || json.Unmarshal(raw, &f) != nil || f == nil {
		return nil, true
	}
	for _, k := range serverFilterKeys {
		delete(f, k)
	}
	for _, v := range f {
		switch x := v.(type) {
		case nil:
		case bool:
			if x {
				return f, false
			}
		case []any:
			if len(x) > 0 {
				return f, false
			}
		default:
			return f, false
		}
	}
	return f, true
}
