# PostHog::Workflows::MessageTemplate

A PostHog messaging template: reusable email content (subject, body, sender) that workflow email steps and the transactional email API send.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Workflows::MessageTemplate",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#type" title="Type">Type</a>" : <i>String</i>,
        "<a href="#content" title="Content">Content</a>" : <i>String</i>,
        "<a href="#messagecategory" title="MessageCategory">MessageCategory</a>" : <i>String</i>,
        "<a href="#sensitive" title="Sensitive">Sensitive</a>" : <i>Boolean</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Workflows::MessageTemplate
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#type" title="Type">Type</a>: <i>String</i>
    <a href="#content" title="Content">Content</a>: <i>String</i>
    <a href="#messagecategory" title="MessageCategory">MessageCategory</a>: <i>String</i>
    <a href="#sensitive" title="Sensitive">Sensitive</a>: <i>Boolean</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the message template belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Human-readable template name shown in the template library.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

What the template is for and when to use it.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags for organizing templates, for example by team or use case. Tags are shared with the rest of the project.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Type

Message channel of the template. Currently only `email` (the PostHog default).

_Required_: No

_Type_: String

_Maximum Length_: <code>24</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Content

Template content keyed by channel, as a JSON object (use Fn::ToJsonString), e.g. {"templating": "liquid", "email": {"subject": "Welcome {{ person.properties.name }}", "text": "...", "html": "<p>...</p>", "preheader": "..."}}. `email.design` holds the visual editor's design JSON. Replaced as a whole on update.

_Required_: Yes

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### MessageCategory

ID of the message category (PostHog::Workflows::MessageCategory) to file the template under. Must belong to the same project.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Sensitive

For emails that carry login codes, reset links or other secrets: PostHog keeps no copy of each sent email's body or filled-in subject, and clicked links keep only the site address.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The message template ID (UUID).

#### TransactionalHogFlowId

ID of the workflow that sends this template over the transactional email API, once the template has been made transactional.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last change.

