# PostHog::Workflows::MessageTemplate

Manages a PostHog [messaging template](https://posthog.com/docs/workflows): reusable email content that workflow email steps and the transactional email API send.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Content` | Required. JSON object keyed by channel; pass it with `Fn::ToJsonString`, e.g. `{"templating": "liquid", "email": {"subject": ..., "text": ..., "html": ..., "preheader": ...}}`. `email.subject` is required for email templates. Replaced as a whole on update. |
| `Description`, `Tags` | Removing them from the template clears them in PostHog. |
| `Type` | Message channel, currently only `email` (the PostHog default; not reported unless set). |
| `MessageCategory` | ID of a `PostHog::Workflows::MessageCategory` (`!GetAtt Category.Id`). Removing it unfiles the template. |
| `Sensitive` | For emails carrying login codes or reset links: PostHog keeps no copy of the sent body. |

`Fn::GetAtt`: `Id`, `TransactionalHogFlowId` (set once the template is made transactional in PostHog), `CreatedAt`, `UpdatedAt`.

Notes:

- PostHog adds fields to `Content` (for example the default `templating` and the `html` rendered from `email.design`). Read keeps the template's `Content` string as long as every value it sets matches PostHog's, so these additions are not reported as drift; a changed subject or body is. If you author with `email.design`, leave `email.html` out, since PostHog re-renders it.
- Unpublished drafts (`draft_content`) are an editor feature and are not managed. Saving `Content` publishes it and clears any draft.
- Delete soft-deletes the template (PostHog does not allow a hard delete). A soft-deleted template is reported as not found.

See [examples/messagetemplate.yaml](examples/messagetemplate.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
