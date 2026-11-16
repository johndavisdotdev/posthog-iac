# PostHog::ErrorTracking::SuppressionRule

A PostHog error tracking suppression rule: incoming exceptions that match a property filter are dropped (optionally sampled) before they create or update issues.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ErrorTracking::SuppressionRule",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#samplingrate" title="SamplingRate">SamplingRate</a>" : <i>Double</i>,
        "<a href="#orderkey" title="OrderKey">OrderKey</a>" : <i>Integer</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ErrorTracking::SuppressionRule
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#samplingrate" title="SamplingRate">SamplingRate</a>: <i>Double</i>
    <a href="#orderkey" title="OrderKey">OrderKey</a>: <i>Integer</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the rule belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Filters

JSON (use Fn::ToJsonString). Property-group filter that defines which incoming error events are suppressed, e.g. {"type": "AND", "values": [{"key": "$exception_values", "type": "event", "operator": "icontains", "value": "ResizeObserver loop"}]}. Omit it (or pass an empty values array) for a match-all rule.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SamplingRate

Probability that a matching event is dropped: 1.0 drops every match (default), 0.0 drops none, 0.5 drops half.

_Required_: No

_Type_: Double

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OrderKey

Evaluation priority among suppression rules; lower is evaluated first.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog suppression rule ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

