package posthogcfn

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

// String returns a pointer to s.
func String(s string) *string { return &s }

// Bool returns a pointer to b.
func Bool(b bool) *bool { return &b }

// Int returns a pointer to i.
func Int(i int) *int { return &i }

// Float returns a pointer to f.
func Float(f float64) *float64 { return &f }

// StringValue dereferences s, returning "" for nil.
func StringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// BoolValue dereferences b, returning false for nil.
func BoolValue(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}

// IntValue dereferences i, returning 0 for nil.
func IntValue(i *int) int {
	if i == nil {
		return 0
	}
	return *i
}

// StringOrNil returns nil for an empty string, so empty API values are left
// out of the resource model instead of appearing as "".
func StringOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// StringPtrOrNil returns nil when s is nil or points to "".
func StringPtrOrNil(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

// Changed reports whether a desired optional value differs from the previous
// one. A nil desired value counts as "not set" and is not a change.
func Changed[T comparable](desired, previous *T) bool {
	if desired == nil {
		return false
	}
	return previous == nil || *desired != *previous
}

// MapOrNil returns nil for an empty map so it is omitted from the model.
func MapOrNil(m map[string]string) map[string]string {
	if len(m) == 0 {
		return nil
	}
	return m
}

// SliceOrNil returns nil for an empty slice so it is omitted from the model.
func SliceOrNil[T any](s []T) []T {
	if len(s) == 0 {
		return nil
	}
	return s
}

// SortedKeys returns the keys of m in sorted order.
func SortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// StringsEqualUnordered reports whether a and b contain the same strings,
// ignoring order and duplicates.
func StringsEqualUnordered(a, b []string) bool {
	as := map[string]struct{}{}
	for _, s := range a {
		as[s] = struct{}{}
	}
	bs := map[string]struct{}{}
	for _, s := range b {
		bs[s] = struct{}{}
	}
	if len(as) != len(bs) {
		return false
	}
	for s := range as {
		if _, ok := bs[s]; !ok {
			return false
		}
	}
	return true
}

// FlexID is an identifier that PostHog may send as a JSON number (most model
// IDs) or a string (UUIDs, short IDs). It always holds the decimal/string
// form, which is what resource models and URL paths use.
type FlexID string

// UnmarshalJSON accepts a JSON number, string or null.
func (f *FlexID) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) == 0 || string(b) == "null" {
		*f = ""
		return nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*f = FlexID(s)
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(b, &n); err != nil {
		return fmt.Errorf("FlexID: %s is neither a string nor a number", b)
	}
	*f = FlexID(n.String())
	return nil
}

// MarshalJSON writes the ID as a JSON number when it is an integer, otherwise
// as a string, matching how PostHog accepts IDs in request bodies.
func (f FlexID) MarshalJSON() ([]byte, error) {
	if f == "" {
		return []byte("null"), nil
	}
	if _, err := strconv.ParseInt(string(f), 10, 64); err == nil {
		return []byte(f), nil
	}
	return json.Marshal(string(f))
}

// String returns the ID.
func (f FlexID) String() string { return string(f) }

// Ptr returns a pointer to the ID string, or nil when empty.
func (f FlexID) Ptr() *string { return StringOrNil(string(f)) }

// IDInt parses a numeric ID from a model property. ok is false when id is
// empty or not an integer.
func IDInt(id *string) (n int64, ok bool) {
	if id == nil {
		return 0, false
	}
	v, err := strconv.ParseInt(strings.TrimSpace(*id), 10, 64)
	return v, err == nil
}

// --- Arbitrary JSON properties ------------------------------------------------
//
// The CloudFormation Go plugin cannot unmarshal free-form "type": "object"
// properties, so arbitrary JSON (filters, queries, steps, ...) is modelled as a
// string property holding JSON. Users pass it with Fn::ToJsonString.

// ParseJSON decodes a JSON string property into a generic value for a request
// body. nil or "" returns (nil, nil). name is used in the error message.
func ParseJSON(name string, s *string) (any, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil
	}
	dec := json.NewDecoder(strings.NewReader(*s))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("%s must be valid JSON: %w", name, err)
	}
	return v, nil
}

// ToJSONString encodes an API value as a JSON string property. nil (or JSON
// null) returns nil.
func ToJSONString(v any) *string {
	if v == nil {
		return nil
	}
	if raw, ok := v.(json.RawMessage); ok {
		t := bytes.TrimSpace(raw)
		if len(t) == 0 || string(t) == "null" {
			return nil
		}
		v = raw
	}
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" {
		return nil
	}
	s := string(b)
	return &s
}

// JSONEqual reports whether two JSON documents are semantically equal
// (object key order and number formatting ignored).
func JSONEqual(a, b string) bool {
	var av, bv any
	if json.Unmarshal([]byte(a), &av) != nil || json.Unmarshal([]byte(b), &bv) != nil {
		return false
	}
	return reflect.DeepEqual(av, bv)
}

// EmptyJSON reports whether a raw API value is absent, null, {} or [].
func EmptyJSON(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 {
		return true
	}
	var v any
	if json.Unmarshal(t, &v) != nil {
		return false
	}
	switch x := v.(type) {
	case nil:
		return true
	case map[string]any:
		return len(x) == 0
	case []any:
		return len(x) == 0
	}
	return false
}

// JSONContains reports whether every value set in want is present and equal
// in have (both decoded with encoding/json into generic values). Objects in
// have may carry extra keys; a null in want also matches a missing key; arrays
// must have the same length and match element by element; scalars must be
// equal.
func JSONContains(want, have any) bool {
	switch w := want.(type) {
	case map[string]any:
		h, ok := have.(map[string]any)
		if !ok {
			return false
		}
		for k, wv := range w {
			hv, present := h[k]
			if !present {
				if wv == nil {
					continue
				}
				return false
			}
			if !JSONContains(wv, hv) {
				return false
			}
		}
		return true
	case []any:
		h, ok := have.([]any)
		if !ok || len(h) != len(w) {
			return false
		}
		for i := range w {
			if !JSONContains(w[i], h[i]) {
				return false
			}
		}
		return true
	default:
		return reflect.DeepEqual(want, have)
	}
}

// PreserveJSONSubset is PreserveJSON for objects PostHog enriches on save
// (compiled bytecode, generated IDs, default values): the template's exact
// string is kept when every value it sets is present and equal in the API
// value (see JSONContains), even if PostHog added keys of its own. Otherwise
// the API value is returned, so changed values are still reported as drift.
// Keys added outside the template are not reported. An API null returns nil.
func PreserveJSONSubset(desired *string, api any) *string {
	got := ToJSONString(api)
	if got == nil {
		return nil
	}
	if desired == nil {
		return got
	}
	var want, have any
	if json.Unmarshal([]byte(*desired), &want) != nil || json.Unmarshal([]byte(*got), &have) != nil {
		return got
	}
	if JSONContains(want, have) {
		return desired
	}
	return got
}

// PreserveJSON returns the JSON string property to put in a model read back
// from the API. If the template's string (desired, typically the previous or
// current model value) is JSON-equal to what the API returned, the template's
// exact string is kept so CloudFormation sees no drift from key order or
// whitespace; otherwise the API value is returned.
func PreserveJSON(desired *string, api any) *string {
	got := ToJSONString(api)
	if got == nil {
		return nil
	}
	if desired != nil && JSONEqual(*desired, *got) {
		return desired
	}
	return got
}
