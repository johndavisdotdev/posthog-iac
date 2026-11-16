# PostHog::ErrorTracking::GroupingRule

Manages a [PostHog error tracking grouping rule](https://posthog.com/docs/error-tracking/grouping-issues): exceptions that match the filters are grouped into the same issue.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Filters` | Required. A JSON property-group filter (`{"type": "AND", "values": [...]}`); pass it with `Fn::ToJsonString`. |
| `Assignee` | Optional, create-only (PostHog's update endpoint only accepts filters). `Type` is `user` (numeric user ID) or `role` (role UUID). |
| `Description` | Optional, create-only for the same reason. |
| `OrderKey` | Optional evaluation priority; lower runs first. Set with PostHog's `reorder` endpoint (also after create). Only reported when the template sets it. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

Changing `Assignee` or `Description` replaces the rule. Delete removes the rule (hard delete). The linked `issue` and `disabled_data` are server state and are not modelled.

See [examples/grouping-rule.yaml](examples/grouping-rule.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
