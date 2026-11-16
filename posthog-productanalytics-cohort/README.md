# PostHog::ProductAnalytics::Cohort

Manages a [PostHog cohort](https://posthog.com/docs/data/cohorts): a named group of persons used in insights, feature flags and audiences.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Description` | Removing it from the template clears it in PostHog. |
| `Filters` | JSON object with a `properties` filter group (person properties, behavioral conditions, other cohorts). Pass it with `Fn::ToJsonString`. Removing it clears the filters. |
| `Query` | JSON HogQL query for query-based (analytical) cohorts. Pass it with `Fn::ToJsonString`. |
| `IsStatic` | Create-only. A static cohort is a fixed list of persons; fill it in PostHog (CSV upload or "add to cohort"). Membership is not managed by this resource. |
| `CohortType` | `static`, `person_property`, `behavioral`, `realtime` or `analytical`. PostHog derives it from the filters when unset, and the derived value is not reported. |

`Fn::GetAtt`: `Id`, `CreatedAt`.

PostHog adds derived keys (for example compiled `bytecode`) to stored filters. Read keeps the template's `Filters` string as long as every value it sets is unchanged in PostHog, so those additions are not reported as drift; a changed value is.

Saving filters makes PostHog recalculate the cohort. Membership counts and calculation status are not part of the resource.

Delete soft-deletes the cohort (PostHog does not allow a hard delete). A soft-deleted cohort is reported as not found.

See [examples/cohort.yaml](examples/cohort.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
