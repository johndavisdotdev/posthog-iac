package resource

import (
	"context"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// table is the subset of PostHog's Table object these handlers use. The
// credential's key and secret are write-only and never returned.
type table struct {
	ID         posthogcfn.FlexID `json:"id"`
	Name       *string           `json:"name"`
	Format     string            `json:"format"`
	URLPattern string            `json:"url_pattern"`
	Options    *tableOptions     `json:"options"`
	HogqlName  string            `json:"hogql_name"`
	CreatedAt  string            `json:"created_at"`
	Deleted    *bool             `json:"deleted"`
}

type tableOptions struct {
	CsvAllowDoubleQuotes *bool `json:"csv_allow_double_quotes,omitempty"`
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
	return posthogcfn.Path("/api/projects/%s/warehouse_tables/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/warehouse_tables/%s/", projectID, id)
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	if msg := validate(currentModel); msg != "" {
		return posthogcfn.InvalidRequest("%s", msg), nil
	}
	cred := currentModel.Credential
	if cred == nil || posthogcfn.StringValue(cred.AccessKey) == "" || posthogcfn.StringValue(cred.AccessSecret) == "" {
		return posthogcfn.InvalidRequest("Credential.AccessKey and Credential.AccessSecret are required"), nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	body := requestBody(currentModel)
	body["credential"] = credentialBody(cred)
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out table
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating warehouse table", err), nil
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
		return posthogcfn.NotFound("table ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("table ProjectId and Id must be set"), nil
	}
	if msg := validate(currentModel); msg != "" {
		return posthogcfn.InvalidRequest("%s", msg), nil
	}
	body := requestBody(currentModel)
	// The credential is write-only, so it is only sent when the template
	// changed it.
	var prevCred *Credential
	if prevModel != nil {
		prevCred = prevModel.Credential
	}
	if cred := currentModel.Credential; cred != nil && credentialChanged(cred, prevCred) {
		body["credential"] = credentialBody(cred)
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	var out table
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating table "+id, err), nil
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
		return posthogcfn.NotFound("table ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting table "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list tables"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[table](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing tables", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if posthogcfn.BoolValue(items[i].Deleted) {
			continue
		}
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live table, mapping a 404 or a soft-deleted one to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*table, *handler.ProgressEvent) {
	var out table
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading table "+id, err)
		return nil, &ev
	}
	if posthogcfn.BoolValue(out.Deleted) {
		ev := posthogcfn.NotFound("table %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

func validate(m *Model) string {
	switch {
	case posthogcfn.StringValue(m.ProjectId) == "":
		return "ProjectId is required"
	case posthogcfn.StringValue(m.Name) == "":
		return "Name is required"
	case posthogcfn.StringValue(m.Format) == "":
		return "Format is required"
	case posthogcfn.StringValue(m.UrlPattern) == "":
		return "UrlPattern is required"
	}
	return ""
}

// requestBody builds the create/update body without the credential. Options
// are always sent so that removing them from the template clears them.
func requestBody(m *Model) map[string]any {
	opts := tableOptions{}
	if m.Options != nil {
		opts.CsvAllowDoubleQuotes = m.Options.CsvAllowDoubleQuotes
	}
	return map[string]any{
		"name":        posthogcfn.StringValue(m.Name),
		"format":      posthogcfn.StringValue(m.Format),
		"url_pattern": posthogcfn.StringValue(m.UrlPattern),
		"options":     opts,
	}
}

func credentialBody(c *Credential) map[string]string {
	return map[string]string{
		"access_key":    posthogcfn.StringValue(c.AccessKey),
		"access_secret": posthogcfn.StringValue(c.AccessSecret),
	}
}

func credentialChanged(cur, prev *Credential) bool {
	if prev == nil {
		return true
	}
	return posthogcfn.StringValue(cur.AccessKey) != posthogcfn.StringValue(prev.AccessKey) ||
		posthogcfn.StringValue(cur.AccessSecret) != posthogcfn.StringValue(prev.AccessSecret)
}

// fromAPI converts an API table to the model. The credential is never
// included. Options default to false and are only reported when set.
func fromAPI(projectID string, t *table, desired *Model) *Model {
	m := &Model{
		ProjectId:  posthogcfn.String(projectID),
		Id:         t.ID.Ptr(),
		Name:       t.Name,
		Format:     posthogcfn.StringOrNil(t.Format),
		UrlPattern: posthogcfn.StringOrNil(t.URLPattern),
		HogqlName:  posthogcfn.StringOrNil(t.HogqlName),
		CreatedAt:  posthogcfn.StringOrNil(t.CreatedAt),
	}
	var want *bool
	if desired != nil && desired.Options != nil {
		want = desired.Options.CsvAllowDoubleQuotes
	}
	var got bool
	if t.Options != nil {
		got = posthogcfn.BoolValue(t.Options.CsvAllowDoubleQuotes)
	}
	if got || want != nil {
		m.Options = &Options{CsvAllowDoubleQuotes: posthogcfn.Bool(got)}
	}
	return m
}
