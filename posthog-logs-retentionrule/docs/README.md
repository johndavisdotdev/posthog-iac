# PostHog::Logs::RetentionRule

A PostHog Logs retention rule: logs matching the rule's filter group are kept for the rule's retention period instead of the environment's default Logs retention. Rules are evaluated in priority order and the first match wins.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Logs::RetentionRule",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
        "<a href="#priority" title="Priority">Priority</a>" : <i>Integer</i>,
        "<a href="#config" title="Config">Config</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Logs::RetentionRule
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
    <a href="#priority" title="Priority">Priority</a>: <i>Integer</i>
    <a href="#config" title="Config">Config</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the retention rule belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

User-visible label for this rule.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the rule is active. Disabled rules are ignored by ingestion. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Priority

Evaluation order: lower numbers are evaluated first and the first matching rule wins. Omit to append after existing rules (PostHog assigns the next priority).

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Config

Retention rule configuration as a JSON object (use Fn::ToJsonString). Required keys: `retention_days` (integer; must be a retention tier the organization is entitled to) and `filter_group` (a PropertyGroupFilter: an AND/OR tree of property predicates deciding which logs the rule matches), e.g. {"retention_days": 30, "filter_group": {"type": "AND", "values": [{"type": "AND", "values": [{"key": "service.name", "operator": "exact", "value": "api"}]}]}}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog retention rule ID (UUID).

#### Version

Incremented by PostHog on each update.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last update.

