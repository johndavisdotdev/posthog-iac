# PostHog::LLMAnalytics::Evaluation

A PostHog LLM analytics evaluation: scores LLM generations, traces or sessions with an LLM judge, Hog code or sentiment classification.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::LLMAnalytics::Evaluation",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#directoryid" title="DirectoryId">DirectoryId</a>" : <i>String</i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
        "<a href="#evaluationtype" title="EvaluationType">EvaluationType</a>" : <i>String</i>,
        "<a href="#evaluationconfig" title="EvaluationConfig">EvaluationConfig</a>" : <i>String</i>,
        "<a href="#outputtype" title="OutputType">OutputType</a>" : <i>String</i>,
        "<a href="#outputconfig" title="OutputConfig">OutputConfig</a>" : <i>String</i>,
        "<a href="#conditions" title="Conditions">Conditions</a>" : <i>String</i>,
        "<a href="#target" title="Target">Target</a>" : <i>String</i>,
        "<a href="#targetconfig" title="TargetConfig">TargetConfig</a>" : <i>String</i>,
        "<a href="#modelconfiguration" title="ModelConfiguration">ModelConfiguration</a>" : <i><a href="modelconfiguration.md">ModelConfiguration</a></i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::LLMAnalytics::Evaluation
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#directoryid" title="DirectoryId">DirectoryId</a>: <i>String</i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
    <a href="#evaluationtype" title="EvaluationType">EvaluationType</a>: <i>String</i>
    <a href="#evaluationconfig" title="EvaluationConfig">EvaluationConfig</a>: <i>String</i>
    <a href="#outputtype" title="OutputType">OutputType</a>: <i>String</i>
    <a href="#outputconfig" title="OutputConfig">OutputConfig</a>: <i>String</i>
    <a href="#conditions" title="Conditions">Conditions</a>: <i>String</i>
    <a href="#target" title="Target">Target</a>: <i>String</i>
    <a href="#targetconfig" title="TargetConfig">TargetConfig</a>: <i>String</i>
    <a href="#modelconfiguration" title="ModelConfiguration">ModelConfiguration</a>: <i><a href="modelconfiguration.md">ModelConfiguration</a></i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the evaluation belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the evaluation.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Description of what this evaluation checks.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DirectoryId

ID of the directory (folder) containing the evaluation. Omit to keep it at the top level.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the evaluation runs automatically on new $ai_generation events. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EvaluationType

`llm_judge` scores outputs with an LLM against a prompt; `hog` runs deterministic Hog code; `sentiment` classifies user-message sentiment (English only).

_Required_: Yes

_Type_: String

_Allowed Values_: <code>llm_judge</code> | <code>hog</code> | <code>sentiment</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EvaluationConfig

Evaluation configuration as a JSON object (use Fn::ToJsonString). For `llm_judge`: {"prompt": "..."} plus optional `judge_method` (`llm` or `decision`), `include_media` and `reasoning_level`; for `hog`: {"source": "<Hog code>"}; for `sentiment`: {"source": "user_messages"}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OutputType

Output format: `boolean` (pass/fail), `numeric` (finite score), `categorical` (category keys) or `sentiment`.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>boolean</code> | <code>numeric</code> | <code>categorical</code> | <code>sentiment</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OutputConfig

Output configuration as a JSON object (use Fn::ToJsonString). Boolean: `allows_na`, `true_is_failure`, `decision_threshold`; numeric: `min`, `max`, `step`, `passing_rule` ({operator: gte|lte, threshold}); categorical: `options` ([{key, label}]), `selection_mode` (single|multiple), `passing_rule` ({categories}).

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Conditions

Trigger conditions as a JSON array (use Fn::ToJsonString). OR between condition sets, AND within each. Each set is {"id": "<stable id>", "rollout_percentage": 0-100 (default 100), "properties": [<event or person property filters>]}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Target

What the evaluation runs on: `generation` (default, each matching $ai_generation event), `trace` (the whole trace once) or `session` (the whole $ai_session_id session once).

_Required_: No

_Type_: String

_Allowed Values_: <code>generation</code> | <code>trace</code> | <code>session</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TargetConfig

Settle configuration for `trace` and `session` targets as a JSON object (use Fn::ToJsonString): {"strategy": "fixed_window", "window_seconds": N} or {"strategy": "inactivity", "quiet_period_seconds": N, "max_age_seconds": N}. Omit for `generation`; PostHog fills in omitted fields with per-target defaults.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ModelConfiguration

_Required_: No

_Type_: <a href="modelconfiguration.md">ModelConfiguration</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog evaluation ID (UUID).

#### Status

Current status: `active`, `paused` or `error`.

#### StatusReason

Why PostHog disabled the evaluation, when Status is `error` (e.g. provider_key_invalid).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last update.

