# PostHog::Surveys::ProductTour

Manages a PostHog [product tour](https://posthog.com/docs/product-tours): a sequence of in-app steps that posthog-js shows to targeted users.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. |
| `Content` | JSON object holding the tour `steps` and display settings; pass it with `Fn::ToJsonString`. |
| `TargetingFlagFilters` | JSON feature-flag filters for targeting. PostHog keeps them on an internal targeting flag (`InternalTargetingFlagId`). |
| `LinkedFlagId` | ID of an existing feature flag; the tour is shown only to users with it enabled. |
| `StartDate`, `EndDate` | Setting `StartDate` launches the tour; setting `EndDate` stops it. |
| `Description`, `AutoLaunch`, `Archived` | Removing them from the template clears them in PostHog. |

`Fn::GetAtt`: `Id` (UUID), `InternalTargetingFlagId`, `CreatedAt`, `UpdatedAt`.

Notes:

- The steps live in `Content` (the API field), not in a separate property.
- PostHog adds keys to the JSON (for example step ids). The template's JSON string is kept as long as every value it sets matches what PostHog returns, so these additions are not reported as drift.
- Create and Update read the tour back with `GET`, because PostHog's write responses omit targeting and the linked flag. Draft content (`draft_content`) is not managed. Delete hard-deletes the tour.

See [examples/producttour.yaml](examples/producttour.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
