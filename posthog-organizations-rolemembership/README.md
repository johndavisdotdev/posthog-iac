# PostHog::Organizations::RoleMembership

Adds an organization member to a [PostHog role](https://posthog.com/docs/settings/access-control).

| Property | Notes |
|---|---|
| `OrganizationId` | Required, create-only. Part of the primary identifier. |
| `RoleId` | Required, create-only. Part of the primary identifier. |
| `UserUuid` | Required, create-only. UUID of a user who is already a member of the organization. |

The primary identifier is `OrganizationId` + `RoleId` + `Id`. PostHog has no update endpoint for memberships, so every property is create-only: changing any of them replaces the membership. List needs both `OrganizationId` and `RoleId`.

`Fn::GetAtt`: `Id`, `JoinedAt`, `UpdatedAt`.

See [examples/rolemembership.yaml](examples/rolemembership.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
