# PostHog::Logs::Alert Annotations

Context for responders, e.g. {"runbook_url": "https://..."}. Values can use {{ $labels.<name> }} and {{ $value }}; names ending in _url must start with https://. Only PlatformOwned alerts can have annotations.

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

