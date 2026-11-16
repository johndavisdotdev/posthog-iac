# PostHog::ErrorTracking::AssignmentRule

Manages a [PostHog error tracking assignment rule](https://posthog.com/docs/error-tracking/assigning-issues): new issues whose exceptions match the filters are assigned to a user or role.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Filters` | Required. A JSON property-group filter (`{"type": "AND", "values": [...]}`); pass it with `Fn::ToJsonString`. |
| `Assignee` | Required. `Type` is `user` (with a numeric user ID) or `role` (with a role UUID). |
| `OrderKey` | Optional evaluation priority; lower runs first and the first match wins. Changed with PostHog's `reorder` endpoint. Only reported when the template sets it, so reordering in the PostHog UI does not show drift otherwise. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

Delete removes the rule (hard delete). PostHog's `disabled_data` (set when a rule stops matching) is runtime state and is not modelled.

See [examples/assignment-rule.yaml](examples/assignment-rule.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
