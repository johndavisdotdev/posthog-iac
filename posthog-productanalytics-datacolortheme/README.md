# PostHog::ProductAnalytics::DataColorTheme

Manages a PostHog data color theme: a named, ordered palette of series colors for insights and dashboards in a project.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. At most 100 characters. |
| `Colors` | Series colors in order, as CSS hex colors (`#1d4aff`). Removing them clears the palette. |

`Fn::GetAtt`: `Id`, `CreatedAt`.

PostHog's built-in global themes (`is_global`) are returned by the list endpoint but are not project resources; List skips them. Creating or changing themes may require project admin access.

See [examples/datacolortheme.yaml](examples/datacolortheme.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
