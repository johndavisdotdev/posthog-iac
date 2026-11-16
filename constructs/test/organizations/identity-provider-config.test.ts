import { App, CfnParameter, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Domain, IdentityProviderConfig, Organization } from '../../src/organizations';

const ORG_ID = '0190f0a3-0000-7000-8000-000000000001';
const SAML = {
  entityId: 'http://www.okta.com/abc',
  acsUrl: 'https://example.okta.com/app/abc/sso/saml',
  x509Cert: SecretValue.secretsManager('okta-saml-cert'),
};

function setup() {
  const stack = new Stack(new App(), 'Test');
  const organization = Organization.fromOrganizationId(stack, 'Org', ORG_ID);
  return { stack, organization };
}

test('creates a SAML configuration for selected domains with SCIM and a new token secret', () => {
  const { stack, organization } = setup();
  const domain = new Domain(stack, 'Company', { organization, domainName: 'example.com' });
  const idp = new IdentityProviderConfig(stack, 'Okta', {
    organization,
    name: 'Okta production',
    saml: SAML,
    domains: [domain],
    scim: true,
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::IdentityProviderConfig', {
    OrganizationId: ORG_ID,
    Name: 'Okta production',
    ConfigScope: 'saml',
    DomainScope: 'selected',
    OrganizationDomainIds: [{ 'Fn::GetAtt': [Match.stringLikeRegexp('^Company'), 'Id'] }],
    SamlEntityId: SAML.entityId,
    SamlAcsUrl: SAML.acsUrl,
    SamlX509Cert: '{{resolve:secretsmanager:okta-saml-cert:SecretString:::}}',
    ScimEnabled: true,
    ScimBearerTokenSecretArn: { Ref: Match.stringLikeRegexp('^OktaScimTokenSecret') },
  });
  t.hasResource('PostHog::Organizations::IdentityProviderConfig', {
    DeletionPolicy: 'Delete',
    DependsOn: [Match.stringLikeRegexp('^OktaScimTokenSecret')],
  });
  t.hasResourceProperties('AWS::SecretsManager::Secret', {
    Tags: Match.arrayWith([{ Key: 'posthog-cdk:handler-writable', Value: 'true' }]),
  });
  expect(idp.scimTokenSecret).toBeDefined();
  expect(stack.resolve(idp.samlRelayState)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Okta/), 'SamlRelayState'] });
  expect(stack.resolve(idp.scimBaseUrl)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Okta/), 'ScimBaseUrl'] });
  expect(stack.resolve(idp.identityProviderConfigId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Okta/), 'Id'] });
});

test('creates an OIDC configuration for all domains with a client secret', () => {
  const { stack, organization } = setup();
  const idp = new IdentityProviderConfig(stack, 'Entra', {
    organization,
    name: 'Entra ID',
    oidc: {
      issuerUrl: 'https://login.microsoftonline.com/tenant/v2.0',
      clientId: 'client-123',
      clientSecret: SecretValue.secretsManager('posthog/oidc-secret'),
    },
    idJag: { issuerUrl: 'https://login.microsoftonline.com/tenant/v2.0', allowedClients: ['a', 'a', 'b'] },
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const t = Template.fromStack(stack);
  const props = Object.values(t.findResources('PostHog::Organizations::IdentityProviderConfig'))[0].Properties;
  expect(props).toEqual({
    OrganizationId: ORG_ID,
    Name: 'Entra ID',
    ConfigScope: 'oidc',
    DomainScope: 'all',
    OidcIssuerUrl: 'https://login.microsoftonline.com/tenant/v2.0',
    OidcClientId: 'client-123',
    OidcClientSecret: '{{resolve:secretsmanager:posthog/oidc-secret:SecretString:::}}',
    IdJagIssuerUrl: 'https://login.microsoftonline.com/tenant/v2.0',
    IdJagAllowedClients: ['a', 'b'],
  });
  t.hasResource('PostHog::Organizations::IdentityProviderConfig', { DeletionPolicy: 'Retain' });
  t.resourceCountIs('AWS::SecretsManager::Secret', 0);
  expect(idp.scimTokenSecret).toBeUndefined();
  expect(() => idp.grantReadScimToken(new iam.AccountRootPrincipal())).toThrow(/SCIM is not enabled/);
});

test('secrets appear only as dynamic references', () => {
  const { stack, organization } = setup();
  const certSecret = secretsmanager.Secret.fromSecretNameV2(stack, 'Cert', 'okta-cert');
  new IdentityProviderConfig(stack, 'Okta', {
    organization,
    name: 'Okta',
    saml: { ...SAML, x509Cert: certSecret.secretValue },
  });
  new IdentityProviderConfig(stack, 'Oidc', {
    organization,
    name: 'Oidc',
    oidc: { issuerUrl: 'https://idp.example.com', clientId: 'c', clientSecret: SecretValue.secretsManager('oidc', { jsonField: 'secret' }) },
  });
  const json = JSON.stringify(Template.fromStack(stack).toJSON());
  expect(json).toContain('{{resolve:secretsmanager:');
  expect(json).toContain('{{resolve:secretsmanager:oidc:SecretString:secret::}}');
  expect(json).not.toMatch(/BEGIN CERTIFICATE/);
});

test('uses a supplied SCIM token secret and grants read access', () => {
  const { stack, organization } = setup();
  const secret = new secretsmanager.Secret(stack, 'MyToken');
  const idp = new IdentityProviderConfig(stack, 'Okta', { organization, name: 'Okta', saml: SAML, scim: true, scimTokenSecret: secret });
  expect(idp.scimTokenSecret).toBe(secret);
  const role = new iam.Role(stack, 'Reader', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  idp.grantReadScimToken(role);
  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::SecretsManager::Secret', 1);
  t.hasResourceProperties('PostHog::Organizations::IdentityProviderConfig', {
    ScimBearerTokenSecretArn: { Ref: Match.stringLikeRegexp('^MyToken') },
  });
  t.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([Match.objectLike({ Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'] })]),
    },
  });
});

test('validation: exactly one of saml and oidc, and SCIM secret only with SCIM', () => {
  const { stack, organization } = setup();
  expect(() => new IdentityProviderConfig(stack, 'None', { organization, name: 'x' })).toThrow(/exactly one of saml, oidc \(got none\)/);
  expect(() => new IdentityProviderConfig(stack, 'Both', {
    organization, name: 'x', saml: SAML, oidc: { issuerUrl: 'https://idp.example.com', clientId: 'c' },
  })).toThrow(/got saml, oidc/);
  const secret = new secretsmanager.Secret(stack, 'S');
  expect(() => new IdentityProviderConfig(stack, 'NoScim', { organization, name: 'x', saml: SAML, scimTokenSecret: secret }))
    .toThrow(/only used when scim is true/);
  expect(() => new IdentityProviderConfig(stack, 'Http', {
    organization, name: 'x', oidc: { issuerUrl: 'http://idp.example.com', clientId: 'c' },
  })).toThrow(/https:\/\//);
  expect(() => new IdentityProviderConfig(stack, 'Long', { organization, name: 'n'.repeat(256), saml: SAML })).toThrow(/name/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new IdentityProviderConfig(stack, 'Token', { organization, name: name.valueAsString, saml: SAML })).not.toThrow();
});

test('imports existing configurations', () => {
  const { stack, organization } = setup();
  const idp = IdentityProviderConfig.fromIdentityProviderConfigId(stack, 'Existing', organization, 'idp-uuid');
  expect(idp.identityProviderConfigId).toBe('idp-uuid');
  expect(idp.organization).toBe(organization);
});
