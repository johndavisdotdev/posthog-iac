# PostHog::Logs::Alert

A PostHog logs alert: counts log entries matching a filter over a time window and fires when the count crosses a threshold. Notification destinations are managed separately.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Logs::Alert",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i><a href="filters.md">Filters</a></i>,
        "<a href="#thresholdcount" title="ThresholdCount">ThresholdCount</a>" : <i>Integer</i>,
        "<a href="#thresholdoperator" title="ThresholdOperator">ThresholdOperator</a>" : <i>String</i>,
        "<a href="#windowminutes" title="WindowMinutes">WindowMinutes</a>" : <i>Integer</i>,
        "<a href="#evaluationperiods" title="EvaluationPeriods">EvaluationPeriods</a>" : <i>Integer</i>,
        "<a href="#datapointstoalarm" title="DatapointsToAlarm">DatapointsToAlarm</a>" : <i>Integer</i>,
        "<a href="#cooldownminutes" title="CooldownMinutes">CooldownMinutes</a>" : <i>Integer</i>,
        "<a href="#schedulerestriction" title="ScheduleRestriction">ScheduleRestriction</a>" : <i><a href="schedulerestriction.md">ScheduleRestriction</a></i>,
        "<a href="#grouping" title="Grouping">Grouping</a>" : <i><a href="grouping.md">Grouping</a></i>,
        "<a href="#labels" title="Labels">Labels</a>" : <i><a href="labels.md">Labels</a></i>,
        "<a href="#annotations" title="Annotations">Annotations</a>" : <i><a href="annotations.md">Annotations</a></i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Logs::Alert
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
    <a href="#filters" title="Filters">Filters</a>: <i><a href="filters.md">Filters</a></i>
    <a href="#thresholdcount" title="ThresholdCount">ThresholdCount</a>: <i>Integer</i>
    <a href="#thresholdoperator" title="ThresholdOperator">ThresholdOperator</a>: <i>String</i>
    <a href="#windowminutes" title="WindowMinutes">WindowMinutes</a>: <i>Integer</i>
    <a href="#evaluationperiods" title="EvaluationPeriods">EvaluationPeriods</a>: <i>Integer</i>
    <a href="#datapointstoalarm" title="DatapointsToAlarm">DatapointsToAlarm</a>: <i>Integer</i>
    <a href="#cooldownminutes" title="CooldownMinutes">CooldownMinutes</a>: <i>Integer</i>
    <a href="#schedulerestriction" title="ScheduleRestriction">ScheduleRestriction</a>: <i><a href="schedulerestriction.md">ScheduleRestriction</a></i>
    <a href="#grouping" title="Grouping">Grouping</a>: <i><a href="grouping.md">Grouping</a></i>
    <a href="#labels" title="Labels">Labels</a>: <i><a href="labels.md">Labels</a></i>
    <a href="#annotations" title="Annotations">Annotations</a>: <i><a href="annotations.md">Annotations</a></i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the alert belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Human-readable name for the alert.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the alert is evaluated. Defaults to true. Disabling resets its state to not_firing.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Filters

_Required_: No

_Type_: <a href="filters.md">Filters</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ThresholdCount

Number of matching log entries in the window that breaches the threshold. Defaults to 100. Use 0 with `above` to fire on any matching log.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ThresholdOperator

Whether the alert fires when the count is `above` (default) or `below` the threshold.

_Required_: No

_Type_: String

_Allowed Values_: <code>above</code> | <code>below</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### WindowMinutes

Time window in minutes over which log entries are counted. Defaults to 5.

_Required_: No

_Type_: Integer

_Allowed Values_: <code>5</code> | <code>10</code> | <code>15</code> | <code>30</code> | <code>60</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EvaluationPeriods

Total number of check periods in the sliding evaluation window (M in N-of-M). Defaults to 1.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DatapointsToAlarm

How many periods within the evaluation window must breach the threshold to fire (N in N-of-M). Defaults to 1.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CooldownMinutes

Minimum minutes between notifications. 0 (default) means no minimum. Does not apply to PagerDuty incidents.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScheduleRestriction

_Required_: No

_Type_: <a href="schedulerestriction.md">ScheduleRestriction</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Grouping

_Required_: No

_Type_: <a href="grouping.md">Grouping</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Labels

Labels that say who owns the alert and how urgent it is, e.g. {"team": "checkout", "severity": "critical"}. `alertname` and names starting with `posthog_` are reserved. Only PlatformOwned alerts can have labels.

_Required_: No

_Type_: <a href="labels.md">Labels</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Annotations

Context for responders, e.g. {"runbook_url": "https://..."}. Values can use {{ $labels.<name> }} and {{ $value }}; names ending in _url must start with https://. Only PlatformOwned alerts can have annotations.

_Required_: No

_Type_: <a href="annotations.md">Annotations</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog logs alert ID (UUID).

#### CheckIntervalMinutes

How often PostHog evaluates the alert, in minutes. Server-managed.

#### PlatformOwned

Whether the PostHog alerts platform evaluates this alert and sends its notifications. Server-managed.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

