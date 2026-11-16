# PostHog::BatchExports::BatchExport

A PostHog batch export: a scheduled export of events, persons, sessions or a HogQL query to a destination such as S3, Snowflake, BigQuery, Postgres, Redshift, Databricks or Azure Blob Storage.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::BatchExports::BatchExport",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#model" title="Model">Model</a>" : <i>String</i>,
        "<a href="#interval" title="Interval">Interval</a>" : <i>String</i>,
        "<a href="#paused" title="Paused">Paused</a>" : <i>Boolean</i>,
        "<a href="#destinationtype" title="DestinationType">DestinationType</a>" : <i>String</i>,
        "<a href="#destinationintegrationid" title="DestinationIntegrationId">DestinationIntegrationId</a>" : <i>String</i>,
        "<a href="#destinationconfig" title="DestinationConfig">DestinationConfig</a>" : <i>String</i>,
        "<a href="#destinationsecretconfig" title="DestinationSecretConfig">DestinationSecretConfig</a>" : <i>String</i>,
        "<a href="#hogqlquery" title="HogqlQuery">HogqlQuery</a>" : <i>String</i>,
        "<a href="#hogqlmodifiers" title="HogqlModifiers">HogqlModifiers</a>" : <i>String</i>,
        "<a href="#primarykey" title="PrimaryKey">PrimaryKey</a>" : <i>[ String, ... ]</i>,
        "<a href="#versionkey" title="VersionKey">VersionKey</a>" : <i>[ String, ... ]</i>,
        "<a href="#incrementalmode" title="IncrementalMode">IncrementalMode</a>" : <i>String</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#timezone" title="Timezone">Timezone</a>" : <i>String</i>,
        "<a href="#offsetday" title="OffsetDay">OffsetDay</a>" : <i>Integer</i>,
        "<a href="#offsethour" title="OffsetHour">OffsetHour</a>" : <i>Integer</i>,
        "<a href="#startat" title="StartAt">StartAt</a>" : <i>String</i>,
        "<a href="#endat" title="EndAt">EndAt</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::BatchExports::BatchExport
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#model" title="Model">Model</a>: <i>String</i>
    <a href="#interval" title="Interval">Interval</a>: <i>String</i>
    <a href="#paused" title="Paused">Paused</a>: <i>Boolean</i>
    <a href="#destinationtype" title="DestinationType">DestinationType</a>: <i>String</i>
    <a href="#destinationintegrationid" title="DestinationIntegrationId">DestinationIntegrationId</a>: <i>String</i>
    <a href="#destinationconfig" title="DestinationConfig">DestinationConfig</a>: <i>String</i>
    <a href="#destinationsecretconfig" title="DestinationSecretConfig">DestinationSecretConfig</a>: <i>String</i>
    <a href="#hogqlquery" title="HogqlQuery">HogqlQuery</a>: <i>String</i>
    <a href="#hogqlmodifiers" title="HogqlModifiers">HogqlModifiers</a>: <i>String</i>
    <a href="#primarykey" title="PrimaryKey">PrimaryKey</a>: <i>
      - String</i>
    <a href="#versionkey" title="VersionKey">VersionKey</a>: <i>
      - String</i>
    <a href="#incrementalmode" title="IncrementalMode">IncrementalMode</a>: <i>String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#timezone" title="Timezone">Timezone</a>: <i>String</i>
    <a href="#offsetday" title="OffsetDay">OffsetDay</a>: <i>Integer</i>
    <a href="#offsethour" title="OffsetHour">OffsetHour</a>: <i>Integer</i>
    <a href="#startat" title="StartAt">StartAt</a>: <i>String</i>
    <a href="#endat" title="EndAt">EndAt</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the batch export belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Human-readable name for the batch export.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Model

Which data model to export: `events` (the PostHog default), `persons`, `sessions`, or `hogql` (the results of HogqlQuery).

_Required_: No

_Type_: String

_Allowed Values_: <code>events</code> | <code>persons</code> | <code>sessions</code> | <code>hogql</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Interval

How often the batch export runs.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>hour</code> | <code>day</code> | <code>week</code> | <code>every 5 minutes</code> | <code>every 15 minutes</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Paused

Whether the batch export is paused.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DestinationType

Destination type. Cannot be changed after creation.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>AwsS3</code> | <code>S3Compatible</code> | <code>Snowflake</code> | <code>Postgres</code> | <code>Redshift</code> | <code>BigQuery</code> | <code>Databricks</code> | <code>AzureBlob</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### DestinationIntegrationId

ID of the team-scoped PostHog integration that provides the destination's credentials (aws-s3, s3-compatible, snowflake, postgresql, aws-redshift, google-cloud-service-account, databricks or azure-blob kind). PostHog requires it for every destination type.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DestinationConfig

Non-secret destination settings as a JSON object (use Fn::ToJsonString). Fields depend on DestinationType, e.g. AwsS3: {"bucket_name", "region", "prefix", "file_format", "compression", ...}; Snowflake: {"database", "warehouse", "schema", "table_name", "role"}; Postgres/Redshift: {"database", "schema", "table_name", ...}; BigQuery: {"dataset_id", "table_id"}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>2</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DestinationSecretConfig

Secret destination settings (credentials such as aws_secret_access_key, password or private_key) as a JSON object (use Fn::ToJsonString with dynamic references). Merged into the destination config on create and update. Write-only: never returned by Read. Prefer DestinationIntegrationId, which keeps credentials in a PostHog integration.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### HogqlQuery

HogQL SELECT query whose results are exported when Model is `hogql`. May reference the {data_interval_start} and {data_interval_end} placeholders.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### HogqlModifiers

HogQL modifiers for the query as a JSON object (use Fn::ToJsonString), e.g. {"convertToProjectTimezone": true}. Only supported when Model is `hogql`.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PrimaryKey

Column or columns of the HogQL query that make up the primary key. Required when IncrementalMode is `MERGE`.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### VersionKey

Column or columns of the HogQL query that make up the version key.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IncrementalMode

How the batch export handles incremental updates: `APPEND` or `MERGE`.

_Required_: No

_Type_: String

_Allowed Values_: <code>APPEND</code> | <code>MERGE</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Filters

Property filters restricting which events are exported, as a JSON array (use Fn::ToJsonString) of HogQL property filters with type event, hogql or person, e.g. [{"key": "$browser", "operator": "exact", "type": "event", "value": ["Firefox"]}].

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Timezone

IANA timezone name (e.g. Europe/London) controlling daily and weekly interval boundaries. PostHog defaults to UTC.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OffsetDay

Day-of-week offset for weekly intervals (0 = Sunday, 6 = Saturday).

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OffsetHour

Hour-of-day offset (0-23) for daily and weekly intervals.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### StartAt

ISO 8601 time before which no runs are triggered.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EndAt

ISO 8601 time after which no runs are triggered.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The batch export ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

#### LastUpdatedAt

ISO 8601 timestamp of the last change.

