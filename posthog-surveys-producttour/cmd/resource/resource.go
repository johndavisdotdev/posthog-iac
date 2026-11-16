package resource

import (
	"context"
	"encoding/json"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// productTour is the subset of PostHog's ProductTour object (GET response)
// these handlers use.
type productTour struct {
	ID                    posthogcfn.FlexID `json:"id"`
	Name                  *string           `json:"name"`
	Description           *string           `json:"description"`
	Content               json.RawMessage   `json:"content"`
	TargetingFlagFilters  json.RawMessage   `json:"targeting_flag_filters"`
	LinkedFlag            *flagRef          `json:"linked_flag"`
	InternalTargetingFlag *flagRef          `json:"internal_targeting_flag"`
	AutoLaunch            bool              `json:"auto_launch"`
	StartDate             *string           `json:"start_date"`
	EndDate               *string           `json:"end_date"`
	Archived              bool              `json:"archived"`
	CreatedAt             string            `json:"created_at"`
	UpdatedAt             string            `json:"updated_at"`
}

// flagRef is the part of a MinimalFeatureFlag the handlers read.
type flagRef struct {
	ID posthogcfn.FlexID `json:"id"`
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
	return posthogcfn.Path("/api/projects/%s/product_tours/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/product_tours/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service. The
// create response omits targeting and the linked flag, so the tour is read
// back with GET.
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

	var created struct {
		ID posthogcfn.FlexID `json:"id"`
	}
	if err := c.Post(ctx, collectionPath(projectID), body, &created); err != nil {
		return posthogcfn.FromError("creating product tour", err), nil
	}
	out, fail := get(ctx, c, projectID, created.ID.String())
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("product tour ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(projectID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. The PATCH
// response omits targeting and the linked flag, so the tour is read back with
// GET.
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
		return posthogcfn.NotFound("product tour ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	if err := c.Patch(ctx, itemPath(projectID, id), body, nil); err != nil {
		return posthogcfn.FromError("updating product tour "+id, err), nil
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
		return posthogcfn.NotFound("product tour ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting product tour "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list product_tours"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[productTour](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing product_tours", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*productTour, *handler.ProgressEvent) {
	var out productTour
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading product tour "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, errString("Name is required")
	}
	linkedFlag, err := idOrNil("LinkedFlagId", m.LinkedFlagId)
	if err != nil {
		return nil, err
	}
	content, err := posthogcfn.ParseJSON("Content", m.Content)
	if err != nil {
		return nil, err
	}
	if content == nil {
		content = map[string]any{}
	}
	targeting, err := posthogcfn.ParseJSON("TargetingFlagFilters", m.TargetingFlagFilters)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"name":                   posthogcfn.StringValue(m.Name),
		"description":            posthogcfn.StringValue(m.Description),
		"content":                content,
		"targeting_flag_filters": targeting,
		"linked_flag_id":         linkedFlag,
		"auto_launch":            posthogcfn.BoolValue(m.AutoLaunch),
		"start_date":             posthogcfn.StringPtrOrNil(m.StartDate),
		"end_date":               posthogcfn.StringPtrOrNil(m.EndDate),
		"archived":               posthogcfn.BoolValue(m.Archived),
	}, nil
}

type errString string

func (e errString) Error() string { return string(e) }

// fromAPI converts an API product tour to the model. desired is the model
// from the request; its JSON strings are kept when the API value contains
// them.
func fromAPI(projectID string, t *productTour, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:            posthogcfn.String(projectID),
		Id:                   t.ID.Ptr(),
		Name:                 t.Name,
		Description:          posthogcfn.StringPtrOrNil(t.Description),
		Content:              jsonOut(desired.Content, t.Content),
		TargetingFlagFilters: jsonOut(desired.TargetingFlagFilters, t.TargetingFlagFilters),
		AutoLaunch:           optBool(t.AutoLaunch, desired.AutoLaunch),
		StartDate:            posthogcfn.StringPtrOrNil(t.StartDate),
		EndDate:              posthogcfn.StringPtrOrNil(t.EndDate),
		Archived:             optBool(t.Archived, desired.Archived),
		CreatedAt:            posthogcfn.StringOrNil(t.CreatedAt),
		UpdatedAt:            posthogcfn.StringOrNil(t.UpdatedAt),
	}
	if t.LinkedFlag != nil {
		m.LinkedFlagId = t.LinkedFlag.ID.Ptr()
	}
	if t.InternalTargetingFlag != nil {
		m.InternalTargetingFlagId = t.InternalTargetingFlag.ID.Ptr()
	}
	return m
}
