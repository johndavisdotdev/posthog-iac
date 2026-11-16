import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { Organization, SsoProvider } from '../../src/organizations';
import { PostHogProject } from '../../src/patterns';
import { SecretApiKeyScope } from '../../src/projects';

const ORG_ID = '0190f0a3-0000-7000-8000-000000000001';
const SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:posthog-key-AbCdEf';
const LOCALHOST_FILTER = { key: '$host', value: '^(localhost|127\\.0\\.0\\.1)($|:)', operator: 'not_regex', type: 'event' };

function setup() {
  const stack = new Stack(new App(), 'Test', { env: { account: '123456789012', region: 'us-east-1' } });
  const organization = Organization.fromOrganizationId(stack, 'Org', ORG_ID);
  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', { hostedZoneId: 'Z123', zoneName: 'example.com' });
  return { stack, organization, zone };
}

function projectProps(t: Template): any {
  return Object.values(t.findResources('PostHog::Organizations::Project'))[0].Properties;
}

function testAccountFilters(t: Template): any[] | undefined {
  const raw = projectProps(t).TestAccountFilters;
  return raw === undefined ? undefined : JSON.parse(raw);
}

function getAtt(prefix: string, attr: string) {
  return { 'Fn::GetAtt': [Match.stringLikeRegexp(`^${prefix}`), attr] };
}

test('minimal project: production defaults, outputs and no optional pieces', () => {
  const { stack, organization } = setup();
  const p = new PostHogProject(stack, 'Analytics', { organization, name: 'Web app' });
  const t = Template.fromStack(stack);

  t.resourceCountIs('PostHog::Organizations::Project', 1);
  t.hasResource('PostHog::Organizations::Project', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  t.hasResourceProperties('PostHog::Organizations::Project', {
    OrganizationId: ORG_ID,
    Name: 'Web app',
    AutocaptureOptOut: false,
    AutocaptureExceptionsOptIn: true,
    AutocaptureWebVitalsOptIn: true,
    TestAccountFiltersDefaultChecked: true,
  });
  expect(projectProps(t).Timezone).toBeUndefined();
  expect(testAccountFilters(t)).toEqual([LOCALHOST_FILTER]);

  t.resourceCountIs('PostHog::Organizations::ProxyRecord', 0);
  t.resourceCountIs('PostHog::Organizations::Domain', 0);
  t.resourceCountIs('PostHog::Projects::SecretApiKey', 0);
  t.resourceCountIs('AWS::SecretsManager::Secret', 0);
  t.resourceCountIs('AWS::Route53::RecordSet', 0);
  t.resourceCountIs('AWS::SSM::Parameter', 0);
  expect(p.proxyRecord).toBeUndefined();
  expect(p.domain).toBeUndefined();
  expect(p.secretApiKey).toBeUndefined();
  expect(p.secretApiKeySecret).toBeUndefined();
  expect(p.parameters).toEqual([]);
  expect(Annotations.fromStack(stack).findWarning('*', Match.anyValue())).toEqual([]);

  // Ingestion goes straight to the project API host.
  expect(stack.resolve(p.ingestionHost)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^AnalyticsProject/), 'ApiHost'] });
  expect(stack.resolve(p.apiToken)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^AnalyticsProject/), 'ApiToken'] });

  const outputs = t.toJSON().Outputs;
  const byValue = (attr: string) => Object.values(outputs).filter((o: any) => o.Value?.['Fn::GetAtt']?.[1] === attr);
  expect(Object.keys(outputs)).toHaveLength(4);
  expect(byValue('Id')).toHaveLength(1);
  expect(byValue('ApiToken')).toHaveLength(1);
  expect(byValue('ApiHost')).toHaveLength(2); // the API host and the ingestion host
});

test('timezone, internal email domain, extra filters and pass-through options', () => {
  const { stack, organization } = setup();
  new PostHogProject(stack, 'Analytics', {
    organization,
    name: 'Web app',
    timezone: 'Europe/Berlin',
    internalEmailDomain: '@example.com',
    testAccountFilters: [{ key: '$environment', value: 'staging', operator: PropertyOperator.IS_NOT }],
    anonymizeIps: true,
    sessionRecording: true,
    autocaptureExceptions: false,
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::Project', {
    Timezone: 'Europe/Berlin',
    AnonymizeIps: true,
    SessionRecordingOptIn: true,
    AutocaptureExceptionsOptIn: false,
    AutocaptureWebVitalsOptIn: true,
  });
  expect(testAccountFilters(t)).toEqual([
    { key: '$environment', value: 'staging', operator: 'is_not', type: 'event' },
    LOCALHOST_FILTER,
    { key: 'email', value: '@example.com', operator: PropertyOperator.NOT_ICONTAINS, type: PropertyFilterType.PERSON },
  ]);
});

test('no test account filters when localhost is not excluded and no domain is given', () => {
  const { stack, organization } = setup();
  new PostHogProject(stack, 'Analytics', { organization, name: 'Web app', excludeLocalhost: false });
  const props = projectProps(Template.fromStack(stack));
  expect(props.TestAccountFilters).toBeUndefined();
  expect(props.TestAccountFiltersDefaultChecked).toBeUndefined();
});

test('honours an explicit removal policy', () => {
  const { stack, organization } = setup();
  new PostHogProject(stack, 'Analytics', { organization, name: 'Web app', removalPolicy: RemovalPolicy.DESTROY });
  Template.fromStack(stack).hasResource('PostHog::Organizations::Project', { DeletionPolicy: 'Delete' });
});

test('reverse proxy: CNAME record and ingestion host', () => {
  const { stack, organization, zone } = setup();
  const p = new PostHogProject(stack, 'Analytics', {
    organization,
    name: 'Web app',
    proxy: { domainName: 'e.example.com', hostedZone: zone },
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::ProxyRecord', { OrganizationId: ORG_ID, Domain: 'e.example.com' });
  t.hasResourceProperties('AWS::Route53::RecordSet', {
    HostedZoneId: 'Z123',
    Name: 'e.example.com.',
    Type: 'CNAME',
    ResourceRecords: [getAtt('AnalyticsProxy', 'TargetCname')],
  });
  expect(p.proxyRecord).toBeDefined();
  expect(p.ingestionHost).toBe('https://e.example.com');
  const outputs = Object.values(t.toJSON().Outputs) as any[];
  expect(outputs.some(o => o.Value === 'https://e.example.com')).toBe(true);
});

test('verified domain: TXT record', () => {
  const { stack, organization, zone } = setup();
  const p = new PostHogProject(stack, 'Analytics', {
    organization,
    name: 'Web app',
    verifiedDomain: { domainName: 'example.com', hostedZone: zone, jitProvisioning: true, ssoEnforcement: SsoProvider.GOOGLE },
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::Domain', {
    OrganizationId: ORG_ID,
    Domain: 'example.com',
    JitProvisioningEnabled: true,
    SsoEnforcement: 'google-oauth2',
  });
  t.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: '_posthog-challenge.example.com.',
    Type: 'TXT',
  });
  expect(p.domain).toBeDefined();
});

test('secret API key: created secret, ARN output only, never the value', () => {
  const { stack, organization } = setup();
  const p = new PostHogProject(stack, 'Analytics', {
    organization,
    name: 'Web app',
    secretApiKey: { scopes: [SecretApiKeyScope.FEATURE_FLAG_READ] },
    ssmPrefix: '/myapp/posthog',
  });
  const role = new iam.Role(stack, 'Role', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  p.grantReadSecretApiKey(role);

  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::SecretsManager::Secret', 1);
  const secretId = Object.keys(t.findResources('AWS::SecretsManager::Secret'))[0];
  t.hasResourceProperties('PostHog::Projects::SecretApiKey', {
    ProjectId: getAtt('AnalyticsProject', 'Id'),
    Label: 'posthog-cdk server key',
    Scopes: ['feature_flag:read'],
    SecretsManagerSecretArn: { Ref: secretId },
  });
  expect(p.secretApiKeySecret).toBe(p.secretApiKey!.secret);

  // The secret ARN appears in an output and a parameter; nothing resolves the value.
  const outputs = Object.values(t.toJSON().Outputs) as any[];
  expect(outputs.filter(o => JSON.stringify(o.Value) === JSON.stringify({ Ref: secretId }))).toHaveLength(1);
  t.hasResourceProperties('AWS::SSM::Parameter', { Name: '/myapp/posthog/secret-api-key-secret-arn', Value: { Ref: secretId } });
  const json = JSON.stringify(t.toJSON());
  expect(json).not.toMatch(/resolve:secretsmanager/);
  expect(json).not.toMatch(/phs_/);
  expect(json).not.toMatch(/"SecretString"/);

  t.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([Match.objectLike({
        Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        Resource: { Ref: secretId },
      })]),
    },
  });
});

test('secret API key: supplied secret and label', () => {
  const { stack, organization } = setup();
  const secret = secretsmanager.Secret.fromSecretCompleteArn(stack, 'Secret', SECRET_ARN);
  const p = new PostHogProject(stack, 'Analytics', {
    organization,
    name: 'Web app',
    secretApiKey: { scopes: [SecretApiKeyScope.FEATURE_FLAG_READ], label: 'backend', secret },
  });
  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::SecretsManager::Secret', 0);
  t.hasResourceProperties('PostHog::Projects::SecretApiKey', { Label: 'backend', SecretsManagerSecretArn: SECRET_ARN });
  expect(p.secretApiKeySecret).toBe(secret);
  const outputs = Object.values(t.toJSON().Outputs) as any[];
  expect(outputs.some(o => o.Value === SECRET_ARN)).toBe(true);
});

test('SSM parameters and grantReadParameters', () => {
  const { stack, organization, zone } = setup();
  const p = new PostHogProject(stack, 'Analytics', {
    organization,
    name: 'Web app',
    proxy: { domainName: 'e.example.com', hostedZone: zone },
    ssmPrefix: '/myapp/posthog',
  });
  const role = new iam.Role(stack, 'Role', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  p.grantReadParameters(role);

  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::SSM::Parameter', 4);
  t.hasResourceProperties('AWS::SSM::Parameter', { Name: '/myapp/posthog/project-id', Type: 'String', Value: getAtt('AnalyticsProject', 'Id') });
  t.hasResourceProperties('AWS::SSM::Parameter', { Name: '/myapp/posthog/api-token', Type: 'String', Value: getAtt('AnalyticsProject', 'ApiToken') });
  t.hasResourceProperties('AWS::SSM::Parameter', { Name: '/myapp/posthog/api-host', Value: getAtt('AnalyticsProject', 'ApiHost') });
  t.hasResourceProperties('AWS::SSM::Parameter', { Name: '/myapp/posthog/ingestion-host', Value: 'https://e.example.com' });
  expect(p.parameters).toHaveLength(4);

  const policy = Object.values(t.findResources('AWS::IAM::Policy'))[0].Properties.PolicyDocument;
  expect(policy.Statement).toHaveLength(1);
  expect(policy.Statement[0].Action).toEqual(['ssm:DescribeParameters', 'ssm:GetParameters', 'ssm:GetParameter', 'ssm:GetParameterHistory']);
  expect(policy.Statement[0].Resource).toHaveLength(4);
  expect(policy.Statement[0].Resource).toContainEqual({
    'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':ssm:us-east-1:123456789012:parameter', { Ref: expect.stringMatching(/^AnalyticsProjectIdParameter/) }]],
  });
});

test('outputs can be turned off', () => {
  const { stack, organization } = setup();
  new PostHogProject(stack, 'Analytics', { organization, name: 'Web app', outputs: false });
  expect(Template.fromStack(stack).toJSON().Outputs).toBeUndefined();
});

test('grants without the matching piece throw', () => {
  const { stack, organization } = setup();
  const p = new PostHogProject(stack, 'Analytics', { organization, name: 'Web app' });
  const role = new iam.Role(stack, 'Role', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  expect(() => p.grantReadParameters(role)).toThrow(/ssmPrefix/);
  expect(() => p.grantReadSecretApiKey(role)).toThrow(/secretApiKey/);
});

test('validates the SSM prefix and skips tokens', () => {
  const { stack, organization } = setup();
  ['myapp', '/myapp/', '/my app'].forEach((bad, i) => {
    expect(() => new PostHogProject(stack, `Bad${i}`, { organization, name: 'x', ssmPrefix: bad }))
      .toThrow(/ssmPrefix/);
  });
  const prefix = new CfnParameter(stack, 'Prefix', { type: 'String' });
  const domain = new CfnParameter(stack, 'EmailDomain', { type: 'String' });
  const p = new PostHogProject(stack, 'Token', {
    organization,
    name: 'x',
    ssmPrefix: prefix.valueAsString,
    internalEmailDomain: domain.valueAsString,
  });
  const role = new iam.Role(stack, 'Role', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  p.grantReadParameters(role);
  Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
    Name: { 'Fn::Join': ['', [{ Ref: 'Prefix' }, '/project-id']] },
  });
});
