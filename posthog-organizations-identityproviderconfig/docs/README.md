# PostHog::Organizations::IdentityProviderConfig

A PostHog identity provider configuration: SAML, OIDC, SCIM or ID-JAG (XAA) settings for an organization, applied to all or selected organization domains.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Organizations::IdentityProviderConfig",
    "Properties" : {
        "<a href="#organizationid" title="OrganizationId">OrganizationId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#domainscope" title="DomainScope">DomainScope</a>" : <i>String</i>,
        "<a href="#configscope" title="ConfigScope">ConfigScope</a>" : <i>String</i>,
        "<a href="#organizationdomainids" title="OrganizationDomainIds">OrganizationDomainIds</a>" : <i>[ String, ... ]</i>,
        "<a href="#oidcissuerurl" title="OidcIssuerUrl">OidcIssuerUrl</a>" : <i>String</i>,
        "<a href="#oidcclientid" title="OidcClientId">OidcClientId</a>" : <i>String</i>,
        "<a href="#oidcclientsecret" title="OidcClientSecret">OidcClientSecret</a>" : <i>String</i>,
        "<a href="#samlentityid" title="SamlEntityId">SamlEntityId</a>" : <i>String</i>,
        "<a href="#samlacsurl" title="SamlAcsUrl">SamlAcsUrl</a>" : <i>String</i>,
        "<a href="#samlx509cert" title="SamlX509Cert">SamlX509Cert</a>" : <i>String</i>,
        "<a href="#scimenabled" title="ScimEnabled">ScimEnabled</a>" : <i>Boolean</i>,
        "<a href="#scimbearertokensecretarn" title="ScimBearerTokenSecretArn">ScimBearerTokenSecretArn</a>" : <i>String</i>,
        "<a href="#idjagissuerurl" title="IdJagIssuerUrl">IdJagIssuerUrl</a>" : <i>String</i>,
        "<a href="#idjagjwksurl" title="IdJagJwksUrl">IdJagJwksUrl</a>" : <i>String</i>,
        "<a href="#idjagallowedclients" title="IdJagAllowedClients">IdJagAllowedClients</a>" : <i>[ String, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Organizations::IdentityProviderConfig
Properties:
    <a href="#organizationid" title="OrganizationId">OrganizationId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#domainscope" title="DomainScope">DomainScope</a>: <i>String</i>
    <a href="#configscope" title="ConfigScope">ConfigScope</a>: <i>String</i>
    <a href="#organizationdomainids" title="OrganizationDomainIds">OrganizationDomainIds</a>: <i>
      - String</i>
    <a href="#oidcissuerurl" title="OidcIssuerUrl">OidcIssuerUrl</a>: <i>String</i>
    <a href="#oidcclientid" title="OidcClientId">OidcClientId</a>: <i>String</i>
    <a href="#oidcclientsecret" title="OidcClientSecret">OidcClientSecret</a>: <i>String</i>
    <a href="#samlentityid" title="SamlEntityId">SamlEntityId</a>: <i>String</i>
    <a href="#samlacsurl" title="SamlAcsUrl">SamlAcsUrl</a>: <i>String</i>
    <a href="#samlx509cert" title="SamlX509Cert">SamlX509Cert</a>: <i>String</i>
    <a href="#scimenabled" title="ScimEnabled">ScimEnabled</a>: <i>Boolean</i>
    <a href="#scimbearertokensecretarn" title="ScimBearerTokenSecretArn">ScimBearerTokenSecretArn</a>: <i>String</i>
    <a href="#idjagissuerurl" title="IdJagIssuerUrl">IdJagIssuerUrl</a>: <i>String</i>
    <a href="#idjagjwksurl" title="IdJagJwksUrl">IdJagJwksUrl</a>: <i>String</i>
    <a href="#idjagallowedclients" title="IdJagAllowedClients">IdJagAllowedClients</a>: <i>
      - String</i>
</pre>

## Properties

#### OrganizationId

ID (UUID) of the PostHog organization the configuration belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Display name for this configuration, e.g. Okta production.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DomainScope

Domains this configuration applies to: all organization domains, or the domains in OrganizationDomainIds (selected). Unset behaves like selected.

_Required_: No

_Type_: String

_Allowed Values_: <code>all</code> | <code>selected</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ConfigScope

Feature configured by this configuration: saml, oidc, scim or xaa.

_Required_: No

_Type_: String

_Allowed Values_: <code>saml</code> | <code>oidc</code> | <code>scim</code> | <code>xaa</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OrganizationDomainIds

IDs of the organization domains (PostHog::Organizations::Domain Id) this configuration applies to.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OidcIssuerUrl

OIDC HTTPS issuer URL. Must exactly match the issuer in the OIDC discovery document.

_Required_: No

_Type_: String

_Maximum Length_: <code>512</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OidcClientId

Client ID of the organization's OIDC application.

_Required_: No

_Type_: String

_Maximum Length_: <code>512</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OidcClientSecret

OIDC client secret. Write-only: never returned. Removing it from the template removes the saved secret. Pass it with a dynamic reference such as {{resolve:secretsmanager:...}}.

_Required_: No

_Type_: String

_Maximum Length_: <code>4096</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SamlEntityId

SAML IdP entity ID (issuer).

_Required_: No

_Type_: String

_Maximum Length_: <code>512</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SamlAcsUrl

SAML single sign-on URL the IdP redirects to.

_Required_: No

_Type_: String

_Maximum Length_: <code>512</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SamlX509Cert

SAML IdP X.509 signing certificate (PEM). Write-only: never read back.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScimEnabled

Whether SCIM provisioning is enabled. Enabling it generates a bearer token, which is written to ScimBearerTokenSecretArn; disabling it clears the token.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScimBearerTokenSecretArn

ARN (or name) of an existing AWS Secrets Manager secret. When SCIM is enabled, PostHog returns the SCIM bearer token once and the handler writes it to this secret as a new version. Required when ScimEnabled is true.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IdJagIssuerUrl

Trusted IdP issuer URL for ID-JAG (XAA). Required to enable ID-JAG.

_Required_: No

_Type_: String

_Maximum Length_: <code>512</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IdJagJwksUrl

Override JWKS URL for ID-JAG. Defaults to OIDC discovery on the issuer URL.

_Required_: No

_Type_: String

_Maximum Length_: <code>512</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IdJagAllowedClients

Allowed ID-JAG client IDs. Empty allows any client ID.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog identity provider configuration ID (UUID).

#### SamlRelayState

Stable UUID sent as SAML RelayState to route authentication responses to this configuration.

#### ScimBaseUrl

SCIM base URL for this configuration.

#### HasSaml

Whether SAML is fully configured.

#### HasOidc

Whether OIDC has an issuer, client ID and client secret.

#### HasOidcClientSecret

Whether an OIDC client secret is saved.

#### HasScim

Whether SCIM is enabled and a bearer token is set.

#### HasIdJag

Whether ID-JAG (XAA) is configured.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last update.

