# PostHog::ProductAnalytics::Cohort

A PostHog cohort: a named group of persons defined by property and behavioral filters (or a HogQL query), used to filter insights, target feature flags and build audiences.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::Cohort",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#query" title="Query">Query</a>" : <i>String</i>,
        "<a href="#isstatic" title="IsStatic">IsStatic</a>" : <i>Boolean</i>,
        "<a href="#cohorttype" title="CohortType">CohortType</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::Cohort
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#query" title="Query">Query</a>: <i>String</i>
    <a href="#isstatic" title="IsStatic">IsStatic</a>: <i>Boolean</i>
    <a href="#cohorttype" title="CohortType">CohortType</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the cohort belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the cohort.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description of the cohort.

_Required_: No

_Type_: String

_Maximum Length_: <code>1000</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Filters

Cohort membership filters as JSON (use Fn::ToJsonString): an object with a `properties` filter group, e.g. {"properties": {"type": "OR", "values": [{"type": "AND", "values": [{"key": "email", "type": "person", "value": "@example.com", "operator": "icontains"}]}]}}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Query

HogQL query that defines the cohort's members, as JSON (use Fn::ToJsonString). Used instead of Filters for query-based cohorts.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsStatic

Whether the cohort is static (a fixed list of persons, filled in PostHog) rather than computed from Filters. Cannot be changed after creation.

_Required_: No

_Type_: Boolean

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### CohortType

Type of cohort. PostHog derives it from the filters when not set.

_Required_: No

_Type_: String

_Allowed Values_: <code>static</code> | <code>person_property</code> | <code>behavioral</code> | <code>realtime</code> | <code>analytical</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog cohort ID.

#### CreatedAt

ISO 8601 creation timestamp.

