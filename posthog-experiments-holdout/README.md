# PostHog::Experiments::Holdout

Manages a [PostHog experiment holdout](https://posthog.com/docs/experiments/holdouts): a stable slice of users excluded from every experiment that references it.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Description` | Removing it from the template clears it. |
| `Filters` | Required, non-empty JSON array of release condition groups (pass it with `Fn::ToJsonString`). Each group's `rollout_percentage` is the share of users held back; `properties` narrows the group. Don't set `variant`: PostHog sets it to `holdout-<id>`, and it is ignored when comparing and left out of the model. Only the first group's `rollout_percentage` is embedded in linked experiments' flags. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`. Reference the holdout from an experiment by its `Id`.

Delete hard-deletes the holdout.

See [examples/holdout.yaml](examples/holdout.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
