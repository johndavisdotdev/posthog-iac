package resource

import (
	"encoding/json"

	"github.com/johndavisdev/posthog-iac/internal/posthogcfn"
)

// jsonOut converts a raw API value to a JSON string property. Empty values
// (null, {} or []) are left out; otherwise the template's string is kept when
// every value it sets matches the API value (posthogcfn.PreserveJSONSubset).
func jsonOut(desired *string, api json.RawMessage) *string {
	if posthogcfn.EmptyJSON(api) {
		return nil
	}
	return posthogcfn.PreserveJSONSubset(desired, api)
}
