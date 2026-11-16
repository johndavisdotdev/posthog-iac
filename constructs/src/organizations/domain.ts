import { Duration, IResolvable, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { CfnDomain } from './domain.generated';
import type { IOrganization } from './organization';
import { validateLength } from '../private/helpers';
import { fqdn } from '../private/organizations';

/**
 * The login method that users on a domain must use (SSO enforcement).
 */
export class SsoProvider {
  /** Google sign-in. */
  public static readonly GOOGLE = new SsoProvider('google-oauth2');
  /** GitHub sign-in. */
  public static readonly GITHUB = new SsoProvider('github');
  /** GitLab sign-in. */
  public static readonly GITLAB = new SsoProvider('gitlab');
  /** SAML, configured with an `IdentityProviderConfig`. */
  public static readonly SAML = new SsoProvider('saml');

  /**
   * A provider PostHog supports that is not listed here, by its PostHog name.
   */
  public static of(name: string): SsoProvider {
    return new SsoProvider(name);
  }

  /** The PostHog provider name. */
  public readonly name: string;

  private constructor(name: string) {
    this.name = name;
  }
}

/**
 * A PostHog organization domain.
 */
export interface IDomain extends IResource {
  /**
   * The PostHog domain ID (a UUID).
   * @attribute
   */
  readonly domainId: string;

  /** The organization that claims the domain. */
  readonly organization: IOrganization;
}

/**
 * Options for claiming a domain in an organization.
 */
export interface DomainOptions {
  /**
   * The email domain to claim, e.g. `example.com`. Changing it replaces the
   * domain, which then needs verifying again.
   */
  readonly domainName: string;

  /**
   * Let users with a verified email address on this domain join the
   * organization automatically when they log in with SSO.
   * @default false
   */
  readonly jitProvisioning?: boolean;

  /**
   * Login method users on this domain must use.
   * @default - no enforcement
   */
  readonly ssoEnforcement?: SsoProvider;

  /**
   * Route 53 hosted zone for the domain. When set, the TXT record PostHog
   * checks to verify the domain (`_posthog-challenge.<domain>`) is created in
   * it. Verification itself is triggered in PostHog once the record has
   * propagated.
   * @default - no record; create it yourself from `verificationChallenge`
   */
  readonly hostedZone?: route53.IHostedZone;

  /**
   * TTL of the verification TXT record.
   * @default Duration.minutes(5)
   */
  readonly verificationRecordTtl?: Duration;

  /**
   * What happens to the PostHog domain when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Domain.
 */
export interface DomainProps extends DomainOptions {
  /** The organization claiming the domain. */
  readonly organization: IOrganization;
}

/**
 * An email domain claimed by a PostHog organization, verified with a DNS TXT
 * record and used for SSO enforcement, SAML and just-in-time provisioning.
 * JIT provisioning and SSO enforcement only take effect once the domain is
 * verified.
 *
 * @resource PostHog::Organizations::Domain
 */
export class Domain extends Resource implements IDomain {
  /**
   * Import an existing domain by its PostHog ID.
   */
  public static fromDomainId(scope: Construct, id: string, organization: IOrganization, domainId: string): IDomain {
    class Import extends Resource implements IDomain {
      public readonly domainId = domainId;
      public readonly organization = organization;
    }
    return new Import(scope, id);
  }

  public readonly domainId: string;
  public readonly organization: IOrganization;

  /** The claimed email domain. */
  public readonly domainName: string;

  /**
   * The value PostHog expects in the `_posthog-challenge.<domain>` TXT record.
   * @attribute
   */
  public readonly verificationChallenge: string;

  /**
   * Whether the domain was verified (at the last create, update or read).
   * @attribute
   */
  public readonly domainIsVerified: IResolvable;

  /**
   * SCIM base URL for the domain, when SCIM is configured.
   * @attribute
   */
  public readonly scimBaseUrl: string;

  /**
   * The verification TXT record, when `hostedZone` is set.
   */
  public readonly verificationRecord?: route53.TxtRecord;

  /** The underlying L1 resource. */
  public readonly resource: CfnDomain;

  constructor(scope: Construct, id: string, props: DomainProps) {
    super(scope, id);
    validateLength('Domain domainName', props.domainName, 1, 128);
    validateLength('Domain ssoEnforcement', props.ssoEnforcement?.name, 1, 28);

    this.organization = props.organization;
    this.domainName = props.domainName;

    this.resource = new CfnDomain(this, 'Resource', {
      organizationId: props.organization.organizationId,
      domain: props.domainName,
      jitProvisioningEnabled: props.jitProvisioning,
      ssoEnforcement: props.ssoEnforcement?.name,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.domainId = this.resource.attrId;
    this.verificationChallenge = this.resource.attrVerificationChallenge;
    this.domainIsVerified = this.resource.attrIsVerified;
    this.scimBaseUrl = this.resource.attrScimBaseUrl;

    if (props.hostedZone) {
      this.verificationRecord = new route53.TxtRecord(this, 'VerificationRecord', {
        zone: props.hostedZone,
        recordName: fqdn(`_posthog-challenge.${props.domainName}`),
        values: [this.verificationChallenge],
        ttl: props.verificationRecordTtl ?? Duration.minutes(5),
        comment: 'PostHog domain verification',
      });
    }
  }
}
