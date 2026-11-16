package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// hogFunction is the subset of PostHog's HogFunction object these handlers use.
type hogFunction struct {
	ID             posthogcfn.FlexID          `json:"id"`
	Type           *string                    `json:"type"`
	Name           *string                    `json:"name"`
	Description    string                     `json:"description"`
	Enabled        bool                       `json:"enabled"`
	Hog            string                     `json:"hog"`
	InputsSchema   json.RawMessage            `json:"inputs_schema"`
	Inputs         map[string]json.RawMessage `json:"inputs"`
	Filters        json.RawMessage            `json:"filters"`
	Mappings       json.RawMessage            `json:"mappings"`
	Masking        *apiMasking                `json:"masking"`
	IconURL        *string                    `json:"icon_url"`
	Template       *apiTemplate               `json:"template"`
	ExecutionOrder *int                       `json:"execution_order"`
	CreatedAt      string                     `json:"created_at"`
	UpdatedAt      string                     `json:"updated_at"`
	Deleted        bool                       `json:"deleted"`
}

type apiMasking struct {
	Hash      string `json:"hash"`
	TTL       int    `json:"ttl"`
	Threshold *int   `json:"threshold"`
}

type apiTemplate struct {
	ID string `json:"id"`
}

// inputSchemaItem is the part of an inputs_schema entry used to find secrets.
type inputSchemaItem struct {
	Key    string `json:"key"`
	Secret bool   `json:"secret"`
}

// compiledKeys are fields PostHog computes (bytecode, transpiled code) and
// adds to filters and input values. They are never part of the model.
var compiledKeys = []string{"bytecode", "transpiled", "bytecode_contract", "bytecode_error", "order"}

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
	return posthogcfn.Path("/api/projects/%s/hog_functions/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/hog_functions/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.Type) == "" {
		return posthogcfn.InvalidRequest("Type is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	body["type"] = *currentModel.Type
	if t := posthogcfn.StringValue(currentModel.TemplateId); t != "" {
		body["template_id"] = t
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out hogFunction
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating hog function", err), nil
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
		return posthogcfn.NotFound("hog function ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("hog function ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted function may succeed, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	// type and template_id are create-only and are not sent on update.
	var out hogFunction
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating hog function "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Hog
// functions cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("hog function ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting hog function "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list hog functions"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[hogFunction](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing hog functions", err), nil
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

// get reads one live function, mapping a 404 or a soft-deleted function to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*hogFunction, *handler.ProgressEvent) {
	var out hogFunction
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading hog function "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("hog function %s has been deleted", id)
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

// requestBody validates the model and builds the create/update body.
//
// Every writable field is sent so that properties removed from the template
// are cleared. The exception is a function created from a template: for the
// fields the template provides (code, inputs schema, filters, mappings,
// masking, icon), an omitted property keeps the template's value.
//
// Inputs and SecretInputs are merged into PostHog's single inputs object.
// The secret values are only ever sent, never logged or read back.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	fromTemplate := posthogcfn.StringValue(m.TemplateId) != ""
	if !fromTemplate && posthogcfn.StringValue(m.Hog) == "" {
		return nil, fmt.Errorf("Hog is required unless TemplateId is set")
	}
	inputsSchema, err := parseJSON("InputsSchema", m.InputsSchema, true)
	if err != nil {
		return nil, err
	}
	inputs, err := parseJSON("Inputs", m.Inputs, false)
	if err != nil {
		return nil, err
	}
	secretInputs, err := parseJSON("SecretInputs", m.SecretInputs, false)
	if err != nil {
		// Never echo the secret value in the error message.
		return nil, fmt.Errorf("SecretInputs must be a valid JSON object")
	}
	filters, err := parseJSON("Filters", m.Filters, false)
	if err != nil {
		return nil, err
	}
	mappings, err := parseJSON("Mappings", m.Mappings, true)
	if err != nil {
		return nil, err
	}
	merged, err := mergeInputs(inputs, secretInputs, m.InputsSchema)
	if err != nil {
		return nil, err
	}

	body := map[string]any{
		"name":            posthogcfn.StringValue(m.Name),
		"description":     posthogcfn.StringValue(m.Description),
		"enabled":         posthogcfn.BoolValue(m.Enabled),
		"inputs":          merged,
		"execution_order": m.ExecutionOrder,
	}
	// templated sets a field the template may provide: the template's value
	// is kept when the property is omitted, otherwise it is cleared.
	templated := func(field string, v, clear any, set bool) {
		switch {
		case set:
			body[field] = v
		case !fromTemplate:
			body[field] = clear
		}
	}
	templated("hog", posthogcfn.StringValue(m.Hog), "", m.Hog != nil)
	templated("inputs_schema", inputsSchema, []any{}, inputsSchema != nil)
	templated("filters", filters, map[string]any{}, filters != nil)
	templated("mappings", mappings, nil, mappings != nil)
	templated("icon_url", posthogcfn.StringValue(m.IconUrl), nil, m.IconUrl != nil)
	if mk := m.Masking; mk != nil {
		if posthogcfn.StringValue(mk.Hash) == "" || mk.Ttl == nil {
			return nil, fmt.Errorf("Masking.Hash and Masking.Ttl are required")
		}
		body["masking"] = apiMasking{Hash: *mk.Hash, TTL: *mk.Ttl, Threshold: mk.Threshold}
	} else if !fromTemplate {
		body["masking"] = nil
	}
	return body, nil
}

// mergeInputs combines the non-secret and secret inputs. A key may appear in
// only one of them. When the template declares an inputs schema, secret keys
// must be marked secret there (otherwise PostHog would return their values),
// and keys marked secret must not be in Inputs (they are never read back).
func mergeInputs(inputs, secretInputs any, schemaJSON *string) (map[string]any, error) {
	merged := map[string]any{}
	plain, _ := inputs.(map[string]any)
	secret, _ := secretInputs.(map[string]any)
	for k, v := range plain {
		merged[k] = v
	}
	var secretInSchema map[string]bool
	if schemaJSON != nil {
		var items []inputSchemaItem
		if json.Unmarshal([]byte(*schemaJSON), &items) == nil {
			secretInSchema = map[string]bool{}
			for _, it := range items {
				secretInSchema[it.Key] = it.Secret
			}
		}
	}
	for _, k := range sortedKeys(secret) {
		if _, dup := plain[k]; dup {
			return nil, fmt.Errorf("input %q is set in both Inputs and SecretInputs", k)
		}
		if secretInSchema != nil && !secretInSchema[k] {
			return nil, fmt.Errorf("SecretInputs key %q must be marked \"secret\": true in InputsSchema", k)
		}
		merged[k] = secret[k]
	}
	for _, k := range sortedKeys(plain) {
		if secretInSchema[k] {
			return nil, fmt.Errorf("input %q is marked secret in InputsSchema; set it in SecretInputs", k)
		}
	}
	return merged, nil
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// fromAPI converts an API function to the model. desired is the model from
// the request: JSON strings are kept when everything they set matches the API
// value, server/template defaults are left out unless the template set them,
// and secret inputs are never returned.
func fromAPI(projectID string, a *hogFunction, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	templateID := ""
	if a.Template != nil {
		templateID = a.Template.ID
	}
	if templateID == "" {
		templateID = posthogcfn.StringValue(desired.TemplateId)
	}
	fromTemplate := templateID != ""
	// report says whether a template-provided field belongs in the model:
	// always when the template set it, otherwise only without a template.
	report := func(set bool) bool { return set || !fromTemplate }

	m := &Model{
		ProjectId:   posthogcfn.String(projectID),
		Id:          a.ID.Ptr(),
		Type:        posthogcfn.StringPtrOrNil(a.Type),
		Name:        posthogcfn.StringPtrOrNil(a.Name),
		Description: posthogcfn.StringOrNil(a.Description),
		TemplateId:  posthogcfn.StringOrNil(templateID),
		CreatedAt:   posthogcfn.StringOrNil(a.CreatedAt),
		UpdatedAt:   posthogcfn.StringOrNil(a.UpdatedAt),
	}
	if a.Enabled || desired.Enabled != nil {
		m.Enabled = posthogcfn.Bool(a.Enabled)
	}
	if desired.ExecutionOrder != nil {
		m.ExecutionOrder = a.ExecutionOrder
	}
	if report(desired.Hog != nil) {
		m.Hog = posthogcfn.StringOrNil(a.Hog)
	}
	if report(desired.IconUrl != nil) {
		m.IconUrl = posthogcfn.StringPtrOrNil(a.IconURL)
	}
	if report(desired.InputsSchema != nil) && !posthogcfn.EmptyJSON(a.InputsSchema) {
		m.InputsSchema = posthogcfn.PreserveJSONSubset(desired.InputsSchema, a.InputsSchema)
	}
	if report(desired.Filters != nil) {
		if f := cleanFilters(a.Filters, desired.Filters == nil); f != nil {
			m.Filters = posthogcfn.PreserveJSONSubset(desired.Filters, f)
		}
	}
	if report(desired.Mappings != nil) && !posthogcfn.EmptyJSON(a.Mappings) {
		m.Mappings = posthogcfn.PreserveJSONSubset(desired.Mappings, cleanMappings(a.Mappings))
	}
	if mk := a.Masking; mk != nil && mk.Hash != "" && report(desired.Masking != nil) {
		m.Masking = &Masking{Hash: posthogcfn.String(mk.Hash), Ttl: posthogcfn.Int(mk.TTL), Threshold: mk.Threshold}
	}
	if plain := publicInputs(a, desired); len(plain) > 0 {
		m.Inputs = posthogcfn.PreserveJSONSubset(desired.Inputs, plain)
	}
	return m
}

// publicInputs returns the API inputs without secrets: keys the inputs schema
// marks secret, values PostHog redacts as {"secret": true}, and keys the
// request put in SecretInputs. Compiled fields are stripped from each value.
func publicInputs(a *hogFunction, desired *Model) map[string]any {
	secret := map[string]bool{}
	var schema []inputSchemaItem
	_ = json.Unmarshal(a.InputsSchema, &schema)
	for _, it := range schema {
		if it.Secret {
			secret[it.Key] = true
		}
	}
	if desired.SecretInputs != nil {
		var s map[string]json.RawMessage
		_ = json.Unmarshal([]byte(*desired.SecretInputs), &s)
		for k := range s {
			secret[k] = true
		}
	}
	out := map[string]any{}
	for k, raw := range a.Inputs {
		if secret[k] {
			continue
		}
		var v any
		if json.Unmarshal(raw, &v) != nil || v == nil {
			continue
		}
		if obj, ok := v.(map[string]any); ok {
			if obj["secret"] == true && len(obj) == 1 {
				continue // redacted secret
			}
			stripKeys(obj)
		}
		out[k] = v
	}
	return out
}

// cleanFilters strips compiled fields from the API filters. When the
// template did not set Filters, the default source is dropped as well, and
// nil is returned if nothing else is left.
func cleanFilters(raw json.RawMessage, dropDefaults bool) map[string]any {
	var f map[string]any
	if json.Unmarshal(raw, &f) != nil || f == nil {
		return nil
	}
	stripKeys(f)
	if dropDefaults && f["source"] == "events" {
		delete(f, "source")
	}
	if len(f) == 0 {
		return nil
	}
	return f
}

// cleanMappings strips compiled fields from each mapping's filters and inputs.
func cleanMappings(raw json.RawMessage) any {
	var mappings []map[string]any
	if json.Unmarshal(raw, &mappings) != nil {
		return raw
	}
	for _, mp := range mappings {
		if f, ok := mp["filters"].(map[string]any); ok {
			stripKeys(f)
		}
		if in, ok := mp["inputs"].(map[string]any); ok {
			for _, v := range in {
				if obj, ok := v.(map[string]any); ok {
					stripKeys(obj)
				}
			}
		}
	}
	return mappings
}

func stripKeys(m map[string]any) {
	for _, k := range compiledKeys {
		delete(m, k)
	}
}
