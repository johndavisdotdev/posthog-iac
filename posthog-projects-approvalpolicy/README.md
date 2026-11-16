# PostHog::Projects::ApprovalPolicy

Manages a PostHog approval policy: changes of one kind (the `ActionKey`) in a project must be approved by the configured approvers before PostHog applies them.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `ActionKey` | Required. The gated action, e.g. `feature_flag.update`. |
| `ApproverConfig` | Required. JSON object (pass it with `Fn::ToJsonString`) describing who approves and the quorum. |
| `Conditions` | JSON object (`Fn::ToJsonString`) narrowing which changes need approval. Removing it resets it to `{}`. |
| `BypassOrgMembershipLevels` | JSON array (`Fn::ToJsonString`) of organization membership levels that skip approval. Removing it resets it to `[]`. |
| `BypassRoles` | Role IDs (UUIDs) whose members skip approval. Removing it clears the list. |
| `AllowSelfApprove` | Defaults to `false`. Removing it resets it to `false`. |
| `Enabled` | Defaults to `true`. Removing it resets it to `true`. |
| `ExpiresAfter` | Duration after which pending change requests expire, e.g. `7 00:00:00` (Django format) or `P7D` (ISO 8601). Your spelling is kept when PostHog returns an equivalent value. Only sent when set: removing it from the template leaves PostHog's current value in place. |

`Fn::GetAtt`: `Id` (UUID), `CreatedAt`, `UpdatedAt`.

The PostHog OpenAPI spec leaves `ApproverConfig`, `Conditions` and `BypassOrgMembershipLevels` untyped, which is why they are JSON strings. Approval policies may need a PostHog plan that includes approvals.

See [examples/approvalpolicy.yaml](examples/approvalpolicy.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
