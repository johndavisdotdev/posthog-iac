# PostHog::ProductAnalytics::Subscription Context

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#dashboardid" title="DashboardId">DashboardId</a>" : <i>String</i>,
    "<a href="#insightid" title="InsightId">InsightId</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#dashboardid" title="DashboardId">DashboardId</a>: <i>String</i>
<a href="#insightid" title="InsightId">InsightId</a>: <i>String</i>
</pre>

## Properties

#### DashboardId

ID of a dashboard that grounds the AI report. Set exactly one of DashboardId and InsightId.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### InsightId

Numeric ID of an insight that grounds the AI report. Set exactly one of DashboardId and InsightId.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

