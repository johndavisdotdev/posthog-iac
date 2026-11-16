# PostHog::ProductAnalytics::Alert

A PostHog insight alert: checks an insight's value on a schedule against a threshold (or an anomaly detector) and notifies subscribed users when it fires. Runtime state (state, last checked/notified, check history) is not part of the resource.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::Alert",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#insightid" title="InsightId">InsightId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#subscribedusers" title="SubscribedUsers">SubscribedUsers</a>" : <i>[ String, ... ]</i>,
        "<a href="#threshold" title="Threshold">Threshold</a>" : <i><a href="threshold.md">Threshold</a></i>,
        "<a href="#condition" title="Condition">Condition</a>" : <i><a href="condition.md">Condition</a></i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
        "<a href="#calculationinterval" title="CalculationInterval">CalculationInterval</a>" : <i>String</i>,
        "<a href="#config" title="Config">Config</a>" : <i>String</i>,
        "<a href="#detectorconfig" title="DetectorConfig">DetectorConfig</a>" : <i>String</i>,
        "<a href="#evaluationdelayintervals" title="EvaluationDelayIntervals">EvaluationDelayIntervals</a>" : <i>Integer</i>,
        "<a href="#schedulestarttime" title="ScheduleStartTime">ScheduleStartTime</a>" : <i>String</i>,
        "<a href="#skipweekend" title="SkipWeekend">SkipWeekend</a>" : <i>Boolean</i>,
        "<a href="#schedulerestriction" title="ScheduleRestriction">ScheduleRestriction</a>" : <i><a href="schedulerestriction.md">ScheduleRestriction</a></i>,
        "<a href="#investigationagentenabled" title="InvestigationAgentEnabled">InvestigationAgentEnabled</a>" : <i>Boolean</i>,
        "<a href="#investigationgatesnotifications" title="InvestigationGatesNotifications">InvestigationGatesNotifications</a>" : <i>Boolean</i>,
        "<a href="#investigationinconclusiveaction" title="InvestigationInconclusiveAction">InvestigationInconclusiveAction</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::Alert
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#insightid" title="InsightId">InsightId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#subscribedusers" title="SubscribedUsers">SubscribedUsers</a>: <i>
      - String</i>
    <a href="#threshold" title="Threshold">Threshold</a>: <i><a href="threshold.md">Threshold</a></i>
    <a href="#condition" title="Condition">Condition</a>: <i><a href="condition.md">Condition</a></i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
    <a href="#calculationinterval" title="CalculationInterval">CalculationInterval</a>: <i>String</i>
    <a href="#config" title="Config">Config</a>: <i>String</i>
    <a href="#detectorconfig" title="DetectorConfig">DetectorConfig</a>: <i>String</i>
    <a href="#evaluationdelayintervals" title="EvaluationDelayIntervals">EvaluationDelayIntervals</a>: <i>Integer</i>
    <a href="#schedulestarttime" title="ScheduleStartTime">ScheduleStartTime</a>: <i>String</i>
    <a href="#skipweekend" title="SkipWeekend">SkipWeekend</a>: <i>Boolean</i>
    <a href="#schedulerestriction" title="ScheduleRestriction">ScheduleRestriction</a>: <i><a href="schedulerestriction.md">ScheduleRestriction</a></i>
    <a href="#investigationagentenabled" title="InvestigationAgentEnabled">InvestigationAgentEnabled</a>: <i>Boolean</i>
    <a href="#investigationgatesnotifications" title="InvestigationGatesNotifications">InvestigationGatesNotifications</a>: <i>Boolean</i>
    <a href="#investigationinconclusiveaction" title="InvestigationInconclusiveAction">InvestigationInconclusiveAction</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the alert belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### InsightId

ID of the insight (PostHog::ProductAnalytics::Insight) the alert monitors.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Name

Human-readable name for the alert.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SubscribedUsers

IDs of the PostHog users notified when the alert fires.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Threshold

_Required_: No

_Type_: <a href="threshold.md">Threshold</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Condition

_Required_: No

_Type_: <a href="condition.md">Condition</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the alert is actively being evaluated. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CalculationInterval

How often the alert is checked: `real_time` (Scale+), `every_15_minutes` (Boost+), `hourly`, `daily`, `weekly` or `monthly`.

_Required_: No

_Type_: String

_Allowed Values_: <code>real_time</code> | <code>every_15_minutes</code> | <code>hourly</code> | <code>daily</code> | <code>weekly</code> | <code>monthly</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Config

Per-insight-kind alert configuration as JSON (use Fn::ToJsonString), discriminated by `type`, e.g. {"type": "TrendsAlertConfig", "series_index": 0, "check_ongoing_interval": false}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DetectorConfig

Anomaly detector configuration as JSON (use Fn::ToJsonString), discriminated by `type` (zscore, mad, iqr, threshold, ecod, copod, isolation_forest, knn, hbos, lof, ocsvm, pca, ensemble, forecast, llm, ...). When set, the detector decides when the alert fires instead of the threshold bounds.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EvaluationDelayIntervals

Skip this many completed insight intervals after excluding the ongoing interval (0-100). Time-series Trends only; a positive delay requires check_ongoing_interval false.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScheduleStartTime

Local time (HH:MM) that starts alert checks.

_Required_: No

_Type_: String

_Pattern_: <code>^([01][0-9]|2[0-3]):[0-5][0-9]$</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SkipWeekend

Skip alert evaluation on Saturdays and Sundays (project timezone).

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScheduleRestriction

_Required_: No

_Type_: <a href="schedulerestriction.md">ScheduleRestriction</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### InvestigationAgentEnabled

Run an investigation agent each time the alert fires (up to three times per firing episode); findings are written to a linked notebook.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### InvestigationGatesNotifications

Hold the first notification of an episode until the investigation agent produces a verdict, and suppress it when the verdict is a false positive. Requires InvestigationAgentEnabled.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### InvestigationInconclusiveAction

How to handle an inconclusive investigation verdict: `notify` (default) or `suppress`.

_Required_: No

_Type_: String

_Allowed Values_: <code>notify</code> | <code>suppress</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog alert ID (UUID).

#### InsightShortId

Short ID of the monitored insight.

#### CreatedAt

ISO 8601 creation timestamp.

