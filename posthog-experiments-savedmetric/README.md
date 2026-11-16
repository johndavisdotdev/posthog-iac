# PostHog::Experiments::SavedMetric

Manages a PostHog [shared experiment metric](https://posthog.com/docs/experiments/metrics): an `ExperimentMetric` definition that can be attached to many experiments (see `SavedMetrics` on `PostHog::Experiments::Experiment`).

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. Unique within the project (case-insensitive). |
| `Query` | Required. JSON `ExperimentMetric` object (`kind: ExperimentMetric`, `metric_type` `mean`/`funnel`/`ratio`/`quantile`/`retention`); pass it with `Fn::ToJsonString`. |
| `Description`, `Tags` | Removing them from the template clears them in PostHog. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

PostHog adds keys to the query (for example a metric `uuid`). The template's JSON string is kept as long as every value it sets matches what PostHog returns, so these additions are not reported as drift. Delete hard-deletes the metric.

See [examples/savedmetric.yaml](examples/savedmetric.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
