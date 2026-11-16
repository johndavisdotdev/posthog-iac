import { CfnOutput, Token } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { PropertyFilter, PropertyFilterType, PropertyOperator } from '../core/filters';
import { Domain, SsoProvider } from '../organizations/domain';
import type { IOrganization } from '../organizations/organization';
import { Project, ProjectOptions } from '../organizations/project';
import { ProxyRecord } from '../organizations/proxy-record';
import { validateLength, validatePattern } from '../private/helpers';
import { SecretApiKey, SecretApiKeyScope } from '../projects/secret-api-key';

/**
 * A PostHog managed reverse proxy for a `PostHogProject`.
 */
export interface PostHogProjectProxyOptions {
  /**
   * The subdomain to proxy PostHog through, e.g. `e.example.com`. Pick a name
   * that doesn't look like analytics (avoid `posthog`, `analytics`,
   * `tracking`), so ad blockers don't block it.
   */
  readonly domainName: string;

  /**
   * Route 53 hosted zone for the subdomain. The CNAME record that points
   * `domainName` at PostHog is created in it.
   */
  readonly hostedZone: route53.IHostedZone;

  /**
   * HTTPS URL that requests to the proxy domain root redirect to. Must be on
   * the same registrable domain as the proxy.
   * @default - no redirect
   */
  readonly rootRedirectUrl?: string;
}

/**
 * An organization domain verified for a `PostHogProject`.
 */
export interface PostHogProjectDomainOptions {
  /** The email domain to claim and verify, e.g. `example.com`. */
  readonly domainName: string;

  /**
   * Route 53 hosted zone for the domain. The `_posthog-challenge` TXT record
   * that verifies it is created in it.
   */
  readonly hostedZone: route53.IHostedZone;

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
}

/**
 * A project secret API key for a `PostHogProject`.
 */
export interface PostHogProjectSecretApiKeyOptions {
  /** API scopes granted to the key. At least one. */
  readonly scopes: SecretApiKeyScope[];

  /**
   * Label that identifies the key in PostHog. 1 to 40 characters.
   * @default 'posthog-cdk server key'
   */
  readonly label?: string;

  /**
   * Secrets Manager secret that receives the key value (`phs_...`).
   * @default - a new secret is created
   */
  readonly secret?: secretsmanager.ISecret;
}

/**
 * Properties for a PostHogProject.
 *
 * Every `ProjectOptions` setting is passed through to the project. The
 * pattern only changes these defaults: exception and web vitals autocapture
 * are on, and new insights exclude internal and test users when there are
 * test account filters.
 */
export interface PostHogProjectProps extends ProjectOptions {
  /** The organization to create the project in. */
  readonly organization: IOrganization;

  /**
   * Your company's email domain, e.g. `example.com`. Adds a test account
   * filter that excludes persons whose email contains `@<domain>`
   * (`email not_icontains @example.com`), after any `testAccountFilters`.
   * @default - no email filter
   */
  readonly internalEmailDomain?: string;

  /**
   * Add a test account filter that excludes events sent from `localhost`
   * and `127.0.0.1` (`$host not_regex ^(localhost|127\.0\.0\.1)($|:)`).
   * @default true
   */
  readonly excludeLocalhost?: boolean;

  /**
   * A PostHog managed reverse proxy, so SDKs send events through your own
   * domain and ad blockers don't drop them. `ingestionHost` then points to
   * it.
   * @default - no proxy; SDKs send events to the project API host
   */
  readonly proxy?: PostHogProjectProxyOptions;

  /**
   * An email domain to claim and verify in the organization, with its TXT
   * record.
   * @default - no domain
   */
  readonly verifiedDomain?: PostHogProjectDomainOptions;

  /**
   * A project secret API key for server-side use (for example local feature
   * flag evaluation). Its value is stored in Secrets Manager and never
   * appears in the template, the outputs or the parameters: only the secret
   * ARN does.
   * @default - no secret API key
   */
  readonly secretApiKey?: PostHogProjectSecretApiKeyOptions;

  /**
   * Add stack outputs for the project ID, the public project API key, the
   * API host, the ingestion host and (with `secretApiKey`) the ARN of the
   * secret that holds the key.
   * @default true
   */
  readonly outputs?: boolean;

  /**
   * Write the same values to SSM String parameters under this prefix:
   * `<prefix>/project-id`, `<prefix>/api-token`, `<prefix>/api-host`,
   * `<prefix>/ingestion-host` and (with `secretApiKey`)
   * `<prefix>/secret-api-key-secret-arn`. Must start with `/` and must not
   * end with `/`, e.g. `/myapp/posthog`.
   * @default - no parameters
   */
  readonly ssmPrefix?: string;
}

/**
 * A production-ready PostHog project: the project with internal and test
 * traffic filtered out, and optionally a managed reverse proxy, a verified
 * organization domain, a secret API key, stack outputs and SSM parameters
 * that applications read their PostHog settings from.
 *
 * The project is retained when it is removed from the stack (deleting it
 * deletes all its data), unless `removalPolicy` says otherwise.
 */
export class PostHogProject extends Construct {
  /** The PostHog project. */
  public readonly project: Project;

  /** The managed reverse proxy, when `proxy` is set. */
  public readonly proxyRecord?: ProxyRecord;

  /** The verified organization domain, when `verifiedDomain` is set. */
  public readonly domain?: Domain;

  /** The project secret API key, when `secretApiKey` is set. */
  public readonly secretApiKey?: SecretApiKey;

  /**
   * The Secrets Manager secret that holds the secret API key value, when
   * `secretApiKey` is set.
   */
  public readonly secretApiKeySecret?: secretsmanager.ISecret;

  /** The PostHog project ID. */
  public readonly projectId: string;

  /** The public project API key (`phc_...`). It is not a secret. */
  public readonly apiToken: string;

  /** The PostHog API host of the project, e.g. `https://us.i.posthog.com`. */
  public readonly apiHost: string;

  /**
   * The host SDKs should send events to (their `api_host`): the proxy URL
   * (`https://<proxy domain>`) when there is a proxy, otherwise `apiHost`.
   */
  public readonly ingestionHost: string;

  /** The SSM parameters, when `ssmPrefix` is set. Empty otherwise. */
  public readonly parameters: ssm.StringParameter[];

  constructor(scope: Construct, id: string, props: PostHogProjectProps) {
    super(scope, id);

    validatePattern('PostHogProject ssmPrefix', props.ssmPrefix, /^\/[a-zA-Z0-9_.\-/]*[a-zA-Z0-9_.-]$/,
      'must start with "/", not end with "/" and use only letters, digits and _.-/');
    validateLength('PostHogProject internalEmailDomain', props.internalEmailDomain, 1, 253);

    const testAccountFilters = [...props.testAccountFilters ?? [], ...defaultTestAccountFilters(props)];

    this.project = new Project(this, 'Project', {
      ...props,
      autocaptureOptOut: props.autocaptureOptOut ?? false,
      autocaptureExceptions: props.autocaptureExceptions ?? true,
      autocaptureWebVitals: props.autocaptureWebVitals ?? true,
      testAccountFilters,
      testAccountFiltersDefaultChecked: props.testAccountFiltersDefaultChecked ?? (testAccountFilters.length > 0 ? true : undefined),
    });

    if (props.proxy) {
      this.proxyRecord = new ProxyRecord(this, 'Proxy', {
        organization: props.organization,
        domainName: props.proxy.domainName,
        hostedZone: props.proxy.hostedZone,
        rootRedirectUrl: props.proxy.rootRedirectUrl,
      });
    }

    if (props.verifiedDomain) {
      this.domain = new Domain(this, 'Domain', {
        organization: props.organization,
        domainName: props.verifiedDomain.domainName,
        hostedZone: props.verifiedDomain.hostedZone,
        jitProvisioning: props.verifiedDomain.jitProvisioning,
        ssoEnforcement: props.verifiedDomain.ssoEnforcement,
      });
    }

    if (props.secretApiKey) {
      this.secretApiKey = this.project.addSecretApiKey('SecretApiKey', {
        label: props.secretApiKey.label ?? 'posthog-cdk server key',
        scopes: props.secretApiKey.scopes,
        secret: props.secretApiKey.secret,
      });
      this.secretApiKeySecret = this.secretApiKey.secret;
    }

    this.projectId = this.project.projectId;
    this.apiToken = this.project.apiToken;
    this.apiHost = this.project.apiHost;
    this.ingestionHost = this.proxyRecord?.apiHost ?? this.project.apiHost;

    // Only ever the secret ARN, never the key value.
    const values: Array<{ id: string; path: string; value: string; description: string }> = [
      { id: 'ProjectId', path: 'project-id', value: this.projectId, description: 'PostHog project ID' },
      { id: 'ApiToken', path: 'api-token', value: this.apiToken, description: 'PostHog public project API key (phc_...)' },
      { id: 'ApiHost', path: 'api-host', value: this.apiHost, description: 'PostHog project API host' },
      { id: 'IngestionHost', path: 'ingestion-host', value: this.ingestionHost, description: 'PostHog SDK api_host (the proxy, if any)' },
    ];
    if (this.secretApiKeySecret) {
      values.push({
        id: 'SecretApiKeySecretArn',
        path: 'secret-api-key-secret-arn',
        value: this.secretApiKeySecret.secretArn,
        description: 'ARN of the Secrets Manager secret holding the PostHog project secret API key',
      });
    }

    if (props.outputs ?? true) {
      for (const v of values) {
        new CfnOutput(this, `${v.id}Output`, { value: v.value, description: v.description });
      }
    }

    this.parameters = [];
    if (props.ssmPrefix !== undefined) {
      for (const v of values) {
        this.parameters.push(new ssm.StringParameter(this, `${v.id}Parameter`, {
          parameterName: `${props.ssmPrefix}/${v.path}`,
          stringValue: v.value,
          description: v.description,
          // The prefix starts with '/', so the name is never a simple name. Saying
          // so lets CDK build the ARN when the prefix is a token.
          simpleName: false,
        }));
      }
    }
  }

  /**
   * Grant read access (`ssm:GetParameter*`) to the SSM parameters. Requires
   * `ssmPrefix`.
   */
  public grantReadParameters(grantee: iam.IGrantable): iam.Grant {
    if (this.parameters.length === 0) {
      throw new Error('PostHogProject has no SSM parameters: set ssmPrefix to use grantReadParameters()');
    }
    return iam.Grant.addToPrincipal({
      grantee,
      actions: ['ssm:DescribeParameters', 'ssm:GetParameters', 'ssm:GetParameter', 'ssm:GetParameterHistory'],
      resourceArns: this.parameters.map(p => p.parameterArn),
    });
  }

  /**
   * Grant read access to the secret holding the secret API key value.
   * Requires `secretApiKey`.
   */
  public grantReadSecretApiKey(grantee: iam.IGrantable): iam.Grant {
    if (!this.secretApiKey) {
      throw new Error('PostHogProject has no secret API key: set secretApiKey to use grantReadSecretApiKey()');
    }
    return this.secretApiKey.grantRead(grantee);
  }
}

function defaultTestAccountFilters(props: PostHogProjectProps): PropertyFilter[] {
  const filters: PropertyFilter[] = [];
  if (props.excludeLocalhost ?? true) {
    filters.push({
      key: '$host',
      value: '^(localhost|127\\.0\\.0\\.1)($|:)',
      operator: PropertyOperator.NOT_REGEX,
      type: PropertyFilterType.EVENT,
    });
  }
  if (props.internalEmailDomain !== undefined) {
    const domain = Token.isUnresolved(props.internalEmailDomain)
      ? props.internalEmailDomain
      : props.internalEmailDomain.replace(/^@/, '');
    filters.push({
      key: 'email',
      value: `@${domain}`,
      operator: PropertyOperator.NOT_ICONTAINS,
      type: PropertyFilterType.PERSON,
    });
  }
  return filters;
}
