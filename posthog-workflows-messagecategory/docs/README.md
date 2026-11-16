# PostHog::Workflows::MessageCategory

A PostHog messaging category: a named group of workflow messages (marketing or transactional) that recipients can opt out of on the preferences page.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Workflows::MessageCategory",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#key" title="Key">Key</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#publicdescription" title="PublicDescription">PublicDescription</a>" : <i>String</i>,
        "<a href="#categorytype" title="CategoryType">CategoryType</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Workflows::MessageCategory
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#key" title="Key">Key</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#publicdescription" title="PublicDescription">PublicDescription</a>: <i>String</i>
    <a href="#categorytype" title="CategoryType">CategoryType</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the message category belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Key

Stable identifier for the category, unique within the project, for example `newsletter`. Opt-out lists and preference imports refer to categories by key. Cannot be changed after creation.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>64</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Display name of the category, shown in the PostHog app.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>128</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Internal notes about which messages belong to this category. Recipients don't see it.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PublicDescription

Description that recipients see next to the category on the preferences page.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CategoryType

`marketing` (the PostHog default): recipients can opt out of it, and sends skip recipients who did. `transactional`: for messages a recipient must get, such as receipts or password resets; sends ignore opt-outs and the category doesn't appear on the preferences page.

_Required_: No

_Type_: String

_Allowed Values_: <code>marketing</code> | <code>transactional</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The message category ID (UUID). Workflow message steps take it as `message_category_id`.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last change.

