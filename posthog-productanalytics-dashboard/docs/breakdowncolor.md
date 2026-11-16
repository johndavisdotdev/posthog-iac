# PostHog::ProductAnalytics::Dashboard BreakdownColor

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#breakdownvalue" title="BreakdownValue">BreakdownValue</a>" : <i>String</i>,
    "<a href="#colortoken" title="ColorToken">ColorToken</a>" : <i>String</i>,
    "<a href="#breakdowntype" title="BreakdownType">BreakdownType</a>" : <i>String</i>,
    "<a href="#breakdownproperty" title="BreakdownProperty">BreakdownProperty</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#breakdownvalue" title="BreakdownValue">BreakdownValue</a>: <i>String</i>
<a href="#colortoken" title="ColorToken">ColorToken</a>: <i>String</i>
<a href="#breakdowntype" title="BreakdownType">BreakdownType</a>: <i>String</i>
<a href="#breakdownproperty" title="BreakdownProperty">BreakdownProperty</a>: <i>String</i>
</pre>

## Properties

#### BreakdownValue

The breakdown value this color applies to, as it appears in the chart legend.

_Required_: Yes

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ColorToken

Palette slot to color the value with, as `preset-1` upwards. Not a CSS color.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BreakdownType

Breakdown type the value came from, such as `event`, `person`, `session` or `cohort`.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BreakdownProperty

Breakdown property the color is scoped to. Omit to apply it under every property.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

