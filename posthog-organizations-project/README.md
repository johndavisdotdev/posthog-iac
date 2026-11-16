# PostHog::Organizations::Project

Manages a [PostHog project](https://posthog.com/docs/settings/projects) and its main settings.

> **Warning: deleting this resource deletes the PostHog project and all of its data** (events, persons, session recordings, insights, dashboards, feature flags and every other object in the project). This cannot be undone. It happens when the resource is removed from the template, when the stack is deleted, and when a change to a create-only property (`OrganizationId`) replaces the project. Set `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` on production projects (the example does), and consider a stack policy.

| Property | Notes |
|---|---|
| `OrganizationId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. Unique within the organization (case-insensitive). |
| `ProductDescription`, `Tags`, `AppUrls`, `Timezone`, `WeekStartDay`, `BaseCurrency`, `BusinessModel` | General settings. `Timezone` is an IANA name; `BaseCurrency` an ISO 4217 code; `WeekStartDay` is `0` (Sunday) or `1` (Monday). PostHog lowercases tags. |
| `AnonymizeIps`, `AutocaptureOptOut`, `AutocaptureExceptionsOptIn`, `AutocaptureWebVitalsOptIn`, `CaptureConsoleLogOptIn`, `CapturePerformanceOptIn`, `CaptureDeadClicks`, `HeatmapsOptIn`, `SurveysOptIn` | Data capture settings. |
| `SessionRecordingOptIn`, `SessionRecordingSampleRate`, `SessionRecordingMinimumDurationMilliseconds`, `SessionRecordingRetentionPeriod`, `RecordingDomains` | Session replay settings. The sample rate is a decimal string between `0.00` and `1.00`. |
| `DataAttributes`, `PersonDisplayNameProperties` | Ordered lists. |
| `TestAccountFilters`, `PathCleaningFilters` | JSON arrays; pass them with `Fn::ToJsonString`. `TestAccountFiltersDefaultChecked` makes new insights exclude test accounts. |

`Fn::GetAtt`: `Id` (use it as `ProjectId` for project-scoped resources), `Uuid`, `ApiToken` (the public `phc_` project key), `ApiHost`, `CreatedAt`. The project's secret API token is never exposed.

**Settings not in the template are left alone.** A project has many more settings than this type models, and most are usually managed in the PostHog UI. Create sends only the properties in the template; Update sends the properties in the template plus the ones removed since the previous version, which are reset (nullable settings to `null`, `Timezone` to `UTC`, `BaseCurrency` to `USD`, `SessionRecordingRetentionPeriod` to `30d`, `DataAttributes` to `["data-attr"]`, lists to `[]`, `AnonymizeIps`/`SessionRecordingOptIn` to `false`). Read reports only the settings the template sets, so PostHog's defaults do not show as drift; an import (identifier-only read) reports every setting.

**Delete safety.** Before sending `DELETE`, the handler checks that `Id` is a numeric project ID and reads the project, and it does nothing (returning not found) if the project does not exist, belongs to another organization, or is already pending deletion. If PostHog keeps the project visible with `is_pending_deletion` while it removes the data, the project is reported as not found and is left out of List.

See [examples/project.yaml](examples/project.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
