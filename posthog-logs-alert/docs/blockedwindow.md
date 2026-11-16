# PostHog::Logs::Alert BlockedWindow

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#start" title="Start">Start</a>" : <i>String</i>,
    "<a href="#end" title="End">End</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#start" title="Start">Start</a>: <i>String</i>
<a href="#end" title="End">End</a>: <i>String</i>
</pre>

## Properties

#### Start

Start time HH:MM (24-hour, project timezone), inclusive.

_Required_: Yes

_Type_: String

_Pattern_: <code>^[0-2][0-9]:[0-5][0-9]$</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### End

End time HH:MM (24-hour, project timezone), exclusive. Each window must span at least 30 minutes.

_Required_: Yes

_Type_: String

_Pattern_: <code>^[0-2][0-9]:[0-5][0-9]$</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

