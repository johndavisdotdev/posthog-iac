# PostHog::Surveys::ProductTour

A PostHog product tour: a sequence of in-app steps (tooltips, modals, banners) shown by posthog-js to targeted users.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Surveys::ProductTour",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#content" title="Content">Content</a>" : <i>String</i>,
        "<a href="#targetingflagfilters" title="TargetingFlagFilters">TargetingFlagFilters</a>" : <i>String</i>,
        "<a href="#linkedflagid" title="LinkedFlagId">LinkedFlagId</a>" : <i>String</i>,
        "<a href="#autolaunch" title="AutoLaunch">AutoLaunch</a>" : <i>Boolean</i>,
        "<a href="#startdate" title="StartDate">StartDate</a>" : <i>String</i>,
        "<a href="#enddate" title="EndDate">EndDate</a>" : <i>String</i>,
        "<a href="#archived" title="Archived">Archived</a>" : <i>Boolean</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Surveys::ProductTour
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#content" title="Content">Content</a>: <i>String</i>
    <a href="#targetingflagfilters" title="TargetingFlagFilters">TargetingFlagFilters</a>: <i>String</i>
    <a href="#linkedflagid" title="LinkedFlagId">LinkedFlagId</a>: <i>String</i>
    <a href="#autolaunch" title="AutoLaunch">AutoLaunch</a>: <i>Boolean</i>
    <a href="#startdate" title="StartDate">StartDate</a>: <i>String</i>
    <a href="#enddate" title="EndDate">EndDate</a>: <i>String</i>
    <a href="#archived" title="Archived">Archived</a>: <i>Boolean</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the product tour belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the product tour.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Description of the product tour.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Content

Tour content as a JSON object (use Fn::ToJsonString). It holds the tour `steps` (each with its type, target selector, title and body) and display settings such as `appearance`.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TargetingFlagFilters

Targeting as a JSON feature-flag filters object (use Fn::ToJsonString), e.g. {"groups": [{"properties": [{"key": "plan", "value": ["pro"], "operator": "exact", "type": "person"}], "rollout_percentage": 100}]}. PostHog keeps it on an internal targeting flag.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### LinkedFlagId

ID of a feature flag linked to the tour: the tour is shown only to users with the flag enabled.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AutoLaunch

Whether posthog-js launches the tour automatically for matching users.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### StartDate

ISO 8601 launch time. Setting it launches the tour.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EndDate

ISO 8601 end time. Setting it stops the tour.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Archived

Whether the tour is archived.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog product tour ID (UUID).

#### InternalTargetingFlagId

ID of the internal targeting flag PostHog manages for the tour.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

