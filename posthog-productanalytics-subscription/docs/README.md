# PostHog::ProductAnalytics::Subscription

A PostHog subscription: a scheduled delivery of an insight, a dashboard or an AI-generated report to email, Slack or Microsoft Teams.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::Subscription",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#title" title="Title">Title</a>" : <i>String</i>,
        "<a href="#insight" title="Insight">Insight</a>" : <i>String</i>,
        "<a href="#dashboard" title="Dashboard">Dashboard</a>" : <i>String</i>,
        "<a href="#dashboardexportinsights" title="DashboardExportInsights">DashboardExportInsights</a>" : <i>[ String, ... ]</i>,
        "<a href="#prompt" title="Prompt">Prompt</a>" : <i>String</i>,
        "<a href="#aipromptconfig" title="AiPromptConfig">AiPromptConfig</a>" : <i><a href="aipromptconfig.md">AiPromptConfig</a></i>,
        "<a href="#contexts" title="Contexts">Contexts</a>" : <i>[ <a href="context.md">Context</a>, ... ]</i>,
        "<a href="#targettype" title="TargetType">TargetType</a>" : <i>String</i>,
        "<a href="#targetvalue" title="TargetValue">TargetValue</a>" : <i>String</i>,
        "<a href="#integrationid" title="IntegrationId">IntegrationId</a>" : <i>String</i>,
        "<a href="#frequency" title="Frequency">Frequency</a>" : <i>String</i>,
        "<a href="#interval" title="Interval">Interval</a>" : <i>Integer</i>,
        "<a href="#byweekday" title="Byweekday">Byweekday</a>" : <i>[ String, ... ]</i>,
        "<a href="#bysetpos" title="Bysetpos">Bysetpos</a>" : <i>Integer</i>,
        "<a href="#count" title="Count">Count</a>" : <i>Integer</i>,
        "<a href="#startdate" title="StartDate">StartDate</a>" : <i>String</i>,
        "<a href="#untildate" title="UntilDate">UntilDate</a>" : <i>String</i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
        "<a href="#invitemessage" title="InviteMessage">InviteMessage</a>" : <i>String</i>,
        "<a href="#sendtestnow" title="SendTestNow">SendTestNow</a>" : <i>Boolean</i>,
        "<a href="#summaryenabled" title="SummaryEnabled">SummaryEnabled</a>" : <i>Boolean</i>,
        "<a href="#summarypromptguide" title="SummaryPromptGuide">SummaryPromptGuide</a>" : <i>String</i>,
        "<a href="#deliveryconfig" title="DeliveryConfig">DeliveryConfig</a>" : <i><a href="deliveryconfig.md">DeliveryConfig</a></i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::Subscription
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#title" title="Title">Title</a>: <i>String</i>
    <a href="#insight" title="Insight">Insight</a>: <i>String</i>
    <a href="#dashboard" title="Dashboard">Dashboard</a>: <i>String</i>
    <a href="#dashboardexportinsights" title="DashboardExportInsights">DashboardExportInsights</a>: <i>
      - String</i>
    <a href="#prompt" title="Prompt">Prompt</a>: <i>String</i>
    <a href="#aipromptconfig" title="AiPromptConfig">AiPromptConfig</a>: <i><a href="aipromptconfig.md">AiPromptConfig</a></i>
    <a href="#contexts" title="Contexts">Contexts</a>: <i>
      - <a href="context.md">Context</a></i>
    <a href="#targettype" title="TargetType">TargetType</a>: <i>String</i>
    <a href="#targetvalue" title="TargetValue">TargetValue</a>: <i>String</i>
    <a href="#integrationid" title="IntegrationId">IntegrationId</a>: <i>String</i>
    <a href="#frequency" title="Frequency">Frequency</a>: <i>String</i>
    <a href="#interval" title="Interval">Interval</a>: <i>Integer</i>
    <a href="#byweekday" title="Byweekday">Byweekday</a>: <i>
      - String</i>
    <a href="#bysetpos" title="Bysetpos">Bysetpos</a>: <i>Integer</i>
    <a href="#count" title="Count">Count</a>: <i>Integer</i>
    <a href="#startdate" title="StartDate">StartDate</a>: <i>String</i>
    <a href="#untildate" title="UntilDate">UntilDate</a>: <i>String</i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
    <a href="#invitemessage" title="InviteMessage">InviteMessage</a>: <i>String</i>
    <a href="#sendtestnow" title="SendTestNow">SendTestNow</a>: <i>Boolean</i>
    <a href="#summaryenabled" title="SummaryEnabled">SummaryEnabled</a>: <i>Boolean</i>
    <a href="#summarypromptguide" title="SummaryPromptGuide">SummaryPromptGuide</a>: <i>String</i>
    <a href="#deliveryconfig" title="DeliveryConfig">DeliveryConfig</a>: <i><a href="deliveryconfig.md">DeliveryConfig</a></i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the subscription belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Title

Human-readable name for this subscription.

_Required_: No

_Type_: String

_Maximum Length_: <code>100</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Insight

Numeric ID of the insight to deliver. Set exactly one of Insight, Dashboard and Prompt.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Dashboard

ID of the dashboard to deliver. Set exactly one of Insight, Dashboard and Prompt.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### DashboardExportInsights

Numeric IDs of the dashboard's insights to include (max 20). Required for dashboard subscriptions.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Prompt

Free-text prompt that drives an AI-generated report. Set exactly one of Insight, Dashboard and Prompt.

_Required_: No

_Type_: String

_Maximum Length_: <code>4000</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AiPromptConfig

_Required_: No

_Type_: <a href="aipromptconfig.md">AiPromptConfig</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Contexts

Up to 3 dashboards and insights that ground an AI report (only valid with Prompt).

_Required_: No

_Type_: List of <a href="context.md">Context</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TargetType

Delivery channel: `email`, `slack` or `teams`.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>email</code> | <code>slack</code> | <code>teams</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TargetValue

Recipient(s): comma-separated email addresses for email, a Slack channel name or ID for slack, or a Microsoft Teams webhook URL for teams. PostHog only returns the host of a Teams webhook URL; the template value is kept when it matches.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IntegrationId

ID of the connected Slack integration. Required when TargetType is slack.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Frequency

How often to deliver: `daily`, `weekly`, `monthly` or `yearly`.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>daily</code> | <code>weekly</code> | <code>monthly</code> | <code>yearly</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Interval

Interval multiplier (e.g. 2 with weekly frequency means every 2 weeks). Defaults to 1.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Byweekday

Days of the week for daily or weekly subscriptions.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Bysetpos

Position within the Byweekday set for monthly frequency (e.g. 1 for first, -1 for last).

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Count

Total number of deliveries before the subscription stops. Omit for unlimited.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### StartDate

When to start delivering (ISO 8601 date-time). Anchors the recurrence and may be in the past. Deliveries run on half-hour cycles at :00 and :30.

_Required_: Yes

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### UntilDate

When to stop delivering (ISO 8601 date-time). Omit for indefinite.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the subscription is active. Set to false to pause delivery. PostHog sets it to false when the delivery integration becomes invalid. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### InviteMessage

Optional message included in the invitation email sent to new recipients. Write-only.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SendTestNow

Deliver the subscription once immediately when it is created or updated. Defaults to false (unlike the PostHog API, whose default on create is true). Write-only.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SummaryEnabled

Attach an AI-generated summary to each delivery (insight and dashboard subscriptions only). Requires the organization to have approved AI data processing.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SummaryPromptGuide

Free-text guidance steering the AI summary (insight and dashboard subscriptions only).

_Required_: No

_Type_: String

_Maximum Length_: <code>500</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DeliveryConfig

_Required_: No

_Type_: <a href="deliveryconfig.md">DeliveryConfig</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog subscription ID.

#### ResourceType

What the subscription delivers: `insight`, `dashboard` or `ai_prompt`. Derived from Insight, Dashboard or Prompt.

#### InsightShortId

Short ID of the delivered insight, for insight subscriptions.

#### Summary

Human-readable schedule summary, e.g. 'sent daily'.

#### NextDeliveryDate

ISO 8601 timestamp of the next scheduled delivery.

#### CreatedAt

ISO 8601 creation timestamp.

