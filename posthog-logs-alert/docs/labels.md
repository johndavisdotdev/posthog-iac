# PostHog::Logs::Alert Labels

Labels that say who owns the alert and how urgent it is, e.g. {"team": "checkout", "severity": "critical"}. `alertname` and names starting with `posthog_` are reserved. Only PlatformOwned alerts can have labels.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#^[a-za-z0-9_]+$" title="^[A-Za-z0-9_]+$">^[A-Za-z0-9_]+$</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#^[a-za-z0-9_]+$" title="^[A-Za-z0-9_]+$">^[A-Za-z0-9_]+$</a>: <i>String</i>
</pre>

## Properties

#### \^[A-Za-z0-9_]+$

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

