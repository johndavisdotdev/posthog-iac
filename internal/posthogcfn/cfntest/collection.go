package cfntest

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// CollectionOptions configures an in-memory PostHog collection.
type CollectionOptions struct {
	// IDField is the identifier field in objects and the last path parameter
	// of the item route. Default "id".
	IDField string
	// StringIDs makes generated IDs UUID-like strings instead of integers.
	StringIDs bool
	// SoftDelete makes DELETE answer 405 (as PostHog does for models that
	// must be deleted with PATCH {"deleted": true}). Soft-deleted objects keep
	// being returned by GET with "deleted": true, and are hidden from lists.
	SoftDelete bool
	// NoUpdate leaves PATCH/PUT unregistered (404/405-style resources).
	NoUpdate bool
	// Defaults are merged into every created object (server-side defaults
	// and read-only fields such as created_at).
	Defaults map[string]any
	// OnCreate may rewrite the stored object after defaults are applied, e.g.
	// to add computed fields. It must not keep a reference to obj.
	OnCreate func(obj map[string]any)
	// OnUpdate is called with the stored object after a PATCH/PUT merge.
	OnUpdate func(obj map[string]any)
	// WriteOnly lists request fields that are stored but never returned
	// (secrets the real API does not echo back).
	WriteOnly []string
}

// Collection is an in-memory PostHog collection mounted on the fake API.
type Collection struct {
	opts       CollectionOptions
	collection string
	item       string

	mu     sync.Mutex
	nextID int
	// objects keyed by parent path values + id.
	objects map[string]map[string]any
	parents map[string]string
}

// Collection mounts an in-memory CRUD collection. collection is the list path
// pattern, e.g. "/api/projects/{project_id}/actions/"; the item route is
// collection + "{id}/" (or the configured IDField). It registers:
//
//	POST   collection  -> 201 with the stored object (ID assigned)
//	GET    collection  -> paginated envelope of live objects under the parent
//	GET    item        -> 200, or 404
//	PATCH  item        -> merge body, 200 (unless NoUpdate)
//	PUT    item        -> replace writable fields, 200 (unless NoUpdate)
//	DELETE item        -> 204 hard delete, or 405 when SoftDelete
func (a *API) Collection(collection string, opts CollectionOptions) *Collection {
	if opts.IDField == "" {
		opts.IDField = "id"
	}
	c := &Collection{
		opts:       opts,
		collection: collection,
		item:       collection + "{" + opts.IDField + "}/",
		nextID:     1,
		objects:    map[string]map[string]any{},
		parents:    map[string]string{},
	}
	a.Handle("POST "+c.collection, c.create)
	a.Handle("GET "+c.collection, c.list)
	a.Handle("GET "+c.item, c.get)
	if !opts.NoUpdate {
		a.Handle("PATCH "+c.item, c.patch)
		a.Handle("PUT "+c.item, c.patch)
	}
	a.Handle("DELETE "+c.item, c.delete)
	return c
}

// parentKey joins the values of every path parameter except the item ID.
func (c *Collection) parentKey(r *http.Request) string {
	var parts []string
	for _, name := range pathParams(c.collection) {
		parts = append(parts, name+"="+r.PathValue(name))
	}
	return strings.Join(parts, "&")
}

func pathParams(pattern string) []string {
	var out []string
	for _, seg := range strings.Split(pattern, "/") {
		if strings.HasPrefix(seg, "{") && strings.HasSuffix(seg, "}") {
			out = append(out, strings.Trim(seg, "{}"))
		}
	}
	return out
}

func (c *Collection) key(parent, id string) string { return parent + "#" + id }

func (c *Collection) newID() any {
	n := c.nextID
	c.nextID++
	if c.opts.StringIDs {
		return fmt.Sprintf("0190a1b2-0000-7000-8000-%012d", n)
	}
	return n
}

func (c *Collection) create(w http.ResponseWriter, r *http.Request) {
	body := Decode(r)
	c.mu.Lock()
	obj := map[string]any{}
	for k, v := range c.opts.Defaults {
		obj[k] = clone(v)
	}
	for k, v := range body {
		obj[k] = v
	}
	if _, ok := obj[c.opts.IDField]; !ok || c.opts.IDField == "id" {
		obj[c.opts.IDField] = c.newID()
	}
	if c.opts.SoftDelete {
		obj["deleted"] = false
	}
	if c.opts.OnCreate != nil {
		c.opts.OnCreate(obj)
	}
	id := fmt.Sprint(obj[c.opts.IDField])
	parent := c.parentKey(r)
	if _, exists := c.objects[c.key(parent, id)]; exists {
		c.mu.Unlock()
		Error(w, http.StatusBadRequest, "validation_error", "unique", "An object with this "+c.opts.IDField+" already exists.")
		return
	}
	c.objects[c.key(parent, id)] = obj
	c.parents[c.key(parent, id)] = parent
	out := c.public(obj)
	c.mu.Unlock()
	JSON(w, http.StatusCreated, out)
}

func (c *Collection) list(w http.ResponseWriter, r *http.Request) {
	parent := c.parentKey(r)
	c.mu.Lock()
	var keys []string
	for k, p := range c.parents {
		if p != parent {
			continue
		}
		if c.opts.SoftDelete && c.objects[k]["deleted"] == true {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = len(keys)
	}
	total := len(keys)
	end := offset + limit
	if offset > total {
		offset = total
	}
	if end > total {
		end = total
	}
	items := make([]any, 0, end-offset)
	for _, k := range keys[offset:end] {
		items = append(items, c.public(c.objects[k]))
	}
	c.mu.Unlock()
	var next any
	if end < total {
		next = fmt.Sprintf("http://internal.posthog%s?limit=%d&offset=%d", r.URL.Path, limit, end)
	}
	JSON(w, http.StatusOK, map[string]any{"count": total, "next": next, "previous": nil, "results": items})
}

func (c *Collection) lookup(r *http.Request) (string, map[string]any) {
	k := c.key(c.parentKey(r), r.PathValue(c.opts.IDField))
	return k, c.objects[k]
}

func (c *Collection) get(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	_, obj := c.lookup(r)
	if obj == nil {
		c.mu.Unlock()
		NotFound(w)
		return
	}
	out := c.public(obj)
	c.mu.Unlock()
	JSON(w, http.StatusOK, out)
}

func (c *Collection) patch(w http.ResponseWriter, r *http.Request) {
	body := Decode(r)
	c.mu.Lock()
	_, obj := c.lookup(r)
	if obj == nil {
		c.mu.Unlock()
		NotFound(w)
		return
	}
	for k, v := range body {
		if k == c.opts.IDField {
			continue
		}
		obj[k] = v
	}
	if c.opts.OnUpdate != nil {
		c.opts.OnUpdate(obj)
	}
	out := c.public(obj)
	c.mu.Unlock()
	JSON(w, http.StatusOK, out)
}

func (c *Collection) delete(w http.ResponseWriter, r *http.Request) {
	if c.opts.SoftDelete {
		Error(w, http.StatusMethodNotAllowed, "invalid_request", "method_not_allowed",
			`Hard delete of this model is not allowed. Use a patch API call to set "deleted" to true`)
		return
	}
	c.mu.Lock()
	k, obj := c.lookup(r)
	if obj == nil {
		c.mu.Unlock()
		NotFound(w)
		return
	}
	delete(c.objects, k)
	delete(c.parents, k)
	c.mu.Unlock()
	NoContent(w)
}

func (c *Collection) public(obj map[string]any) map[string]any {
	out := clone(obj).(map[string]any)
	for _, f := range c.opts.WriteOnly {
		delete(out, f)
	}
	return out
}

// Put stores obj directly under the given parent path values (for seeding
// state the handler under test did not create). parent maps path parameter
// names to values, e.g. {"project_id": "1"}.
func (c *Collection) Put(parent map[string]string, obj map[string]any) {
	var parts []string
	for _, name := range pathParams(c.collection) {
		parts = append(parts, name+"="+parent[name])
	}
	p := strings.Join(parts, "&")
	id := fmt.Sprint(obj[c.opts.IDField])
	c.mu.Lock()
	defer c.mu.Unlock()
	c.objects[c.key(p, id)] = clone(obj).(map[string]any)
	c.parents[c.key(p, id)] = p
}

// Get returns a copy of the stored object (including write-only fields and
// soft-deleted objects), or nil.
func (c *Collection) Get(parent map[string]string, id string) map[string]any {
	var parts []string
	for _, name := range pathParams(c.collection) {
		parts = append(parts, name+"="+parent[name])
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	obj := c.objects[c.key(strings.Join(parts, "&"), id)]
	if obj == nil {
		return nil
	}
	return clone(obj).(map[string]any)
}

// Len returns how many objects are stored (including soft-deleted ones).
func (c *Collection) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.objects)
}

func clone(v any) any {
	b, _ := json.Marshal(v)
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}
