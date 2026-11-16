# PostHog::DataWarehouse::Table

Manages a [self-managed PostHog data warehouse table](https://posthog.com/docs/data-warehouse/setup/s3): files in an S3-compatible bucket that PostHog reads as one table.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. Unique; letters, numbers and underscores, starting with a letter or underscore. |
| `Format` | Required. `CSV`, `CSVWithNames`, `Parquet`, `JSONEachRow`, `Delta` or `DeltaS3Wrapper`. |
| `UrlPattern` | Required. HTTPS URL with `*` wildcards, e.g. `https://bucket.s3.amazonaws.com/orders/*.parquet`. |
| `Credential` | Required, **write-only**. `AccessKey` and `AccessSecret` for the bucket; resolve them with dynamic references. Only sent on update when changed. |
| `Options` | `CsvAllowDoubleQuotes`. Removing it clears it. |

`Fn::GetAtt`: `Id`, `HogqlName`, `CreatedAt`.

PostHog never returns the credential, so rotating it outside CloudFormation is not detected as drift. A table marked `deleted` is reported as not found. Tables synced by a data warehouse source are managed by the source, not by this type.

See [examples/table.yaml](examples/table.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
