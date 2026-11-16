# PostHog::ProductAnalytics::Alert ThresholdConfiguration

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#type" title="Type">Type</a>" : <i>String</i>,
    "<a href="#bounds" title="Bounds">Bounds</a>" : <i><a href="bounds.md">Bounds</a></i>
}
</pre>

### YAML

<pre>
<a href="#type" title="Type">Type</a>: <i>String</i>
<a href="#bounds" title="Bounds">Bounds</a>: <i><a href="bounds.md">Bounds</a></i>
</pre>

## Properties

#### Type

Whether bounds are compared as `absolute` values or as `percentage` change from the previous interval.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>absolute</code> | <code>percentage</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Bounds

_Required_: No

_Type_: <a href="bounds.md">Bounds</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

