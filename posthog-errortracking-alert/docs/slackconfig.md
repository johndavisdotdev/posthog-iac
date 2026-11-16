# PostHog::ErrorTracking::Alert SlackConfig

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#channel" title="Channel">Channel</a>" : <i>String</i>,
    "<a href="#channelname" title="ChannelName">ChannelName</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#channel" title="Channel">Channel</a>: <i>String</i>
<a href="#channelname" title="ChannelName">ChannelName</a>: <i>String</i>
</pre>

## Properties

#### Channel

Slack channel ID notifications are delivered to, e.g. C0123ABCD.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ChannelName

Human-readable Slack channel name, stored for display only.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

