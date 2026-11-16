# PostHog::ProductAnalytics::DataColorTheme

A PostHog data color theme: a named, ordered palette of series colors that insights and dashboards in a project can use.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::DataColorTheme",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#colors" title="Colors">Colors</a>" : <i>[ String, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::DataColorTheme
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#colors" title="Colors">Colors</a>: <i>
      - String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the color theme belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the theme.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>100</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Colors

Series colors in order, as CSS hex colors such as #1d4aff.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog data color theme ID.

#### CreatedAt

ISO 8601 creation timestamp.

