# PostHog::Surveys::Survey

A PostHog survey: questions shown to users in-app (popover or widget), on a hosted page, or collected through the API.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Surveys::Survey",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#type" title="Type">Type</a>" : <i>String</i>,
        "<a href="#schedule" title="Schedule">Schedule</a>" : <i>String</i>,
        "<a href="#linkedflagid" title="LinkedFlagId">LinkedFlagId</a>" : <i>String</i>,
        "<a href="#linkedinsightid" title="LinkedInsightId">LinkedInsightId</a>" : <i>String</i>,
        "<a href="#targetingflagfilters" title="TargetingFlagFilters">TargetingFlagFilters</a>" : <i>String</i>,
        "<a href="#questions" title="Questions">Questions</a>" : <i>String</i>,
        "<a href="#conditions" title="Conditions">Conditions</a>" : <i>String</i>,
        "<a href="#appearance" title="Appearance">Appearance</a>" : <i>String</i>,
        "<a href="#translations" title="Translations">Translations</a>" : <i>String</i>,
        "<a href="#startdate" title="StartDate">StartDate</a>" : <i>String</i>,
        "<a href="#enddate" title="EndDate">EndDate</a>" : <i>String</i>,
        "<a href="#archived" title="Archived">Archived</a>" : <i>Boolean</i>,
        "<a href="#responseslimit" title="ResponsesLimit">ResponsesLimit</a>" : <i>Integer</i>,
        "<a href="#iterationcount" title="IterationCount">IterationCount</a>" : <i>Integer</i>,
        "<a href="#iterationfrequencydays" title="IterationFrequencyDays">IterationFrequencyDays</a>" : <i>Integer</i>,
        "<a href="#repeatuntilstopped" title="RepeatUntilStopped">RepeatUntilStopped</a>" : <i>Boolean</i>,
        "<a href="#enablepartialresponses" title="EnablePartialResponses">EnablePartialResponses</a>" : <i>Boolean</i>,
        "<a href="#enableiframeembedding" title="EnableIframeEmbedding">EnableIframeEmbedding</a>" : <i>Boolean</i>,
        "<a href="#baselanguage" title="BaseLanguage">BaseLanguage</a>" : <i>String</i>,
        "<a href="#responsesamplingstartdate" title="ResponseSamplingStartDate">ResponseSamplingStartDate</a>" : <i>String</i>,
        "<a href="#responsesamplingintervaltype" title="ResponseSamplingIntervalType">ResponseSamplingIntervalType</a>" : <i>String</i>,
        "<a href="#responsesamplinginterval" title="ResponseSamplingInterval">ResponseSamplingInterval</a>" : <i>Integer</i>,
        "<a href="#responsesamplinglimit" title="ResponseSamplingLimit">ResponseSamplingLimit</a>" : <i>Integer</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Surveys::Survey
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#type" title="Type">Type</a>: <i>String</i>
    <a href="#schedule" title="Schedule">Schedule</a>: <i>String</i>
    <a href="#linkedflagid" title="LinkedFlagId">LinkedFlagId</a>: <i>String</i>
    <a href="#linkedinsightid" title="LinkedInsightId">LinkedInsightId</a>: <i>String</i>
    <a href="#targetingflagfilters" title="TargetingFlagFilters">TargetingFlagFilters</a>: <i>String</i>
    <a href="#questions" title="Questions">Questions</a>: <i>String</i>
    <a href="#conditions" title="Conditions">Conditions</a>: <i>String</i>
    <a href="#appearance" title="Appearance">Appearance</a>: <i>String</i>
    <a href="#translations" title="Translations">Translations</a>: <i>String</i>
    <a href="#startdate" title="StartDate">StartDate</a>: <i>String</i>
    <a href="#enddate" title="EndDate">EndDate</a>: <i>String</i>
    <a href="#archived" title="Archived">Archived</a>: <i>Boolean</i>
    <a href="#responseslimit" title="ResponsesLimit">ResponsesLimit</a>: <i>Integer</i>
    <a href="#iterationcount" title="IterationCount">IterationCount</a>: <i>Integer</i>
    <a href="#iterationfrequencydays" title="IterationFrequencyDays">IterationFrequencyDays</a>: <i>Integer</i>
    <a href="#repeatuntilstopped" title="RepeatUntilStopped">RepeatUntilStopped</a>: <i>Boolean</i>
    <a href="#enablepartialresponses" title="EnablePartialResponses">EnablePartialResponses</a>: <i>Boolean</i>
    <a href="#enableiframeembedding" title="EnableIframeEmbedding">EnableIframeEmbedding</a>: <i>Boolean</i>
    <a href="#baselanguage" title="BaseLanguage">BaseLanguage</a>: <i>String</i>
    <a href="#responsesamplingstartdate" title="ResponseSamplingStartDate">ResponseSamplingStartDate</a>: <i>String</i>
    <a href="#responsesamplingintervaltype" title="ResponseSamplingIntervalType">ResponseSamplingIntervalType</a>: <i>String</i>
    <a href="#responsesamplinginterval" title="ResponseSamplingInterval">ResponseSamplingInterval</a>: <i>Integer</i>
    <a href="#responsesamplinglimit" title="ResponseSamplingLimit">ResponseSamplingLimit</a>: <i>Integer</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the survey belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Survey name. In-app surveys send it to visitors' browsers and hosted surveys show it publicly, so keep private details out of it.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Internal survey description. Never delivered to visitors.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Type

Survey type.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>popover</code> | <code>widget</code> | <code>external_survey</code> | <code>api</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Schedule

`once` shows the survey once per user (PostHog's default), `recurring` repeats every IterationFrequencyDays, `always` shows it every time the conditions match.

_Required_: No

_Type_: String

_Allowed Values_: <code>once</code> | <code>recurring</code> | <code>always</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### LinkedFlagId

ID of a feature flag linked to the survey: the survey is shown only to users with the flag enabled.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### LinkedInsightId

ID of an insight linked to the survey.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TargetingFlagFilters

Person targeting as a JSON feature-flag filters object (use Fn::ToJsonString), e.g. {"groups": [{"properties": [{"key": "email", "value": ["@example.com"], "operator": "icontains", "type": "person"}], "rollout_percentage": 100}]}. PostHog keeps it on a targeting flag it manages. Removing the property removes the targeting.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Questions

Questions as a JSON array (use Fn::ToJsonString). Each question has a `type` (`open`, `link`, `rating`, `single_choice` or `multiple_choice`), `question`, and type-specific fields such as `choices`, `scale`, `display`, `link` and `branching`. PostHog assigns an `id` to questions without one.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Conditions

Display conditions as a JSON object (use Fn::ToJsonString): `url`, `urlMatchType`, `selector`, `deviceTypes`, `seenSurveyWaitPeriodInDays`, `events`, `actions` and so on.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Appearance

Appearance customization as a JSON object (use Fn::ToJsonString): colours, `position`, `submitButtonText`, `thankYouMessageHeader`, `whiteLabel` and so on.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Translations

Survey-level translations as a JSON object keyed by language code (use Fn::ToJsonString). Question translations go inside each question.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### StartDate

ISO 8601 launch time. Setting it launches the survey.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EndDate

ISO 8601 end time. Setting it completes the survey.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Archived

Whether the survey is archived.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ResponsesLimit

Number of responses after which the survey stops automatically.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IterationCount

For a recurring schedule, how many times the survey is shown to a user.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IterationFrequencyDays

For a recurring schedule, the number of days between survey iterations.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### RepeatUntilStopped

For a recurring schedule, keep repeating until the survey is stopped (IterationCount is then ignored).

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EnablePartialResponses

Store a response as soon as one question is answered (true) instead of when all are answered (false).

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EnableIframeEmbedding

Allow the hosted survey page to be embedded in an iframe.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BaseLanguage

BCP-47 code of the language of the survey's untranslated text. PostHog defaults to `en`.

_Required_: No

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>20</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ResponseSamplingStartDate

ISO 8601 start of response sampling.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ResponseSamplingIntervalType

Unit of the response sampling interval.

_Required_: No

_Type_: String

_Allowed Values_: <code>day</code> | <code>week</code> | <code>month</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ResponseSamplingInterval

Length of the response sampling interval, in ResponseSamplingIntervalType units.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ResponseSamplingLimit

Maximum number of responses collected per sampling interval.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog survey ID (UUID).

#### TargetingFlagId

ID of the targeting flag PostHog manages for TargetingFlagFilters.

#### CreatedAt

ISO 8601 creation timestamp.

