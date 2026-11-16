# PostHog::SessionReplay::Playlist

A PostHog session replay playlist: either a manually curated collection of recordings or a saved filter view that matches recordings by criteria.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::SessionReplay::Playlist",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#type" title="Type">Type</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#pinned" title="Pinned">Pinned</a>" : <i>Boolean</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::SessionReplay::Playlist
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#type" title="Type">Type</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#pinned" title="Pinned">Pinned</a>: <i>Boolean</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the playlist belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Type

Playlist type: `collection` for manually curated recordings or `filters` for a saved filter view. Create-only.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>collection</code> | <code>filters</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Human-readable name for the playlist.

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Description of the playlist's purpose or contents.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Pinned

Whether the playlist is pinned to the top of the list. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Filters

Recording filter criteria as a JSON object (use Fn::ToJsonString), e.g. {"date_from": "-7d", "filter_test_accounts": true, "duration": [{"key": "duration", "type": "recording", "value": 60, "operator": "gt"}]}. Only used when Type is `filters`.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### ShortId

The playlist's short ID, used in its URL and API path.

#### Id

The playlist's numeric PostHog ID.

#### CreatedAt

ISO 8601 creation timestamp.

