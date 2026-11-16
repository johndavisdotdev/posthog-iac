package resource

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// approvalPolicy is the subset of PostHog's ApprovalPolicy object these
// handlers use. conditions, approver_config and bypass_org_membership_levels
// are untyped in the OpenAPI spec and are carried as JSON-string properties.
type approvalPolicy struct {
	ID                        posthogcfn.FlexID `json:"id"`
	ActionKey                 string            `json:"action_key"`
	Conditions                json.RawMessage   `json:"conditions"`
	ApproverConfig            json.RawMessage   `json:"approver_config"`
	AllowSelfApprove          bool              `json:"allow_self_approve"`
	BypassOrgMembershipLevels json.RawMessage   `json:"bypass_org_membership_levels"`
	BypassRoles               []string          `json:"bypass_roles"`
	ExpiresAfter              *string           `json:"expires_after"`
	Enabled                   *bool             `json:"enabled"`
	CreatedAt                 string            `json:"created_at"`
	UpdatedAt                 *string           `json:"updated_at"`
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
	return posthogcfn.Path("/api/projects/%s/approval_policies/", projectID)
}

func itemPath(projectID, id string) string {
	return posthogcfn.Path("/api/projects/%s/approval_policies/%s/", projectID, id)
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
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out approvalPolicy
	if err := c.Post(ctx, collectionPath(projectID), body, &out); err != nil {
		return posthogcfn.FromError("creating approval policy", err), nil
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
		return posthogcfn.NotFound("approval policy ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out approvalPolicy
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading approval policy "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(projectID, &out, currentModel)), nil
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
		return posthogcfn.NotFound("approval policy ProjectId and Id must be set"), nil
	}
	body, err := requestBody(currentModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// PATCH on a deleted policy returns 404, which FromError maps to NotFound.
	var out approvalPolicy
	if err := c.Patch(ctx, itemPath(projectID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating approval policy "+id, err), nil
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
		return posthogcfn.NotFound("approval policy ProjectId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out approvalPolicy
	if err := c.Get(ctx, itemPath(projectID, id), nil, &out); err != nil {
		return posthogcfn.FromError("reading approval policy "+id, err), nil
	}
	if err := c.Delete(ctx, itemPath(projectID, id)); err != nil {
		return posthogcfn.FromError("deleting approval policy "+id, err), nil
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
		return posthogcfn.InvalidRequest("ProjectId is required to list approval policies"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[approvalPolicy](ctx, c, collectionPath(projectID), nil)
	if err != nil {
		return posthogcfn.FromError("listing approval policies", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		models = append(models, Model{ProjectId: posthogcfn.String(projectID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// requestBody builds the create/update body. Every writable field is sent so
// that properties removed from the template are reset in PostHog. The one
// exception is expires_after: PostHog's default duration is not documented,
// so it is only sent when the template sets it.
func requestBody(m *Model) (map[string]any, error) {
	if posthogcfn.StringValue(m.ActionKey) == "" {
		return nil, errors.New("ActionKey is required")
	}
	approvers, err := posthogcfn.ParseJSON("ApproverConfig", m.ApproverConfig)
	if err != nil {
		return nil, err
	}
	if approvers == nil {
		return nil, errors.New("ApproverConfig is required")
	}
	if _, ok := approvers.(map[string]any); !ok {
		return nil, errors.New("ApproverConfig must be a JSON object")
	}
	conditions, err := posthogcfn.ParseJSON("Conditions", m.Conditions)
	if err != nil {
		return nil, err
	}
	if conditions == nil {
		conditions = map[string]any{}
	}
	levels, err := posthogcfn.ParseJSON("BypassOrgMembershipLevels", m.BypassOrgMembershipLevels)
	if err != nil {
		return nil, err
	}
	if levels == nil {
		levels = []any{}
	}
	if _, ok := levels.([]any); !ok {
		return nil, errors.New("BypassOrgMembershipLevels must be a JSON array")
	}
	roles := m.BypassRoles
	if roles == nil {
		roles = []string{}
	}
	enabled := true
	if m.Enabled != nil {
		enabled = *m.Enabled
	}
	body := map[string]any{
		"action_key":                   posthogcfn.StringValue(m.ActionKey),
		"conditions":                   conditions,
		"approver_config":              approvers,
		"allow_self_approve":           posthogcfn.BoolValue(m.AllowSelfApprove),
		"bypass_org_membership_levels": levels,
		"bypass_roles":                 roles,
		"enabled":                      enabled,
	}
	if e := posthogcfn.StringValue(m.ExpiresAfter); e != "" {
		if _, ok := parseDuration(e); !ok {
			return nil, fmt.Errorf("ExpiresAfter %q is not a duration such as \"7 00:00:00\", \"12:00:00\" or P7D", e)
		}
		body["expires_after"] = e
	}
	return body, nil
}

// fromAPI converts an API policy to the model. desired is the model from the
// request: its JSON strings and duration are kept when equivalent to the API
// value, and server defaults are only reported when the template set them.
func fromAPI(projectID string, p *approvalPolicy, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	m := &Model{
		ProjectId:                 posthogcfn.String(projectID),
		Id:                        p.ID.Ptr(),
		ActionKey:                 posthogcfn.StringOrNil(p.ActionKey),
		Conditions:                jsonProp(desired.Conditions, p.Conditions),
		ApproverConfig:            jsonProp(desired.ApproverConfig, p.ApproverConfig),
		BypassOrgMembershipLevels: jsonProp(desired.BypassOrgMembershipLevels, p.BypassOrgMembershipLevels),
		BypassRoles:               posthogcfn.SliceOrNil(p.BypassRoles),
		CreatedAt:                 posthogcfn.StringOrNil(p.CreatedAt),
		UpdatedAt:                 posthogcfn.StringPtrOrNil(p.UpdatedAt),
	}
	if p.AllowSelfApprove || desired.AllowSelfApprove != nil {
		m.AllowSelfApprove = posthogcfn.Bool(p.AllowSelfApprove)
	}
	if p.Enabled != nil && (!*p.Enabled || desired.Enabled != nil) {
		m.Enabled = posthogcfn.Bool(*p.Enabled)
	}
	if desired.ExpiresAfter != nil && p.ExpiresAfter != nil && *p.ExpiresAfter != "" {
		m.ExpiresAfter = p.ExpiresAfter
		want, ok1 := parseDuration(*desired.ExpiresAfter)
		got, ok2 := parseDuration(*p.ExpiresAfter)
		if ok1 && ok2 && want == got {
			m.ExpiresAfter = desired.ExpiresAfter
		}
	}
	return m
}

// jsonProp returns a JSON-string property for an API value. Empty values
// ({}, [] or null) are left out unless the template set the property.
func jsonProp(desired *string, raw json.RawMessage) *string {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 || string(t) == "null" {
		return nil
	}
	if desired == nil && (string(t) == "{}" || string(t) == "[]") {
		return nil
	}
	return posthogcfn.PreserveJSON(desired, raw)
}

var (
	djangoDuration = regexp.MustCompile(`^(?:(-?\d+) (?:days?,? )?)?(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$`)
	isoDuration    = regexp.MustCompile(`^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$`)
)

// parseDuration parses the duration formats Django's DurationField accepts
// ("[D [days ]][[HH:]MM:]SS[.ffffff]" and ISO 8601 "P..") into seconds, so
// the template's spelling can be kept when PostHog normalises it.
func parseDuration(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	num := func(v string) float64 {
		if v == "" {
			return 0
		}
		f, _ := strconv.ParseFloat(v, 64)
		return f
	}
	if g := djangoDuration.FindStringSubmatch(s); g != nil {
		return num(g[1])*86400 + num(g[2])*3600 + num(g[3])*60 + num(g[4]), true
	}
	if s != "P" && s != "PT" {
		if g := isoDuration.FindStringSubmatch(strings.ToUpper(s)); g != nil {
			return num(g[1])*7*86400 + num(g[2])*86400 + num(g[3])*3600 + num(g[4])*60 + num(g[5]), true
		}
	}
	return 0, false
}
