# PostHog::ProductAnalytics::Insight

A saved PostHog insight: a query (trends, funnel, retention, paths, SQL, ...) with a name, optionally shown on one or more dashboards. Computed results are never part of the resource.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::Insight",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#derivedname" title="DerivedName">DerivedName</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#query" title="Query">Query</a>" : <i>String</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#favorited" title="Favorited">Favorited</a>" : <i>Boolean</i>,
        "<a href="#dashboards" title="Dashboards">Dashboards</a>" : <i>[ String, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::Insight
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#derivedname" title="DerivedName">DerivedName</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#query" title="Query">Query</a>: <i>String</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#favorited" title="Favorited">Favorited</a>: <i>Boolean</i>
    <a href="#dashboards" title="Dashboards">Dashboards</a>: <i>
      - String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the insight belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the insight. When unset, PostHog shows the derived name.

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DerivedName

Fallback name generated from the query, shown when Name is unset.

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description of the insight.

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Query

The insight's query as JSON (use Fn::ToJsonString), usually an InsightVizNode wrapping a TrendsQuery, FunnelsQuery, RetentionQuery, etc., or a DataVisualizationNode wrapping a HogQLQuery. E.g. {"kind": "InsightVizNode", "source": {"kind": "TrendsQuery", "series": [{"kind": "EventsNode", "event": "$pageview"}]}}.

_Required_: Yes

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags on the insight.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Favorited

Whether the insight is favorited.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Dashboards

IDs of the dashboards (PostHog::ProductAnalytics::Dashboard) the insight is shown on. Removing an ID removes the insight's tile from that dashboard.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog insight ID.

#### ShortId

The insight's short ID, as used in PostHog URLs (/insights/<ShortId>).

#### CreatedAt

ISO 8601 creation timestamp.

