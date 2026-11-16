# PostHog::ErrorTracking::AssignmentRule

A PostHog error tracking assignment rule: automatically assigns new issues whose exceptions match a property filter to a user or role.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ErrorTracking::AssignmentRule",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#assignee" title="Assignee">Assignee</a>" : <i><a href="assignee.md">Assignee</a></i>,
        "<a href="#orderkey" title="OrderKey">OrderKey</a>" : <i>Integer</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ErrorTracking::AssignmentRule
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#assignee" title="Assignee">Assignee</a>: <i><a href="assignee.md">Assignee</a></i>
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

JSON (use Fn::ToJsonString). Property-group filter that defines which incoming error events the rule matches, e.g. {"type": "AND", "values": [{"key": "$exception_types", "type": "event", "operator": "exact", "value": ["TypeError"]}]}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Assignee

_Required_: Yes

_Type_: <a href="assignee.md">Assignee</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OrderKey

Evaluation priority among assignment rules; lower is evaluated first and the first matching rule wins. PostHog defaults it to 0.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog assignment rule ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

