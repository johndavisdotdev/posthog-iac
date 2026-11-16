# PostHog::Organizations::RoleMembership

Assigns an organization member to a PostHog role. Memberships cannot be changed in place: changing any property replaces the membership.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Organizations::RoleMembership",
    "Properties" : {
        "<a href="#organizationid" title="OrganizationId">OrganizationId</a>" : <i>String</i>,
        "<a href="#roleid" title="RoleId">RoleId</a>" : <i>String</i>,
        "<a href="#useruuid" title="UserUuid">UserUuid</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Organizations::RoleMembership
Properties:
    <a href="#organizationid" title="OrganizationId">OrganizationId</a>: <i>String</i>
    <a href="#roleid" title="RoleId">RoleId</a>: <i>String</i>
    <a href="#useruuid" title="UserUuid">UserUuid</a>: <i>String</i>
</pre>

## Properties

#### OrganizationId

ID (UUID) of the PostHog organization the role belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### RoleId

ID (UUID) of the role to add the member to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### UserUuid

UUID of the user to add to the role. The user must be a member of the organization.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog role membership ID (UUID).

#### JoinedAt

ISO 8601 timestamp of when the user was added to the role.

#### UpdatedAt

ISO 8601 timestamp of the last update.

