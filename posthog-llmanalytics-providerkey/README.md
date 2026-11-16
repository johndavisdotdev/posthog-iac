# PostHog::LLMAnalytics::ProviderKey

Manages an LLM provider API key that [PostHog LLM analytics](https://posthog.com/docs/llm-analytics/evaluations) uses to run LLM-judge evaluations in a project.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Provider` | Required, create-only. `openai`, `anthropic`, `gemini`, `openrouter`, `fireworks`, `azure_openai`, `together_ai`, `minimax`, `system_one` or `openai_compatible`. |
| `Name` | Required, up to 255 characters. |
| `ApiKey` | **Write-only.** Never returned by PostHog or by Read; use `ApiKeyMasked` to identify it. Pass it with a `{{resolve:secretsmanager:...}}` dynamic reference. Changing it rotates the key; removing it from the template keeps the stored key. |
| `SetAsActive` | Write-only. When `true`, makes this the project's active key for its provider on create/update. |
| `BaseUrl`, `SystemOneModel` | For `openai_compatible` and `system_one`. |
| `AzureEndpoint`, `ApiVersion` | For `azure_openai` (and Anthropic keys served by Microsoft Foundry). |

`BaseUrl`, `SystemOneModel`, `AzureEndpoint` and `ApiVersion` are write-only in the PostHog API; they are read back from PostHog's `*_display` fields (a trailing-slash difference is not drift). They are only sent when set, so removing one from the template keeps the stored value.

`Fn::GetAtt`: `Id`, `ApiKeyMasked`, `State`, `ErrorMessage`, `CreatedAt`, `LastUsedAt`.

Delete hard-deletes the key. Evaluations pinned to it lose their key (PostHog marks them `provider_key_deleted`).

The API key in the type configuration needs the `llm_provider_key:read` and `llm_provider_key:write` scopes.

See [examples/providerkey.yaml](examples/providerkey.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
