package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// playlist is the subset of PostHog's SessionRecordingPlaylist object these
// handlers use. Recording counts and synthetic-playlist details are left out.
type playlist struct {
	ID          posthogcfn.FlexID `json:"id"`
	ShortID     string            `json:"short_id"`
	Name        *string           `json:"name"`
	Description string            `json:"description"`
	Pinned      bool              `json:"pinned"`
	Filters     json.RawMessage   `json:"filters"`
	Type        *string           `json:"type"`
	CreatedAt   string            `json:"created_at"`
	Deleted     bool              `json:"deleted"`
	IsSynthetic bool              `json:"is_synthetic"`
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
	return posthogcfn.Path("/api/projects/%s/session_recording_playlists/", projectID)
}

func itemPath(projectID, shortID string) string {
	return posthogcfn.Path("/api/projects/%s/session_recording_playlists/%s/", projectID, shortID)
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
	typ := posthogcfn.StringValue(currentModel.Type)
	if typ == "" {
		return posthogcfn.InvalidRequest("Type is required"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	body["type"] = typ
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out playlist
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating session replay playlist", err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, shortID := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.ShortId)
	if projectID == "" || shortID == "" {
		return posthogcfn.NotFound("playlist ProjectId and ShortId must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, projectID, shortID)
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
	projectID, shortID := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.ShortId)
	if shortID == "" && prevModel != nil {
		shortID = posthogcfn.StringValue(prevModel.ShortId)
	}
	if projectID == "" || shortID == "" {
		return posthogcfn.NotFound("playlist ProjectId and ShortId must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a soft-deleted playlist succeeds, so check it is live first.
	current, fail := get(ctx, c, projectID, shortID)
	if fail != nil {
		return *fail, nil
	}
	if want := posthogcfn.StringValue(currentModel.Type); want != "" && current.Type != nil && *current.Type != want {
		return posthogcfn.NotUpdatable("Type is create-only (playlist %s is a %s playlist)", shortID, *current.Type), nil
	}
	if currentModel.Type == nil {
		currentModel.Type = current.Type
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	var out playlist
	if err := c.Patch(ctx, itemPath(projectID, shortID), body, &out); err != nil {
		return posthogcfn.FromError("updating session replay playlist "+shortID, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. Playlists
// cannot be hard-deleted (DELETE returns 405); they are soft-deleted.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID, shortID := posthogcfn.StringValue(currentModel.ProjectId), posthogcfn.StringValue(currentModel.ShortId)
	if projectID == "" || shortID == "" {
		return posthogcfn.NotFound("playlist ProjectId and ShortId must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, projectID, shortID); fail != nil {
		return *fail, nil
	}
	if err := c.SoftDelete(ctx, itemPath(projectID, shortID)); err != nil {
		return posthogcfn.FromError("deleting session replay playlist "+shortID, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service. Synthetic
// playlists (computed by PostHog, with no stored row) are skipped.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	projectID := posthogcfn.StringValue(currentModel.ProjectId)
	if projectID == "" {
		return posthogcfn.InvalidRequest("ProjectId is required to list session replay playlists"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[playlist](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing session replay playlists", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if items[i].Deleted || items[i].IsSynthetic || items[i].ShortID == "" {
			continue
		}
		models = append(models, Model{
			ProjectId: posthogcfn.String(projectID),
			ShortId:   posthogcfn.String(items[i].ShortID),
			Id:        items[i].ID.Ptr(),
		})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live playlist, mapping a 404 or a soft-deleted one to NotFound.
func get(ctx context.Context, c *posthogcfn.Client, projectID, shortID string) (*playlist, *handler.ProgressEvent) {
	var out playlist
	if err := c.Get(ctx, itemPath(projectID, shortID), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading session replay playlist "+shortID, err)
		return nil, &ev
	}
	if out.Deleted {
		ev := posthogcfn.NotFound("session replay playlist %s has been deleted", shortID)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body (without type, which is
// create-only). Every writable field is sent so that properties removed from
// the template are cleared. PostHog treats omitted filters on a filters-type
// playlist as removing them, so filters are always sent for that type.
func requestBody(m *Model) (map[string]any, error) {
	filters, err := posthogcfn.ParseJSON("Filters", m.Filters)
	if err != nil {
		return nil, err
	}
	if filters != nil {
		if _, ok := filters.(map[string]any); !ok {
			return nil, fmt.Errorf("Filters must be a JSON object")
		}
	}
	body := map[string]any{
		"name":        posthogcfn.StringPtrOrNil(m.Name),
		"description": posthogcfn.StringValue(m.Description),
		"pinned":      posthogcfn.BoolValue(m.Pinned),
	}
	switch {
	case filters != nil:
		body["filters"] = filters
	case posthogcfn.StringValue(m.Type) == "filters":
		body["filters"] = map[string]any{}
	}
	return body, nil
}

// fromAPI converts an API playlist to the model. Empty filters ({} or null)
// and pinned=false are reported only when the template set them.
func fromAPI(projectID string, p *playlist, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:   posthogcfn.String(projectID),
		ShortId:     posthogcfn.StringOrNil(p.ShortID),
		Id:          p.ID.Ptr(),
		Type:        posthogcfn.StringPtrOrNil(p.Type),
		Name:        posthogcfn.StringPtrOrNil(p.Name),
		Description: posthogcfn.StringOrNil(p.Description),
		CreatedAt:   posthogcfn.StringOrNil(p.CreatedAt),
	}
	if p.Pinned || desired.Pinned != nil {
		m.Pinned = posthogcfn.Bool(p.Pinned)
	}
	raw := strings.TrimSpace(string(p.Filters))
	if raw != "" && raw != "null" && (!posthogcfn.JSONEqual(raw, "{}") || desired.Filters != nil) {
		m.Filters = posthogcfn.PreserveJSON(desired.Filters, p.Filters)
	}
	return m
}
