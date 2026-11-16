# PostHog::Experiments::WebExperiment

Manages a PostHog [no-code web experiment](https://posthog.com/docs/experiments/no-code-web-experiments): DOM changes per variant that posthog-js applies on your site, served through a feature flag PostHog creates.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Variants` | Required. JSON object keyed by variant key; each variant has `transforms` (`selector`, `text`, `html`, `css`), optional `conditions` and `rollout_percentage`. Pass it with `Fn::ToJsonString`. |

`Fn::GetAtt`: `Id`, `FeatureFlagKey` (the flag PostHog created), `CreatedAt`.

Notes:

- A web experiment is an experiment of type `web`. Metrics, launch dates and other experiment settings are not exposed by this endpoint; use `PostHog::Experiments::Experiment` for product experiments.
- Keys PostHog adds to the variants are not reported as drift as long as every value in the template matches.
- Delete calls `DELETE` (hard delete). An experiment that was soft-deleted elsewhere is reported as not found.

See [examples/webexperiment.yaml](examples/webexperiment.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
