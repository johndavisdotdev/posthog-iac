import { IResource, RemovalPolicy, Resource, SecretValue } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import type { IDomain } from './domain';
import {
  CfnIdentityProviderConfig,
  CfnIdentityProviderConfigPropsConfigScope,
  CfnIdentityProviderConfigPropsDomainScope,
} from './identity-provider-config.generated';
import type { IOrganization } from './organization';
import { exactlyOne, secretOrNew, secretProp, uniqueOrUndefined, validateLength } from '../private/helpers';
import { validateHttpsUrl } from '../private/organizations';

/**
 * SAML single sign-on settings.
 */
export interface SamlOptions {
  /** The identity provider's entity ID (issuer). */
  readonly entityId: string;

  /** The identity provider's single sign-on URL. */
  readonly acsUrl: string;

  /**
   * The identity provider's X.509 signing certificate (PEM). Use a
   * `SecretValue` from Secrets Manager or SSM so the certificate is passed as
   * a dynamic reference. Write-only: PostHog never returns it.
   */
  readonly x509Cert: SecretValue;
}

/**
 * OpenID Connect single sign-on settings.
 */
export interface OidcOptions {
  /**
   * The HTTPS issuer URL. Must exactly match the issuer in the OIDC discovery
   * document.
   */
  readonly issuerUrl: string;

  /** Client ID of the organization's OIDC application. */
  readonly clientId: string;

  /**
   * Client secret of the OIDC application. Use a `SecretValue` from Secrets
   * Manager or SSM so it is passed as a dynamic reference. Write-only:
   * PostHog never returns it.
   * @default - no client secret
   */
  readonly clientSecret?: SecretValue;
}

/**
 * ID-JAG (cross-app access, XAA) settings.
 */
export interface IdJagOptions {
  /** The trusted identity provider's issuer URL. */
  readonly issuerUrl: string;

  /**
   * JWKS URL override.
   * @default - OIDC discovery on the issuer URL
   */
  readonly jwksUrl?: string;

  /**
   * Allowed client IDs.
   * @default - any client ID
   */
  readonly allowedClients?: string[];
}

/**
 * A PostHog identity provider configuration.
 */
export interface IIdentityProviderConfig extends IResource {
  /**
   * The PostHog identity provider configuration ID (a UUID).
   * @attribute
   */
  readonly identityProviderConfigId: string;

  /** The organization the configuration belongs to. */
  readonly organization: IOrganization;
}

/**
 * Options for creating an identity provider configuration in an organization.
 */
export interface IdentityProviderConfigOptions {
  /** Display name, e.g. `Okta production`. */
  readonly name: string;

  /**
   * SAML settings. Specify exactly one of `saml` and `oidc`.
   * @default - not a SAML configuration
   */
  readonly saml?: SamlOptions;

  /**
   * OIDC settings. Specify exactly one of `saml` and `oidc`.
   * @default - not an OIDC configuration
   */
  readonly oidc?: OidcOptions;

  /**
   * The organization domains the configuration applies to.
   * @default - all of the organization's domains
   */
  readonly domains?: IDomain[];

  /**
   * Enable SCIM provisioning. PostHog then generates a bearer token, returned
   * only once, which is written to `scimTokenSecret`.
   * @default false
   */
  readonly scim?: boolean;

  /**
   * Secrets Manager secret the SCIM bearer token is written to. Only used
   * when `scim` is true. The PostHog resource type handler needs
   * `secretsmanager:PutSecretValue` on it.
   * @default - a new secret is created
   */
  readonly scimTokenSecret?: secretsmanager.ISecret;

  /**
   * ID-JAG (cross-app access) settings.
   * @default - ID-JAG not configured
   */
  readonly idJag?: IdJagOptions;

  /**
   * What happens to the configuration when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an IdentityProviderConfig.
 */
export interface IdentityProviderConfigProps extends IdentityProviderConfigOptions {
  /** The organization the configuration belongs to. */
  readonly organization: IOrganization;
}

/**
 * A PostHog identity provider configuration: SAML or OIDC single sign-on for
 * an organization, optionally with SCIM provisioning and ID-JAG, applied to
 * all or selected organization domains.
 *
 * @resource PostHog::Organizations::IdentityProviderConfig
 */
export class IdentityProviderConfig extends Resource implements IIdentityProviderConfig {
  /**
   * Import an existing identity provider configuration by its PostHog ID.
   */
  public static fromIdentityProviderConfigId(
    scope: Construct, id: string, organization: IOrganization, identityProviderConfigId: string): IIdentityProviderConfig {
    class Import extends Resource implements IIdentityProviderConfig {
      public readonly identityProviderConfigId = identityProviderConfigId;
      public readonly organization = organization;
    }
    return new Import(scope, id);
  }

  public readonly identityProviderConfigId: string;
  public readonly organization: IOrganization;

  /**
   * The SAML RelayState value to configure in the identity provider.
   * @attribute
   */
  public readonly samlRelayState: string;

  /**
   * The SCIM base URL to configure in the identity provider.
   * @attribute
   */
  public readonly scimBaseUrl: string;

  /**
   * The secret holding the SCIM bearer token, when `scim` is enabled.
   */
  public readonly scimTokenSecret?: secretsmanager.ISecret;

  /** The underlying L1 resource. */
  public readonly resource: CfnIdentityProviderConfig;

  constructor(scope: Construct, id: string, props: IdentityProviderConfigProps) {
    super(scope, id);
    exactlyOne('IdentityProviderConfig', { saml: props.saml, oidc: props.oidc });
    validateLength('IdentityProviderConfig name', props.name, 1, 255);
    if (props.saml) {
      validateLength('IdentityProviderConfig saml.entityId', props.saml.entityId, 1, 512);
      validateLength('IdentityProviderConfig saml.acsUrl', props.saml.acsUrl, 1, 512);
    }
    if (props.oidc) {
      validateLength('IdentityProviderConfig oidc.issuerUrl', props.oidc.issuerUrl, 1, 512);
      validateHttpsUrl('IdentityProviderConfig oidc.issuerUrl', props.oidc.issuerUrl);
      validateLength('IdentityProviderConfig oidc.clientId', props.oidc.clientId, 1, 512);
    }
    if (props.idJag) {
      validateLength('IdentityProviderConfig idJag.issuerUrl', props.idJag.issuerUrl, 1, 512);
      validateLength('IdentityProviderConfig idJag.jwksUrl', props.idJag.jwksUrl, 1, 512);
      props.idJag.allowedClients?.forEach(c => validateLength('IdentityProviderConfig idJag.allowedClients item', c, 1, 256));
    }
    if (props.scimTokenSecret && !props.scim) {
      throw new Error('IdentityProviderConfig: scimTokenSecret is only used when scim is true');
    }

    this.organization = props.organization;

    if (props.scim) {
      this.scimTokenSecret = secretOrNew(this, 'ScimTokenSecret', props.scimTokenSecret,
        `PostHog SCIM bearer token for ${this.node.path} (written by the PostHog resource type handler)`);
    }

    this.resource = new CfnIdentityProviderConfig(this, 'Resource', {
      organizationId: props.organization.organizationId,
      name: props.name,
      configScope: (props.saml ? CfnIdentityProviderConfigPropsConfigScope.SAML : CfnIdentityProviderConfigPropsConfigScope.OIDC),
      domainScope: props.domains
        ? CfnIdentityProviderConfigPropsDomainScope.SELECTED
        : CfnIdentityProviderConfigPropsDomainScope.ALL,
      organizationDomainIds: uniqueOrUndefined(props.domains?.map(d => d.domainId)),
      samlEntityId: props.saml?.entityId,
      samlAcsUrl: props.saml?.acsUrl,
      samlX509Cert: secretProp(props.saml?.x509Cert),
      oidcIssuerUrl: props.oidc?.issuerUrl,
      oidcClientId: props.oidc?.clientId,
      oidcClientSecret: secretProp(props.oidc?.clientSecret),
      scimEnabled: props.scim,
      scimBearerTokenSecretArn: this.scimTokenSecret?.secretArn,
      idJagIssuerUrl: props.idJag?.issuerUrl,
      idJagJwksUrl: props.idJag?.jwksUrl,
      idJagAllowedClients: uniqueOrUndefined(props.idJag?.allowedClients),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
    if (this.scimTokenSecret) {
      // The handler writes the token into the secret, so it must exist first.
      this.resource.node.addDependency(this.scimTokenSecret);
    }

    this.identityProviderConfigId = this.resource.attrId;
    this.samlRelayState = this.resource.attrSamlRelayState;
    this.scimBaseUrl = this.resource.attrScimBaseUrl;
  }

  /**
   * Grant read access to the SCIM bearer token secret, e.g. to a function that
   * copies the token into the identity provider. Throws if SCIM is not
   * enabled.
   */
  public grantReadScimToken(grantee: iam.IGrantable): iam.Grant {
    if (!this.scimTokenSecret) {
      throw new Error('IdentityProviderConfig: SCIM is not enabled, so there is no SCIM token secret to grant');
    }
    return this.scimTokenSecret.grantRead(grantee);
  }
}
