# PostHog::LLMAnalytics::Evaluation

Manages a [PostHog LLM analytics evaluation](https://posthog.com/docs/llm-analytics/evaluations), which scores LLM generations, traces or sessions with an LLM judge, Hog code or sentiment classification.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required, up to 400 characters. |
| `EvaluationType` | Required. `llm_judge`, `hog` or `sentiment`. |
| `OutputType` | Required. `boolean`, `numeric`, `categorical` or `sentiment`. |
| `EvaluationConfig` | JSON object (`Fn::ToJsonString`). `llm_judge`: `{prompt}`; `hog`: `{source}`; `sentiment`: `{source: user_messages}` (the default, not reported when omitted). |
| `OutputConfig` | JSON object (`Fn::ToJsonString`) with output settings such as `allows_na`, `true_is_failure`, `min`/`max`, `options`, `passing_rule`. Only reported when set in the template, because PostHog fills in defaults. |
| `Conditions` | JSON array (`Fn::ToJsonString`) of condition sets `{id, rollout_percentage, properties}`; OR between sets, AND within a set. |
| `Target`, `TargetConfig` | `generation` (default), `trace` or `session`; `TargetConfig` is the settle strategy for traces and sessions (JSON object, only reported when set). |
| `ModelConfiguration` | `Provider`, `Model` and optional `ProviderKeyId` of the judge. Required for `llm_judge`. If removed from the template of an existing `llm_judge`, PostHog keeps the current model. |
| `Description`, `DirectoryId`, `Enabled` | Removing them from the template clears them (`Enabled` defaults to `false`). |

`Fn::GetAtt`: `Id`, `Status`, `StatusReason`, `CreatedAt`, `UpdatedAt`.

Keys and condition fields PostHog adds with server defaults (e.g. `rollout_percentage: 100`) are not reported as drift. Delete soft-deletes the evaluation (PostHog does not allow a hard delete); a soft-deleted evaluation is reported as not found.

The API key needs the `evaluation:read` and `evaluation:write` scopes.

See [examples/evaluation.yaml](examples/evaluation.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
