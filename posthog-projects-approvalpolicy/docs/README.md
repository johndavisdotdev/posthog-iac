# PostHog::Projects::ApprovalPolicy

A PostHog approval policy: requires changes of one kind (the action key, e.g. changes to feature flags) in a project to be approved by designated approvers before they are applied.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Projects::ApprovalPolicy",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#actionkey" title="ActionKey">ActionKey</a>" : <i>String</i>,
        "<a href="#conditions" title="Conditions">Conditions</a>" : <i>String</i>,
        "<a href="#approverconfig" title="ApproverConfig">ApproverConfig</a>" : <i>String</i>,
        "<a href="#allowselfapprove" title="AllowSelfApprove">AllowSelfApprove</a>" : <i>Boolean</i>,
        "<a href="#bypassorgmembershiplevels" title="BypassOrgMembershipLevels">BypassOrgMembershipLevels</a>" : <i>String</i>,
        "<a href="#bypassroles" title="BypassRoles">BypassRoles</a>" : <i>[ String, ... ]</i>,
        "<a href="#expiresafter" title="ExpiresAfter">ExpiresAfter</a>" : <i>String</i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Projects::ApprovalPolicy
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#actionkey" title="ActionKey">ActionKey</a>: <i>String</i>
    <a href="#conditions" title="Conditions">Conditions</a>: <i>String</i>
    <a href="#approverconfig" title="ApproverConfig">ApproverConfig</a>: <i>String</i>
    <a href="#allowselfapprove" title="AllowSelfApprove">AllowSelfApprove</a>: <i>Boolean</i>
    <a href="#bypassorgmembershiplevels" title="BypassOrgMembershipLevels">BypassOrgMembershipLevels</a>: <i>String</i>
    <a href="#bypassroles" title="BypassRoles">BypassRoles</a>: <i>
      - String</i>
    <a href="#expiresafter" title="ExpiresAfter">ExpiresAfter</a>: <i>String</i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the approval policy belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### ActionKey

Key of the gated action, e.g. feature_flag.update.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>128</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Conditions

JSON object (use Fn::ToJsonString) restricting which changes of the action need approval. Leave unset to gate every change.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ApproverConfig

JSON object (use Fn::ToJsonString) describing who can approve and how many approvals are needed, e.g. {"users": [1, 2], "roles": [], "quorum": 1}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AllowSelfApprove

Whether the requester of a change may approve it. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BypassOrgMembershipLevels

JSON array (use Fn::ToJsonString) of organization membership levels whose members can apply the change without approval.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BypassRoles

IDs (UUIDs) of roles whose members can apply the change without approval.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ExpiresAfter

Auto-expire pending change requests after this duration, as a Django duration string such as "7 00:00:00" (7 days) or "12:00:00" (12 hours), or ISO 8601 such as P7D. Leave unset for the PostHog default.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the policy is enforced. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog approval policy ID (UUID).

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last change.

