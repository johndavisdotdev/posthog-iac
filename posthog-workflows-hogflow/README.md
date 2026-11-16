# PostHog::Workflows::HogFlow

Manages a PostHog [workflow](https://posthog.com/docs/workflows) (hog flow): a trigger followed by a graph of actions that PostHog runs for each person who enters it.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Actions` | Required. JSON array of action nodes; pass it with `Fn::ToJsonString`. Exactly one node must have `type: trigger`: its `config` is the workflow trigger. |
| `Edges` | JSON array of `{from, to, type, index?}` edges. Removing it clears the edges. |
| `Status` | `draft` (PostHog default), `active` or `archived`. Removing it sets the workflow back to `draft`. |
| `ExitCondition` | Default `exit_only_at_end`. `exit_on_conversion*` need `Conversion`. |
| `Conversion`, `Variables` | JSON (`Fn::ToJsonString`). Removing them clears them. |
| `TriggerMasking` | `{Hash, Ttl, Threshold}` dedup/throttle on the trigger. Removing it disables masking. |
| `EmailSendingRateLimit` | `{Count, Period: minute\|hour}` email pacing. Removing it disables pacing. |
| `OriginProduct` | Create-only. `loops`, `broadcasts` or `transactional_emails`. |
| `Description`, `Tags` | Removing them clears them in PostHog. |

`Fn::GetAtt`: `Id`, `Trigger` (JSON, derived by PostHog from the trigger action), `Version`, `CreatedAt`, `UpdatedAt`.

Notes:

- The API's `trigger` field is read-only: PostHog derives it from the trigger action, so it is exposed as the read-only `Trigger` attribute. Define the trigger in `Actions`.
- PostHog adds fields to actions (timestamps, compiled filter bytecode). Read keeps the template's JSON string as long as every value it sets matches PostHog's, so these additions are not reported as drift; changed values are.
- PostHog stores `exit_on_trigger_not_matched*` as `exit_only_at_end`/`exit_on_conversion` for triggers other than event and cohort triggers, which shows up as drift.
- Out of scope: schedules, batch jobs, staged drafts/publish, runs and invocations. Updates PATCH the live workflow.
- Delete hard-deletes the workflow.

See [examples/hogflow.yaml](examples/hogflow.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
