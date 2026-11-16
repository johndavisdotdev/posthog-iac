package resource

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// featureFlag is the subset of PostHog's FeatureFlag object these handlers use.
type featureFlag struct {
	ID                         posthogcfn.FlexID `json:"id"`
	Key                        *string           `json:"key"`
	Name                       string            `json:"name"`
	Filters                    json.RawMessage   `json:"filters"`
	Active                     bool              `json:"active"`
	Archived                   bool              `json:"archived"`
	Tags                       []string          `json:"tags"`
	IsRemoteConfiguration      *bool             `json:"is_remote_configuration"`
	EnsureExperienceContinuity *bool             `json:"ensure_experience_continuity"`
	EvaluationRuntime          *string           `json:"evaluation_runtime"`
	BucketingIdentifier        *string           `json:"bucketing_identifier"`
	Version                    *int              `json:"version"`
	CreatedAt                  string            `json:"created_at"`
	UpdatedAt                  *string           `json:"updated_at"`
	Deleted                    bool              `json:"deleted"`
}

const (
	defaultEvaluationRuntime   = "all"
	defaultBucketingIdentifier = "distinct_id"
)

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
	return posthogcfn.Path("/api/projects/%s/feature_flags/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/feature_flags/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.Key) == "" {
		return posthogcfn.InvalidRequest("Key is required"), nil
	}
	body, err := requestBody(currentModel, true)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out featureFlag
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating feature flag", err), nil
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
		return posthogcfn.NotFound("feature flag ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("feature flag ProjectId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Key) == "" {
		return posthogcfn.InvalidRequest("Key is required"), nil
	}
	body, err := requestBody(currentModel, false)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted flag succeeds, so check it is live first. The
	// read also gives the version PostHog checks for config version 2 flags.
	cur, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	if cur.Version != nil {
		body["version"] = *cur.Version
	}
	var out featureFlag
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating feature flag "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Feature
// flags cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("feature flag ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting feature flag "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list feature flags"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[featureFlag](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing feature flags", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Deleted {
			continue
		}
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr(), Key: items[i].Key})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live flag, mapping a 404 or a soft-deleted flag to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*featureFlag, *handler.ProgressEvent) {
	var out featureFlag
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading feature flag "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("feature flag %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are reset in PostHog. On create,
// unset EvaluationRuntime/BucketingIdentifier are left to the server default.
func requestBody(m *Model, create bool) (map[string]any, error) {
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return nil, err
	}
	if filters == nil {
		filters = map[string]any{"groups": []any{}}
	} else if _, ok := filters.(map[string]any); !ok {
		return nil, errors.New("Filters must be a JSON object")
	}
	active := true
	if m.Active != nil {
		active = *m.Active
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	contexts := m.EvaluationContexts
	if contexts == nil {
		contexts = []string{}
	}
	body := map[string]any{
		"key":                          posthogcfn.StringValue(m.Key),
		"name":                         posthogcfn.StringValue(m.Name),
		"filters":                      filters,
		"active":                       active,
		"archived":                     posthogcfn.BoolValue(m.Archived),
		"tags":                         tags,
		"evaluation_contexts":          contexts,
		"is_remote_configuration":      posthogcfn.BoolValue(m.IsRemoteConfiguration),
		"ensure_experience_continuity": posthogcfn.BoolValue(m.EnsureExperienceContinuity),
	}
	for field, v := range map[string]*string{"evaluation_runtime": m.EvaluationRuntime, "bucketing_identifier": m.BucketingIdentifier} {
		switch {
		case v != nil:
			body[field] = *v
		case !create:
			body[field] = nil
		}
	}
	return body, nil
}

// fromAPI converts an API flag to the model. desired is the model from the
// request; server defaults are left out unless the template set them, and the
// template's Filters string is kept when it is equivalent to the API value.
func fromAPI(projectID string, f *featureFlag, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId: posthogcfn.String(projectID),
		Id:        f.ID.Ptr(),
		Key:       f.Key,
		Name:      posthogcfn.StringOrNil(f.Name),
		Filters:   preserveFilters(desired.Filters, f.Filters),
		Tags:      posthogcfn.SliceOrNil(f.Tags),
		CreatedAt: posthogcfn.StringOrNil(f.CreatedAt),
		UpdatedAt: posthogcfn.StringPtrOrNil(f.UpdatedAt),
		// EvaluationContexts is never returned by PostHog (write-only).
	}
	if !f.Active || desired.Active != nil {
		m.Active = posthogcfn.Bool(f.Active)
	}
	if f.Archived || desired.Archived != nil {
		m.Archived = posthogcfn.Bool(f.Archived)
	}
	m.IsRemoteConfiguration = optionalBool(f.IsRemoteConfiguration, desired.IsRemoteConfiguration)
	m.EnsureExperienceContinuity = optionalBool(f.EnsureExperienceContinuity, desired.EnsureExperienceContinuity)
	m.EvaluationRuntime = optionalString(f.EvaluationRuntime, desired.EvaluationRuntime, defaultEvaluationRuntime)
	m.BucketingIdentifier = optionalString(f.BucketingIdentifier, desired.BucketingIdentifier, defaultBucketingIdentifier)
	return m
}

// optionalBool reports a nullable boolean that defaults to false: only when
// it is true or the template set it.
func optionalBool(api, desired *bool) *bool {
	v := posthogcfn.BoolValue(api)
	if v || desired != nil {
		return posthogcfn.Bool(v)
	}
	return nil
}

// optionalString reports an enum PostHog fills with a default: only when the
// template set it or the value is not the default.
func optionalString(api, desired *string, apiDefault string) *string {
	v := posthogcfn.StringPtrOrNil(api)
	if desired != nil {
		if v == nil {
			return posthogcfn.String(apiDefault)
		}
		return v
	}
	if v == nil || *v == apiDefault {
		return nil
	}
	return v
}

// preserveFilters returns the Filters property for the model. PostHog
// normalizes filters (adding "multivariate": null, "payloads": {}, empty
// property lists and so on), so the template's string is kept when it is
// equal to the API value once null and empty members are ignored. Filters
// with no content at all are reported as unset.
func preserveFilters(desired *string, api json.RawMessage) *string {
	var got any
	if len(api) == 0 || json.Unmarshal(api, &got) != nil {
		return nil
	}
	pruned := pruneFilters(got)
	if pruned == nil {
		return nil
	}
	if desired != nil {
		var want any
		if json.Unmarshal([]byte(*desired), &want) == nil && reflect.DeepEqual(pruneFilters(want), pruned) {
			return desired
		}
	}
	return posthogcfn.ToJSONString(api)
}

// pruneFilters drops members that carry no meaning: nulls, empty objects and
// arrays inside objects, and the false-valued top-level switches. It returns
// nil when nothing is left.
func pruneFilters(v any) any {
	obj, ok := v.(map[string]any)
	if !ok {
		return v
	}
	for _, k := range []string{"early_exit", "feature_enrollment"} {
		if obj[k] == false {
			delete(obj, k)
		}
	}
	out := prune(obj)
	if m, ok := out.(map[string]any); ok && len(m) == 0 {
		return nil
	}
	return out
}

func prune(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, val := range t {
			p := prune(val)
			if isEmpty(p) {
				continue
			}
			out[k] = p
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, val := range t {
			out[i] = prune(val)
		}
		return out
	default:
		return v
	}
}

func isEmpty(v any) bool {
	switch t := v.(type) {
	case nil:
		return true
	case map[string]any:
		return len(t) == 0
	case []any:
		return len(t) == 0
	}
	return false
}
