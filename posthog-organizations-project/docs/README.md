# PostHog::Organizations::Project

A PostHog project and its main settings. Deleting the resource deletes the PostHog project and all of its data (events, persons, recordings, insights, flags and so on); it cannot be undone.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Organizations::Project",
    "Properties" : {
        "<a href="#organizationid" title="OrganizationId">OrganizationId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#productdescription" title="ProductDescription">ProductDescription</a>" : <i>String</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#appurls" title="AppUrls">AppUrls</a>" : <i>[ String, ... ]</i>,
        "<a href="#anonymizeips" title="AnonymizeIps">AnonymizeIps</a>" : <i>Boolean</i>,
        "<a href="#timezone" title="Timezone">Timezone</a>" : <i>String</i>,
        "<a href="#weekstartday" title="WeekStartDay">WeekStartDay</a>" : <i>Integer</i>,
        "<a href="#basecurrency" title="BaseCurrency">BaseCurrency</a>" : <i>String</i>,
        "<a href="#businessmodel" title="BusinessModel">BusinessModel</a>" : <i>String</i>,
        "<a href="#autocaptureoptout" title="AutocaptureOptOut">AutocaptureOptOut</a>" : <i>Boolean</i>,
        "<a href="#autocaptureexceptionsoptin" title="AutocaptureExceptionsOptIn">AutocaptureExceptionsOptIn</a>" : <i>Boolean</i>,
        "<a href="#autocapturewebvitalsoptin" title="AutocaptureWebVitalsOptIn">AutocaptureWebVitalsOptIn</a>" : <i>Boolean</i>,
        "<a href="#captureconsolelogoptin" title="CaptureConsoleLogOptIn">CaptureConsoleLogOptIn</a>" : <i>Boolean</i>,
        "<a href="#captureperformanceoptin" title="CapturePerformanceOptIn">CapturePerformanceOptIn</a>" : <i>Boolean</i>,
        "<a href="#capturedeadclicks" title="CaptureDeadClicks">CaptureDeadClicks</a>" : <i>Boolean</i>,
        "<a href="#heatmapsoptin" title="HeatmapsOptIn">HeatmapsOptIn</a>" : <i>Boolean</i>,
        "<a href="#surveysoptin" title="SurveysOptIn">SurveysOptIn</a>" : <i>Boolean</i>,
        "<a href="#sessionrecordingoptin" title="SessionRecordingOptIn">SessionRecordingOptIn</a>" : <i>Boolean</i>,
        "<a href="#sessionrecordingsamplerate" title="SessionRecordingSampleRate">SessionRecordingSampleRate</a>" : <i>String</i>,
        "<a href="#sessionrecordingminimumdurationmilliseconds" title="SessionRecordingMinimumDurationMilliseconds">SessionRecordingMinimumDurationMilliseconds</a>" : <i>Integer</i>,
        "<a href="#sessionrecordingretentionperiod" title="SessionRecordingRetentionPeriod">SessionRecordingRetentionPeriod</a>" : <i>String</i>,
        "<a href="#recordingdomains" title="RecordingDomains">RecordingDomains</a>" : <i>[ String, ... ]</i>,
        "<a href="#dataattributes" title="DataAttributes">DataAttributes</a>" : <i>[ String, ... ]</i>,
        "<a href="#persondisplaynameproperties" title="PersonDisplayNameProperties">PersonDisplayNameProperties</a>" : <i>[ String, ... ]</i>,
        "<a href="#testaccountfilters" title="TestAccountFilters">TestAccountFilters</a>" : <i>String</i>,
        "<a href="#testaccountfiltersdefaultchecked" title="TestAccountFiltersDefaultChecked">TestAccountFiltersDefaultChecked</a>" : <i>Boolean</i>,
        "<a href="#pathcleaningfilters" title="PathCleaningFilters">PathCleaningFilters</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Organizations::Project
Properties:
    <a href="#organizationid" title="OrganizationId">OrganizationId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#productdescription" title="ProductDescription">ProductDescription</a>: <i>String</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#appurls" title="AppUrls">AppUrls</a>: <i>
      - String</i>
    <a href="#anonymizeips" title="AnonymizeIps">AnonymizeIps</a>: <i>Boolean</i>
    <a href="#timezone" title="Timezone">Timezone</a>: <i>String</i>
    <a href="#weekstartday" title="WeekStartDay">WeekStartDay</a>: <i>Integer</i>
    <a href="#basecurrency" title="BaseCurrency">BaseCurrency</a>: <i>String</i>
    <a href="#businessmodel" title="BusinessModel">BusinessModel</a>: <i>String</i>
    <a href="#autocaptureoptout" title="AutocaptureOptOut">AutocaptureOptOut</a>: <i>Boolean</i>
    <a href="#autocaptureexceptionsoptin" title="AutocaptureExceptionsOptIn">AutocaptureExceptionsOptIn</a>: <i>Boolean</i>
    <a href="#autocapturewebvitalsoptin" title="AutocaptureWebVitalsOptIn">AutocaptureWebVitalsOptIn</a>: <i>Boolean</i>
    <a href="#captureconsolelogoptin" title="CaptureConsoleLogOptIn">CaptureConsoleLogOptIn</a>: <i>Boolean</i>
    <a href="#captureperformanceoptin" title="CapturePerformanceOptIn">CapturePerformanceOptIn</a>: <i>Boolean</i>
    <a href="#capturedeadclicks" title="CaptureDeadClicks">CaptureDeadClicks</a>: <i>Boolean</i>
    <a href="#heatmapsoptin" title="HeatmapsOptIn">HeatmapsOptIn</a>: <i>Boolean</i>
    <a href="#surveysoptin" title="SurveysOptIn">SurveysOptIn</a>: <i>Boolean</i>
    <a href="#sessionrecordingoptin" title="SessionRecordingOptIn">SessionRecordingOptIn</a>: <i>Boolean</i>
    <a href="#sessionrecordingsamplerate" title="SessionRecordingSampleRate">SessionRecordingSampleRate</a>: <i>String</i>
    <a href="#sessionrecordingminimumdurationmilliseconds" title="SessionRecordingMinimumDurationMilliseconds">SessionRecordingMinimumDurationMilliseconds</a>: <i>Integer</i>
    <a href="#sessionrecordingretentionperiod" title="SessionRecordingRetentionPeriod">SessionRecordingRetentionPeriod</a>: <i>String</i>
    <a href="#recordingdomains" title="RecordingDomains">RecordingDomains</a>: <i>
      - String</i>
    <a href="#dataattributes" title="DataAttributes">DataAttributes</a>: <i>
      - String</i>
    <a href="#persondisplaynameproperties" title="PersonDisplayNameProperties">PersonDisplayNameProperties</a>: <i>
      - String</i>
    <a href="#testaccountfilters" title="TestAccountFilters">TestAccountFilters</a>: <i>String</i>
    <a href="#testaccountfiltersdefaultchecked" title="TestAccountFiltersDefaultChecked">TestAccountFiltersDefaultChecked</a>: <i>Boolean</i>
    <a href="#pathcleaningfilters" title="PathCleaningFilters">PathCleaningFilters</a>: <i>String</i>
</pre>

## Properties

#### OrganizationId

ID (UUID) of the PostHog organization the project belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Project name. Must be unique within the organization (case-insensitive).

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>200</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ProductDescription

Short description of what the project is about, used as context by PostHog AI features.

_Required_: No

_Type_: String

_Maximum Length_: <code>1000</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Labels applied to the project. PostHog trims and lowercases them.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AppUrls

URLs of the sites and apps that send data to this project (used by the toolbar and heatmaps).

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AnonymizeIps

When true, PostHog drops the IP address from every ingested event.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Timezone

IANA timezone used for date-based filters and reporting, e.g. America/Los_Angeles. PostHog defaults to UTC.

_Required_: No

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### WeekStartDay

First day of the week for date range filters: 0 = Sunday, 1 = Monday.

_Required_: No

_Type_: Integer

_Allowed Values_: <code>0</code> | <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BaseCurrency

ISO 4217 currency code used for revenue analytics, e.g. EUR. PostHog defaults to USD.

_Required_: No

_Type_: String

_Pattern_: <code>^[A-Z]{3}$</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BusinessModel

Whether the project serves B2B or B2C customers (b2b, b2c or other). Used to optimize default UI layouts.

_Required_: No

_Type_: String

_Allowed Values_: <code>b2b</code> | <code>b2c</code> | <code>other</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AutocaptureOptOut

Disables posthog-js autocapture (clicks, page views) when true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AutocaptureExceptionsOptIn

Enables automatic capture of JavaScript exceptions via the SDK.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AutocaptureWebVitalsOptIn

Enables automatic capture of Core Web Vitals performance metrics.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CaptureConsoleLogOptIn

Enables capturing browser console logs alongside session replays.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CapturePerformanceOptIn

Enables capturing performance timing and network requests.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CaptureDeadClicks

Enables capturing clicks that had no effect.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### HeatmapsOptIn

Enables heatmap recording on pages that use posthog-js.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SurveysOptIn

Enables displaying surveys via posthog-js on allowed origins.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SessionRecordingOptIn

Enables session replay recording for this project.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SessionRecordingSampleRate

Fraction of sessions to record, as a decimal string between 0.00 and 1.00 (e.g. 0.1 = 10%).

_Required_: No

_Type_: String

_Pattern_: <code>^-?\d{0,1}(?:\.\d{0,2})?$</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SessionRecordingMinimumDurationMilliseconds

Skip saving sessions shorter than this many milliseconds.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SessionRecordingRetentionPeriod

How long to retain new session recordings: 30d, 90d, 1y or 5y (availability depends on plan).

_Required_: No

_Type_: String

_Allowed Values_: <code>30d</code> | <code>90d</code> | <code>1y</code> | <code>5y</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### RecordingDomains

Origins permitted to record session replays and heatmaps. Empty allows all origins.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DataAttributes

Element attributes that posthog-js captures as action identifiers, e.g. data-attr.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PersonDisplayNameProperties

Ordered list of person properties used to render a person's display name in the UI.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TestAccountFilters

JSON array of property filters that identify internal/test traffic to exclude from insights (use Fn::ToJsonString), e.g. [{"key": "email", "value": "@example.com", "operator": "not_icontains", "type": "person"}].

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TestAccountFiltersDefaultChecked

When true, new insights exclude internal/test users by default.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PathCleaningFilters

JSON array of regex rewrite rules that collapse dynamic path segments before URLs are shown in paths (use Fn::ToJsonString), e.g. [{"regex": "/user/\\d+", "alias": "/user/<id>"}].

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog project ID. Use it as ProjectId for project-scoped PostHog resources.

#### Uuid

The project UUID.

#### ApiToken

The project API key (public token, phc_...) that PostHog SDKs use to send events.

#### ApiHost

Host the PostHog SDKs send events to (their api_host option).

#### CreatedAt

ISO 8601 creation timestamp.

