# PostHog::ProductAnalytics::Alert Bounds

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#lower" title="Lower">Lower</a>" : <i>Double</i>,
    "<a href="#upper" title="Upper">Upper</a>" : <i>Double</i>
}
</pre>

### YAML

<pre>
<a href="#lower" title="Lower">Lower</a>: <i>Double</i>
<a href="#upper" title="Upper">Upper</a>: <i>Double</i>
</pre>

## Properties

#### Lower

The alert fires when the value drops below this number.

_Required_: No

_Type_: Double

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Upper

The alert fires when the value exceeds this number.

_Required_: No

_Type_: Double

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

