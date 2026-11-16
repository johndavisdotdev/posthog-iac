# PostHog::Experiments::Experiment

Manages a [PostHog experiment](https://posthog.com/docs/experiments): a feature flag with variants plus the metrics used to compare them.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `FeatureFlagKey` | Required, create-only. PostHog creates the flag when no flag with this key exists, otherwise links to the existing flag. |
| `FeatureFlag` | Create-only, write-only. JSON flag config (`filters.multivariate.variants`, `filters.groups`, `ensure_experience_continuity`) for a new flag; pass it with `Fn::ToJsonString`. Cannot be combined with an existing flag's key. After creation, manage the flag itself (for example with `PostHog::FeatureFlags::FeatureFlag`). |
| `FeatureFlagRuleId` | Create-only. Experiment rule of an existing flag with rules. |
| `Metrics`, `MetricsSecondary` | JSON arrays of `ExperimentMetric` objects. |
| `Parameters`, `ExposureCriteria`, `StatsConfig` | JSON objects. |
| `SavedMetrics` | Shared metrics (`Id`, `Type` = `primary`/`secondary`). |
| `HoldoutId` | ID of a `PostHog::Experiments::Holdout`. |
| `StartDate`, `EndDate` | Setting `StartDate` launches the experiment; setting `EndDate` stops it. |
| `Description`, `Tags`, `ExcludedVariants`, `Conclusion`, `ConclusionComment`, `Repository`, `Archived`, `OnlyCountMaturedUsers` | Removing them from the template clears them in PostHog. |
| `AllowUnknownEvents` | Write-only. Skips PostHog's check that metric events have been ingested. |

`Fn::GetAtt`: `Id`, `FeatureFlagId`, `Status`, `CreatedAt`, `UpdatedAt`.

Notes:

- Experiment results, health and other computed data are never part of the model.
- PostHog adds keys to the JSON properties (metric `uuid`s, flag config projected into `parameters`, defaults). The template's JSON string is kept as long as every value it sets matches what PostHog returns, so these additions are not reported as drift.
- `Type`, `ExposureCriteria` and `StatsConfig` have server defaults; they are only reported when the template sets them. Removing `Type` from the template keeps the current type.
- Delete soft-deletes the experiment (PostHog does not allow a hard delete); the linked feature flag is left in place. A soft-deleted experiment is reported as not found.
- List also returns archived experiments.

See [examples/experiment.yaml](examples/experiment.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
