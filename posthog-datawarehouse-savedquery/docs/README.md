# PostHog::DataWarehouse::SavedQuery

A PostHog data warehouse saved query (view): a named HogQL query that can be queried like a table and optionally materialized on a schedule.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::DataWarehouse::SavedQuery",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#query" title="Query">Query</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#syncfrequency" title="SyncFrequency">SyncFrequency</a>" : <i>String</i>,
        "<a href="#incremental" title="Incremental">Incremental</a>" : <i><a href="incremental.md">Incremental</a></i>,
        "<a href="#folderid" title="FolderId">FolderId</a>" : <i>String</i>,
        "<a href="#istest" title="IsTest">IsTest</a>" : <i>Boolean</i>,
        "<a href="#acknowledgebreakingchanges" title="AcknowledgeBreakingChanges">AcknowledgeBreakingChanges</a>" : <i>Boolean</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::DataWarehouse::SavedQuery
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#query" title="Query">Query</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#syncfrequency" title="SyncFrequency">SyncFrequency</a>: <i>String</i>
    <a href="#incremental" title="Incremental">Incremental</a>: <i><a href="incremental.md">Incremental</a></i>
    <a href="#folderid" title="FolderId">FolderId</a>: <i>String</i>
    <a href="#istest" title="IsTest">IsTest</a>: <i>Boolean</i>
    <a href="#acknowledgebreakingchanges" title="AcknowledgeBreakingChanges">AcknowledgeBreakingChanges</a>: <i>Boolean</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the saved query belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Unique name for the view. Used as the table name in HogQL queries.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>128</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Query

HogQL query definition as a JSON object (use Fn::ToJsonString) with a "kind" key (always "HogQLQuery") and a "query" key containing the SQL string, e.g. {"kind": "HogQLQuery", "query": "SELECT event, count() AS cnt FROM events GROUP BY event"}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

What this view represents: what one row is, what the view includes or leaves out, and when to use it.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SyncFrequency

How often to materialize this view, or `never` to pause scheduled materialization. Leave unset for no scheduled materialization.

_Required_: No

_Type_: String

_Allowed Values_: <code>never</code> | <code>15min</code> | <code>30min</code> | <code>1hour</code> | <code>6hour</code> | <code>12hour</code> | <code>24hour</code> | <code>7day</code> | <code>30day</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Incremental

Incremental materialization settings.

_Required_: No

_Type_: <a href="incremental.md">Incremental</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### FolderId

Optional folder ID used to organize this view in the SQL editor sidebar.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsTest

Whether this view is for testing only and will auto-expire.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AcknowledgeBreakingChanges

Confirm an update that removes columns used by downstream views. Without it such an update is refused. Write-only.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog saved query ID (UUID).

#### Status

Materialization status: Cancelled, Modified, Completed, Failed, Running or Skipped.

#### IsMaterialized

Whether the view is materialized.

#### LastRunAt

ISO 8601 timestamp of the last materialization run.

#### LatestError

Latest materialization error, if any.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

