# PostHog::Organizations::IdentityProviderConfig

Manages a PostHog identity provider configuration: [SAML, OIDC](https://posthog.com/docs/settings/sso), SCIM or ID-JAG (XAA) settings for an organization, applied to all organization domains or to selected ones.

| Property | Notes |
|---|---|
| `OrganizationId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `ConfigScope` | `saml`, `oidc`, `scim` or `xaa`. |
| `DomainScope`, `OrganizationDomainIds` | `all` or `selected`; with `selected`, the IDs of `PostHog::Organizations::Domain` resources. |
| `OidcIssuerUrl`, `OidcClientId`, `OidcClientSecret` | OIDC settings. `OidcClientSecret` is **write-only**: never read back. |
| `SamlEntityId`, `SamlAcsUrl`, `SamlX509Cert` | SAML settings. `SamlX509Cert` (PEM) is **write-only**. |
| `ScimEnabled`, `ScimBearerTokenSecretArn` | See below. |
| `IdJagIssuerUrl`, `IdJagJwksUrl`, `IdJagAllowedClients` | ID-JAG (XAA) settings. |

Every writable property is sent on update, so removing one from the template clears it in PostHog. In particular, removing `OidcClientSecret` deletes the saved secret and removing `SamlX509Cert` clears the certificate. Pass secrets with dynamic references (`{{resolve:secretsmanager:...}}`).

**SCIM.** Enabling SCIM makes PostHog generate a bearer token that it returns only once. The handler writes it as a new version of the existing Secrets Manager secret in `ScimBearerTokenSecretArn` (required when `ScimEnabled` is true; the handler needs `secretsmanager:PutSecretValue` on it) and never puts it in the resource model. `scim_enabled` is only sent when it changes, so later updates do not rotate the token. If the secret cannot be written, Create deletes the new configuration and Update turns SCIM off again, so the token is never lost silently. Setting `ScimEnabled` to false clears the token in PostHog.

`Fn::GetAtt`: `Id`, `SamlRelayState`, `ScimBaseUrl`, `HasSaml`, `HasOidc`, `HasOidcClientSecret`, `HasScim`, `HasIdJag`, `CreatedAt`, `UpdatedAt`.

See [examples/identityproviderconfig.yaml](examples/identityproviderconfig.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
