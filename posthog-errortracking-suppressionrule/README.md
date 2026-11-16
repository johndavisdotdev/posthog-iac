# PostHog::ErrorTracking::SuppressionRule

Manages a [PostHog error tracking](https://posthog.com/docs/error-tracking) suppression rule: incoming exceptions that match the filters are dropped before they create or update issues.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Filters` | Optional JSON property-group filter (`{"type": "AND", "values": [...]}`); pass it with `Fn::ToJsonString`. Omit it for a match-all rule. Removing it from the template turns the rule into a match-all rule. |
| `SamplingRate` | Probability (0 to 1) that a matching event is dropped. Defaults to 1.0 (drop every match); removing it resets it to 1.0. |
| `OrderKey` | Optional evaluation priority; lower runs first. Set with PostHog's `reorder` endpoint (also after create). Only reported when the template sets it. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

Delete removes the rule (hard delete). `disabled_data` is server state and is not modelled.

See [examples/suppression-rule.yaml](examples/suppression-rule.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
