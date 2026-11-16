# PostHog::DataWarehouse::Endpoint

Manages a [PostHog endpoint](https://posthog.com/docs/endpoints): a named HogQL or insight query exposed at `/api/projects/{project_id}/endpoints/{name}/run`.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required, create-only. Part of the primary identifier (PostHog addresses endpoints by name). Changing it replaces the endpoint. |
| `Query` | Required. JSON object with a `kind` key; pass it with `Fn::ToJsonString`. Only sent on update when it differs from the current query, since every query change creates a new endpoint version. |
| `DataFreshnessSeconds` | 900, 1800, 3600, 21600, 43200, 86400 (default) or 604800. |
| `IsActive` | Defaults to `true`. |
| `IsMaterialized` | Materialize results to S3. |
| `DerivedFromInsight` | Create-only. Short ID of the source insight. |
| `Description`, `BucketOverrides`, `Tags`, `OptionalBreakdownProperties` | Removing them from the template clears them (and resets the three settings above to their defaults). |

`Fn::GetAtt`: `Id` (also an additional identifier), `EndpointPath`, `Url`, `CurrentVersion`, `MaterializationStatus`, `CreatedAt`, `UpdatedAt`.

Notes:

- Endpoint versions are not managed; Read and Update always use the current version.
- For materialized endpoints PostHog reports the materialization node's effective freshness, which can differ from `DataFreshnessSeconds` and then shows as drift.

See [examples/endpoint.yaml](examples/endpoint.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
