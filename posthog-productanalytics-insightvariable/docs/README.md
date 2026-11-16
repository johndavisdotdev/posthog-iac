# PostHog::ProductAnalytics::InsightVariable

A PostHog SQL (insight) variable: a named, typed value that SQL insights reference as {variables.code_name}.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::InsightVariable",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#type" title="Type">Type</a>" : <i>String</i>,
        "<a href="#defaultvalue" title="DefaultValue">DefaultValue</a>" : <i>String</i>,
        "<a href="#values" title="Values">Values</a>" : <i>[ String, ... ]</i>,
        "<a href="#ismulti" title="IsMulti">IsMulti</a>" : <i>Boolean</i>,
        "<a href="#valuesquery" title="ValuesQuery">ValuesQuery</a>" : <i>String</i>,
        "<a href="#valuesqueryconnectionid" title="ValuesQueryConnectionId">ValuesQueryConnectionId</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::InsightVariable
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#type" title="Type">Type</a>: <i>String</i>
    <a href="#defaultvalue" title="DefaultValue">DefaultValue</a>: <i>String</i>
    <a href="#values" title="Values">Values</a>: <i>
      - String</i>
    <a href="#ismulti" title="IsMulti">IsMulti</a>: <i>Boolean</i>
    <a href="#valuesquery" title="ValuesQuery">ValuesQuery</a>: <i>String</i>
    <a href="#valuesqueryconnectionid" title="ValuesQueryConnectionId">ValuesQueryConnectionId</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the SQL variable belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Human-readable name of the variable. PostHog derives CodeName from it.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Type

Variable type. Controls how the value is rendered and substituted in HogQL: `String`, `Number`, `Boolean`, `List` or `Date`.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>String</code> | <code>Number</code> | <code>Boolean</code> | <code>List</code> | <code>Date</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DefaultValue

Default value used when a query references the variable. A plain string for String, Date and single-value List variables; a number such as "42" for Number; "true" or "false" for Boolean; a JSON array (use Fn::ToJsonString) for multi-value List variables.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Values

Allowed values for List variables.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsMulti

Whether a List variable accepts multiple selected values.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ValuesQuery

HogQL query whose first result column supplies the allowed values of a List variable. An optional second column supplies display labels.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ValuesQueryConnectionId

ID of the external data source connection ValuesQuery runs against. Leave unset to run it against PostHog.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog SQL variable ID (UUID).

#### CodeName

Code-safe name used in HogQL as {variables.code_name}. Derived from Name.

#### CreatedAt

ISO 8601 creation timestamp.

