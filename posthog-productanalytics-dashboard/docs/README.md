# PostHog::ProductAnalytics::Dashboard

A PostHog dashboard: a named collection of insight tiles with shared filters. Tiles are managed by attaching insights (PostHog::ProductAnalytics::Insight Dashboards) and are not part of this resource.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::Dashboard",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#pinned" title="Pinned">Pinned</a>" : <i>Boolean</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#breakdowncolors" title="BreakdownColors">BreakdownColors</a>" : <i>[ <a href="breakdowncolor.md">BreakdownColor</a>, ... ]</i>,
        "<a href="#datacolorthemeid" title="DataColorThemeId">DataColorThemeId</a>" : <i>String</i>,
        "<a href="#quickfilterids" title="QuickFilterIds">QuickFilterIds</a>" : <i>[ String, ... ]</i>,
        "<a href="#gridspacing" title="GridSpacing">GridSpacing</a>" : <i>String</i>,
        "<a href="#layoutcompaction" title="LayoutCompaction">LayoutCompaction</a>" : <i>String</i>,
        "<a href="#groupdisplay" title="GroupDisplay">GroupDisplay</a>" : <i>String</i>,
        "<a href="#usetemplate" title="UseTemplate">UseTemplate</a>" : <i>String</i>,
        "<a href="#usedashboard" title="UseDashboard">UseDashboard</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::Dashboard
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#pinned" title="Pinned">Pinned</a>: <i>Boolean</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#breakdowncolors" title="BreakdownColors">BreakdownColors</a>: <i>
      - <a href="breakdowncolor.md">BreakdownColor</a></i>
    <a href="#datacolorthemeid" title="DataColorThemeId">DataColorThemeId</a>: <i>String</i>
    <a href="#quickfilterids" title="QuickFilterIds">QuickFilterIds</a>: <i>
      - String</i>
    <a href="#gridspacing" title="GridSpacing">GridSpacing</a>: <i>String</i>
    <a href="#layoutcompaction" title="LayoutCompaction">LayoutCompaction</a>: <i>String</i>
    <a href="#groupdisplay" title="GroupDisplay">GroupDisplay</a>: <i>String</i>
    <a href="#usetemplate" title="UseTemplate">UseTemplate</a>: <i>String</i>
    <a href="#usedashboard" title="UseDashboard">UseDashboard</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the dashboard belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the dashboard.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description of the dashboard.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Pinned

Whether the dashboard is pinned to the top of the dashboard list.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags on the dashboard.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Filters

Dashboard-level filters applied to every tile, as JSON (use Fn::ToJsonString): date_from, date_to, properties, breakdown_filter, interval, compareFilter, filterTestAccounts. E.g. {"date_from": "-30d"}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BreakdownColors

Colors pinned to specific breakdown values across the dashboard's tiles.

_Required_: No

_Type_: List of <a href="breakdowncolor.md">BreakdownColor</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DataColorThemeId

ID of the color theme (PostHog::ProductAnalytics::DataColorTheme) used for chart visualizations.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### QuickFilterIds

IDs of the quick filters shown on this dashboard.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### GridSpacing

Named tile density preset.

_Required_: No

_Type_: String

_Allowed Values_: <code>tight</code> | <code>condensed</code> | <code>standard</code> | <code>relaxed</code> | <code>wide</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### LayoutCompaction

How tiles rearrange after a move or resize: `vertical` stacks tiles upward, `horizontal` to the left, `stable` preserves positions.

_Required_: No

_Type_: String

_Allowed Values_: <code>vertical</code> | <code>horizontal</code> | <code>stable</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### GroupDisplay

How tile groups show: `sections` (collapsible bands) or `tabs`.

_Required_: No

_Type_: String

_Allowed Values_: <code>sections</code> | <code>tabs</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### UseTemplate

Key of a predefined dashboard template to create the dashboard from. Only used on creation.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### UseDashboard

ID of an existing dashboard to duplicate (tiles included). Only used on creation.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog dashboard ID.

#### CreatedAt

ISO 8601 creation timestamp.

