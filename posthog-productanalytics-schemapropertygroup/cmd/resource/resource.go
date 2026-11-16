package resource

import (
	"context"
	"fmt"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// propertyGroup is the subset of PostHog's SchemaPropertyGroup object these
// handlers use. The computed list of events using the group is left out.
type propertyGroup struct {
	ID          posthogcfn.FlexID `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Properties  []groupProperty   `json:"properties"`
	CreatedAt   string            `json:"created_at"`
}

type groupProperty struct {
	ID                posthogcfn.FlexID `json:"id,omitempty"`
	Name              string            `json:"name"`
	PropertyType      string            `json:"property_type"`
	IsRequired        bool              `json:"is_required"`
	IsOptionalInTypes bool              `json:"is_optional_in_types"`
	Description       string            `json:"description"`
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
	return posthogcfn.Path("/api/projects/%s/schema_property_groups/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/schema_property_groups/%s/", projectID, id)
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
	body, err := requestBody(currentModel, nil)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out propertyGroup
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating schema property group", err), nil
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
		return posthogcfn.NotFound("schema property group ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("schema property group ProjectId and Id must be set"), nil
	}
	if _, err := requestBody(currentModel, nil); err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// Read the current group so properties that keep their name keep their ID
	// (PostHog updates them in place instead of recreating them).
	current, fail := get(ctx, c, projectID, id)
	if fail != nil {
		return *fail, nil
	}
	body, err := requestBody(currentModel, current)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	var out propertyGroup
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating schema property group "+id, err), nil
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
		return posthogcfn.NotFound("schema property group ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting schema property group "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list schema property groups"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[propertyGroup](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing schema property groups", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*propertyGroup, *handler.ProgressEvent) {
	var out propertyGroup
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading schema property group "+id, err)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog. current
// (the group as stored, or nil on create) supplies the IDs of properties that
// keep their name.
func requestBody(m *Model, current *propertyGroup) (map[string]any, error) {
	if posthogcfn.StringValue(m.Name) == "" {
		return nil, fmt.Errorf("Name is required")
	}
	existing := map[string]posthogcfn.FlexID{}
	if current != nil {
		for _, p := range current.Properties {
			existing[p.Name] = p.ID
		}
	}
	seen := map[string]bool{}
	props := make([]groupProperty, 0, len(m.Properties))
	for i, p := range m.Properties {
		name := posthogcfn.StringValue(p.Name)
		if name == "" || posthogcfn.StringValue(p.PropertyType) == "" {
			return nil, fmt.Errorf("Properties[%d] needs Name and PropertyType", i)
		}
		if seen[name] {
			return nil, fmt.Errorf("Properties: duplicate property name %q", name)
		}
		seen[name] = true
		props = append(props, groupProperty{
			ID:                existing[name],
			Name:              name,
			PropertyType:      *p.PropertyType,
			IsRequired:        posthogcfn.BoolValue(p.IsRequired),
			IsOptionalInTypes: posthogcfn.BoolValue(p.IsOptionalInTypes),
			Description:       posthogcfn.StringValue(p.Description),
		})
	}
	return map[string]any{
		"name":        *m.Name,
		"description": posthogcfn.StringValue(m.Description),
		"properties":  props,
	}, nil
}

// fromAPI converts an API group to the model. A property's false booleans are
// reported only when the template set them, so omitted properties do not show
// as drift.
func fromAPI(projectID string, g *propertyGroup, desired *Model) *Model {
	want := map[string]Property{}
	if desired != nil {
		for _, p := range desired.Properties {
			want[posthogcfn.StringValue(p.Name)] = p
		}
	}
	m := &Model{
		ProjectId:   posthogcfn.String(projectID),
		Id:          g.ID.Ptr(),
		Name:        posthogcfn.StringOrNil(g.Name),
		Description: posthogcfn.StringOrNil(g.Description),
		CreatedAt:   posthogcfn.StringOrNil(g.CreatedAt),
	}
	for _, p := range g.Properties {
		w := want[p.Name]
		prop := Property{
			Name:         posthogcfn.StringOrNil(p.Name),
			PropertyType: posthogcfn.StringOrNil(p.PropertyType),
			Description:  posthogcfn.StringOrNil(p.Description),
		}
		if p.IsRequired || w.IsRequired != nil {
			prop.IsRequired = posthogcfn.Bool(p.IsRequired)
		}
		if p.IsOptionalInTypes || w.IsOptionalInTypes != nil {
			prop.IsOptionalInTypes = posthogcfn.Bool(p.IsOptionalInTypes)
		}
		m.Properties = append(m.Properties, prop)
	}
	return m
}
