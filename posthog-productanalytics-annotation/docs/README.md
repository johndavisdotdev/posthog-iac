# PostHog::ProductAnalytics::Annotation

A PostHog annotation: a note pinned to a point in time (a release, incident or campaign) and shown on insight charts in a project, an organization, a dashboard or a single insight.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::Annotation",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#content" title="Content">Content</a>" : <i>String</i>,
        "<a href="#datemarker" title="DateMarker">DateMarker</a>" : <i>String</i>,
        "<a href="#creationtype" title="CreationType">CreationType</a>" : <i>String</i>,
        "<a href="#scope" title="Scope">Scope</a>" : <i>String</i>,
        "<a href="#dashboarditem" title="DashboardItem">DashboardItem</a>" : <i>String</i>,
        "<a href="#dashboardid" title="DashboardId">DashboardId</a>" : <i>String</i>,
        "<a href="#emoji" title="Emoji">Emoji</a>" : <i>String</i>,
        "<a href="#hiddeninuserinterface" title="HiddenInUserInterface">HiddenInUserInterface</a>" : <i>Boolean</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::Annotation
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#content" title="Content">Content</a>: <i>String</i>
    <a href="#datemarker" title="DateMarker">DateMarker</a>: <i>String</i>
    <a href="#creationtype" title="CreationType">CreationType</a>: <i>String</i>
    <a href="#scope" title="Scope">Scope</a>: <i>String</i>
    <a href="#dashboarditem" title="DashboardItem">DashboardItem</a>: <i>String</i>
    <a href="#dashboardid" title="DashboardId">DashboardId</a>: <i>String</i>
    <a href="#emoji" title="Emoji">Emoji</a>: <i>String</i>
    <a href="#hiddeninuserinterface" title="HiddenInUserInterface">HiddenInUserInterface</a>: <i>Boolean</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the annotation belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Content

Annotation text shown on charts to describe the change, release or incident.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>8192</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DateMarker

When the annotation happened (ISO 8601 timestamp, e.g. 2026-05-01T12:00:00Z). Used to position it on charts.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CreationType

Who created the annotation: `USR` for user-created notes, `GIT` for bot or deployment notes. Defaults to `USR`.

_Required_: No

_Type_: String

_Allowed Values_: <code>USR</code> | <code>GIT</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Scope

Where the annotation is shown: `project` (every insight in the project), `organization` (every project in the organization), `dashboard` (insights on the dashboard in DashboardId) or `dashboard_item` (only the insight in DashboardItem).

_Required_: Yes

_Type_: String

_Allowed Values_: <code>dashboard_item</code> | <code>dashboard</code> | <code>project</code> | <code>organization</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DashboardItem

ID of the insight to attach the annotation to (for scope `dashboard_item`). Must belong to the same project.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DashboardId

ID of the dashboard to attach the annotation to (for scope `dashboard`). Must belong to the same project.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Emoji

Optional emoji shown in place of the default badge on charts.

_Required_: No

_Type_: String

_Maximum Length_: <code>16</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### HiddenInUserInterface

When true, the annotation is hidden from the PostHog UI (charts and the annotations list) but still readable over the API. Use for high-frequency markers such as deployments.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog annotation ID.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last change.

