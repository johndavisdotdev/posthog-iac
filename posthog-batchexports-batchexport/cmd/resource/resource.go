package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// PostHog defaults for fields the template may leave out.
const (
	defaultModel    = "events"
	defaultTimezone = "UTC"
)

// secretConfigKeys are destination config fields that hold credentials.
// PostHog strips them from responses; they are also removed here in case an
// API version returns them, so they never reach the model.
var secretConfigKeys = map[string]bool{
	"aws_access_key_id": true, "aws_secret_access_key": true, "aws_session_token": true,
	"password": true, "private_key": true, "private_key_passphrase": true, "private_key_id": true,
	"client_secret": true, "token": true, "connection_string": true, "account_key": true,
	"credentials": true, "secret": true,
}

// batchExport is the subset of PostHog's BatchExport object these handlers use.
type batchExport struct {
	ID              posthogcfn.FlexID `json:"id"`
	Name            string            `json:"name"`
	Model           *string           `json:"model"`
	Destination     apiDestination    `json:"destination"`
	Interval        string            `json:"interval"`
	Paused          bool              `json:"paused"`
	StartAt         *string           `json:"start_at"`
	EndAt           *string           `json:"end_at"`
	HogqlQuery      *string           `json:"hogql_query"`
	HogqlModifiers  json.RawMessage   `json:"hogql_modifiers"`
	PrimaryKey      []string          `json:"primary_key"`
	VersionKey      []string          `json:"version_key"`
	IncrementalMode *string           `json:"incremental_mode"`
	Filters         json.RawMessage   `json:"filters"`
	Timezone        *string           `json:"timezone"`
	OffsetDay       *int              `json:"offset_day"`
	OffsetHour      *int              `json:"offset_hour"`
	CreatedAt       string            `json:"created_at"`
	LastUpdatedAt   string            `json:"last_updated_at"`
}

type apiDestination struct {
	Type        string            `json:"type"`
	Config      json.RawMessage   `json:"config"`
	Integration posthogcfn.FlexID `json:"integration"`
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
	return posthogcfn.Path("/api/projects/%s/batch_exports/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/batch_exports/%s/", projectID, id)
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
	body["paused"] = posthogcfn.BoolValue(currentModel.Paused)
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out batchExport
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating batch export", err), nil
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
		return posthogcfn.NotFound("batch export ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("batch export ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	current, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	if current.Destination.Type != "" && current.Destination.Type != posthogcfn.StringValue(currentModel.DestinationType) {
		return posthogcfn.NotUpdatable("DestinationType cannot be changed (%s to %s)", current.Destination.Type, *currentModel.DestinationType), nil
	}
	if err := c.Patch(ctx, itemPath(projectID, id), body, nil); err != nil {
		return posthogcfn.FromError("updating batch export "+id, err), nil
	}
	// Pausing goes through the dedicated endpoints, which also pause or
	// resume the export's schedule.
	if want := posthogcfn.BoolValue(currentModel.Paused); want != current.Paused {
		action := "unpause"
		if want {
			action = "pause"
		}
		if err := c.Post(ctx, posthogcfn.Path("/api/projects/%s/batch_exports/%s/"+action+"/", projectID, id), map[string]any{}, nil); err != nil {
			return posthogcfn.FromError(action+" batch export "+id, err), nil
		}
	}
	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("batch export ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting batch export "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list batch exports"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[batchExport](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing batch exports", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one batch export, mapping a 404 to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*batchExport, *handler.ProgressEvent) {
	var out batchExport
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading batch export "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// parseJSON decodes a JSON string property and checks that it is an array
// (wantArray) or an object.
func parseJSON(name string, s *string, wantArray bool) (any, error) {
	v, err := posthogcfn.ParseJSON(name, s)
	if err != nil || v == nil {
		return v, err
	}
	if _, isArray := v.([]any); wantArray && !isArray {
		return nil, fmt.Errorf("%s must be a JSON array", name)
	}
	if _, isObject := v.(map[string]any); !wantArray && !isObject {
		return nil, fmt.Errorf("%s must be a JSON object", name)
	}
	return v, nil
}

// requestBody validates the model and builds the create/update body (paused
// is handled by the callers). Writable fields are sent so that properties
// removed from the template are cleared or reset to the PostHog default.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	if posthogcfn.StringValue(m.Interval) == "" {
		return nil, fmt.Errorf("Interval is required")
	}
	if posthogcfn.StringValue(m.DestinationType) == "" {
		return nil, fmt.Errorf("DestinationType is required")
	}
	destination, err := destinationBody(m)
	if err != nil {
		return nil, err
	}
	modifiers, err := parseJSON("HogqlModifiers", m.HogqlModifiers, false)
	if err != nil {
		return nil, err
	}
	filters, err := parseJSON("Filters", m.Filters, true)
	if err != nil {
		return nil, err
	}
	if filters == nil {
		filters = []any{}
	}
	model := posthogcfn.StringValue(m.Model)
	if model == "" {
		model = defaultModel
	}
	body := map[string]any{
		"name":            posthogcfn.StringValue(m.Name),
		"model":           model,
		"interval":        *m.Interval,
		"destination":     destination,
		"hogql_query":     posthogcfn.StringPtrOrNil(m.HogqlQuery),
		"hogql_modifiers": modifiers,
		"primary_key":     posthogcfn.SliceOrNil(m.PrimaryKey),
		"version_key":     posthogcfn.SliceOrNil(m.VersionKey),
		"filters":         filters,
		"timezone":        posthogcfn.StringPtrOrNil(m.Timezone),
		"offset_day":      m.OffsetDay,
		"offset_hour":     m.OffsetHour,
		"start_at":        posthogcfn.StringPtrOrNil(m.StartAt),
		"end_at":          posthogcfn.StringPtrOrNil(m.EndAt),
	}
	// incremental_mode is not nullable in the request schema; it is only
	// sent when set.
	if m.IncrementalMode != nil {
		body["incremental_mode"] = *m.IncrementalMode
	}
	return body, nil
}

// destinationBody merges DestinationConfig and DestinationSecretConfig into
// the destination's config. Secret values are only ever sent: they are never
// logged, echoed in errors or read back.
func destinationBody(m *Model) (map[string]any, error) {
	config, err := parseJSON("DestinationConfig", m.DestinationConfig, false)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, fmt.Errorf("DestinationConfig is required")
	}
	merged := config.(map[string]any)
	if m.DestinationSecretConfig != nil {
		secret, err := parseJSON("DestinationSecretConfig", m.DestinationSecretConfig, false)
		if err != nil {
			return nil, fmt.Errorf("DestinationSecretConfig must be a valid JSON object")
		}
		for k, v := range secret.(map[string]any) {
			if _, dup := merged[k]; dup {
				return nil, fmt.Errorf("destination config field %q is set in both DestinationConfig and DestinationSecretConfig", k)
			}
			merged[k] = v
		}
	}
	for k := range merged {
		if secretConfigKeys[k] && !inSecretConfig(m, k) {
			return nil, fmt.Errorf("destination config field %q is a credential; set it in DestinationSecretConfig", k)
		}
	}
	dest := map[string]any{"type": *m.DestinationType, "config": merged}
	if s := posthogcfn.StringValue(m.DestinationIntegrationId); s != "" {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("DestinationIntegrationId must be a numeric integration ID")
		}
		dest["integration_id"] = n
	}
	return dest, nil
}

func inSecretConfig(m *Model, key string) bool {
	if m.DestinationSecretConfig == nil {
		return false
	}
	var s map[string]json.RawMessage
	_ = json.Unmarshal([]byte(*m.DestinationSecretConfig), &s)
	_, ok := s[key]
	return ok
}

// fromAPI converts an API batch export to the model. desired is the model
// from the request: JSON strings and timestamps are kept when equivalent to
// the API value, server defaults are left out unless the template set them,
// and destination credentials are never returned.
func fromAPI(projectID string, a *batchExport, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:                posthogcfn.String(projectID),
		Id:                       a.ID.Ptr(),
		Name:                     posthogcfn.StringOrNil(a.Name),
		Interval:                 posthogcfn.StringOrNil(a.Interval),
		DestinationType:          posthogcfn.StringOrNil(a.Destination.Type),
		DestinationIntegrationId: a.Destination.Integration.Ptr(),
		HogqlQuery:               posthogcfn.StringPtrOrNil(a.HogqlQuery),
		PrimaryKey:               posthogcfn.SliceOrNil(a.PrimaryKey),
		VersionKey:               posthogcfn.SliceOrNil(a.VersionKey),
		IncrementalMode:          posthogcfn.StringPtrOrNil(a.IncrementalMode),
		OffsetDay:                a.OffsetDay,
		OffsetHour:               a.OffsetHour,
		StartAt:                  sameTime(desired.StartAt, a.StartAt),
		EndAt:                    sameTime(desired.EndAt, a.EndAt),
		CreatedAt:                posthogcfn.StringOrNil(a.CreatedAt),
		LastUpdatedAt:            posthogcfn.StringOrNil(a.LastUpdatedAt),
	}
	if v := posthogcfn.StringPtrOrNil(a.Model); v != nil && (*v != defaultModel || desired.Model != nil) {
		m.Model = v
	}
	if v := posthogcfn.StringPtrOrNil(a.Timezone); v != nil && (*v != defaultTimezone || desired.Timezone != nil) {
		m.Timezone = v
	}
	if a.Paused || desired.Paused != nil {
		m.Paused = posthogcfn.Bool(a.Paused)
	}
	if !posthogcfn.EmptyJSON(a.HogqlModifiers) {
		m.HogqlModifiers = posthogcfn.PreserveJSONSubset(desired.HogqlModifiers, a.HogqlModifiers)
	}
	if !posthogcfn.EmptyJSON(a.Filters) {
		m.Filters = posthogcfn.PreserveJSONSubset(desired.Filters, a.Filters)
	}
	if config := publicConfig(a.Destination.Config, desired); len(config) > 0 {
		m.DestinationConfig = posthogcfn.PreserveJSONSubset(desired.DestinationConfig, config)
	}
	return m
}

// publicConfig returns the destination config without credentials: known
// secret fields (at any depth, e.g. Redshift copy_inputs) and any field the
// request put in DestinationSecretConfig.
func publicConfig(raw json.RawMessage, desired *Model) map[string]any {
	var config map[string]any
	if json.Unmarshal(raw, &config) != nil {
		return nil
	}
	requested := map[string]json.RawMessage{}
	if desired.DestinationSecretConfig != nil {
		_ = json.Unmarshal([]byte(*desired.DestinationSecretConfig), &requested)
	}
	for k := range requested {
		delete(config, k)
	}
	stripSecrets(config)
	return config
}

func stripSecrets(v any) {
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			if secretConfigKeys[k] {
				delete(t, k)
				continue
			}
			stripSecrets(child)
		}
	case []any:
		for _, child := range t {
			stripSecrets(child)
		}
	}
}

// sameTime returns the template's timestamp when it denotes the same instant
// as the API's (PostHog may reformat it), otherwise the API value.
func sameTime(desired, api *string) *string {
	api = posthogcfn.StringPtrOrNil(api)
	if api == nil || desired == nil {
		return api
	}
	d, err1 := time.Parse(time.RFC3339, *desired)
	a, err2 := time.Parse(time.RFC3339, *api)
	if err1 == nil && err2 == nil && d.Equal(a) {
		return desired
	}
	return api
}
