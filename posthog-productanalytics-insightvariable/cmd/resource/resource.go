package resource

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// insightVariable is the subset of PostHog's InsightVariable object these
// handlers use. default_value and values are untyped in the OpenAPI spec.
type insightVariable struct {
	ID                      posthogcfn.FlexID `json:"id"`
	Name                    string            `json:"name"`
	Type                    string            `json:"type"`
	DefaultValue            json.RawMessage   `json:"default_value"`
	Values                  json.RawMessage   `json:"values"`
	IsMulti                 bool              `json:"is_multi"`
	ValuesQuery             *string           `json:"values_query"`
	ValuesQueryConnectionID *string           `json:"values_query_connection_id"`
	CodeName                *string           `json:"code_name"`
	CreatedAt               string            `json:"created_at"`
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
	return posthogcfn.Path("/api/projects/%s/insight_variables/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/insight_variables/%s/", projectID, id)
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

	var out insightVariable
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating SQL variable", err), nil
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
		return posthogcfn.NotFound("SQL variable ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out insightVariable
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading SQL variable "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
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
		return posthogcfn.NotFound("SQL variable ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a deleted variable returns 404, which FromError maps to NotFound.
	var out insightVariable
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating SQL variable "+id, err), nil
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
		return posthogcfn.NotFound("SQL variable ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out insightVariable
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading SQL variable "+id, err), nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting SQL variable "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list SQL variables"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[insightVariable](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing SQL variables", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	typ := posthogcfn.StringValue(m.Type)
	if typ == "" {
		return nil, fmt.Errorf("Type is required")
	}
	def, err := encodeDefault(typ, m.DefaultValue)
	if err != nil {
		return nil, err
	}
	var values any // null clears the list
	if m.Values != nil {
		values = m.Values
	}
	return map[string]any{
		"name":                       posthogcfn.StringValue(m.Name),
		"type":                       typ,
		"default_value":              def,
		"values":                     values,
		"is_multi":                   posthogcfn.BoolValue(m.IsMulti),
		"values_query":               posthogcfn.StringPtrOrNil(m.ValuesQuery),
		"values_query_connection_id": posthogcfn.StringPtrOrNil(m.ValuesQueryConnectionId),
	}, nil
}

// encodeDefault converts the DefaultValue string property into the JSON value
// PostHog stores for the variable type.
func encodeDefault(typ string, v *string) (any, error) {
	if v == nil || *v == "" {
		return nil, nil
	}
	s := *v
	switch typ {
	case "Number":
		var n json.Number
		if err := json.Unmarshal([]byte(strings.TrimSpace(s)), &n); err != nil {
			return nil, fmt.Errorf("DefaultValue must be a number for a Number variable, got %q", s)
		}
		return n, nil
	case "Boolean":
		b, err := strconv.ParseBool(strings.TrimSpace(s))
		if err != nil {
			return nil, fmt.Errorf("DefaultValue must be true or false for a Boolean variable, got %q", s)
		}
		return b, nil
	case "List":
		if strings.HasPrefix(strings.TrimSpace(s), "[") {
			return posthogcfn.ParseJSON("DefaultValue", v)
		}
	}
	return s, nil
}

// decodeDefault converts PostHog's default_value back to the string
// property, keeping the template's spelling when it means the same value.
func decodeDefault(desired *string, raw json.RawMessage) *string {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 || string(t) == "null" {
		return nil
	}
	switch t[0] {
	case '"':
		var s string
		if json.Unmarshal(t, &s) != nil {
			return nil
		}
		return posthogcfn.StringOrNil(s)
	case '[', '{':
		return posthogcfn.PreserveJSON(desired, raw)
	case 't', 'f':
		got := string(t)
		if desired != nil {
			if b, err := strconv.ParseBool(strings.TrimSpace(*desired)); err == nil && strconv.FormatBool(b) == got {
				return desired
			}
		}
		return &got
	default: // number
		got := string(t)
		if desired != nil {
			want, err1 := strconv.ParseFloat(strings.TrimSpace(*desired), 64)
			have, err2 := strconv.ParseFloat(got, 64)
			if err1 == nil && err2 == nil && want == have {
				return desired
			}
		}
		return &got
	}
}

// decodeValues converts PostHog's values list to strings.
func decodeValues(raw json.RawMessage) []string {
	var items []any
	if json.Unmarshal(raw, &items) != nil || len(items) == 0 {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, it := range items {
		if s, ok := it.(string); ok {
			out = append(out, s)
			continue
		}
		b, _ := json.Marshal(it)
		out = append(out, string(b))
	}
	return out
}

// fromAPI converts an API variable to the model. desired is the model from
// the request; server defaults are only reported when the template set them.
func fromAPI(projectID string, v *insightVariable, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:               posthogcfn.String(projectID),
		Id:                      v.ID.Ptr(),
		Name:                    posthogcfn.StringOrNil(v.Name),
		Type:                    posthogcfn.StringOrNil(v.Type),
		DefaultValue:            decodeDefault(desired.DefaultValue, v.DefaultValue),
		Values:                  decodeValues(v.Values),
		ValuesQuery:             posthogcfn.StringPtrOrNil(v.ValuesQuery),
		ValuesQueryConnectionId: posthogcfn.StringPtrOrNil(v.ValuesQueryConnectionID),
		CodeName:                posthogcfn.StringPtrOrNil(v.CodeName),
		CreatedAt:               posthogcfn.StringOrNil(v.CreatedAt),
	}
	if v.IsMulti || desired.IsMulti != nil {
		m.IsMulti = posthogcfn.Bool(v.IsMulti)
	}
	return m
}
