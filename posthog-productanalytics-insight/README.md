# PostHog::ProductAnalytics::Insight

Manages a saved [PostHog insight](https://posthog.com/docs/product-analytics/insights). Computed results are never read into the resource.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Query` | Required. JSON query, usually an `InsightVizNode` wrapping a `TrendsQuery`, `FunnelsQuery`, `RetentionQuery`, etc., or a `DataVisualizationNode` wrapping a `HogQLQuery`. Pass it with `Fn::ToJsonString`. |
| `Name`, `DerivedName`, `Description`, `Tags`, `Favorited` | Removing them from the template clears them in PostHog. |
| `Dashboards` | IDs of the dashboards the insight is shown on (e.g. `!GetAtt MyDashboard.Id`). Removing an ID removes the tile from that dashboard; an empty list takes the insight off every dashboard. |

`Fn::GetAtt`: `Id`, `ShortId` (as in `/insights/<ShortId>`), `CreatedAt`. `[ProjectId, ShortId]` is an additional identifier.

Dashboards are written through PostHog's deprecated `dashboards` field, requested with `include_dashboards=true`; if PostHog stops returning it, Read falls back to the insight's live `dashboard_tiles`. Read uses `refresh=force_cache` so it never runs the query, and List requests `basic=true&saved=true`.

Read keeps the template's `Query` string as long as every value it sets is unchanged in PostHog, so keys PostHog fills in are not reported as drift; a changed value is.

Delete soft-deletes the insight. A soft-deleted insight is reported as not found.

See [examples/insight.yaml](examples/insight.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
