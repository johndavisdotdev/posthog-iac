package resource

import (
	"bytes"
	"context"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// project is the subset of PostHog's Project object these handlers use. The
// secret API tokens PostHog includes in the response are deliberately not
// decoded, so they can never reach the model or the logs.
type project struct {
	ID                                          posthogcfn.FlexID `json:"id"`
	UUID                                        string            `json:"uuid"`
	Organization                                string            `json:"organization"`
	Name                                        *string           `json:"name"`
	ProductDescription                          *string           `json:"product_description"`
	Tags                                        []string          `json:"tags"`
	AppURLs                                     []string          `json:"app_urls"`
	AnonymizeIPs                                bool              `json:"anonymize_ips"`
	Timezone                                    *string           `json:"timezone"`
	WeekStartDay                                *int              `json:"week_start_day"`
	BaseCurrency                                *string           `json:"base_currency"`
	BusinessModel                               *string           `json:"business_model"`
	AutocaptureOptOut                           *bool             `json:"autocapture_opt_out"`
	AutocaptureExceptionsOptIn                  *bool             `json:"autocapture_exceptions_opt_in"`
	AutocaptureWebVitalsOptIn                   *bool             `json:"autocapture_web_vitals_opt_in"`
	CaptureConsoleLogOptIn                      *bool             `json:"capture_console_log_opt_in"`
	CapturePerformanceOptIn                     *bool             `json:"capture_performance_opt_in"`
	CaptureDeadClicks                           *bool             `json:"capture_dead_clicks"`
	HeatmapsOptIn                               *bool             `json:"heatmaps_opt_in"`
	SurveysOptIn                                *bool             `json:"surveys_opt_in"`
	SessionRecordingOptIn                       bool              `json:"session_recording_opt_in"`
	SessionRecordingSampleRate                  *string           `json:"session_recording_sample_rate"`
	SessionRecordingMinimumDurationMilliseconds *int              `json:"session_recording_minimum_duration_milliseconds"`
	SessionRecordingRetentionPeriod             *string           `json:"session_recording_retention_period"`
	RecordingDomains                            []string          `json:"recording_domains"`
	DataAttributes                              []string          `json:"data_attributes"`
	PersonDisplayNameProperties                 []string          `json:"person_display_name_properties"`
	TestAccountFilters                          json.RawMessage   `json:"test_account_filters"`
	TestAccountFiltersDefaultChecked            *bool             `json:"test_account_filters_default_checked"`
	PathCleaningFilters                         json.RawMessage   `json:"path_cleaning_filters"`
	APIToken                                    string            `json:"api_token"`
	APIHost                                     string            `json:"api_host"`
	CreatedAt                                   string            `json:"created_at"`
	IsPendingDeletion                           *bool             `json:"is_pending_deletion"`
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

func collectionPath(orgID string) string {
	return posthogcfn.Path("/api/organizations/%s/projects/", orgID)
}

func itemPath(orgID, id string) string {
	return posthogcfn.Path("/api/organizations/%s/projects/%s/", orgID, id)
}

// Create handles the Create event from the CloudFormation service.
func Create(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID := posthogcfn.StringValue(currentModel.OrganizationId)
	if orgID == "" {
		return posthogcfn.InvalidRequest("OrganizationId is required"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	body, err := requestBody(currentModel, nil)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	var out project
	if err := c.Post(ctx, collectionPath(orgID), body, &out); err != nil {
		return posthogcfn.FromError("creating project", err), nil
	}
	return posthogcfn.Success(fromAPI(orgID, &out, currentModel)), nil
}

// Read handles the Read event from the CloudFormation service.
func Read(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("project OrganizationId and Id must be set"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	out, fail := get(ctx, c, orgID, id)
	if fail != nil {
		return *fail, nil
	}
	return posthogcfn.Success(fromAPI(orgID, out, currentModel)), nil
}

// Update handles the Update event from the CloudFormation service. A project
// has many settings that are usually managed in the PostHog UI, so only the
// properties in the template are written, plus the properties removed from
// the template since the previous update, which are reset to PostHog's
// "unset" value.
func Update(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if id == "" && prevModel != nil {
		id = posthogcfn.StringValue(prevModel.Id)
	}
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("project OrganizationId and Id must be set"), nil
	}
	if posthogcfn.StringValue(currentModel.Name) == "" {
		return posthogcfn.InvalidRequest("Name is required"), nil
	}
	body, err := requestBody(currentModel, prevModel)
	if err != nil {
		return posthogcfn.InvalidRequest("%v", err), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	// A project pending deletion still answers PATCH, so check it is live first.
	if _, fail := get(ctx, c, orgID, id); fail != nil {
		return *fail, nil
	}
	var out project
	if err := c.Patch(ctx, itemPath(orgID, id), body, &out); err != nil {
		return posthogcfn.FromError("updating project "+id, err), nil
	}
	return posthogcfn.Success(fromAPI(orgID, &out, currentModel)), nil
}

// Delete handles the Delete event from the CloudFormation service. It deletes
// the PostHog project and all of its data. Before sending DELETE it confirms
// that the identifier is a numeric project ID and that the project exists,
// belongs to OrganizationId and is not already being deleted, so a stale or
// malformed identifier can never delete anything else.
func Delete(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID, id := posthogcfn.StringValue(currentModel.OrganizationId), posthogcfn.StringValue(currentModel.Id)
	if orgID == "" || id == "" {
		return posthogcfn.NotFound("project OrganizationId and Id must be set"), nil
	}
	if _, ok := posthogcfn.IDInt(currentModel.Id); !ok {
		return posthogcfn.NotFound("%q is not a PostHog project ID", id), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	if _, fail := get(ctx, c, orgID, id); fail != nil {
		return *fail, nil
	}
	if err := c.Delete(ctx, itemPath(orgID, id)); err != nil {
		return posthogcfn.FromError("deleting project "+id, err), nil
	}
	return posthogcfn.DeleteSuccess(), nil
}

// List handles the List event from the CloudFormation service.
func List(req handler.Request, prevModel *Model, currentModel *Model) (handler.ProgressEvent, error) {
	c, fail := newClient(req)
	if fail != nil {
		return *fail, nil
	}
	orgID := posthogcfn.StringValue(currentModel.OrganizationId)
	if orgID == "" {
		return posthogcfn.InvalidRequest("OrganizationId is required to list projects"), nil
	}
	ctx, cancel := posthogcfn.Context()
	defer cancel()

	items, err := posthogcfn.List[project](ctx, c, collectionPath(orgID), nil)
	if err != nil {
		return posthogcfn.FromError("listing projects", err), nil
	}
	models := make([]Model, 0, len(items))
	for i := range items {
		if posthogcfn.BoolValue(items[i].IsPendingDeletion) {
			continue
		}
		models = append(models, Model{OrganizationId: posthogcfn.String(orgID), Id: items[i].ID.Ptr()})
	}
	return posthogcfn.ListSuccess(models, ""), nil
}

// get reads one live project of the organization. A 404, a project pending
// deletion and a project of another organization are all NotFound.
func get(ctx context.Context, c *posthogcfn.Client, orgID, id string) (*project, *handler.ProgressEvent) {
	var out project
	if err := c.Get(ctx, itemPath(orgID, id), nil, &out); err != nil {
		ev := posthogcfn.FromError("reading project "+id, err)
		return nil, &ev
	}
	if posthogcfn.BoolValue(out.IsPendingDeletion) {
		ev := posthogcfn.NotFound("project %s is being deleted", id)
		return nil, &ev
	}
	if out.Organization != "" && !strings.EqualFold(out.Organization, orgID) {
		ev := posthogcfn.NotFound("project %s does not belong to organization %s", id, orgID)
		return nil, &ev
	}
	return &out, nil
}

// requestBody builds the create/update body: the name, every property set in
// m, and the "unset" value of every property set in prev but not in m. prev is
// nil on create.
func requestBody(m, prev *Model) (map[string]any, error) {
	if prev == nil {
		prev = &Model{}
	}
	body := map[string]any{"name": posthogcfn.StringValue(m.Name)}
	put := func(key string, set, wasSet bool, value func() any, unset any) {
		switch {
		case set:
			body[key] = value()
		case wasSet:
			body[key] = unset
		}
	}
	str := func(s *string) func() any { return func() any { return *s } }
	boolean := func(b *bool) func() any { return func() any { return *b } }
	integer := func(i *int) func() any { return func() any { return *i } }
	list := func(s []string) func() any { return func() any { return s } }

	put("product_description", m.ProductDescription != nil, prev.ProductDescription != nil, str(m.ProductDescription), nil)
	put("tags", m.Tags != nil, prev.Tags != nil, list(m.Tags), []string{})
	put("app_urls", m.AppUrls != nil, prev.AppUrls != nil, list(m.AppUrls), []string{})
	put("anonymize_ips", m.AnonymizeIps != nil, prev.AnonymizeIps != nil, boolean(m.AnonymizeIps), false)
	put("timezone", m.Timezone != nil, prev.Timezone != nil, str(m.Timezone), "UTC")
	put("week_start_day", m.WeekStartDay != nil, prev.WeekStartDay != nil, integer(m.WeekStartDay), nil)
	put("base_currency", m.BaseCurrency != nil, prev.BaseCurrency != nil, str(m.BaseCurrency), "USD")
	put("business_model", m.BusinessModel != nil, prev.BusinessModel != nil, str(m.BusinessModel), nil)
	put("autocapture_opt_out", m.AutocaptureOptOut != nil, prev.AutocaptureOptOut != nil, boolean(m.AutocaptureOptOut), nil)
	put("autocapture_exceptions_opt_in", m.AutocaptureExceptionsOptIn != nil, prev.AutocaptureExceptionsOptIn != nil, boolean(m.AutocaptureExceptionsOptIn), nil)
	put("autocapture_web_vitals_opt_in", m.AutocaptureWebVitalsOptIn != nil, prev.AutocaptureWebVitalsOptIn != nil, boolean(m.AutocaptureWebVitalsOptIn), nil)
	put("capture_console_log_opt_in", m.CaptureConsoleLogOptIn != nil, prev.CaptureConsoleLogOptIn != nil, boolean(m.CaptureConsoleLogOptIn), nil)
	put("capture_performance_opt_in", m.CapturePerformanceOptIn != nil, prev.CapturePerformanceOptIn != nil, boolean(m.CapturePerformanceOptIn), nil)
	put("capture_dead_clicks", m.CaptureDeadClicks != nil, prev.CaptureDeadClicks != nil, boolean(m.CaptureDeadClicks), nil)
	put("heatmaps_opt_in", m.HeatmapsOptIn != nil, prev.HeatmapsOptIn != nil, boolean(m.HeatmapsOptIn), nil)
	put("surveys_opt_in", m.SurveysOptIn != nil, prev.SurveysOptIn != nil, boolean(m.SurveysOptIn), nil)
	put("session_recording_opt_in", m.SessionRecordingOptIn != nil, prev.SessionRecordingOptIn != nil, boolean(m.SessionRecordingOptIn), false)
	put("session_recording_sample_rate", m.SessionRecordingSampleRate != nil, prev.SessionRecordingSampleRate != nil, str(m.SessionRecordingSampleRate), nil)
	put("session_recording_minimum_duration_milliseconds", m.SessionRecordingMinimumDurationMilliseconds != nil, prev.SessionRecordingMinimumDurationMilliseconds != nil, integer(m.SessionRecordingMinimumDurationMilliseconds), nil)
	put("session_recording_retention_period", m.SessionRecordingRetentionPeriod != nil, prev.SessionRecordingRetentionPeriod != nil, str(m.SessionRecordingRetentionPeriod), "30d")
	put("recording_domains", m.RecordingDomains != nil, prev.RecordingDomains != nil, list(m.RecordingDomains), []string{})
	put("data_attributes", m.DataAttributes != nil, prev.DataAttributes != nil, list(m.DataAttributes), []string{"data-attr"})
	put("person_display_name_properties", m.PersonDisplayNameProperties != nil, prev.PersonDisplayNameProperties != nil, list(m.PersonDisplayNameProperties), nil)
	put("test_account_filters_default_checked", m.TestAccountFiltersDefaultChecked != nil, prev.TestAccountFiltersDefaultChecked != nil, boolean(m.TestAccountFiltersDefaultChecked), nil)

	for _, f := range []struct {
		key, name   string
		value, prev *string
	}{
		{"test_account_filters", "TestAccountFilters", m.TestAccountFilters, prev.TestAccountFilters},
		{"path_cleaning_filters", "PathCleaningFilters", m.PathCleaningFilters, prev.PathCleaningFilters},
	} {
		v, err := posthogcfn.ParseJSON(f.name, f.value)
		if err != nil {
			return nil, err
		}
		put(f.key, v != nil, f.prev != nil, func() any { return v }, []any{})
	}
	return body, nil
}

// fromAPI converts an API project to the model. desired is the model from the
// request. A project carries many settings with server-side defaults, so a
// setting is reported only when the template sets it; an identifier-only
// read (import, or Read after List) reports every setting PostHog returns.
func fromAPI(orgID string, p *project, desired *Model) *Model {
	if desired == nil {
		desired = &Model{}
	}
	all := desired.Name == nil
	m := &Model{
		OrganizationId: posthogcfn.String(orgID),
		Id:             p.ID.Ptr(),
		Uuid:           posthogcfn.StringOrNil(p.UUID),
		Name:           p.Name,
		ApiToken:       posthogcfn.StringOrNil(p.APIToken),
		ApiHost:        posthogcfn.StringOrNil(p.APIHost),
		CreatedAt:      posthogcfn.StringOrNil(p.CreatedAt),
	}
	if desired.OrganizationId != nil && strings.EqualFold(*desired.OrganizationId, orgID) {
		m.OrganizationId = desired.OrganizationId
	}
	want := func(set bool) bool { return all || set }

	if want(desired.ProductDescription != nil) {
		m.ProductDescription = posthogcfn.StringPtrOrNil(p.ProductDescription)
	}
	if want(desired.Tags != nil) {
		m.Tags = unordered(desired.Tags, p.Tags, true)
	}
	if want(desired.AppUrls != nil) {
		m.AppUrls = unordered(desired.AppUrls, p.AppURLs, false)
	}
	if want(desired.AnonymizeIps != nil) {
		m.AnonymizeIps = posthogcfn.Bool(p.AnonymizeIPs)
	}
	if want(desired.Timezone != nil) {
		m.Timezone = posthogcfn.StringPtrOrNil(p.Timezone)
	}
	if want(desired.WeekStartDay != nil) {
		m.WeekStartDay = p.WeekStartDay
	}
	if want(desired.BaseCurrency != nil) {
		m.BaseCurrency = posthogcfn.StringPtrOrNil(p.BaseCurrency)
	}
	if want(desired.BusinessModel != nil) {
		m.BusinessModel = posthogcfn.StringPtrOrNil(p.BusinessModel)
	}
	for _, f := range []struct {
		set bool
		dst **bool
		api *bool
	}{
		{desired.AutocaptureOptOut != nil, &m.AutocaptureOptOut, p.AutocaptureOptOut},
		{desired.AutocaptureExceptionsOptIn != nil, &m.AutocaptureExceptionsOptIn, p.AutocaptureExceptionsOptIn},
		{desired.AutocaptureWebVitalsOptIn != nil, &m.AutocaptureWebVitalsOptIn, p.AutocaptureWebVitalsOptIn},
		{desired.CaptureConsoleLogOptIn != nil, &m.CaptureConsoleLogOptIn, p.CaptureConsoleLogOptIn},
		{desired.CapturePerformanceOptIn != nil, &m.CapturePerformanceOptIn, p.CapturePerformanceOptIn},
		{desired.CaptureDeadClicks != nil, &m.CaptureDeadClicks, p.CaptureDeadClicks},
		{desired.HeatmapsOptIn != nil, &m.HeatmapsOptIn, p.HeatmapsOptIn},
		{desired.SurveysOptIn != nil, &m.SurveysOptIn, p.SurveysOptIn},
		{desired.TestAccountFiltersDefaultChecked != nil, &m.TestAccountFiltersDefaultChecked, p.TestAccountFiltersDefaultChecked},
	} {
		if want(f.set) {
			*f.dst = f.api
		}
	}
	if want(desired.SessionRecordingOptIn != nil) {
		m.SessionRecordingOptIn = posthogcfn.Bool(p.SessionRecordingOptIn)
	}
	if want(desired.SessionRecordingSampleRate != nil) {
		m.SessionRecordingSampleRate = sampleRate(desired.SessionRecordingSampleRate, p.SessionRecordingSampleRate)
	}
	if want(desired.SessionRecordingMinimumDurationMilliseconds != nil) {
		m.SessionRecordingMinimumDurationMilliseconds = p.SessionRecordingMinimumDurationMilliseconds
	}
	if want(desired.SessionRecordingRetentionPeriod != nil) {
		m.SessionRecordingRetentionPeriod = posthogcfn.StringPtrOrNil(p.SessionRecordingRetentionPeriod)
	}
	if want(desired.RecordingDomains != nil) {
		m.RecordingDomains = unordered(desired.RecordingDomains, p.RecordingDomains, false)
	}
	if want(desired.DataAttributes != nil) {
		m.DataAttributes = posthogcfn.SliceOrNil(p.DataAttributes)
	}
	if want(desired.PersonDisplayNameProperties != nil) {
		m.PersonDisplayNameProperties = posthogcfn.SliceOrNil(p.PersonDisplayNameProperties)
	}
	if want(desired.TestAccountFilters != nil) {
		m.TestAccountFilters = jsonProperty(desired.TestAccountFilters, p.TestAccountFilters)
	}
	if want(desired.PathCleaningFilters != nil) {
		m.PathCleaningFilters = jsonProperty(desired.PathCleaningFilters, p.PathCleaningFilters)
	}
	return m
}

// unordered returns the API list, or the template's list when it holds the
// same items in another order (PostHog lowercases tags, hence fold).
func unordered(desired, api []string, fold bool) []string {
	if len(api) == 0 {
		return nil
	}
	if desired != nil {
		d := desired
		if fold {
			d = make([]string, len(desired))
			for i, s := range desired {
				d[i] = strings.ToLower(strings.TrimSpace(s))
			}
		}
		if posthogcfn.StringsEqualUnordered(d, api) {
			return desired
		}
	}
	return api
}

// sampleRate keeps the template's decimal string when it is numerically
// equal to PostHog's (which normalises 0.1 to "0.10").
func sampleRate(desired, api *string) *string {
	v := posthogcfn.StringPtrOrNil(api)
	if v == nil || desired == nil {
		return v
	}
	a, errA := strconv.ParseFloat(*v, 64)
	d, errD := strconv.ParseFloat(*desired, 64)
	if errA == nil && errD == nil && a == d {
		return desired
	}
	return v
}

// jsonProperty returns a JSON-string property, keeping the template's string
// when JSON-equal. An empty array is reported as unset unless the template
// set it.
func jsonProperty(desired *string, api json.RawMessage) *string {
	t := bytes.TrimSpace(api)
	if len(t) == 0 || string(t) == "null" || (desired == nil && (string(t) == "[]" || string(t) == "{}")) {
		return nil
	}
	return posthogcfn.PreserveJSON(desired, api)
}
