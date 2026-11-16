# PostHog::Organizations::ProxyRecord

A PostHog managed reverse proxy: a custom subdomain you own that proxies PostHog ingestion. After creation, add a CNAME record from Domain to TargetCname; PostHog then verifies the record and provisions the proxy.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Organizations::ProxyRecord",
    "Properties" : {
        "<a href="#organizationid" title="OrganizationId">OrganizationId</a>" : <i>String</i>,
        "<a href="#domain" title="Domain">Domain</a>" : <i>String</i>,
        "<a href="#rootredirecturl" title="RootRedirectUrl">RootRedirectUrl</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Organizations::ProxyRecord
Properties:
    <a href="#organizationid" title="OrganizationId">OrganizationId</a>: <i>String</i>
    <a href="#domain" title="Domain">Domain</a>: <i>String</i>
    <a href="#rootredirecturl" title="RootRedirectUrl">RootRedirectUrl</a>: <i>String</i>
</pre>

## Properties

#### OrganizationId

ID (UUID) of the PostHog organization that owns the proxy.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Domain

The custom domain to proxy through, e.g. e.example.com. Must be a subdomain you control.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### RootRedirectUrl

HTTPS URL that requests to the proxy domain root redirect to. Must use the same registrable domain as the proxy. Omit to disable the redirect.

_Required_: No

_Type_: String

_Maximum Length_: <code>1024</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog proxy record ID (UUID).

#### TargetCname

The CNAME target. Create a DNS CNAME record from Domain to this value.

#### Status

Current provisioning status: waiting (DNS verification pending), issuing (SSL certificate being issued), valid (proxy is live), warning (operational with issues), erroring, deleting or timed_out.

#### Message

Human-readable status message with details about errors or warnings, if any.

#### RootRedirectSupported

Whether this proxy supports a redirect from its root URL.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last update.

