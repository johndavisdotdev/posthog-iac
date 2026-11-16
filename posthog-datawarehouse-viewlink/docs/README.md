# PostHog::DataWarehouse::ViewLink

A PostHog data warehouse join (view link): joins a table or view onto a source table so its rows are reachable through a field, e.g. events.person or persons.stripe_customer.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::DataWarehouse::ViewLink",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#sourcetablename" title="SourceTableName">SourceTableName</a>" : <i>String</i>,
        "<a href="#sourcetablekey" title="SourceTableKey">SourceTableKey</a>" : <i>String</i>,
        "<a href="#joiningtablename" title="JoiningTableName">JoiningTableName</a>" : <i>String</i>,
        "<a href="#joiningtablekey" title="JoiningTableKey">JoiningTableKey</a>" : <i>String</i>,
        "<a href="#fieldname" title="FieldName">FieldName</a>" : <i>String</i>,
        "<a href="#configuration" title="Configuration">Configuration</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::DataWarehouse::ViewLink
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#sourcetablename" title="SourceTableName">SourceTableName</a>: <i>String</i>
    <a href="#sourcetablekey" title="SourceTableKey">SourceTableKey</a>: <i>String</i>
    <a href="#joiningtablename" title="JoiningTableName">JoiningTableName</a>: <i>String</i>
    <a href="#joiningtablekey" title="JoiningTableKey">JoiningTableKey</a>: <i>String</i>
    <a href="#fieldname" title="FieldName">FieldName</a>: <i>String</i>
    <a href="#configuration" title="Configuration">Configuration</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the join belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### SourceTableName

Name of the table the join starts from, for example events.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SourceTableKey

Column or HogQL expression on the source table used as the join key.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### JoiningTableName

Name of the table or view being joined onto the source table.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### JoiningTableKey

Column or HogQL expression on the joining table used as the join key.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### FieldName

Accessor added to the source table to reach the joined rows, for example person in events.person.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Configuration

Optional join configuration as a JSON object (use Fn::ToJsonString), for example experiments optimization flags.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog join ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

