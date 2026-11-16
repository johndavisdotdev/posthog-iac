# PostHog::Workflows::HogFlow EmailSendingRateLimit

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#count" title="Count">Count</a>" : <i>Integer</i>,
    "<a href="#period" title="Period">Period</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#count" title="Count">Count</a>: <i>Integer</i>
<a href="#period" title="Period">Period</a>: <i>String</i>
</pre>

## Properties

#### Count

Maximum number of emails this workflow sends per period.

_Required_: Yes

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Period

Window the count applies to. Sends over the limit are delayed until capacity frees up, not dropped.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>minute</code> | <code>hour</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

