# PostHog::Logs::RetentionRule

Manages a [PostHog Logs](https://posthog.com/docs/logs) retention rule: logs that match the rule are kept for the rule's retention period instead of the environment's default.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required, up to 255 characters. |
| `Config` | Required. JSON object; pass it with `Fn::ToJsonString`. Keys: `retention_days` (a retention tier the organization is entitled to) and `filter_group` (AND/OR tree of property filters). |
| `Enabled` | Defaults to `false`. Removing it from the template disables the rule. |
| `Priority` | Lower numbers are evaluated first; the first matching rule wins. When omitted, PostHog appends the rule after the existing ones and the assigned value is not reported (removing it from the template keeps the current priority). |

`Fn::GetAtt`: `Id`, `Version`, `CreatedAt`, `UpdatedAt`.

Keys PostHog adds to `Config` with server defaults are not reported as drift. Delete hard-deletes the rule.

The API key needs the `logs:read` and `logs:write` scopes.

See [examples/retentionrule.yaml](examples/retentionrule.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
