# PostHog::ProductAnalytics::Dashboard

Manages a [PostHog dashboard](https://posthog.com/docs/product-analytics/dashboards). Tiles are not part of this resource: put an insight on a dashboard with the `Dashboards` property of `PostHog::ProductAnalytics::Insight`.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Description`, `Pinned`, `Tags`, `BreakdownColors`, `DataColorThemeId`, `QuickFilterIds` | Removing them from the template clears them in PostHog. |
| `Filters` | JSON dashboard-level filters applied to every tile (`date_from`, `date_to`, `properties`, `breakdown_filter`, `interval`, `compareFilter`, `filterTestAccounts`). Pass it with `Fn::ToJsonString`. Removing it sends `{}`. |
| `GridSpacing`, `LayoutCompaction`, `GroupDisplay` | Display presets. Only reported when set in the template; removing one leaves PostHog's current value. |
| `UseTemplate`, `UseDashboard` | Create-only, write-only: create the dashboard from a template key or by duplicating another dashboard (its tiles included). |

`Fn::GetAtt`: `Id`, `CreatedAt`.

PostHog's create endpoint treats `filters` as read-only, so Create sets them with a follow-up PATCH. Breakdown colors that the dashboard assigned itself (`source: auto`) are not reported.

Delete soft-deletes the dashboard and keeps its insights. A soft-deleted dashboard is reported as not found.

See [examples/dashboard.yaml](examples/dashboard.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
