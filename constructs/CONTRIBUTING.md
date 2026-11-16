# Writing L2 and L3 constructs

The L1 constructs (`src/**/*.generated.ts`) are generated from the resource type schemas; see the README. This guide covers the hand-written L2 (one construct per resource type) and L3 (patterns combining several resources) constructs.

**`src/product-analytics/action.ts` is the reference L2.** Read it, and its test `test/product-analytics/action.test.ts`, before writing a new one.

## Layout

- `src/<service>/<resource>.ts`: the L2 for one resource type, next to its `<resource>.generated.ts` L1.
- `src/<service>/l2.ts`: the barrel that exports the service's hand-written files. The generated `index.ts` re-exports it. Don't edit `index.ts` or `*.generated.ts`.
- `src/core/`: shared, exported models used across services (`PropertyFilter`, `PropertyGroup`, …). Exported as the `core` submodule.
- `src/private/`: internal helpers, **not** exported, so plain functions are fine there:
  - `helpers.ts`: validation, `jsonProp`, `secretProp`, `secretOrNew`, …
  - `filters.ts`: renders the `core` filter models to PostHog's JSON shape.
- `src/patterns/`: L3 constructs (the `patterns` submodule).
- `test/<service>/<resource>.test.ts`: one test file per L2.

## L2 checklist

1. **Interface:** `IXxx extends IResource` with the identifier as an `@attribute` (`actionId`, `flagId`, …), plus the parent it belongs to (`project: IProject`) if other constructs need it.
2. **Class:** `Xxx extends Resource implements IXxx` with the `@resource PostHog::Service::Resource` doc tag. It exposes `resource: CfnXxx` and `@attribute` getters for useful read-only properties.
3. **Importers:** static `fromXxxId(scope, id, ..., xxxId)` (and `fromXxxKey`/`fromXxxName` where PostHog has a second identifier).
4. **Props:**
   - Split them into `XxxOptions` (everything except the parent) and `XxxProps extends XxxOptions` (adds `project: IProject` or `organization: IOrganization`). The parent's `addXxx(id, options)` helper takes the options. Add the helper to `ProjectBase` in `src/organizations/project.ts`, or to the relevant parent L2.
   - Reference other resources by interface (`insight: IInsight`), never by raw ID strings.
   - Use TypeScript enums for every fixed set of values; cast to the L1 enum (`value as string as CfnXxxEnum`).
   - Use `Duration` for intervals, `Date | string` for timestamps, and `SecretValue` for secrets.
   - **Never accept a JSON string.** Model free-form JSON as typed interfaces where the shape is stable (reuse `core.PropertyFilter` / `PropertyGroup`). Where it isn't, add an `{ [key: string]: any }` escape hatch (`rawFilters`, `rawQuery`). Render with `jsonProp(this, value)`, which handles CDK tokens correctly.
   - Document every prop, with an `@default`.
5. **Removal policy:** a `removalPolicy` prop, `RemovalPolicy.DESTROY` by default. Use `RETAIN` for resources whose deletion destroys data (Project), and say so in the docs.
6. **Validation:** check concrete values in the constructor with `validateLength` / `validatePattern` / `validateRange` / `exactlyOne`. These skip tokens, so validation never breaks on references. Mirror the limits from the resource type schema.
7. **Secrets:**
   - Secrets the user supplies are `SecretValue`, rendered with `secretProp()` into the L1's write-only property. That gives a dynamic reference, so the value never appears in the template.
   - Values PostHog returns only once go into a Secrets Manager secret: take an optional `secret?: secretsmanager.ISecret` and fall back to `secretOrNew()`, which adds the `posthog-cdk:handler-writable` tag the registration pattern scopes write access to. Expose `grantRead()`.
8. **Exports:** add the file to the service's `l2.ts`.

## Tests

Each L2 needs tests for:

- Synthesis with typed props (`Template.hasResourceProperties`), including the JSON rendered from typed models.
- Optional props being left out, and the removal policy.
- Validation errors on concrete values, and no error for tokens (use a real `CfnParameter`).
- `fromXxxId` importers and `addXxx` helpers.
- Secrets appearing only as dynamic references, never in plain text.

If you change an example in `README.md`, update `test/readme-examples.test.ts` to match.

## Building

```bash
npx projen generate:l1   # only after a schema change
npx projen build         # jsii, eslint, jest, API.md
```
