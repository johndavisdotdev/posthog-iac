import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Organization, ProxyRecord } from '../../src/organizations';

const ORG_ID = '0190f0a3-0000-7000-8000-000000000001';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const organization = Organization.fromOrganizationId(stack, 'Org', ORG_ID);
  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', { hostedZoneId: 'Z123', zoneName: 'example.com' });
  return { stack, organization, zone };
}

test('creates a proxy and exposes its attributes', () => {
  const { stack, organization } = setup();
  const proxy = new ProxyRecord(stack, 'Proxy', {
    organization,
    domainName: 'e.example.com',
    rootRedirectUrl: 'https://www.example.com',
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::ProxyRecord', {
    OrganizationId: ORG_ID,
    Domain: 'e.example.com',
    RootRedirectUrl: 'https://www.example.com',
  });
  t.hasResource('PostHog::Organizations::ProxyRecord', { DeletionPolicy: 'Delete' });
  t.resourceCountIs('AWS::Route53::RecordSet', 0);
  expect(stack.resolve(proxy.targetCname)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Proxy/), 'TargetCname'] });
  expect(stack.resolve(proxy.status)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Proxy/), 'Status'] });
  expect(stack.resolve(proxy.statusMessage)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Proxy/), 'Message'] });
  expect(stack.resolve(proxy.proxyRecordId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Proxy/), 'Id'] });
  expect(proxy.apiHost).toBe('https://e.example.com');
});

test('creates the CNAME record in the hosted zone', () => {
  const { stack, organization, zone } = setup();
  const proxy = new ProxyRecord(stack, 'Proxy', { organization, domainName: 'e.example.com', hostedZone: zone });
  expect(proxy.cnameRecord).toBeDefined();
  Template.fromStack(stack).hasResourceProperties('AWS::Route53::RecordSet', {
    HostedZoneId: 'Z123',
    Name: 'e.example.com.',
    Type: 'CNAME',
    TTL: '300',
    ResourceRecords: [{ 'Fn::GetAtt': [Match.stringLikeRegexp('^Proxy'), 'TargetCname'] }],
  });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, organization } = setup();
  new ProxyRecord(stack, 'Bare', { organization, domainName: 'e.example.com', removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Organizations::ProxyRecord', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::Organizations::ProxyRecord'))[0].Properties;
  expect(props).toEqual({ OrganizationId: ORG_ID, Domain: 'e.example.com' });
});

test('validates the redirect URL and skips tokens', () => {
  const { stack, organization } = setup();
  expect(() => new ProxyRecord(stack, 'Http', { organization, domainName: 'e.example.com', rootRedirectUrl: 'http://example.com' }))
    .toThrow(/https:\/\//);
  expect(() => new ProxyRecord(stack, 'Empty', { organization, domainName: '' })).toThrow(/domainName/);
  const url = new CfnParameter(stack, 'Url', { type: 'String' });
  expect(() => new ProxyRecord(stack, 'Token', { organization, domainName: 'e.example.com', rootRedirectUrl: url.valueAsString }))
    .not.toThrow();
});

test('imports existing proxy records', () => {
  const { stack, organization } = setup();
  const proxy = ProxyRecord.fromProxyRecordId(stack, 'Existing', organization, 'proxy-uuid');
  expect(proxy.proxyRecordId).toBe('proxy-uuid');
  expect(proxy.organization).toBe(organization);
});
