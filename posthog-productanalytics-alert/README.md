# PostHog::ProductAnalytics::Alert

Manages a [PostHog insight alert](https://posthog.com/docs/alerts): a scheduled check of an insight's value against a threshold or an anomaly detector.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `InsightId` | Required. Numeric ID of the monitored insight (e.g. `!GetAtt MyInsight.Id`). |
| `Name` | Required. |
| `SubscribedUsers` | Numeric PostHog user IDs to notify. |
| `Threshold` | `Configuration.Type` (`absolute` or `percentage`) and `Configuration.Bounds` (`Lower`, `Upper`). Only sent when set: removing it from the template leaves PostHog's threshold unchanged. |
| `Condition` | `absolute_value` (PostHog's default, not reported unless set), `relative_increase` or `relative_decrease`. |
| `Config` | JSON per-insight-kind config, e.g. `{"type": "TrendsAlertConfig", "series_index": 0}`. Only sent and reported when set. |
| `DetectorConfig` | JSON anomaly detector config. Removing it switches the alert back to threshold bounds. |
| `CalculationInterval` | Only sent and reported when set (PostHog's default is daily). |
| `Enabled` | Defaults to true; removing it re-enables the alert. |
| `EvaluationDelayIntervals`, `ScheduleStartTime`, `SkipWeekend`, `ScheduleRestriction`, `Investigation*` | Removing them resets them to PostHog's defaults (0, none, false, none, false, `notify`). |

`Fn::GetAtt`: `Id` (UUID), `InsightShortId`, `CreatedAt`.

Runtime state (`state`, `last_checked_at`, `last_notified_at`, `next_check_at`, `last_value`, check history) and `snoozed_until` are not part of the resource. Read asks for a single check (`checks_limit=1`) to keep the response small.

Delete hard-deletes the alert.

See [examples/alert.yaml](examples/alert.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
