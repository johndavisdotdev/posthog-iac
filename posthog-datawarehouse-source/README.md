# PostHog::DataWarehouse::Source

Manages a [PostHog data warehouse source](https://posthog.com/docs/cdp/sources): a connection to an external system (Postgres, Stripe, Hubspot, ...) whose tables PostHog syncs into the warehouse or queries live.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `SourceType` | Required, create-only, e.g. `Postgres`, `Stripe`. |
| `Payload` | Required, **write-only**. Connection credentials and settings as a JSON object; pass it with `Fn::ToJsonString` and resolve secrets with dynamic references. Keys depend on `SourceType`. A `schemas` array picks which tables sync (create only). |
| `AccessMethod` | Create-only. `warehouse` (default) or `direct`. |
| `DestinationIds` | Create-only, write-only. Destinations every table writes to. |
| `Prefix`, `Description`, `DirectQueryEnabled`, `AutoSyncNewSchemas`, `AutoSyncSchemaPatterns` | Removing them from the template clears them in PostHog. |

`Fn::GetAtt`: `Id`, `Status`, `LatestError`, `LastRunAt`, `CreatedAt`.

Notes:

- PostHog's create endpoint returns only the new ID and does not accept the auto-sync settings, so Create POSTs the source, PATCHes `AutoSyncNewSchemas`/`AutoSyncSchemaPatterns` when set (deleting the source again if that fails), then reads it back.
- PostHog never returns credentials, so changes made outside CloudFormation to the connection are not detected as drift. When `Payload` changes in the template, Update sends the new values (minus `schemas`) as the source's `job_inputs`; PostHog validates them against the source type. Table selection and per-table sync settings are not managed after create.
- Delete hard-deletes the source and the tables it synced.

See [examples/source.yaml](examples/source.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
