# PostHog::Workflows::HogFlow TriggerMasking

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

HogQL template defining the dedup/grouping key, e.g. {person.id} (once per person within Ttl).

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Ttl

Seconds (60 to 94608000) to suppress repeat firings of the same hash.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Threshold

Fire once per N matches of the same hash within Ttl (a sampler: N=3 fires on the 1st, 4th, 7th match). Omit to fire on the first match, then suppress repeats within Ttl.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

