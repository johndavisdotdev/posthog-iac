# PostHog::FeatureFlags::FeatureFlag

Manages a [PostHog feature flag](https://posthog.com/docs/feature-flags).

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Key` | Required. Unique within the project. `ProjectId` + `Key` is an additional identifier. Changing it renames the flag in place. |
| `Name` | The flag's description (PostHog keeps it in the `name` field). |
| `Filters` | Targeting as a JSON object (pass it with `Fn::ToJsonString`): `groups`, `multivariate`, `payloads`, `aggregation_group_type_index`, `early_exit`. Unset means no release conditions (`{"groups": []}`), so the flag evaluates to false for everyone. PostHog's added `null`/empty members are ignored when comparing, so they don't show as drift. |
| `Active` | Defaults to `true`. Removing it from the template re-enables the flag. |
| `Archived`, `Tags`, `IsRemoteConfiguration`, `EnsureExperienceContinuity` | Removing them from the template clears them. |
| `EvaluationRuntime` | `server`, `client` or `all` (the default). |
| `BucketingIdentifier` | `distinct_id` (the default) or `device_id`. |
| `EvaluationContexts` | Write-only: PostHog accepts it but does not return it, so drift is not detected. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

Update reads the flag first and sends its current `version`, which PostHog uses to reject concurrent edits of version 2 flags (409 → `ResourceConflict`).

Delete soft-deletes the flag (PostHog does not allow a hard delete). A soft-deleted flag is reported as not found.

Usage and analytics fields (`status`, `last_called_at`, experiments, surveys, usage dashboards) are not part of the model.

See [examples/featureflag.yaml](examples/featureflag.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
