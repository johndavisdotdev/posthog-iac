# PostHog::ProductAnalytics::Action

Manages a [PostHog action](https://posthog.com/docs/data/actions): a named, reusable event definition.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. Unique within the project. |
| `Description`, `Tags`, `SlackMessageFormat`, `PostToSlack` | Removing them from the template clears them in PostHog. |
| `Steps` | The action matches an event that satisfies any step. `TextMatching`/`HrefMatching`/`UrlMatching` are `exact`, `contains` or `regex`. `Properties` is a JSON array of property filters; pass it with `Fn::ToJsonString`. |

`Fn::GetAtt`: `Id`, `CreatedAt`.

Delete soft-deletes the action (PostHog does not allow a hard delete). A soft-deleted action is reported as not found.

See [examples/action.yaml](examples/action.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
