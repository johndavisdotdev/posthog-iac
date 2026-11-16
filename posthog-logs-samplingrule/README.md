# PostHog::Logs::SamplingRule

Manages a [PostHog Logs](https://posthog.com/docs/logs) sampling rule, which reduces ingested log or span volume.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required, up to 255 characters. |
| `RuleType` | Required. `severity_sampling`, `path_drop` or `rate_limit`. Span rules support `path_drop` and `rate_limit` only. |
| `Config` | Required. Type-specific JSON object; pass it with `Fn::ToJsonString`. See the property description in the schema for each rule type's keys. |
| `Source` | Create-only. `logs` (default) or `spans`. Changing it replaces the rule. |
| `Enabled` | Defaults to `false`. Removing it from the template disables the rule. |
| `Priority` | Lower numbers are evaluated first; logs and span rules have separate orders. When omitted, PostHog appends the rule and the assigned value is not reported (removing it from the template keeps the current priority). |
| `ScopeService`, `ScopePathPattern`, `ScopeAttributeFilters` | Optional legacy scopes (`ScopeAttributeFilters` is a JSON array). Removing them from the template clears them. Prefer `filter_group` in `Config`. |

`Fn::GetAtt`: `Id`, `Version`, `CreatedAt`, `UpdatedAt`.

Keys PostHog adds to `Config` with server defaults are not reported as drift. List reads both the `logs` and `spans` rule sets. Delete hard-deletes the rule.

The API key needs the `logs:read` and `logs:write` scopes.

See [examples/samplingrule.yaml](examples/samplingrule.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
