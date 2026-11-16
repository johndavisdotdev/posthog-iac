# PostHog::FeatureFlags::ScheduledChange

Manages a [PostHog scheduled flag change](https://posthog.com/docs/feature-flags/scheduled-flag-changes): a change PostHog applies to a feature flag at a set time, once or on a recurring schedule.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `RecordId` | Required. ID of the flag to change (`!GetAtt <Flag>.Id`). |
| `ModelName` | `FeatureFlag`, the only supported value and the default. |
| `Payload` | Required JSON object (pass it with `Fn::ToJsonString`) with `operation` and `value`: `update_status` (`true`/`false`), `add_release_condition` (`groups`, `payloads`, `multivariate`) or `update_variants` (`variants`, `payloads`). |
| `ScheduledAt` | Required ISO 8601 date-time. A value PostHog reformats (e.g. a different offset for the same instant) is not reported as drift. |
| `IsRecurring`, `RecurrenceInterval`, `CronExpression`, `EndDate` | Recurring schedules (only for `update_status`). `IsRecurring: true` needs `RecurrenceInterval` (`daily`, `weekly`, `monthly`, `yearly`) or `CronExpression`. Removing them from the template clears them. |

Read-only execution state: `ExecutedAt`, `LastExecutedAt`, `FailureReason`, plus `Timezone`, `CreatedAt`, `UpdatedAt`. All are available with `Fn::GetAtt`, as is `Id`.

When an approval policy applies, the change only runs at its scheduled time if its change request has been approved; the change request summary is not part of the model.

Delete hard-deletes the scheduled change. It does not undo a change that has already been applied to the flag.

See [examples/scheduledchange.yaml](examples/scheduledchange.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
