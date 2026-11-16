# PostHog::Organizations::Domain

Manages a [PostHog organization domain](https://posthog.com/docs/settings/sso): an email domain the organization claims, used for SSO enforcement, SAML and just-in-time provisioning.

| Property | Notes |
|---|---|
| `OrganizationId` | Required, create-only. Part of the primary identifier. |
| `Domain` | Required, create-only (changing it replaces the resource and needs a new verification). |
| `JitProvisioningEnabled`, `SsoEnforcement` | Removing them from the template turns JIT provisioning off and SSO enforcement off. `SsoEnforcement` is a provider name such as `google-oauth2`, `github`, `gitlab` or `saml`. |

`Fn::GetAtt`: `Id`, `IsVerified`, `VerifiedAt`, `VerificationChallenge`, `ScimBaseUrl`.

PostHog verifies the domain through a DNS TXT record named `_posthog-challenge.<domain>` whose value is `VerificationChallenge` (see the example, which creates it in Route 53). The resource does not wait for or trigger verification; trigger it in PostHog once the record has propagated. JIT provisioning and SSO enforcement only take effect on a verified domain.

See [examples/domain.yaml](examples/domain.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
