# PostHog::ProductAnalytics::SchemaPropertyGroup Property

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#name" title="Name">Name</a>" : <i>String</i>,
    "<a href="#propertytype" title="PropertyType">PropertyType</a>" : <i>String</i>,
    "<a href="#isrequired" title="IsRequired">IsRequired</a>" : <i>Boolean</i>,
    "<a href="#isoptionalintypes" title="IsOptionalInTypes">IsOptionalInTypes</a>" : <i>Boolean</i>,
    "<a href="#description" title="Description">Description</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#name" title="Name">Name</a>: <i>String</i>
<a href="#propertytype" title="PropertyType">PropertyType</a>: <i>String</i>
<a href="#isrequired" title="IsRequired">IsRequired</a>: <i>Boolean</i>
<a href="#isoptionalintypes" title="IsOptionalInTypes">IsOptionalInTypes</a>: <i>Boolean</i>
<a href="#description" title="Description">Description</a>: <i>String</i>
</pre>

## Properties

#### Name

Property name, e.g. plan. Unique within the group.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PropertyType

Property type: `DateTime`, `String`, `Numeric`, `Boolean`, `Object` or `Array`.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>DateTime</code> | <code>String</code> | <code>Numeric</code> | <code>Boolean</code> | <code>Object</code> | <code>Array</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsRequired

Whether events must carry this property. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsOptionalInTypes

Whether generated types mark this property optional even when it is required. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description of the property.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

