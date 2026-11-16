# PostHog::ProductAnalytics::Annotation

Manages a [PostHog annotation](https://posthog.com/docs/data/annotations): a note pinned to a point in time and shown on insight charts.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Content` | Required. At most 8192 characters. |
| `DateMarker` | Required. ISO 8601 timestamp. Your spelling is kept when PostHog returns the same instant in another format. |
| `Scope` | Required. `project`, `organization`, `dashboard` (set `DashboardId`) or `dashboard_item` (a single insight; set `DashboardItem`). The deprecated `recording` scope is not accepted. |
| `DashboardItem`, `DashboardId` | Numeric insight/dashboard IDs, passed as strings. Removing them detaches the annotation. |
| `CreationType` | `USR` (default) or `GIT`. Removing it resets it to `USR`. |
| `Emoji`, `HiddenInUserInterface` | Optional. Removing them clears them in PostHog. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

Delete soft-deletes the annotation (PostHog does not allow a hard delete). A soft-deleted annotation is reported as not found.

See [examples/annotation.yaml](examples/annotation.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
