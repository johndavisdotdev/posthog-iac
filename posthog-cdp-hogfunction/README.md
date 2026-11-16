# PostHog::CDP::HogFunction

Manages a PostHog [hog function](https://posthog.com/docs/cdp): a destination, transformation, site app or webhook source that runs Hog code on events.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Type` | Required, create-only. `destination`, `site_destination`, `internal_destination`, `source_webhook`, `warehouse_source_webhook`, `site_app`, `transformation` or `transformation_log`. |
| `Name` | Required. |
| `TemplateId` | Create-only. Create from a PostHog template (e.g. `template-slack`); PostHog copies its code, inputs schema and defaults. |
| `Hog` | Source code. Required unless `TemplateId` is set. |
| `InputsSchema` | JSON array (`Fn::ToJsonString`) of input definitions. Mark secret inputs with `"secret": true`. |
| `Inputs` | JSON object of **non-secret** input values: `{"url": {"value": "..."}}`. |
| `SecretInputs` | **Write-only.** JSON object of secret input values, same shape as `Inputs`. Never returned by Read. |
| `Filters`, `Mappings` | JSON (`Fn::ToJsonString`). |
| `Masking` | `{Hash, Ttl, Threshold}`: suppress repeat events with the same hash. |
| `Description`, `Enabled`, `IconUrl`, `ExecutionOrder` | Removing them clears them in PostHog. |

`Fn::GetAtt`: `Id`, `CreatedAt`, `UpdatedAt`.

## Secret inputs

PostHog keeps all input values in one `inputs` object. This type splits it in two:

- `Inputs` holds non-secret values. It is read back, so drift (for example a changed URL) is detected.
- `SecretInputs` holds API tokens and passwords. It is a write-only property: CloudFormation sends it on create and update and never expects it back, and Read never returns it. Pass the values with a dynamic reference (`{{resolve:secretsmanager:...}}`) so they do not appear in the template either.

On create and update the handler merges both objects and sends them as `inputs`; secret values are never logged. A key may be in only one of the two. When `InputsSchema` is set, every `SecretInputs` key must be marked `"secret": true` in it (PostHog only encrypts and redacts inputs marked secret), and a key marked secret must not be in `Inputs`; violations return `InvalidRequest` before any API call. When the schema comes from a template, the template decides which inputs are secret.

Read drops every input the stored schema marks secret, every value PostHog redacts as `{"secret": true}`, and every key the request put in `SecretInputs`. Because secret values are not read back, changing a secret outside CloudFormation is not detected as drift; change `SecretInputs` (or the secret it resolves) and update the stack to rotate it.

A single write-only `Inputs` property would have been simpler, but it would have hidden drift in every non-secret input as well.

## Notes

- With `TemplateId`, the template's code, inputs schema, filters, mappings, masking and icon are kept when the corresponding property is omitted, and they are not reported by Read (so the template's defaults do not show as drift). Set the property to manage it.
- PostHog adds compiled fields (`bytecode`, `transpiled`, `order`) to filters and inputs. They are stripped, and JSON strings are kept as long as every value they set matches PostHog's.
- Secret inputs inside `Mappings` are not handled separately; keep secrets in top-level inputs.
- Staged drafts, revisions, logs, metrics and invocations are out of scope. Updates PATCH the live function.
- Delete soft-deletes the function (PostHog does not allow a hard delete). A soft-deleted function is reported as not found.

See [examples/hogfunction.yaml](examples/hogfunction.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
