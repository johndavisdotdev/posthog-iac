# PostHog::Logs::Alert

Manages a [PostHog logs](https://posthog.com/docs/logs) alert: PostHog counts the log entries that match `Filters` over `WindowMinutes` and fires when the count is above (or below) `ThresholdCount`.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required, up to 255 characters. |
| `Filters` | `SeverityLevels` (`trace` ... `fatal`), `ServiceNames`, and `FilterGroup` (JSON property group; pass it with `Fn::ToJsonString`). An enabled alert needs at least one of them. |
| `Enabled` | Defaults to `true`. |
| `ThresholdCount`, `ThresholdOperator`, `WindowMinutes` | Default 100, `above`, 5. `WindowMinutes` is 5, 10, 15, 30 or 60. |
| `EvaluationPeriods`, `DatapointsToAlarm` | N-of-M evaluation (1-10 each, default 1). |
| `CooldownMinutes` | Minimum minutes between notifications (default 0). |
| `ScheduleRestriction` | Quiet hours: up to five `BlockedWindows` (`Start`/`End` as `HH:MM`, project timezone). Removing it disables quiet hours. |
| `Grouping`, `Labels`, `Annotations` | Only for alerts evaluated by the PostHog alerts platform (`PlatformOwned`). They are sent only when the template sets them (or set them before, so removing them resets grouping to `single` and clears labels/annotations). |

Settings left out of the template are reset to PostHog's defaults on update and are not reported, so they do not show as drift.

`Fn::GetAtt`: `Id`, `CheckIntervalMinutes`, `PlatformOwned`, `CreatedAt`, `UpdatedAt`.

Not modelled: runtime state (`state`, `next_check_at`, `last_checked_at`, `last_notified_at`, `last_error_message`, `consecutive_failures`, `state_timeline`, `first_enabled_at`), `snooze_until` (an operational toggle, left to the PostHog UI), and notification destinations (managed by PostHog's separate `/logs/alerts/{id}/destinations/` endpoints).

Delete removes the alert (hard delete).

See [examples/logs-alert.yaml](examples/logs-alert.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
