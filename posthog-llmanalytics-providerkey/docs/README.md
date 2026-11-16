# PostHog::LLMAnalytics::ProviderKey

A PostHog LLM analytics provider key: an LLM provider API key (OpenAI, Anthropic, Gemini, ...) that PostHog uses to run LLM-judge evaluations and other LLM analytics features in a project. The key itself is write-only; PostHog only returns a masked form.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::LLMAnalytics::ProviderKey",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#provider" title="Provider">Provider</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#apikey" title="ApiKey">ApiKey</a>" : <i>String</i>,
        "<a href="#baseurl" title="BaseUrl">BaseUrl</a>" : <i>String</i>,
        "<a href="#systemonemodel" title="SystemOneModel">SystemOneModel</a>" : <i>String</i>,
        "<a href="#azureendpoint" title="AzureEndpoint">AzureEndpoint</a>" : <i>String</i>,
        "<a href="#apiversion" title="ApiVersion">ApiVersion</a>" : <i>String</i>,
        "<a href="#setasactive" title="SetAsActive">SetAsActive</a>" : <i>Boolean</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::LLMAnalytics::ProviderKey
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#provider" title="Provider">Provider</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#apikey" title="ApiKey">ApiKey</a>: <i>String</i>
    <a href="#baseurl" title="BaseUrl">BaseUrl</a>: <i>String</i>
    <a href="#systemonemodel" title="SystemOneModel">SystemOneModel</a>: <i>String</i>
    <a href="#azureendpoint" title="AzureEndpoint">AzureEndpoint</a>: <i>String</i>
    <a href="#apiversion" title="ApiVersion">ApiVersion</a>: <i>String</i>
    <a href="#setasactive" title="SetAsActive">SetAsActive</a>: <i>Boolean</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the provider key belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Provider

LLM provider the key is for. Changing it replaces the key.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>openai</code> | <code>anthropic</code> | <code>gemini</code> | <code>openrouter</code> | <code>fireworks</code> | <code>azure_openai</code> | <code>together_ai</code> | <code>minimax</code> | <code>system_one</code> | <code>openai_compatible</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Display name of the key.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ApiKey

The provider API key. Write-only: PostHog never returns it (see ApiKeyMasked). Pass it with a dynamic reference such as {{resolve:secretsmanager:openai-api-key}}; never put it in plain text.

_Required_: No

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BaseUrl

Public HTTPS base URL of an OpenAI-compatible or System One API. For System One, end before /systemone.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SystemOneModel

Model ID served by the System One endpoint.

_Required_: No

_Type_: String

_Maximum Length_: <code>100</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AzureEndpoint

Azure OpenAI endpoint URL. For an Anthropic key served by Microsoft Foundry, the endpoint of the Foundry resource, e.g. https://my-resource.services.ai.azure.com/. Omit it for a key from the Anthropic API.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ApiVersion

Azure OpenAI API version.

_Required_: No

_Type_: String

_Maximum Length_: <code>20</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SetAsActive

Make this the project's active key for its provider when it is created or updated. Write-only.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog provider key ID (UUID).

#### ApiKeyMasked

Masked form of the API key, as shown in PostHog.

#### State

Validation state of the key: `unknown`, `ok`, `invalid` or `error`.

#### ErrorMessage

Error reported by the provider when the key last failed validation.

#### CreatedAt

ISO 8601 creation timestamp.

#### LastUsedAt

ISO 8601 timestamp of when PostHog last used the key.

