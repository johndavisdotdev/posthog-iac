# PostHog::ProductAnalytics::EventDefinition

A PostHog event definition: the metadata (description, tags, owner, verification, visibility and schema enforcement) PostHog keeps for an event name in a project. Requires a PostHog plan with the data management feature.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::EventDefinition",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#owner" title="Owner">Owner</a>" : <i>String</i>,
        "<a href="#verified" title="Verified">Verified</a>" : <i>Boolean</i>,
        "<a href="#hidden" title="Hidden">Hidden</a>" : <i>Boolean</i>,
        "<a href="#enforcementmode" title="EnforcementMode">EnforcementMode</a>" : <i>String</i>,
        "<a href="#primaryproperty" title="PrimaryProperty">PrimaryProperty</a>" : <i>String</i>,
        "<a href="#posttoslack" title="PostToSlack">PostToSlack</a>" : <i>Boolean</i>,
        "<a href="#defaultcolumns" title="DefaultColumns">DefaultColumns</a>" : <i>[ String, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::EventDefinition
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#owner" title="Owner">Owner</a>: <i>String</i>
    <a href="#verified" title="Verified">Verified</a>: <i>Boolean</i>
    <a href="#hidden" title="Hidden">Hidden</a>: <i>Boolean</i>
    <a href="#enforcementmode" title="EnforcementMode">EnforcementMode</a>: <i>String</i>
    <a href="#primaryproperty" title="PrimaryProperty">PrimaryProperty</a>: <i>String</i>
    <a href="#posttoslack" title="PostToSlack">PostToSlack</a>: <i>Boolean</i>
    <a href="#defaultcolumns" title="DefaultColumns">DefaultColumns</a>: <i>
      - String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the event definition belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Event name, e.g. signed_up or $pageview. Unique within the project. Create-only.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Description

Human-readable description of the event.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags on the event definition.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Owner

Numeric ID of the user responsible for the event.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Verified

Whether the event is marked as verified. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Hidden

Whether the event is hidden from event pickers. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EnforcementMode

Schema enforcement for this event: `allow` (accept events that don't match the schema) or `reject`. Defaults to `allow`.

_Required_: No

_Type_: String

_Allowed Values_: <code>allow</code> | <code>reject</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PrimaryProperty

Name of a single property PostHog UIs show next to the event name (for example $pathname on $pageview).

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PostToSlack

Whether to post to the project's Slack/webhook integration when the event is ingested. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DefaultColumns

Columns shown by default when exploring this event.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog event definition ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

