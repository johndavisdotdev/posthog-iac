# PostHog::ErrorTracking::GroupingRule

A PostHog error tracking grouping rule: exceptions that match a property filter are grouped into the same issue, optionally assigned to a user or role.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ErrorTracking::GroupingRule",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#assignee" title="Assignee">Assignee</a>" : <i><a href="assignee.md">Assignee</a></i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#orderkey" title="OrderKey">OrderKey</a>" : <i>Integer</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ErrorTracking::GroupingRule
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#assignee" title="Assignee">Assignee</a>: <i><a href="assignee.md">Assignee</a></i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
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

JSON (use Fn::ToJsonString). Property-group filter that defines which exceptions are grouped into the same issue, e.g. {"type": "AND", "values": [{"key": "$exception_types", "type": "event", "operator": "exact", "value": ["ChunkLoadError"]}]}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Assignee

_Required_: No

_Type_: <a href="assignee.md">Assignee</a>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Description

Optional human-readable description of what the rule is for. PostHog cannot change it after creation, so changing it replaces the rule.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### OrderKey

Evaluation priority among grouping rules; lower is evaluated first.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog grouping rule ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

