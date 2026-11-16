# PostHog::DataWarehouse::SavedQuery Incremental

Incremental materialization settings.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
    "<a href="#incrementalkey" title="IncrementalKey">IncrementalKey</a>" : <i>String</i>,
    "<a href="#uniquekey" title="UniqueKey">UniqueKey</a>" : <i>[ String, ... ]</i>,
    "<a href="#lookbackseconds" title="LookbackSeconds">LookbackSeconds</a>" : <i>Integer</i>
}
</pre>

### YAML

<pre>
<a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
<a href="#incrementalkey" title="IncrementalKey">IncrementalKey</a>: <i>String</i>
<a href="#uniquekey" title="UniqueKey">UniqueKey</a>: <i>
      - String</i>
<a href="#lookbackseconds" title="LookbackSeconds">LookbackSeconds</a>: <i>Integer</i>
</pre>

## Properties

#### Enabled

Whether runs update the table incrementally instead of rebuilding it.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IncrementalKey

Output column whose advancing value marks rows as new. Each run reads only rows at or after the last run's highest value for it.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### UniqueKey

Output columns that identify a row, used to match recomputed rows against stored ones. Must include every GROUP BY column.

_Required_: Yes

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### LookbackSeconds

How far back before the last run's high point to re-read, so late-arriving data is picked up. Only applies when the incremental key is a date or time.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

