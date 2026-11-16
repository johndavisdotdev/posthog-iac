# PostHog::Surveys::Survey

Manages a [PostHog survey](https://posthog.com/docs/surveys): questions shown in-app (popover or widget), on a hosted page, or collected through the API.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Name` | Required. Public: delivered to visitors' browsers. |
| `Type` | Required. `popover`, `widget`, `external_survey` or `api`. |
| `Questions` | JSON array of questions (`open`, `link`, `rating`, `single_choice`, `multiple_choice`); pass it with `Fn::ToJsonString`. |
| `Conditions`, `Appearance`, `Translations` | JSON objects. |
| `TargetingFlagFilters` | JSON feature-flag filters for person targeting. PostHog keeps them on a targeting flag it manages (`TargetingFlagId`). Removing the property removes the targeting. |
| `LinkedFlagId`, `LinkedInsightId` | IDs of an existing feature flag / insight. |
| `StartDate`, `EndDate` | Setting `StartDate` launches the survey; setting `EndDate` completes it. |
| `Schedule`, `IterationCount`, `IterationFrequencyDays`, `RepeatUntilStopped` | Recurring surveys. |
| `ResponsesLimit`, `ResponseSampling*`, `EnablePartialResponses`, `EnableIframeEmbedding`, `BaseLanguage`, `Archived`, `Description` | Removing them from the template clears them (or resets them to PostHog's default) in PostHog. |

`Fn::GetAtt`: `Id` (UUID), `TargetingFlagId`, `CreatedAt`.

Notes:

- Responses and results are never part of the model.
- PostHog assigns question `id`s and fills in defaults. The template's JSON string is kept as long as every value it sets matches what PostHog returns, so these additions are not reported as drift.
- `Schedule`, `BaseLanguage`, `Conditions` and `Appearance` have server defaults; they are only reported when the template sets them.
- Create and Update read the survey back with `GET`, because PostHog's write responses omit some fields. Delete hard-deletes the survey.

See [examples/survey.yaml](examples/survey.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
