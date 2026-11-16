# PostHog::Projects::SecretApiKey

Manages a PostHog project secret API key (`phs_...`): a project-scoped key with a fixed set of API scopes, for server-side use.

PostHog returns the key value **only once**, in the create response. The handler writes it to the Secrets Manager secret you name in `SecretsManagerSecretArn` and never puts it in the resource model, logs or events.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Label` | Required, at most 40 characters. Updated in place. |
| `Scopes` | Required, at least one scope (e.g. `feature_flag:read`, `query:read`). Updated in place. The key can access every object of a granted type, regardless of per-object access controls. |
| `SecretsManagerSecretArn` | Required, create-only, write-only. An existing secret (e.g. an `AWS::SecretsManager::Secret` in the same template). The handler stores the key value as its secret string. Changing it replaces the key. |

`Fn::GetAtt`: `Id`, `MaskValue`, `CreatedAt`.

Notes:

- The resource type's execution role needs `secretsmanager:PutSecretValue` on the secret (the create handler declares it), plus `kms:GenerateDataKey` on a customer managed KMS key if the secret uses one.
- If the secret cannot be written, the new key is deleted again and the create fails, so no unrecoverable key is left behind.
- Delete deletes the key in PostHog. The secret is not deleted; it belongs to your template.
- Rolling the key (`POST .../roll/`) is not supported. To rotate it, change `SecretsManagerSecretArn` (or replace the resource), which creates a new key and deletes the old one.

See [examples/secretapikey.yaml](examples/secretapikey.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API and a fake Secrets Manager
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
