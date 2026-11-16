# PostHog::ProductAnalytics::SchemaPropertyGroup

Manages a PostHog schema property group: a reusable, named set of typed properties attached to event definitions to describe and enforce their schema (see [data management](https://posthog.com/docs/data/data-management)).

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Description` | Removing it from the template clears it in PostHog. |
| `Properties` | The group's properties: `Name` and `PropertyType` (`DateTime`, `String`, `Numeric`, `Boolean`, `Object`, `Array`) are required; `IsRequired` and `IsOptionalInTypes` default to false. Names must be unique within the group. Order does not matter. |

`Fn::GetAtt`: `Id`, `CreatedAt`.

On update the handler sends the full property list; properties that keep their `Name` are sent with their existing PostHog ID so they are updated in place, properties removed from the template are removed from the group. The list of events that use the group is computed by PostHog and is not part of the model.

Delete hard-deletes the group.

See [examples/schemapropertygroup.yaml](examples/schemapropertygroup.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
