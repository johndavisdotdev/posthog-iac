# PostHog::Workflows::HogFlow

A PostHog workflow (hog flow): a trigger followed by a graph of actions (messages, delays, branches) that PostHog runs for each person who enters it.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Workflows::HogFlow",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#status" title="Status">Status</a>" : <i>String</i>,
        "<a href="#originproduct" title="OriginProduct">OriginProduct</a>" : <i>String</i>,
        "<a href="#actions" title="Actions">Actions</a>" : <i>String</i>,
        "<a href="#edges" title="Edges">Edges</a>" : <i>String</i>,
        "<a href="#conversion" title="Conversion">Conversion</a>" : <i>String</i>,
        "<a href="#exitcondition" title="ExitCondition">ExitCondition</a>" : <i>String</i>,
        "<a href="#triggermasking" title="TriggerMasking">TriggerMasking</a>" : <i><a href="triggermasking.md">TriggerMasking</a></i>,
        "<a href="#emailsendingratelimit" title="EmailSendingRateLimit">EmailSendingRateLimit</a>" : <i><a href="emailsendingratelimit.md">EmailSendingRateLimit</a></i>,
        "<a href="#variables" title="Variables">Variables</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Workflows::HogFlow
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#status" title="Status">Status</a>: <i>String</i>
    <a href="#originproduct" title="OriginProduct">OriginProduct</a>: <i>String</i>
    <a href="#actions" title="Actions">Actions</a>: <i>String</i>
    <a href="#edges" title="Edges">Edges</a>: <i>String</i>
    <a href="#conversion" title="Conversion">Conversion</a>: <i>String</i>
    <a href="#exitcondition" title="ExitCondition">ExitCondition</a>: <i>String</i>
    <a href="#triggermasking" title="TriggerMasking">TriggerMasking</a>: <i><a href="triggermasking.md">TriggerMasking</a></i>
    <a href="#emailsendingratelimit" title="EmailSendingRateLimit">EmailSendingRateLimit</a>: <i><a href="emailsendingratelimit.md">EmailSendingRateLimit</a></i>
    <a href="#variables" title="Variables">Variables</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the workflow belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Workflow name.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Optional description.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags for organizing workflows, for example by team or use case. Tags are shared with the rest of the project.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Status

`draft` (no execution, the PostHog default), `active` (live) or `archived` (disabled).

_Required_: No

_Type_: String

_Allowed Values_: <code>draft</code> | <code>active</code> | <code>archived</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OriginProduct

Product surface that owns this workflow, e.g. `loops`. Can only be set on create.

_Required_: No

_Type_: String

_Allowed Values_: <code>loops</code> | <code>broadcasts</code> | <code>transactional_emails</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Actions

Ordered action nodes as a JSON array (use Fn::ToJsonString): [{"id", "name", "type", "config", "description"?, "on_error"?, "filters"?, "output_variable"?}]. Exactly one action with type `trigger` is required (its config defines the workflow trigger), and typically one `exit`. Types: trigger, function, function_email, function_sms, function_push, delay, wait_until_condition, wait_until_time_window, conditional_branch, random_cohort_branch, exit, email_sandbox.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>2</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Edges

Graph edges as a JSON array (use Fn::ToJsonString): [{"from", "to", "type": "continue"|"branch", "index"?}]. `branch` requires `index` (into config.conditions of a conditional_branch or wait_until_condition). Every non-exit action needs a reachable next action.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Conversion

Conversion goal as a JSON object (use Fn::ToJsonString): {"filters": [property filters], "events": [{"filters": {"events": [...]}}], "window": "7d"}. Required for the exit_on_conversion exit conditions.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ExitCondition

When people leave the workflow early. `exit_only_at_end` (the PostHog default), `exit_on_conversion` (needs Conversion), `exit_on_trigger_not_matched` or `exit_on_trigger_not_matched_or_conversion`. Only event and cohort triggers are re-checked.

_Required_: No

_Type_: String

_Allowed Values_: <code>exit_only_at_end</code> | <code>exit_on_conversion</code> | <code>exit_on_trigger_not_matched</code> | <code>exit_on_trigger_not_matched_or_conversion</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TriggerMasking

_Required_: No

_Type_: <a href="triggermasking.md">TriggerMasking</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EmailSendingRateLimit

_Required_: No

_Type_: <a href="emailsendingratelimit.md">EmailSendingRateLimit</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Variables

Workflow variables as a JSON array (use Fn::ToJsonString): [{"key", "type": "string"|"number"|"boolean", "default"}]. Total under 5 KB.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The workflow ID (UUID).

#### Trigger

The workflow trigger as JSON, derived by PostHog from the config of the trigger action.

#### Version

Version of the workflow, incremented on every change.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last change.

