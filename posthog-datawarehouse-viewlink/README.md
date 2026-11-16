# PostHog::DataWarehouse::ViewLink

Manages a [PostHog data warehouse join](https://posthog.com/docs/data-warehouse/join) (view link): a join of a table or view onto a source table, reachable as `<source table>.<FieldName>` in HogQL. Uses the `warehouse_view_links` API.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `SourceTableName`, `SourceTableKey` | Required. Table the join starts from and its join key (column or HogQL expression). |
| `JoiningTableName`, `JoiningTableKey` | Required. Table or view joined on and its join key. |
| `FieldName` | Required. Accessor added to the source table, e.g. `person` in `events.person`. |
| `Configuration` | Optional JSON object (e.g. experiments optimization flags); pass it with `Fn::ToJsonString`. Removing it clears it. |

`Fn::GetAtt`: `Id`, `CreatedAt`.

A join marked `deleted` is reported as not found and skipped by List.

See [examples/viewlink.yaml](examples/viewlink.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
