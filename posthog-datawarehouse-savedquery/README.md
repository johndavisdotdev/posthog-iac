# PostHog::DataWarehouse::SavedQuery

Manages a [PostHog data warehouse view](https://posthog.com/docs/data-warehouse/views) (saved query): a named HogQL query that can be queried like a table and optionally materialized.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. Unique; used as the table name in HogQL. |
| `Query` | Required. JSON object `{"kind": "HogQLQuery", "query": "SELECT ..."}`; pass it with `Fn::ToJsonString`. |
| `SyncFrequency` | `never`, `15min`, `30min`, `1hour`, `6hour`, `12hour`, `24hour`, `7day` or `30day`. Unset means no scheduled materialization. Only sent on update when it changes. |
| `Incremental` | Incremental materialization (`IncrementalKey`, `UniqueKey` required; `Enabled`, `LookbackSeconds`). |
| `Description`, `FolderId`, `IsTest`, `Incremental` | Removing them from the template clears them in PostHog. |
| `AcknowledgeBreakingChanges` | Write-only. Set to `true` to allow an update that removes columns used by downstream views. |

`Fn::GetAtt`: `Id`, `Status`, `IsMaterialized`, `LastRunAt`, `LatestError`, `CreatedAt`, `UpdatedAt` (materialization status is read-only).

Notes:

- PostHog refuses a query change unless the caller sends the revision it last read. Update reads the view first and sends its `latest_history_id` as `edited_history_id`.
- A view marked `deleted` is reported as not found and skipped by List.

See [examples/savedquery.yaml](examples/savedquery.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
