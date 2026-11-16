# PostHog::ErrorTracking::GroupingRule Assignee

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#type" title="Type">Type</a>" : <i>String</i>,
    "<a href="#id" title="Id">Id</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#type" title="Type">Type</a>: <i>String</i>
<a href="#id" title="Id">Id</a>: <i>String</i>
</pre>

## Properties

#### Type

Assignee type. `user` for a user ID or `role` for a role UUID.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>user</code> | <code>role</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Id

User ID when Type is `user`, or role UUID when Type is `role`.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

