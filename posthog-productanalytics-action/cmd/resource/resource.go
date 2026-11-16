package resource

import (
	"context"
	"encoding/json"
	"strconv"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// action is the subset of PostHog's Action object these handlers use.
type action struct {
	ID                 posthogcfn.FlexID `json:"id"`
	Name               *string           `json:"name"`
	Description        string            `json:"description"`
	Tags               []string          `json:"tags"`
	PostToSlack        bool              `json:"post_to_slack"`
	SlackMessageFormat string            `json:"slack_message_format"`
	Steps              []actionStep      `json:"steps"`
	CreatedAt          string            `json:"created_at"`
	Deleted            bool              `json:"deleted"`
}

type actionStep struct {
	Event        *string         `json:"event,omitempty"`
	Selector     *string         `json:"selector,omitempty"`
	TagName      *string         `json:"tag_name,omitempty"`
	Text         *string         `json:"text,omitempty"`
	TextMatching *string         `json:"text_matching,omitempty"`
	Href         *string         `json:"href,omitempty"`
	HrefMatching *string         `json:"href_matching,omitempty"`
	URL          *string         `json:"url,omitempty"`
	URLMatching  *string         `json:"url_matching,omitempty"`
	Properties   json.RawMessage `json:"properties,omitempty"`
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
	return posthogcfn.Path("/api/projects/%s/actions/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/actions/%s/", projectID, id)
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
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out action
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating action", err), nil
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
		return posthogcfn.NotFound("action ProjectId and Id must be set"), nil
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
	if id == "" {
		id = posthogcfn.StringValue(prevModel.Id)
	}
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("action ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted action succeeds, so check it is live first.
	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out action
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating action "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Actions
// cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, id := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.Id)
	if projectID == "" || id == "" {
		return posthogcfn.NotFound("action ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting action "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list actions"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[action](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing actions", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Deleted {
			continue
		}
		// List returns identifiers only; CloudFormation calls Read for details.
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live action, mapping a 404 or a soft-deleted action to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*action, *handler.ProgressEvent) {
	var out action
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading action "+id, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("action %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are cleared in PostHog.
func requestBody(m *Model) (map[string]any, error) {
	steps := make([]actionStep, 0, len(m.Steps))
	for i, s := range m.Steps {
		props, err := posthogcfn.ParseJSON("Steps["+strconv.Itoa(i)+"].Properties", s.Properties)
		if err != nil {
			return nil, err
		}
		step := actionStep{
			Event: s.Event, Selector: s.Selector, TagName: s.TagName,
			Text: s.Text, TextMatching: s.TextMatching,
			Href: s.Href, HrefMatching: s.HrefMatching,
			URL: s.Url, URLMatching: s.UrlMatching,
		}
		if props != nil {
			raw, _ := json.Marshal(props)
			step.Properties = raw
		}
		steps = append(steps, step)
	}
	tags := m.Tags
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{
		"name":                 posthogcfn.StringValue(m.Name),
		"description":          posthogcfn.StringValue(m.Description),
		"tags":                 tags,
		"post_to_slack":        posthogcfn.BoolValue(m.PostToSlack),
		"slack_message_format": posthogcfn.StringValue(m.SlackMessageFormat),
		"steps":                steps,
	}, nil
}

// fromAPI converts an API action to the model. desired is the model from the
// request; its JSON strings are kept when JSON-equal to the API value so that
// formatting differences are not reported as drift.
func fromAPI(projectID string, a *action, desired *Model) *Model {
	m := &Model{
		ProjectId:          posthogcfn.String(projectID),
		Id:                 a.ID.Ptr(),
		Name:               a.Name,
		Description:        posthogcfn.StringOrNil(a.Description),
		Tags:               posthogcfn.SliceOrNil(a.Tags),
		SlackMessageFormat: posthogcfn.StringOrNil(a.SlackMessageFormat),
		CreatedAt:          posthogcfn.StringOrNil(a.CreatedAt),
	}
	if a.PostToSlack || (desired != nil && desired.PostToSlack != nil) {
		m.PostToSlack = posthogcfn.Bool(a.PostToSlack)
	}
	for i, s := range a.Steps {
		var want Step
		if desired != nil && i < len(desired.Steps) {
			want = desired.Steps[i]
		}
		step := Step{
			Event: posthogcfn.StringPtrOrNil(s.Event), Selector: posthogcfn.StringPtrOrNil(s.Selector),
			TagName: posthogcfn.StringPtrOrNil(s.TagName), Text: posthogcfn.StringPtrOrNil(s.Text),
			TextMatching: matching(s.TextMatching, want.TextMatching, "exact"),
			Href:         posthogcfn.StringPtrOrNil(s.Href),
			HrefMatching: matching(s.HrefMatching, want.HrefMatching, "exact"),
			Url:          posthogcfn.StringPtrOrNil(s.URL),
			UrlMatching:  matching(s.URLMatching, want.UrlMatching, "contains"),
		}
		desiredProps := want.Properties
		if len(s.Properties) > 0 && string(s.Properties) != "null" && string(s.Properties) != "[]" {
			step.Properties = posthogcfn.PreserveJSON(desiredProps, s.Properties)
		}
		m.Steps = append(m.Steps, step)
	}
	return m
}

// matching returns the API's *_matching value for the model. PostHog fills in
// a default when none is sent; that default is left out of the model unless
// the template set it, so an omitted property does not show as drift.
func matching(api, desired *string, apiDefault string) *string {
	v := posthogcfn.StringPtrOrNil(api)
	if v == nil || (desired == nil && *v == apiDefault) {
		return nil
	}
	return v
}
