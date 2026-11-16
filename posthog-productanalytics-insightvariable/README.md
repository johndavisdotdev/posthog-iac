# PostHog::ProductAnalytics::InsightVariable

Manages a PostHog SQL variable (`insight_variables` in the API): a named, typed value that SQL insights reference as `{variables.code_name}`.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. PostHog derives `CodeName` from it, so renaming changes `CodeName`. |
| `Type` | Required. `String`, `Number`, `Boolean`, `List` or `Date`. |
| `DefaultValue` | A string, interpreted by `Type`: plain text for `String`, `Date` and single-value `List`; a number such as `"42"` for `Number` (sent as a JSON number); `"true"`/`"false"` for `Boolean`; a JSON array (`Fn::ToJsonString`) for a multi-value `List`. Your spelling is kept when PostHog returns the same value. |
| `Values`, `IsMulti`, `ValuesQuery`, `ValuesQueryConnectionId` | List options. Removing them clears them in PostHog. |

`Fn::GetAtt`: `Id` (UUID), `CodeName`, `CreatedAt`.

See [examples/insightvariable.yaml](examples/insightvariable.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
