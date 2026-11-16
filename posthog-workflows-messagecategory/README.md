# PostHog::Workflows::MessageCategory

Manages a PostHog [messaging category](https://posthog.com/docs/workflows): a group of workflow messages that recipients can opt out of on the preferences page.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Key` | Required, create-only. Unique within the project (e.g. `newsletter`); `[ProjectId, Key]` is an additional identifier. |
| `Name` | Required. |
| `Description`, `PublicDescription` | Removing them from the template clears them in PostHog. `PublicDescription` is shown to recipients. |
| `CategoryType` | `marketing` (PostHog default) or `transactional`. Removing it resets it to `marketing`. The default is not reported when the template omits it. |

`Fn::GetAtt`: `Id` (UUID, used as `message_category_id` in workflow message steps and as `MessageCategory` on templates), `CreatedAt`, `UpdatedAt`.

Delete archives the category (`PATCH {"deleted": true}`; PostHog does not allow a hard delete). An archived category is reported as not found.

See [examples/messagecategory.yaml](examples/messagecategory.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
