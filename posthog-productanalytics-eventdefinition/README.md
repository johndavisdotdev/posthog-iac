# PostHog::ProductAnalytics::EventDefinition

Manages a PostHog [event definition](https://posthog.com/docs/data/data-management): the metadata PostHog keeps for an event name (description, tags, owner, verification, visibility and schema enforcement). Requires a PostHog plan with data management.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required, create-only (renaming replaces the definition). `ProjectId` + `Name` is an additional identifier. |
| `Description`, `Tags`, `Owner`, `PrimaryProperty`, `DefaultColumns` | Removing them from the template clears them in PostHog. `Owner` is a numeric user ID. |
| `Verified`, `Hidden`, `PostToSlack` | Default to false. |
| `EnforcementMode` | `allow` (default) or `reject` events that don't match the event's schema. |

`Fn::GetAtt`: `Id`, `CreatedAt`.

PostHog creates event definitions automatically when it ingests an event for the first time. Create looks the name up first and fails with `AlreadyExists` if a definition exists (a duplicate-name error from the API maps to `AlreadyExists` too). To manage such an event, [import](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import.html) it with its `ProjectId` and `Id`.

Delete hard-deletes the definition. PostHog recreates it if the event is ingested again. Usage statistics (`last_seen_at`, volumes) are not part of the model.

See [examples/eventdefinition.yaml](examples/eventdefinition.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
