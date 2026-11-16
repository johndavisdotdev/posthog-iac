# PostHog::ProductAnalytics::Alert Threshold

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#name" title="Name">Name</a>" : <i>String</i>,
    "<a href="#configuration" title="Configuration">Configuration</a>" : <i><a href="thresholdconfiguration.md">ThresholdConfiguration</a></i>
}
</pre>

### YAML

<pre>
<a href="#name" title="Name">Name</a>: <i>String</i>
<a href="#configuration" title="Configuration">Configuration</a>: <i><a href="thresholdconfiguration.md">ThresholdConfiguration</a></i>
</pre>

## Properties

#### Name

Optional name for the threshold.

_Required_: No

_Type_: String

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Configuration

_Required_: Yes

_Type_: <a href="thresholdconfiguration.md">ThresholdConfiguration</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

