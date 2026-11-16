# PostHog::ProductAnalytics::DashboardTemplate

Manages a [PostHog dashboard template](https://posthog.com/docs/product-analytics/dashboards#dashboard-templates): a reusable dashboard definition that new dashboards can be created from.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `TemplateName` | Required. |
| `DashboardDescription`, `Tags`, `ImageUrl`, `AvailabilityContexts`, `Customization` | Removing them from the template clears them in PostHog. |
| `Tiles` | JSON array of tiles (`{"type": "INSIGHT", "name", "query", "layouts", "color"}` or `{"type": "TEXT", "body"}`). Pass it with `Fn::ToJsonString`. |
| `Variables` | JSON array of template variables referenced from tiles as `{VARIABLE_1}`. Pass it with `Fn::ToJsonString`. |
| `DashboardFilters` | JSON dashboard-level filters, e.g. `{"date_from": "-30d"}`. |
| `Scope` | `team` (default, this project) or `organization`. `global` and `feature_flag` are for PostHog staff. |
| `Customization` | `TileSpacing`, `LayoutCompaction`, `GroupDisplay` and `Groups` (JSON) for dashboards made from the template. Only the fields set in the template are reported. |

`Fn::GetAtt`: `Id` (UUID), `CreatedAt`.

Read keeps the template's JSON strings as long as every value they set is unchanged in PostHog, so keys PostHog fills in are not reported as drift. `IsFeatured` (staff only) and the computed `non_portable_references` are left out.

List returns only the project's own templates (scope `team` or `organization`), not PostHog's official ones.

Delete soft-deletes the template. A soft-deleted template is reported as not found.

See [examples/dashboardtemplate.yaml](examples/dashboardtemplate.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
