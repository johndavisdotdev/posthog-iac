# PostHog::ProductAnalytics::DashboardTemplate

A PostHog dashboard template: a reusable dashboard definition (tiles, filters and variables) that new dashboards can be created from.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::DashboardTemplate",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#templatename" title="TemplateName">TemplateName</a>" : <i>String</i>,
        "<a href="#dashboarddescription" title="DashboardDescription">DashboardDescription</a>" : <i>String</i>,
        "<a href="#dashboardfilters" title="DashboardFilters">DashboardFilters</a>" : <i>String</i>,
        "<a href="#tiles" title="Tiles">Tiles</a>" : <i>String</i>,
        "<a href="#variables" title="Variables">Variables</a>" : <i>String</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#imageurl" title="ImageUrl">ImageUrl</a>" : <i>String</i>,
        "<a href="#scope" title="Scope">Scope</a>" : <i>String</i>,
        "<a href="#availabilitycontexts" title="AvailabilityContexts">AvailabilityContexts</a>" : <i>[ String, ... ]</i>,
        "<a href="#customization" title="Customization">Customization</a>" : <i><a href="customization.md">Customization</a></i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::DashboardTemplate
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#templatename" title="TemplateName">TemplateName</a>: <i>String</i>
    <a href="#dashboarddescription" title="DashboardDescription">DashboardDescription</a>: <i>String</i>
    <a href="#dashboardfilters" title="DashboardFilters">DashboardFilters</a>: <i>String</i>
    <a href="#tiles" title="Tiles">Tiles</a>: <i>String</i>
    <a href="#variables" title="Variables">Variables</a>: <i>String</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#imageurl" title="ImageUrl">ImageUrl</a>: <i>String</i>
    <a href="#scope" title="Scope">Scope</a>: <i>String</i>
    <a href="#availabilitycontexts" title="AvailabilityContexts">AvailabilityContexts</a>: <i>
      - String</i>
    <a href="#customization" title="Customization">Customization</a>: <i><a href="customization.md">Customization</a></i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the template belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### TemplateName

Name of the template.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DashboardDescription

Description given to dashboards created from the template.

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DashboardFilters

Dashboard-level filters for dashboards created from the template, as JSON (use Fn::ToJsonString), e.g. {"date_from": "-30d"}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tiles

Tiles of the template as a JSON array (use Fn::ToJsonString). Each tile is an object such as {"type": "INSIGHT", "name": "Pageviews", "query": {...}, "layouts": {...}, "color": null} or {"type": "TEXT", "body": "..."}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Variables

Template variables as a JSON array (use Fn::ToJsonString), e.g. [{"id": "VARIABLE_1", "name": "Signed up", "type": "event", "default": {"id": "signed_up"}, "required": true, "description": "..."}].

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags on the template.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ImageUrl

URL of the template's preview image.

_Required_: No

_Type_: String

_Maximum Length_: <code>8201</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Scope

Who can use the template: `team` (this project) or `organization` (every project in the organization). `global` and `feature_flag` are reserved for PostHog staff. Defaults to `team`.

_Required_: No

_Type_: String

_Allowed Values_: <code>team</code> | <code>organization</code> | <code>global</code> | <code>feature_flag</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AvailabilityContexts

Contexts in which the template is offered, e.g. general or onboarding.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Customization

_Required_: No

_Type_: <a href="customization.md">Customization</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog dashboard template ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

