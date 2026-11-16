package resource

import (
	"context"
	"strconv"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// earlyAccessFeature is the subset of PostHog's EarlyAccessFeature object
// these handlers use.
type earlyAccessFeature struct {
	ID               posthogcfn.FlexID `json:"id"`
	Name             *string           `json:"name"`
	Description      string            `json:"description"`
	Stage            *string           `json:"stage"`
	DocumentationURL string            `json:"documentation_url"`
	ImageURL         string            `json:"image_url"`
	FeatureFlag      *linkedFlag       `json:"feature_flag"`
	CreatedAt        string            `json:"created_at"`
}

type linkedFlag struct {
	ID  posthogcfn.FlexID `json:"id"`
	Key string            `json:"key"`
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
	return posthogcfn.Path("/api/projects/%s/early_access_feature/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/early_access_feature/%s/", projectID, id)
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
	if fail := validate(currentModel); fail != nil {
		return *fail, nil
	}
	body := updateBody(currentModel)
	if currentModel.FeatureFlagId != nil {
		flagID, ok := posthogcfn.IDInt(currentModel.FeatureFlagId)
		if !ok {
			return posthogcfn.InvalidRequest("FeatureFlagId must be a numeric feature flag ID"), nil
		}
		body["feature_flag_id"] = flagID
	}
	payload, err := posthogcfn.ParseJSON("Payload", currentModel.Payload)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if payload != nil {
		body["payload"] = payload
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out earlyAccessFeature
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating early access feature", err), nil
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
		return posthogcfn.NotFound("early access feature ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("early access feature ProjectId and Id must be set"), nil
	}
	if fail := validate(currentModel); fail != nil {
		return *fail, nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	cur, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	// The linked flag and payload are only accepted on create.
	if want, ok := posthogcfn.IDInt(currentModel.FeatureFlagId); ok && cur.FeatureFlag != nil && strconv.FormatInt(want, 10) != cur.FeatureFlag.ID.String() {
		return posthogcfn.NotUpdatable("FeatureFlagId can only be set on create"), nil
	}
	var out earlyAccessFeature
	if err := c.Patch(ctx, itemPath(projectID, id), updateBody(currentModel), &out); err != nil {
		return posthogcfn.FromError("updating early access feature "+id, err), nil
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
		return posthogcfn.NotFound("early access feature ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting early access feature "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list early access features"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[earlyAccessFeature](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing early access features", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one early access feature, mapping a 404 to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*earlyAccessFeature, *handler.ProgressEvent) {
	var out earlyAccessFeature
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading early access feature "+id, err)
		return nil, &ev
	}
	return &out, nil
}

func validate(m *Model) *handler.ProgressEvent {
	var ev handler.ProgressEvent
	switch {
	case posthogcfn.StringValue(m.Name) == "":
		ev = posthogcfn.InvalidRequest("Name is required")
	case posthogcfn.StringValue(m.Stage) == "":
		ev = posthogcfn.InvalidRequest("Stage is required")
	default:
		return nil
	}
	return &ev
}

// updateBody builds the fields accepted on both create and update. Every one
// is sent so that properties removed from the template are cleared.
func updateBody(m *Model) map[string]any {
	return map[string]any{
		"name":              posthogcfn.StringValue(m.Name),
		"description":       posthogcfn.StringValue(m.Description),
		"stage":             posthogcfn.StringValue(m.Stage),
		"documentation_url": posthogcfn.StringValue(m.DocumentationUrl),
		"image_url":         posthogcfn.StringValue(m.ImageUrl),
	}
}

// fromAPI converts an API early access feature to the model. FeatureFlagId is
// create-only input, so it is reported only when the template set it (the
// backing flag is always available as LinkedFeatureFlagId). Payload is
// write-only and never returned.
func fromAPI(projectID string, f *earlyAccessFeature, desired *Model) *Model {
	m := &Model{
		ProjectId:        posthogcfn.String(projectID),
		Id:               f.ID.Ptr(),
		Name:             f.Name,
		Description:      posthogcfn.StringOrNil(f.Description),
		Stage:            f.Stage,
		DocumentationUrl: posthogcfn.StringOrNil(f.DocumentationURL),
		ImageUrl:         posthogcfn.StringOrNil(f.ImageURL),
		CreatedAt:        posthogcfn.StringOrNil(f.CreatedAt),
	}
	if f.FeatureFlag != nil {
		m.LinkedFeatureFlagId = f.FeatureFlag.ID.Ptr()
		m.FeatureFlagKey = posthogcfn.StringOrNil(f.FeatureFlag.Key)
		if desired != nil && desired.FeatureFlagId != nil {
			// Keep the template's spelling when it is the same number.
			if n, ok := posthogcfn.IDInt(desired.FeatureFlagId); ok && strconv.FormatInt(n, 10) == f.FeatureFlag.ID.String() {
				m.FeatureFlagId = desired.FeatureFlagId
			} else {
				m.FeatureFlagId = f.FeatureFlag.ID.Ptr()
			}
		}
	}
	return m
}
