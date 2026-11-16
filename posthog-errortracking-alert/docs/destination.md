# PostHog::ErrorTracking::Alert Destination

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#channeltype" title="ChannelType">ChannelType</a>" : <i>String</i>,
    "<a href="#integrationid" title="IntegrationId">IntegrationId</a>" : <i>Integer</i>,
    "<a href="#config" title="Config">Config</a>" : <i><a href="slackconfig.md">SlackConfig</a></i>
}
</pre>

### YAML

<pre>
<a href="#channeltype" title="ChannelType">ChannelType</a>: <i>String</i>
<a href="#integrationid" title="IntegrationId">IntegrationId</a>: <i>Integer</i>
<a href="#config" title="Config">Config</a>: <i><a href="slackconfig.md">SlackConfig</a></i>
</pre>

## Properties

#### ChannelType

Delivery channel for notifications. Only `slack` is supported.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>slack</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IntegrationId

ID of the PostHog workspace integration used to deliver notifications (required for Slack).

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Config

_Required_: Yes

_Type_: <a href="slackconfig.md">SlackConfig</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

