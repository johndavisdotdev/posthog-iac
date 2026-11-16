package resource

import (
	"encoding/json"
	"strconv"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// jsonOut converts a raw API value to a model property. Empty values are left
// out; non-empty values keep the template's string when it is contained.
func jsonOut(desired *string, raw json.RawMessage) *string {
	if posthogcfn.EmptyJSON(raw) {
		return nil
	}
	return posthogcfn.PreserveJSONSubset(desired, raw)
}

// defaultedJSONOut is jsonOut for objects PostHog fills with defaults: the
// value is only reported when the template set the property, so a server
// default does not show as drift.
func defaultedJSONOut(desired *string, raw json.RawMessage) *string {
	if desired == nil {
		return nil
	}
	return jsonOut(desired, raw)
}

// optBool reports a boolean that defaults to false: it is left out of the
// model unless it is true or the template set it.
func optBool(api bool, desired *bool) *bool {
	if api || desired != nil {
		return posthogcfn.Bool(api)
	}
	return nil
}

// optBoolPtr is optBool for a nullable API boolean.
func optBoolPtr(api *bool, desired *bool) *bool {
	return optBool(api != nil && *api, desired)
}

// optString reports a string that has a server default: the default is left
// out of the model unless the template set it.
func optString(api *string, desired *string, apiDefault string) *string {
	v := posthogcfn.StringPtrOrNil(api)
	if v == nil || (desired == nil && *v == apiDefault) {
		return nil
	}
	return v
}

// idOrNil converts an ID property to the integer PostHog expects, or nil when
// unset. ok is false when the value is set but not an integer.
func idOrNil(name string, id *string) (any, error) {
	if posthogcfn.StringValue(id) == "" {
		return nil, nil
	}
	n, ok := posthogcfn.IDInt(id)
	if !ok {
		return nil, &invalidID{name: name}
	}
	return n, nil
}

type invalidID struct{ name string }

func (e *invalidID) Error() string { return e.name + " must be an integer ID" }

// intIDPtr formats a nullable integer ID from the API for the model.
func intIDPtr(id *int64) *string {
	if id == nil {
		return nil
	}
	return posthogcfn.String(strconv.FormatInt(*id, 10))
}
