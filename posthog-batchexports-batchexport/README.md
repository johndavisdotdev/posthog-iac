# PostHog::BatchExports::BatchExport

Manages a PostHog [batch export](https://posthog.com/docs/cdp/batch-exports): a scheduled export of events, persons, sessions or a HogQL query to S3, S3-compatible storage, Snowflake, Postgres, Redshift, BigQuery, Databricks or Azure Blob Storage.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name`, `Interval` | Required. `Interval`: `hour`, `day`, `week`, `every 5 minutes`, `every 15 minutes`. |
| `DestinationType` | Required, create-only. `AwsS3`, `S3Compatible`, `Snowflake`, `Postgres`, `Redshift`, `BigQuery`, `Databricks` or `AzureBlob`. |
| `DestinationIntegrationId` | ID of the PostHog integration holding the destination's credentials. PostHog requires it for every destination type. |
| `DestinationConfig` | Required. Non-secret destination settings as a JSON object (`Fn::ToJsonString`), e.g. `bucket_name`, `region`, `prefix`, `file_format`. |
| `DestinationSecretConfig` | **Write-only.** Credential fields as a JSON object, merged into the destination config on create/update. Never returned by Read. |
| `Model` | `events` (PostHog default), `persons`, `sessions` or `hogql`. |
| `HogqlQuery`, `HogqlModifiers`, `PrimaryKey`, `VersionKey`, `IncrementalMode` | For `hogql` exports. |
| `Paused` | Changes go through PostHog's pause/unpause endpoints, which also pause the schedule. |
| `Filters` | JSON array of HogQL property filters (`Fn::ToJsonString`). |
| `Timezone`, `OffsetDay`, `OffsetHour`, `StartAt`, `EndAt` | Schedule settings. Removing them resets them to PostHog's defaults. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `LastUpdatedAt`.

## Credentials

PostHog now keeps destination credentials in a team-scoped integration (`DestinationIntegrationId`), so the recommended configuration has no secrets in the template at all. For credential fields that PostHog still accepts in the destination config (for example `aws_access_key_id`/`aws_secret_access_key`, `password`, `private_key`), use `DestinationSecretConfig` with dynamic references. It is a write-only property: the handler merges it into the config it sends and never reads it back.

Read never returns credentials: it drops every field named in `DestinationSecretConfig` and every known credential field (`aws_access_key_id`, `aws_secret_access_key`, `password`, `private_key`, `client_secret`, `token`, `connection_string` and similar, at any depth, e.g. Redshift `copy_inputs`), even if PostHog were to return them. Putting a known credential field in `DestinationConfig` is rejected with `InvalidRequest`. Because credentials are not read back, a credential changed outside CloudFormation is not detected as drift.

## Notes

- PostHog adds defaults to the destination config (e.g. `file_format`). Read keeps the template's `DestinationConfig` string as long as every value it sets matches PostHog's, so these additions are not drift.
- PostHog merges a PATCHed destination config into the stored one, so a config field removed from the template may stay set in PostHog.
- `IncrementalMode` is only sent when set (the API does not accept null for it).
- Runs, backfills, logs and test steps are out of scope.
- Delete hard-deletes the batch export.

See [examples/batchexport.yaml](examples/batchexport.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
