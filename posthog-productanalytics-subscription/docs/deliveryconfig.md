# PostHog::ProductAnalytics::Subscription DeliveryConfig

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#postallinsightsinmainmessage" title="PostAllInsightsInMainMessage">PostAllInsightsInMainMessage</a>" : <i>Boolean</i>,
    "<a href="#includeimages" title="IncludeImages">IncludeImages</a>" : <i>Boolean</i>,
    "<a href="#includefeedback" title="IncludeFeedback">IncludeFeedback</a>" : <i>Boolean</i>,
    "<a href="#includemanagelink" title="IncludeManageLink">IncludeManageLink</a>" : <i>Boolean</i>,
    "<a href="#includeposthoghint" title="IncludePosthogHint">IncludePosthogHint</a>" : <i>Boolean</i>
}
</pre>

### YAML

<pre>
<a href="#postallinsightsinmainmessage" title="PostAllInsightsInMainMessage">PostAllInsightsInMainMessage</a>: <i>Boolean</i>
<a href="#includeimages" title="IncludeImages">IncludeImages</a>: <i>Boolean</i>
<a href="#includefeedback" title="IncludeFeedback">IncludeFeedback</a>: <i>Boolean</i>
<a href="#includemanagelink" title="IncludeManageLink">IncludeManageLink</a>: <i>Boolean</i>
<a href="#includeposthoghint" title="IncludePosthogHint">IncludePosthogHint</a>: <i>Boolean</i>
</pre>

## Properties

#### PostAllInsightsInMainMessage

Slack subscriptions only. Insight and dashboard subscriptions: upload all insight images in the main Slack message instead of threading the rest. AI report subscriptions: post the chart images in the main message with the summary. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IncludeImages

AI report subscriptions only: include generated chart images. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IncludeFeedback

AI report subscriptions only: include report feedback links. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IncludeManageLink

AI report subscriptions only: include a link to manage the subscription. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IncludePosthogHint

AI report subscriptions only: include PostHog product guidance (rendered in Slack only). Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

