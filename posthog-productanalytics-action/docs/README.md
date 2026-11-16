# PostHog::ProductAnalytics::Action

A PostHog action: a named, reusable definition of one or more events (by event name, element selector, text, href or URL) used in insights, cohorts and alerts.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::ProductAnalytics::Action",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#posttoslack" title="PostToSlack">PostToSlack</a>" : <i>Boolean</i>,
        "<a href="#slackmessageformat" title="SlackMessageFormat">SlackMessageFormat</a>" : <i>String</i>,
        "<a href="#steps" title="Steps">Steps</a>" : <i>[ <a href="step.md">Step</a>, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::ProductAnalytics::Action
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#posttoslack" title="PostToSlack">PostToSlack</a>: <i>Boolean</i>
    <a href="#slackmessageformat" title="SlackMessageFormat">SlackMessageFormat</a>: <i>String</i>
    <a href="#steps" title="Steps">Steps</a>: <i>
      - <a href="step.md">Step</a></i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the action belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the action. Must be unique within the project.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Human-readable description of what the action represents.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags on the action.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### PostToSlack

Whether to post a message to the project's Slack/webhook integration when the action is triggered.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SlackMessageFormat

Custom message format for Slack/webhook notifications.

_Required_: No

_Type_: String

_Maximum Length_: <code>1200</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Steps

Match conditions. The action matches an event that satisfies any one step.

_Required_: No

_Type_: List of <a href="step.md">Step</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog action ID.

#### CreatedAt

ISO 8601 creation timestamp.

