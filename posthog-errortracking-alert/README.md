# PostHog::ErrorTracking::Alert

Manages a [PostHog error tracking alert](https://posthog.com/docs/error-tracking/alerts): a notification (currently Slack) sent when an issue is created, reopened, starts spiking or is assigned.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required, up to 400 characters. |
| `Triggers` | Required. Any of `issue_created`, `issue_reopened`, `issue_spiking`, `issue_assigned`. |
| `Destinations` | Required. Each has `ChannelType` (`slack`), `IntegrationId` (PostHog Slack integration) and `Config.Channel` (Slack channel ID) / `Config.ChannelName`. An update replaces all destinations. |
| `Filters` | Optional JSON in hog function filter shape (`events`, `actions`, `properties`, `filter_test_accounts`); pass it with `Fn::ToJsonString`. The server-compiled `bytecode` is stripped when reading. Removing it clears the filters. |
| `Enabled` | Defaults to `true`. PostHog's create request has no `enabled`, so `Enabled: false` creates the alert and then disables it. |
| `ThrottleSeconds` | Minimum seconds between notifications per issue (0 to 2592000). Defaults to 0 (no throttle). |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

Delete removes the alert (hard delete). Per-destination delivery state (`last_delivered_at`, `last_error`, `consecutive_failures`, destination IDs) is runtime state and is not modelled.

See [examples/error-tracking-alert.yaml](examples/error-tracking-alert.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
