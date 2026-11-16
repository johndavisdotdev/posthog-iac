# PostHog::ProductAnalytics::Subscription

Manages a [PostHog subscription](https://posthog.com/docs/product-analytics/subscriptions): a scheduled delivery of an insight, a dashboard or an AI-generated report to email, Slack or Microsoft Teams.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Insight`, `Dashboard`, `Prompt` | Set exactly one. `Insight` and `Dashboard` are numeric IDs (as strings) and create-only: changing them replaces the subscription. `Prompt` makes it an AI report. |
| `DashboardExportInsights` | Dashboard subscriptions: numeric IDs of the dashboard's insights to include (max 20). |
| `AiPromptConfig`, `Contexts` | AI report subscriptions only. Each `Contexts` item sets exactly one of `DashboardId` and `InsightId`. |
| `TargetType`, `TargetValue` | Required. `email` (comma-separated addresses), `slack` (channel, plus `IntegrationId`) or `teams` (webhook URL). PostHog only returns the host of a Teams URL; the template value is kept when it matches. |
| `Frequency`, `Interval`, `Byweekday`, `Bysetpos`, `Count`, `StartDate`, `UntilDate` | Schedule. `Frequency` and `StartDate` are required; `Interval` defaults to 1. Timestamps equal to the template's are kept verbatim. |
| `Enabled` | Defaults to true. PostHog sets it to false when the delivery integration becomes invalid, which shows as drift. |
| `SummaryEnabled`, `SummaryPromptGuide` | AI summary, insight and dashboard subscriptions only. |
| `DeliveryConfig` | Rendering options. Removing it from the template clears it. |
| `SendTestNow`, `InviteMessage` | Write-only. `SendTestNow` defaults to **false** here (the PostHog API defaults to true on create), so stack operations don't send test deliveries. |

Removing an optional property from the template clears it in PostHog.

`Fn::GetAtt`: `Id`, `ResourceType`, `InsightShortId`, `Summary`, `NextDeliveryDate`, `CreatedAt`.

Delete soft-deletes the subscription (PostHog does not allow a hard delete). A soft-deleted subscription is reported as not found.

See [examples/subscription.yaml](examples/subscription.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
