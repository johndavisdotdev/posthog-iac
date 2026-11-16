# PostHog::LLMAnalytics::Evaluation ModelConfiguration

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#provider" title="Provider">Provider</a>" : <i>String</i>,
    "<a href="#model" title="Model">Model</a>" : <i>String</i>,
    "<a href="#providerkeyid" title="ProviderKeyId">ProviderKeyId</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#provider" title="Provider">Provider</a>: <i>String</i>
<a href="#model" title="Model">Model</a>: <i>String</i>
<a href="#providerkeyid" title="ProviderKeyId">ProviderKeyId</a>: <i>String</i>
</pre>

## Properties

#### Provider

LLM provider of the judge model.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>openai</code> | <code>anthropic</code> | <code>gemini</code> | <code>openrouter</code> | <code>fireworks</code> | <code>azure_openai</code> | <code>together_ai</code> | <code>minimax</code> | <code>system_one</code> | <code>openai_compatible</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Model

Model ID, e.g. gpt-4.1-mini.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>100</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ProviderKeyId

Optional ID of a project provider key (PostHog::LLMAnalytics::ProviderKey) to run the evaluation with. It must use the same provider.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

