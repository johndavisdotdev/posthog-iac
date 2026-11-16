# PostHog::CDP::HogFunction

A PostHog hog function (CDP): a destination, transformation, site app or webhook source that runs Hog code on events, configured with inputs and event filters.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::CDP::HogFunction",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#type" title="Type">Type</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
        "<a href="#templateid" title="TemplateId">TemplateId</a>" : <i>String</i>,
        "<a href="#hog" title="Hog">Hog</a>" : <i>String</i>,
        "<a href="#inputsschema" title="InputsSchema">InputsSchema</a>" : <i>String</i>,
        "<a href="#inputs" title="Inputs">Inputs</a>" : <i>String</i>,
        "<a href="#secretinputs" title="SecretInputs">SecretInputs</a>" : <i>String</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#mappings" title="Mappings">Mappings</a>" : <i>String</i>,
        "<a href="#masking" title="Masking">Masking</a>" : <i><a href="masking.md">Masking</a></i>,
        "<a href="#iconurl" title="IconUrl">IconUrl</a>" : <i>String</i>,
        "<a href="#executionorder" title="ExecutionOrder">ExecutionOrder</a>" : <i>Integer</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::CDP::HogFunction
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#type" title="Type">Type</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
    <a href="#templateid" title="TemplateId">TemplateId</a>: <i>String</i>
    <a href="#hog" title="Hog">Hog</a>: <i>String</i>
    <a href="#inputsschema" title="InputsSchema">InputsSchema</a>: <i>String</i>
    <a href="#inputs" title="Inputs">Inputs</a>: <i>String</i>
    <a href="#secretinputs" title="SecretInputs">SecretInputs</a>: <i>String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#mappings" title="Mappings">Mappings</a>: <i>String</i>
    <a href="#masking" title="Masking">Masking</a>: <i><a href="masking.md">Masking</a></i>
    <a href="#iconurl" title="IconUrl">IconUrl</a>: <i>String</i>
    <a href="#executionorder" title="ExecutionOrder">ExecutionOrder</a>: <i>Integer</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the function belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Type

Function type. Cannot be changed after creation.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>destination</code> | <code>site_destination</code> | <code>internal_destination</code> | <code>source_webhook</code> | <code>warehouse_source_webhook</code> | <code>site_app</code> | <code>transformation</code> | <code>transformation_log</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Display name for the function.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description of what this function does.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the function is active and processing events.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TemplateId

ID of the template to create this function from, e.g. template-slack or template-webhook. PostHog copies the template's code, inputs schema and defaults. Can only be set on create.

_Required_: No

_Type_: String

_Maximum Length_: <code>400</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Hog

Source code: Hog for most types, TypeScript for site_destination and site_app. When TemplateId is set and Hog is omitted, the template's code is used.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### InputsSchema

Schema of the function's configurable inputs as a JSON array (use Fn::ToJsonString): [{"key", "type", "label"?, "required"?, "secret"?, "default"?, ...}]. When TemplateId is set and this is omitted, the template's schema is used.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Inputs

Values of the non-secret inputs as a JSON object keyed by input key (use Fn::ToJsonString), e.g. {"url": {"value": "https://example.com/hook"}}. Wrap each value in {"value": ...}. Inputs that the schema marks secret go in SecretInputs instead.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SecretInputs

Values of the secret inputs (API tokens, passwords), as a JSON object in the same shape as Inputs (use Fn::ToJsonString with a dynamic reference, e.g. {"api_key": {"value": "{{resolve:secretsmanager:...}}"}}). Each key must be marked "secret": true in the inputs schema. Write-only: never returned by Read.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Filters

Event filters that control which events trigger the function, as a JSON object (use Fn::ToJsonString): {"events": [...], "actions": [...], "properties": [...], "filter_test_accounts": bool, "source": "events"}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Mappings

Event-to-destination mappings as a JSON array (use Fn::ToJsonString): [{"name", "filters", "inputs", "inputs_schema"}]. Only for destination and site_destination types.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Masking

_Required_: No

_Type_: <a href="masking.md">Masking</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IconUrl

URL of the icon displayed in the PostHog UI.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ExecutionOrder

Execution priority for transformations. Lower values run first.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The hog function ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last change.

