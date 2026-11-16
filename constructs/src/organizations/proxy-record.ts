import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import type { IOrganization } from './organization';
import { CfnProxyRecord } from './proxy-record.generated';
import { validateLength } from '../private/helpers';
import { fqdn, validateHttpsUrl } from '../private/organizations';

/**
 * A PostHog managed reverse proxy.
 */
export interface IProxyRecord extends IResource {
  /**
   * The PostHog proxy record ID (a UUID).
   * @attribute
   */
  readonly proxyRecordId: string;

  /** The organization that owns the proxy. */
  readonly organization: IOrganization;
}

/**
 * Options for creating a managed reverse proxy in an organization.
 */
export interface ProxyRecordOptions {
  /**
   * The subdomain to proxy PostHog through, e.g. `e.example.com`. Must be a
   * subdomain you control. Changing it replaces the proxy.
   */
  readonly domainName: string;

  /**
   * HTTPS URL that requests to the proxy domain root redirect to. Must be on
   * the same registrable domain as the proxy.
   * @default - no redirect
   */
  readonly rootRedirectUrl?: string;

  /**
   * Route 53 hosted zone for the subdomain. When set, the CNAME record from
   * `domainName` to `targetCname` is created in it.
   * @default - no record; create it yourself from `targetCname`
   */
  readonly hostedZone?: route53.IHostedZone;

  /**
   * TTL of the CNAME record.
   * @default Duration.minutes(5)
   */
  readonly recordTtl?: Duration;

  /**
   * What happens to the PostHog proxy when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a ProxyRecord.
 */
export interface ProxyRecordProps extends ProxyRecordOptions {
  /** The organization that owns the proxy. */
  readonly organization: IOrganization;
}

/**
 * A PostHog managed reverse proxy: a subdomain you own through which SDKs
 * send data to PostHog. After the CNAME record exists, PostHog verifies it
 * and issues a certificate; `status` moves from `waiting` through `issuing`
 * to `valid`. The resource does not wait for that.
 *
 * @resource PostHog::Organizations::ProxyRecord
 */
export class ProxyRecord extends Resource implements IProxyRecord {
  /**
   * Import an existing proxy record by its PostHog ID.
   */
  public static fromProxyRecordId(scope: Construct, id: string, organization: IOrganization, proxyRecordId: string): IProxyRecord {
    class Import extends Resource implements IProxyRecord {
      public readonly proxyRecordId = proxyRecordId;
      public readonly organization = organization;
    }
    return new Import(scope, id);
  }

  public readonly proxyRecordId: string;
  public readonly organization: IOrganization;

  /** The proxied subdomain. */
  public readonly domainName: string;

  /**
   * The host name the subdomain's CNAME record must point to.
   * @attribute
   */
  public readonly targetCname: string;

  /**
   * Provisioning status at the last create, update or read: `waiting`,
   * `issuing`, `valid`, `warning`, `erroring`, `deleting` or `timed_out`.
   * @attribute
   */
  public readonly status: string;

  /**
   * Status details from PostHog, if any.
   * @attribute
   */
  public readonly statusMessage: string;

  /**
   * The URL to use as the SDKs' `api_host` once the proxy is valid
   * (`https://<domainName>`).
   */
  public readonly apiHost: string;

  /**
   * The CNAME record, when `hostedZone` is set.
   */
  public readonly cnameRecord?: route53.CnameRecord;

  /** The underlying L1 resource. */
  public readonly resource: CfnProxyRecord;

  constructor(scope: Construct, id: string, props: ProxyRecordProps) {
    super(scope, id);
    validateLength('ProxyRecord domainName', props.domainName, 1, 253);
    validateLength('ProxyRecord rootRedirectUrl', props.rootRedirectUrl, 1, 1024);
    validateHttpsUrl('ProxyRecord rootRedirectUrl', props.rootRedirectUrl);

    this.organization = props.organization;
    this.domainName = props.domainName;

    this.resource = new CfnProxyRecord(this, 'Resource', {
      organizationId: props.organization.organizationId,
      domain: props.domainName,
      rootRedirectUrl: props.rootRedirectUrl,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.proxyRecordId = this.resource.attrId;
    this.targetCname = this.resource.attrTargetCname;
    this.status = this.resource.attrStatus;
    this.statusMessage = this.resource.attrMessage;
    this.apiHost = `https://${props.domainName}`;

    if (props.hostedZone) {
      this.cnameRecord = new route53.CnameRecord(this, 'CnameRecord', {
        zone: props.hostedZone,
        recordName: fqdn(props.domainName),
        domainName: this.targetCname,
        ttl: props.recordTtl ?? Duration.minutes(5),
        comment: 'PostHog managed reverse proxy',
      });
    }
  }
}
