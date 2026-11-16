# PostHog::ProductAnalytics::DashboardTemplate Customization

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#tilespacing" title="TileSpacing">TileSpacing</a>" : <i>String</i>,
    "<a href="#layoutcompaction" title="LayoutCompaction">LayoutCompaction</a>" : <i>String</i>,
    "<a href="#groupdisplay" title="GroupDisplay">GroupDisplay</a>" : <i>String</i>,
    "<a href="#groups" title="Groups">Groups</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#tilespacing" title="TileSpacing">TileSpacing</a>: <i>String</i>
<a href="#layoutcompaction" title="LayoutCompaction">LayoutCompaction</a>: <i>String</i>
<a href="#groupdisplay" title="GroupDisplay">GroupDisplay</a>: <i>String</i>
<a href="#groups" title="Groups">Groups</a>: <i>String</i>
</pre>

## Properties

#### TileSpacing

Named tile density preset.

_Required_: No

_Type_: String

_Allowed Values_: <code>tight</code> | <code>condensed</code> | <code>standard</code> | <code>relaxed</code> | <code>wide</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### LayoutCompaction

How tiles rearrange after a move or resize: `vertical`, `horizontal` or `stable`.

_Required_: No

_Type_: String

_Allowed Values_: <code>vertical</code> | <code>horizontal</code> | <code>stable</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### GroupDisplay

How tile groups show: `sections` or `tabs`.

_Required_: No

_Type_: String

_Allowed Values_: <code>sections</code> | <code>tabs</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Groups

Settings for tile groups, keyed by the tiles' group_key, as a JSON object (use Fn::ToJsonString).

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

