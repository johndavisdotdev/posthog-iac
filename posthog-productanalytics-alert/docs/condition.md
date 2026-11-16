# PostHog::ProductAnalytics::Alert Condition

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#type" title="Type">Type</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#type" title="Type">Type</a>: <i>String</i>
</pre>

## Properties

#### Type

How the value is evaluated: `absolute_value`, `relative_increase` or `relative_decrease`.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>absolute_value</code> | <code>relative_increase</code> | <code>relative_decrease</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

