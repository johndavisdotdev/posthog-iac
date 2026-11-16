# PostHog::DataWarehouse::Source

A PostHog data warehouse source: a connection to an external system (e.g. Postgres, Stripe, Hubspot) whose tables PostHog syncs into the data warehouse or queries live.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::DataWarehouse::Source",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#sourcetype" title="SourceType">SourceType</a>" : <i>String</i>,
        "<a href="#payload" title="Payload">Payload</a>" : <i>String</i>,
        "<a href="#prefix" title="Prefix">Prefix</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#accessmethod" title="AccessMethod">AccessMethod</a>" : <i>String</i>,
        "<a href="#directqueryenabled" title="DirectQueryEnabled">DirectQueryEnabled</a>" : <i>Boolean</i>,
        "<a href="#destinationids" title="DestinationIds">DestinationIds</a>" : <i>[ String, ... ]</i>,
        "<a href="#autosyncnewschemas" title="AutoSyncNewSchemas">AutoSyncNewSchemas</a>" : <i>Boolean</i>,
        "<a href="#autosyncschemapatterns" title="AutoSyncSchemaPatterns">AutoSyncSchemaPatterns</a>" : <i>[ String, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::DataWarehouse::Source
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#sourcetype" title="SourceType">SourceType</a>: <i>String</i>
    <a href="#payload" title="Payload">Payload</a>: <i>String</i>
    <a href="#prefix" title="Prefix">Prefix</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#accessmethod" title="AccessMethod">AccessMethod</a>: <i>String</i>
    <a href="#directqueryenabled" title="DirectQueryEnabled">DirectQueryEnabled</a>: <i>Boolean</i>
    <a href="#destinationids" title="DestinationIds">DestinationIds</a>: <i>
      - String</i>
    <a href="#autosyncnewschemas" title="AutoSyncNewSchemas">AutoSyncNewSchemas</a>: <i>Boolean</i>
    <a href="#autosyncschemapatterns" title="AutoSyncSchemaPatterns">AutoSyncSchemaPatterns</a>: <i>
      - String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the source belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### SourceType

The source type, e.g. Postgres, Stripe, Hubspot. Changing it replaces the source.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Payload

Connection credentials and settings as a JSON object (use Fn::ToJsonString). Keys depend on SourceType. Add a 'schemas' array to pick which tables sync; omit it and every discovered table syncs with default settings. Write-only: never read back. Changing it later sends the new values (without 'schemas') as the source's job inputs.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Prefix

Prefix added to the table names PostHog creates in HogQL. Does not filter which tables are imported.

_Required_: No

_Type_: String

_Maximum Length_: <code>100</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description.

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AccessMethod

Connection mode: `warehouse` (import, the default) or `direct` (live query). Changing it replaces the source.

_Required_: No

_Type_: String

_Allowed Values_: <code>warehouse</code> | <code>direct</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### DirectQueryEnabled

Whether a synced source should also be live-queryable via direct connection. Ignored for pure direct-query sources.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DestinationIds

IDs of the destinations every table on this source writes to. Omit to write to the PostHog warehouse only. Set on create only and never read back.

_Required_: No

_Type_: List of String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### AutoSyncNewSchemas

Automatically enable syncing for schemas discovered on this source after creation. Not supported for direct-query sources.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AutoSyncSchemaPatterns

fnmatch-style globs (`*` and `?`), e.g. `raw_*`, restricting which newly discovered schema names auto-sync. Empty means every new schema qualifies. Only used when AutoSyncNewSchemas is true.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog source ID (UUID).

#### Status

Sync status of the source, e.g. Running, Completed, Error.

#### LatestError

Latest sync error, if any.

#### LastRunAt

ISO 8601 timestamp of the last sync run.

#### CreatedAt

ISO 8601 creation timestamp.

