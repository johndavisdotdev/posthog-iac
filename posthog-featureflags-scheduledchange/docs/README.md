# PostHog::FeatureFlags::ScheduledChange

A PostHog scheduled change: a change to a feature flag (enable/disable, add a release condition, update variants) applied automatically at a set time, once or on a recurring schedule.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::FeatureFlags::ScheduledChange",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#recordid" title="RecordId">RecordId</a>" : <i>String</i>,
        "<a href="#modelname" title="ModelName">ModelName</a>" : <i>String</i>,
        "<a href="#payload" title="Payload">Payload</a>" : <i>String</i>,
        "<a href="#scheduledat" title="ScheduledAt">ScheduledAt</a>" : <i>String</i>,
        "<a href="#isrecurring" title="IsRecurring">IsRecurring</a>" : <i>Boolean</i>,
        "<a href="#recurrenceinterval" title="RecurrenceInterval">RecurrenceInterval</a>" : <i>String</i>,
        "<a href="#cronexpression" title="CronExpression">CronExpression</a>" : <i>String</i>,
        "<a href="#enddate" title="EndDate">EndDate</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::FeatureFlags::ScheduledChange
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#recordid" title="RecordId">RecordId</a>: <i>String</i>
    <a href="#modelname" title="ModelName">ModelName</a>: <i>String</i>
    <a href="#payload" title="Payload">Payload</a>: <i>String</i>
    <a href="#scheduledat" title="ScheduledAt">ScheduledAt</a>: <i>String</i>
    <a href="#isrecurring" title="IsRecurring">IsRecurring</a>: <i>Boolean</i>
    <a href="#recurrenceinterval" title="RecurrenceInterval">RecurrenceInterval</a>: <i>String</i>
    <a href="#cronexpression" title="CronExpression">CronExpression</a>: <i>String</i>
    <a href="#enddate" title="EndDate">EndDate</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the scheduled change belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### RecordId

ID of the record to modify, e.g. the feature flag ID.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>200</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ModelName

Type of record to modify. Only `FeatureFlag` is supported (the default).

_Required_: No

_Type_: String

_Allowed Values_: <code>FeatureFlag</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Payload

The change to apply, as a JSON object (use Fn::ToJsonString) with an `operation` and a `value`. Operations: `update_status` (value: true/false to enable/disable the flag), `add_release_condition` (value: object with `groups`, `payloads` and `multivariate`), `update_variants` (value: object with `variants` and `payloads`).

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScheduledAt

ISO 8601 date-time when the change should be applied, e.g. 2026-06-01T14:00:00Z.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsRecurring

Whether the schedule repeats. Only the `update_status` operation supports recurring schedules.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### RecurrenceInterval

How often the schedule repeats. Required when IsRecurring is true.

_Required_: No

_Type_: String

_Allowed Values_: <code>daily</code> | <code>weekly</code> | <code>monthly</code> | <code>yearly</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### CronExpression

Cron expression for a recurring schedule, as an alternative to RecurrenceInterval.

_Required_: No

_Type_: String

_Maximum Length_: <code>100</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EndDate

Optional ISO 8601 date-time after which a recurring schedule stops executing.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog scheduled change ID.

#### ExecutedAt

When the change was applied (for a one-off change). Unset until it runs.

#### LastExecutedAt

When a recurring schedule last ran.

#### FailureReason

Why the last execution failed, if it did.

#### Timezone

Time zone PostHog evaluates the schedule in (the project's time zone).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last update.

