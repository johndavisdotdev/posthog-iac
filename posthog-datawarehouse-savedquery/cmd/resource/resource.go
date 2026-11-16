package resource

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// savedQuery is the subset of PostHog's DataWarehouseSavedQuery object these
// handlers use.
type savedQuery struct {
	ID              posthogcfn.FlexID `json:"id"`
	Name            *string           `json:"name"`
	Query           json.RawMessage   `json:"query"`
	Description     *string           `json:"description"`
	SyncFrequency   *string           `json:"sync_frequency"`
	Incremental     *incremental      `json:"incremental"`
	FolderID        *string           `json:"folder_id"`
	IsTest          bool              `json:"is_test"`
	Status          *string           `json:"status"`
	IsMaterialized  *bool             `json:"is_materialized"`
	LastRunAt       *string           `json:"last_run_at"`
	LatestError     *string           `json:"latest_error"`
	LatestHistoryID *string           `json:"latest_history_id"`
	CreatedAt       string            `json:"created_at"`
	UpdatedAt       *string           `json:"updated_at"`
	Deleted         *bool             `json:"deleted"`
}

type incremental struct {
	Enabled         bool     `json:"enabled"`
	IncrementalKey  string   `json:"incremental_key"`
	UniqueKey       []string `json:"unique_key"`
	LookbackSeconds int      `json:"lookback_seconds"`
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
	return posthogcfn.Path("/api/projects/%s/warehouse_saved_queries/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/warehouse_saved_queries/%s/", projectID, id)
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
	if currentModel.SyncFrequency != nil {
		body["sync_frequency"] = *currentModel.SyncFrequency
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out savedQuery
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating saved query", err), nil
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
		return posthogcfn.NotFound("saved query ProjectId and Id must be set"), nil
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
		return posthogcfn.NotFound("saved query ProjectId and Id must be set"), nil
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
	// PostHog refuses a query change unless the caller names the revision it
	// last read, as optimistic concurrency control.
	if current.LatestHistoryID != nil {
		body["edited_history_id"] = *current.LatestHistoryID
	}
	// Only touch the schedule when it changes; null clears it.
	if posthogcfn.StringValue(currentModel.SyncFrequency) != posthogcfn.StringValue(current.SyncFrequency) {
		body["sync_frequency"] = currentModel.SyncFrequency
	}
	var out savedQuery
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating saved query "+id, err), nil
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
		return posthogcfn.NotFound("saved query ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting saved query "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list saved queries"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[savedQuery](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing saved queries", err), nil
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

// get reads one live saved query, mapping a 404 or a deleted one to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, id string) (*savedQuery, *handler.ProgressEvent) {
	var out savedQuery
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading saved query "+id, err)
		return nil, &ev
	}
	if posthogcfn.BoolValue(out.Deleted) {
		ev := posthogcfn.NotFound("saved query %s has been deleted", id)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body. Every writable field except
// sync_frequency is sent, so properties removed from the template are cleared.
func requestBody(m *Model) (map[string]any, error) {
	query, err := posthogcfn.ParseJSON("Query", m.Query)
	if err != nil {
		return nil, err
	}
	if _, ok := query.(map[string]any); !ok {
		return nil, errors.New("Query must be a JSON object such as {\"kind\": \"HogQLQuery\", \"query\": \"SELECT ...\"}")
	}
	body := map[string]any{
		"name":                         posthogcfn.StringValue(m.Name),
		"query":                        query,
		"description":                  posthogcfn.StringValue(m.Description),
		"folder_id":                    m.FolderId,
		"is_test":                      posthogcfn.BoolValue(m.IsTest),
		"acknowledge_breaking_changes": posthogcfn.BoolValue(m.AcknowledgeBreakingChanges),
		"incremental":                  nil,
	}
	if inc := m.Incremental; inc != nil {
		unique := inc.UniqueKey
		if unique == nil {
			unique = []string{}
		}
		body["incremental"] = incremental{
			Enabled:         posthogcfn.BoolValue(inc.Enabled),
			IncrementalKey:  posthogcfn.StringValue(inc.IncrementalKey),
			UniqueKey:       unique,
			LookbackSeconds: posthogcfn.IntValue(inc.LookbackSeconds),
		}
	}
	return body, nil
}

// fromAPI converts an API saved query to the model. desired is the model from
// the request: its Query string is kept when JSON-equal to the API value, and
// server defaults are only reported when the template set them.
func fromAPI(projectID string, q *savedQuery, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:      posthogcfn.String(projectID),
		Id:             q.ID.Ptr(),
		Name:           q.Name,
		Query:          posthogcfn.PreserveJSON(desired.Query, q.Query),
		Description:    posthogcfn.StringPtrOrNil(q.Description),
		SyncFrequency:  posthogcfn.StringPtrOrNil(q.SyncFrequency),
		FolderId:       posthogcfn.StringPtrOrNil(q.FolderID),
		Status:         posthogcfn.StringPtrOrNil(q.Status),
		IsMaterialized: q.IsMaterialized,
		LastRunAt:      posthogcfn.StringPtrOrNil(q.LastRunAt),
		LatestError:    posthogcfn.StringPtrOrNil(q.LatestError),
		CreatedAt:      posthogcfn.StringOrNil(q.CreatedAt),
		UpdatedAt:      posthogcfn.StringPtrOrNil(q.UpdatedAt),
	}
	if q.IsTest || desired.IsTest != nil {
		m.IsTest = posthogcfn.Bool(q.IsTest)
	}
	if inc := q.Incremental; inc != nil {
		want := desired.Incremental
		if want == nil {
			want = &Incremental{}
		}
		mi := &Incremental{
			IncrementalKey: posthogcfn.StringOrNil(inc.IncrementalKey),
			UniqueKey:      posthogcfn.SliceOrNil(inc.UniqueKey),
		}
		if inc.Enabled || want.Enabled != nil {
			mi.Enabled = posthogcfn.Bool(inc.Enabled)
		}
		if inc.LookbackSeconds != 0 || want.LookbackSeconds != nil {
			mi.LookbackSeconds = posthogcfn.Int(inc.LookbackSeconds)
		}
		m.Incremental = mi
	}
	return m
}
