# PostHog::Organizations::Domain

A PostHog organization domain: an email domain the organization claims (verified with a DNS TXT record), used for SSO enforcement, SAML and just-in-time provisioning.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Organizations::Domain",
    "Properties" : {
        "<a href="#organizationid" title="OrganizationId">OrganizationId</a>" : <i>String</i>,
        "<a href="#domain" title="Domain">Domain</a>" : <i>String</i>,
        "<a href="#jitprovisioningenabled" title="JitProvisioningEnabled">JitProvisioningEnabled</a>" : <i>Boolean</i>,
        "<a href="#ssoenforcement" title="SsoEnforcement">SsoEnforcement</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Organizations::Domain
Properties:
    <a href="#organizationid" title="OrganizationId">OrganizationId</a>: <i>String</i>
    <a href="#domain" title="Domain">Domain</a>: <i>String</i>
    <a href="#jitprovisioningenabled" title="JitProvisioningEnabled">JitProvisioningEnabled</a>: <i>Boolean</i>
    <a href="#ssoenforcement" title="SsoEnforcement">SsoEnforcement</a>: <i>String</i>
</pre>

## Properties

#### OrganizationId

ID (UUID) of the PostHog organization that claims the domain.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Domain

The email domain, e.g. example.com. Changing it replaces the resource (and requires verifying the new domain).

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>128</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### JitProvisioningEnabled

Whether users with an email address on this (verified) domain can join the organization automatically when they log in with SSO.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SsoEnforcement

SSO provider that users on this domain must log in with, e.g. google-oauth2, github, gitlab or saml. Empty means no enforcement.

_Required_: No

_Type_: String

_Maximum Length_: <code>28</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog organization domain ID (UUID).

#### IsVerified

Whether the domain has been verified.

#### VerifiedAt

ISO 8601 timestamp of when the domain was verified.

#### VerificationChallenge

Value of the DNS TXT record (on _posthog-challenge.<domain>) that proves ownership of the domain.

#### ScimBaseUrl

SCIM base URL for this domain, when SCIM is configured.

