# PostHog::Logs::Alert Filters

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#severitylevels" title="SeverityLevels">SeverityLevels</a>" : <i>[ String, ... ]</i>,
    "<a href="#servicenames" title="ServiceNames">ServiceNames</a>" : <i>[ String, ... ]</i>,
    "<a href="#filtergroup" title="FilterGroup">FilterGroup</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#severitylevels" title="SeverityLevels">SeverityLevels</a>: <i>
      - String</i>
<a href="#servicenames" title="ServiceNames">ServiceNames</a>: <i>
      - String</i>
<a href="#filtergroup" title="FilterGroup">FilterGroup</a>: <i>String</i>
</pre>

## Properties

#### SeverityLevels

Log severity levels to match.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ServiceNames

Service names to match.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### FilterGroup

JSON (use Fn::ToJsonString). Property filter group, e.g. {"type": "AND", "values": [{"type": "AND", "values": [{"key": "message", "type": "log", "operator": "icontains", "value": "timeout"}]}]}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

