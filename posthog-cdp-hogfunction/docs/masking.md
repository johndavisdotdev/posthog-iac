# PostHog::CDP::HogFunction Masking

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#hash" title="Hash">Hash</a>" : <i>String</i>,
    "<a href="#ttl" title="Ttl">Ttl</a>" : <i>Integer</i>,
    "<a href="#threshold" title="Threshold">Threshold</a>" : <i>Integer</i>
}
</pre>

### YAML

<pre>
<a href="#hash" title="Hash">Hash</a>: <i>String</i>
<a href="#ttl" title="Ttl">Ttl</a>: <i>Integer</i>
<a href="#threshold" title="Threshold">Threshold</a>: <i>Integer</i>
</pre>

## Properties

#### Hash

Hog expression used to compute the masking hash, e.g. {person.id}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Ttl

Time-to-live in seconds (60 to 86400) during which repeat events with the same hash are masked.

_Required_: Yes

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Threshold

Optional number of matches before masking applies.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

