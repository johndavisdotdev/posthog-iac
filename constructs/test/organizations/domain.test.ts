import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Domain, Organization, SsoProvider } from '../../src/organizations';

const ORG_ID = '0190f0a3-0000-7000-8000-000000000001';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const organization = Organization.fromOrganizationId(stack, 'Org', ORG_ID);
  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', { hostedZoneId: 'Z123', zoneName: 'example.com' });
  return { stack, organization, zone };
}

test('claims a domain and exposes its attributes', () => {
  const { stack, organization } = setup();
  const domain = new Domain(stack, 'Company', {
    organization,
    domainName: 'example.com',
    jitProvisioning: true,
    ssoEnforcement: SsoProvider.GOOGLE,
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::Domain', {
    OrganizationId: ORG_ID,
    Domain: 'example.com',
    JitProvisioningEnabled: true,
    SsoEnforcement: 'google-oauth2',
  });
  t.hasResource('PostHog::Organizations::Domain', { DeletionPolicy: 'Delete' });
  t.resourceCountIs('AWS::Route53::RecordSet', 0);
  expect(domain.verificationRecord).toBeUndefined();
  expect(stack.resolve(domain.domainId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Company/), 'Id'] });
  expect(stack.resolve(domain.verificationChallenge)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Company/), 'VerificationChallenge'] });
  expect(stack.resolve(domain.domainIsVerified)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Company/), 'IsVerified'] });
  expect(stack.resolve(domain.scimBaseUrl)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Company/), 'ScimBaseUrl'] });
});

test('creates the verification TXT record in the hosted zone', () => {
  const { stack, organization, zone } = setup();
  const domain = new Domain(stack, 'Company', { organization, domainName: 'example.com', hostedZone: zone });
  expect(domain.verificationRecord).toBeDefined();
  Template.fromStack(stack).hasResourceProperties('AWS::Route53::RecordSet', {
    HostedZoneId: 'Z123',
    Name: '_posthog-challenge.example.com.',
    Type: 'TXT',
    TTL: '300',
    ResourceRecords: [{ 'Fn::Join': ['', ['"', { 'Fn::GetAtt': [Match.stringLikeRegexp('^Company'), 'VerificationChallenge'] }, '"']] }],
  });
});

test('record name works for subdomains, trailing dots and tokens', () => {
  const { stack, organization, zone } = setup();
  new Domain(stack, 'Sub', { organization, domainName: 'eu.example.com.', hostedZone: zone, verificationRecordTtl: Duration.minutes(1) });
  const param = new CfnParameter(stack, 'DomainName', { type: 'String' });
  new Domain(stack, 'Token', { organization, domainName: param.valueAsString, hostedZone: zone });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('AWS::Route53::RecordSet', { Name: '_posthog-challenge.eu.example.com.', TTL: '60' });
  t.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: { 'Fn::Join': ['', ['_posthog-challenge.', { Ref: 'DomainName' }, '.']] },
  });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, organization } = setup();
  new Domain(stack, 'Bare', { organization, domainName: 'example.org', removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Organizations::Domain', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::Organizations::Domain'))[0].Properties;
  expect(props).toEqual({ OrganizationId: ORG_ID, Domain: 'example.org' });
});

test('supports custom SSO providers and validates lengths', () => {
  const { stack, organization } = setup();
  new Domain(stack, 'Custom', { organization, domainName: 'example.net', ssoEnforcement: SsoProvider.of('microsoft') });
  Template.fromStack(stack).hasResourceProperties('PostHog::Organizations::Domain', { SsoEnforcement: 'microsoft' });
  expect(() => new Domain(stack, 'Empty', { organization, domainName: '' })).toThrow(/domainName must be between 1 and 128/);
  expect(() => new Domain(stack, 'Long', { organization, domainName: 'x.com', ssoEnforcement: SsoProvider.of('p'.repeat(29)) }))
    .toThrow(/ssoEnforcement/);
});

test('imports existing domains', () => {
  const { stack, organization } = setup();
  const domain = Domain.fromDomainId(stack, 'Existing', organization, 'domain-uuid');
  expect(domain.domainId).toBe('domain-uuid');
  expect(domain.organization.organizationId).toBe(ORG_ID);
});
