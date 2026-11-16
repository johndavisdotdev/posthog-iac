# PostHog::FeatureFlags::EarlyAccessFeature

Manages a [PostHog early access feature](https://posthog.com/docs/feature-flags/early-access-feature-management): a feature users opt in to, backed by a feature flag.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name`, `Stage` | Required. `Stage` is `draft`, `concept`, `alpha`, `beta`, `general-availability` or `archived`; the active stages (alpha, beta, general-availability) enable the flag for opted-in users. |
| `Description`, `DocumentationUrl`, `ImageUrl` | Removing them from the template clears them. |
| `FeatureFlagId` | Create-only. Links an existing flag (not multivariate, not group-based, not owned by another product). If omitted, PostHog creates a flag from the feature name. Changing it replaces the feature. |
| `Payload` | Create-only and write-only JSON (pass it with `Fn::ToJsonString`). PostHog only accepts it on create and reports the flag's payload back in a different form, so it is not read back. |

`Fn::GetAtt`: `Id` (a UUID), `LinkedFeatureFlagId` and `FeatureFlagKey` (the backing flag, including one PostHog created), `CreatedAt`.

Delete hard-deletes the early access feature. The backing flag is managed by PostHog, not by this resource.

See [examples/earlyaccessfeature.yaml](examples/earlyaccessfeature.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
