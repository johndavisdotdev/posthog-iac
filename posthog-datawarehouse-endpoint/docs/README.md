# PostHog::DataWarehouse::Endpoint

A PostHog endpoint: a named HogQL or insight query exposed as an API route (/api/projects/{project_id}/endpoints/{name}/run), optionally materialized.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::DataWarehouse::Endpoint",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#query" title="Query">Query</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#datafreshnessseconds" title="DataFreshnessSeconds">DataFreshnessSeconds</a>" : <i>Integer</i>,
        "<a href="#isactive" title="IsActive">IsActive</a>" : <i>Boolean</i>,
        "<a href="#ismaterialized" title="IsMaterialized">IsMaterialized</a>" : <i>Boolean</i>,
        "<a href="#derivedfrominsight" title="DerivedFromInsight">DerivedFromInsight</a>" : <i>String</i>,
        "<a href="#bucketoverrides" title="BucketOverrides">BucketOverrides</a>" : <i><a href="bucketoverrides.md">BucketOverrides</a></i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#optionalbreakdownproperties" title="OptionalBreakdownProperties">OptionalBreakdownProperties</a>" : <i>[ String, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::DataWarehouse::Endpoint
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#query" title="Query">Query</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#datafreshnessseconds" title="DataFreshnessSeconds">DataFreshnessSeconds</a>: <i>Integer</i>
    <a href="#isactive" title="IsActive">IsActive</a>: <i>Boolean</i>
    <a href="#ismaterialized" title="IsMaterialized">IsMaterialized</a>: <i>Boolean</i>
    <a href="#derivedfrominsight" title="DerivedFromInsight">DerivedFromInsight</a>: <i>String</i>
    <a href="#bucketoverrides" title="BucketOverrides">BucketOverrides</a>: <i><a href="bucketoverrides.md">BucketOverrides</a></i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#optionalbreakdownproperties" title="OptionalBreakdownProperties">OptionalBreakdownProperties</a>: <i>
      - String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the endpoint belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Unique URL-safe name, used in the endpoint's path. Must start with a letter and contain only letters, numbers, hyphens and underscores. Changing it replaces the endpoint.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>128</code>

_Pattern_: <code>^[A-Za-z][A-Za-z0-9_-]*$</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Query

HogQL or insight query the endpoint executes, as a JSON object with a "kind" key (use Fn::ToJsonString), e.g. {"kind": "HogQLQuery", "query": "SELECT count() FROM events"}. Changing it creates a new endpoint version.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description of what this endpoint returns.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DataFreshnessSeconds

How fresh the data should be, in seconds: 900, 1800, 3600, 21600, 43200, 86400 (the default) or 604800. Controls cache TTL and materialization sync frequency.

_Required_: No

_Type_: Integer

_Allowed Values_: <code>900</code> | <code>1800</code> | <code>3600</code> | <code>21600</code> | <code>43200</code> | <code>86400</code> | <code>604800</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsActive

Whether this endpoint is available for execution via the API. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsMaterialized

Whether query results are materialized to S3.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DerivedFromInsight

Short ID of the insight this endpoint was derived from.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### BucketOverrides

Per-column bucket overrides for range variable materialization. Keys are column names, values are bucket keys.

_Required_: No

_Type_: <a href="bucketoverrides.md">BucketOverrides</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tag names associated with this endpoint.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OptionalBreakdownProperties

Breakdown property names that may be omitted on /run. Omitted ones return data aggregated across all values of that breakdown. By default every breakdown variable is required.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog endpoint ID (UUID).

#### EndpointPath

Relative API path to execute this endpoint.

#### Url

Absolute URL to execute this endpoint.

#### CurrentVersion

Latest version number.

#### MaterializationStatus

Current materialization status of the current version (e.g. Completed, Running).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

