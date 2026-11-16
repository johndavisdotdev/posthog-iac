# PostHog::Projects::SecretApiKey

A PostHog project secret API key (phs_...): a project-scoped key with a fixed set of API scopes, for server-side use. PostHog returns the key value only when the key is created; the handler writes it to an AWS Secrets Manager secret you provide and never puts it in the resource model.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Projects::SecretApiKey",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#label" title="Label">Label</a>" : <i>String</i>,
        "<a href="#scopes" title="Scopes">Scopes</a>" : <i>[ String, ... ]</i>,
        "<a href="#secretsmanagersecretarn" title="SecretsManagerSecretArn">SecretsManagerSecretArn</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Projects::SecretApiKey
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#label" title="Label">Label</a>: <i>String</i>
    <a href="#scopes" title="Scopes">Scopes</a>: <i>
      - String</i>
    <a href="#secretsmanagersecretarn" title="SecretsManagerSecretArn">SecretsManagerSecretArn</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the secret API key belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Label

Label that identifies the key in PostHog.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>40</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Scopes

Project-wide API scopes granted to the key, e.g. feature_flag:read or query:read. Project secret API keys do not honor object-level access controls, so a scope can access every resource of that type in the project.

_Required_: Yes

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SecretsManagerSecretArn

ARN of an existing AWS Secrets Manager secret. On create the handler writes the key value (phs_...) to it as the secret string, because PostHog returns the value only once. The resource type execution role needs secretsmanager:PutSecretValue on the secret (and kms:GenerateDataKey/kms:Encrypt when it uses a customer managed KMS key). Changing it replaces the key.

_Required_: Yes

_Type_: String

_Pattern_: <code>^arn:aws[a-z-]*:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:.+$</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog ID of the secret API key.

#### MaskValue

Masked form of the key value as shown in PostHog, e.g. phs_...abcd.

#### CreatedAt

ISO 8601 creation timestamp.

