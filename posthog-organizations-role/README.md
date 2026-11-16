# PostHog::Organizations::Role

Manages a [PostHog role](https://posthog.com/docs/settings/access-control): a named group of organization members that access controls can be granted to. Add members with `PostHog::Organizations::RoleMembership`.

| Property | Notes |
|---|---|
| `OrganizationId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. Updated in place. |

`Fn::GetAtt`: `Id`, `IsDefault`, `CreatedAt`.

Delete removes the role (and its memberships) in PostHog.

See [examples/role.yaml](examples/role.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
