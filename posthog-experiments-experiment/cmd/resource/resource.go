package resource

import (
	"context"
	"encoding/json"
	"net/url"
	"sort"
	"strconv"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// experiment is the subset of PostHog's Experiment object these handlers use.
// Results, health and other computed fields are never read.
type experiment struct {
	ID             posthogcfn.FlexID `json:"id"`
	Name           *string           `json:"name"`
	Description    *string           `json:"description"`
	FeatureFlagKey *string           `json:"feature_flag_key"`
	FeatureFlag    *struct {
		ID posthogcfn.FlexID `json:"id"`
	} `json:"feature_flag"`
	FeatureFlagRuleID *string `json:"feature_flag_rule_id"`
	HoldoutID         *int64  `json:"holdout_id"`
	Holdout           *struct {
		ID posthogcfn.FlexID `json:"id"`
	} `json:"holdout"`
	Type                  *string           `json:"type"`
	StartDate             *string           `json:"start_date"`
	EndDate               *string           `json:"end_date"`
	Parameters            json.RawMessage   `json:"parameters"`
	ExposureCriteria      json.RawMessage   `json:"exposure_criteria"`
	Metrics               json.RawMessage   `json:"metrics"`
	MetricsSecondary      json.RawMessage   `json:"metrics_secondary"`
	StatsConfig           json.RawMessage   `json:"stats_config"`
	SavedMetrics          []savedMetricLink `json:"saved_metrics"`
	ExcludedVariants      []string          `json:"excluded_variants"`
	Archived              bool              `json:"archived"`
	Deleted               *bool             `json:"deleted"`
	Conclusion            *string           `json:"conclusion"`
	ConclusionComment     *string           `json:"conclusion_comment"`
	Repository            *string           `json:"repository"`
	OnlyCountMaturedUsers *bool             `json:"only_count_matured_users"`
	Tags                  []string          `json:"tags"`
	Status                *string           `json:"status"`
	CreatedAt             string            `json:"created_at"`
	UpdatedAt             string            `json:"updated_at"`
}

// savedMetricLink is one entry of the experiment's read-only saved_metrics.
type savedMetricLink struct {
	SavedMetric posthogcfn.FlexID `json:"saved_metric"`
	Metadata    struct {
		Type string `json:"type"`
	} `json:"metadata"`
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
	return posthogcfn.Path("/api/projects/%s/experiments/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/experiments/%s/", projectID, id)
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
	if posthogcfn.StringValue(currentModel.FeatureFlagKey) == "" {
		return posthogcfn.InvalidRequest("FeatureFlagKey is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	body["feature_flag_key"] = posthogcfn.StringValue(currentModel.FeatureFlagKey)
	flag, err := posthogcfn.ParseJSON("FeatureFlag", currentModel.FeatureFlag)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if flag != nil {
		body["feature_flag"] = flag
	}
	if v := posthogcfn.StringValue(currentModel.FeatureFlagRuleId); v != "" {
		body["feature_flag_rule_id"] = v
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out experiment
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating experiment", err), nil
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
		return posthogcfn.NotFound("experiment ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("experiment ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted experiment succeeds, so check it is live first.
	current, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	if k := posthogcfn.StringValue(currentModel.FeatureFlagKey); k != "" && k != posthogcfn.StringValue(current.FeatureFlagKey) {
		return posthogcfn.NotUpdatable("FeatureFlagKey cannot be changed"), nil
	}
	var out experiment
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating experiment "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Experiments
// cannot be hard-deleted (DELETE returns 405); they are soft-deleted. The
// linked feature flag is left in place.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("experiment ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting experiment "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service. The list
// endpoint hides archived experiments by default, so archived ones are read
// with a second query.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list experiments"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	seen := map[string]bool{}
	models := []Model{}
	for _, q := range []url.Values{nil, {"archived": {"true"}}} {
		items, err := posthogcfn.List[experiment](ctx, c, collectionPath(projectID), q)
		if err != nil {
			return posthogcfn.FromError("listing experiments", err), nil
		}
		for i := range items {
			id := items[i].ID.String()
			if posthogcfn.BoolValue(items[i].Deleted) || id == "" || seen[id] {
				continue
			}
			seen[id] = true
			models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
		}
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live experiment, mapping a 404 or a soft-deleted experiment
// to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*experiment, *handler.ProgressEvent) {
	var out experiment
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading experiment "+id, err)
		return nil, &ev
	}
	if posthogcfn.BoolValue(out.Deleted) {
		ev := posthogcfn.NotFound("experiment %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable, updatable field
// is sent so that properties removed from the template are cleared.
// Create-only fields are added by Create.
func requestBody(m *Model) (map[string]any, error) {
	body := map[string]any{
		"name":                     posthogcfn.StringValue(m.Name),
		"description":              posthogcfn.StringValue(m.Description),
		"type":                     posthogcfn.StringValue(m.Type),
		"start_date":               posthogcfn.StringPtrOrNil(m.StartDate),
		"end_date":                 posthogcfn.StringPtrOrNil(m.EndDate),
		"archived":                 posthogcfn.BoolValue(m.Archived),
		"conclusion":               posthogcfn.StringPtrOrNil(m.Conclusion),
		"conclusion_comment":       posthogcfn.StringValue(m.ConclusionComment),
		"repository":               posthogcfn.StringPtrOrNil(m.Repository),
		"only_count_matured_users": posthogcfn.BoolValue(m.OnlyCountMaturedUsers),
		"allow_unknown_events":     posthogcfn.BoolValue(m.AllowUnknownEvents),
	}
	if m.Type == nil {
		// PostHog chooses the default type; don't overwrite it with "".
		delete(body, "type")
	}
	holdout, err := idOrNil("HoldoutId", m.HoldoutId)
	if err != nil {
		return nil, err
	}
	body["holdout_id"] = holdout

	for _, f := range []struct {
		name, field string
		value       *string
	}{
		{"Parameters", "parameters", m.Parameters},
		{"ExposureCriteria", "exposure_criteria", m.ExposureCriteria},
		{"Metrics", "metrics", m.Metrics},
		{"MetricsSecondary", "metrics_secondary", m.MetricsSecondary},
		{"StatsConfig", "stats_config", m.StatsConfig},
	} {
		v, err := posthogcfn.ParseJSON(f.name, f.value)
		if err != nil {
			return nil, err
		}
		if v == nil {
			// Clear removed properties: empty metric lists, empty stats
			// config (PostHog defaults), null for the nullable objects.
			switch f.field {
			case "metrics", "metrics_secondary":
				v = []any{}
			case "stats_config":
				v = map[string]any{}
			}
		}
		body[f.field] = v
	}

	saved := make([]map[string]any, 0, len(m.SavedMetrics))
	for i, s := range m.SavedMetrics {
		id, err := idOrNil("SavedMetrics["+strconv.Itoa(i)+"].Id", s.Id)
		if err != nil {
			return nil, err
		}
		if id == nil {
			return nil, &invalidID{name: "SavedMetrics[" + strconv.Itoa(i) + "].Id"}
		}
		saved = append(saved, map[string]any{"id": id, "metadata": map[string]any{"type": posthogcfn.StringValue(s.Type)}})
	}
	body["saved_metrics_ids"] = saved

	excluded := m.ExcludedVariants
	if excluded == nil {
		excluded = []string{}
	}
	body["excluded_variants"] = excluded
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	body["tags"] = tags
	return body, nil
}

// fromAPI converts an API experiment to the model. desired is the model from
// the request: write-only and create-only inputs the API does not echo are
// copied from it, and its JSON strings are kept when the API value contains
// them.
func fromAPI(projectID string, e *experiment, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:             posthogcfn.String(projectID),
		Id:                    e.ID.Ptr(),
		Name:                  e.Name,
		Description:           posthogcfn.StringPtrOrNil(e.Description),
		FeatureFlagKey:        e.FeatureFlagKey,
		FeatureFlagRuleId:     posthogcfn.StringPtrOrNil(e.FeatureFlagRuleID),
		Type:                  optString(e.Type, desired.Type, "product"),
		StartDate:             posthogcfn.StringPtrOrNil(e.StartDate),
		EndDate:               posthogcfn.StringPtrOrNil(e.EndDate),
		Parameters:            parametersOut(desired.Parameters, e.Parameters),
		ExposureCriteria:      defaultedJSONOut(desired.ExposureCriteria, e.ExposureCriteria),
		Metrics:               jsonOut(desired.Metrics, e.Metrics),
		MetricsSecondary:      jsonOut(desired.MetricsSecondary, e.MetricsSecondary),
		StatsConfig:           defaultedJSONOut(desired.StatsConfig, e.StatsConfig),
		ExcludedVariants:      posthogcfn.SliceOrNil(e.ExcludedVariants),
		Archived:              optBool(e.Archived, desired.Archived),
		Conclusion:            posthogcfn.StringPtrOrNil(e.Conclusion),
		ConclusionComment:     posthogcfn.StringPtrOrNil(e.ConclusionComment),
		Repository:            posthogcfn.StringPtrOrNil(e.Repository),
		OnlyCountMaturedUsers: optBoolPtr(e.OnlyCountMaturedUsers, desired.OnlyCountMaturedUsers),
		Tags:                  posthogcfn.SliceOrNil(e.Tags),
		Status:                posthogcfn.StringPtrOrNil(e.Status),
		CreatedAt:             posthogcfn.StringOrNil(e.CreatedAt),
		UpdatedAt:             posthogcfn.StringOrNil(e.UpdatedAt),
	}
	if e.FeatureFlag != nil {
		m.FeatureFlagId = e.FeatureFlag.ID.Ptr()
	}
	switch {
	case e.HoldoutID != nil:
		m.HoldoutId = intIDPtr(e.HoldoutID)
	case e.Holdout != nil:
		m.HoldoutId = e.Holdout.ID.Ptr()
	}
	for _, s := range e.SavedMetrics {
		m.SavedMetrics = append(m.SavedMetrics, SavedMetricLink{
			Id:   s.SavedMetric.Ptr(),
			Type: posthogcfn.StringOrNil(s.Metadata.Type),
		})
	}
	sort.Slice(m.SavedMetrics, func(i, j int) bool {
		return posthogcfn.StringValue(m.SavedMetrics[i].Id) < posthogcfn.StringValue(m.SavedMetrics[j].Id)
	})
	return m
}

// flagProjectedParameters are the keys PostHog projects from the linked
// feature flag into parameters on read. They are not experiment settings, so
// they are ignored when the template does not set Parameters.
var flagProjectedParameters = []string{
	"feature_flag_variants", "rollout_percentage", "aggregation_group_type_index",
	"ensure_experience_continuity", "payloads",
}

// parametersOut reports parameters. When the template set Parameters, its
// string is kept if the API value contains it. When it did not, the keys
// PostHog projects from the flag (and null values) are dropped and the rest is
// reported only if anything is left.
func parametersOut(desired *string, raw json.RawMessage) *string {
	if posthogcfn.EmptyJSON(raw) {
		return nil
	}
	if desired != nil {
		return posthogcfn.PreserveJSONSubset(desired, raw)
	}
	var obj map[string]any
	if json.Unmarshal(raw, &obj) != nil {
		return posthogcfn.ToJSONString(raw)
	}
	for _, k := range flagProjectedParameters {
		delete(obj, k)
	}
	for k, v := range obj {
		if v == nil {
			delete(obj, k)
		}
	}
	if len(obj) == 0 {
		return nil
	}
	return posthogcfn.ToJSONString(obj)
}
