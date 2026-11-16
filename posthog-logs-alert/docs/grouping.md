# PostHog::Logs::Alert Grouping

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#mode" title="Mode">Mode</a>" : <i>String</i>,
    "<a href="#keys" title="Keys">Keys</a>" : <i>[ String, ... ]</i>,
    "<a href="#maxinstances" title="MaxInstances">MaxInstances</a>" : <i>Integer</i>,
    "<a href="#onoverflow" title="OnOverflow">OnOverflow</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#mode" title="Mode">Mode</a>: <i>String</i>
<a href="#keys" title="Keys">Keys</a>: <i>
      - String</i>
<a href="#maxinstances" title="MaxInstances">MaxInstances</a>: <i>Integer</i>
<a href="#onoverflow" title="OnOverflow">OnOverflow</a>: <i>String</i>
</pre>

## Properties

#### Mode

`single` keeps one instance for the whole alert. `by_result_labels` keeps one instance per distinct value of the labels in Keys, each firing and resolving on its own (needs ThresholdOperator `above`).

_Required_: Yes

_Type_: String

_Allowed Values_: <code>single</code> | <code>by_result_labels</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Keys

Result labels whose values make a group, such as service_name or severity_text. Empty for `single`, required for `by_result_labels`. Changing them deletes existing instances.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### MaxInstances

Most instances the alert keeps at once (1-100, default 100).

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OnOverflow

What happens to groups past MaxInstances. `degrade_visible` (default) names how many were left out.

_Required_: No

_Type_: String

_Allowed Values_: <code>degrade_visible</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

