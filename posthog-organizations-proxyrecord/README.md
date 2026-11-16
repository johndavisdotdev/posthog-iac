# PostHog::Organizations::ProxyRecord

Manages a [PostHog managed reverse proxy](https://posthog.com/docs/advanced/proxy/managed-reverse-proxy): a subdomain you own through which SDKs send data to PostHog.

| Property | Notes |
|---|---|
| `OrganizationId` | Required, create-only. Part of the primary identifier. |
| `Domain` | Required, create-only. A subdomain you control, e.g. `e.example.com`. |
| `RootRedirectUrl` | Optional HTTPS URL that requests to the proxy root redirect to (same registrable domain as the proxy). Removing it disables the redirect. PostHog only accepts it on update, so Create sets it with a follow-up PATCH (and deletes the new proxy if that fails). |

`Fn::GetAtt`: `Id`, `TargetCname`, `Status`, `Message`, `RootRedirectSupported`, `CreatedAt`, `UpdatedAt`.

After creation, add a CNAME record from `Domain` to `TargetCname` (see the example, which creates it in Route 53). PostHog then verifies the record and issues a certificate; `Status` moves from `waiting` through `issuing` to `valid`. The resource does not wait for that, so `Status` reflects the state at the last create, update or read.

Delete removes waiting, erroring and timed-out proxies immediately. For a live proxy PostHog starts a clean-up workflow and the record stays visible with status `deleting`; such a record is reported as not found and is left out of List. The number of proxies is limited by the organization's plan.

See [examples/proxyrecord.yaml](examples/proxyrecord.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
