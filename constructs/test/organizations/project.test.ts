import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { BusinessModel, Organization, Project, RecordingRetentionPeriod, WeekStartDay } from '../../src/organizations';

const ORG_ID = '0190f0a3-0000-7000-8000-000000000001';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const organization = Organization.fromOrganizationId(stack, 'Org', ORG_ID);
  return { stack, organization };
}

test('creates a project with typed settings and filters', () => {
  const { stack, organization } = setup();
  const project = new Project(stack, 'Web', {
    organization,
    name: 'Web app',
    productDescription: 'Our SaaS dashboard',
    tags: ['prod', 'prod', 'web'],
    appUrls: ['https://app.example.com'],
    anonymizeIps: true,
    timezone: 'Europe/Berlin',
    weekStartDay: WeekStartDay.MONDAY,
    baseCurrency: 'EUR',
    businessModel: BusinessModel.B2B,
    autocaptureOptOut: false,
    autocaptureExceptions: true,
    autocaptureWebVitals: true,
    captureConsoleLogs: true,
    capturePerformance: true,
    captureDeadClicks: true,
    heatmaps: true,
    surveys: true,
    sessionRecording: true,
    sessionRecordingSampleRate: 0.25,
    sessionRecordingMinimumDuration: Duration.seconds(2),
    sessionRecordingRetentionPeriod: RecordingRetentionPeriod.NINETY_DAYS,
    recordingDomains: ['https://app.example.com'],
    dataAttributes: ['data-attr', 'data-testid'],
    personDisplayNameProperties: ['email', 'name'],
    testAccountFilters: [
      { key: 'email', value: '@example.com', operator: PropertyOperator.NOT_ICONTAINS, type: PropertyFilterType.PERSON },
    ],
    testAccountFiltersDefaultChecked: true,
    pathCleaningFilters: [{ regex: '/user/\\d+', alias: '/user/<id>' }],
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::Project', {
    OrganizationId: ORG_ID,
    Name: 'Web app',
    ProductDescription: 'Our SaaS dashboard',
    Tags: ['prod', 'web'],
    AppUrls: ['https://app.example.com'],
    AnonymizeIps: true,
    Timezone: 'Europe/Berlin',
    WeekStartDay: 1,
    BaseCurrency: 'EUR',
    BusinessModel: 'b2b',
    AutocaptureOptOut: false,
    AutocaptureExceptionsOptIn: true,
    AutocaptureWebVitalsOptIn: true,
    CaptureConsoleLogOptIn: true,
    CapturePerformanceOptIn: true,
    CaptureDeadClicks: true,
    HeatmapsOptIn: true,
    SurveysOptIn: true,
    SessionRecordingOptIn: true,
    SessionRecordingSampleRate: '0.25',
    SessionRecordingMinimumDurationMilliseconds: 2000,
    SessionRecordingRetentionPeriod: '90d',
    RecordingDomains: ['https://app.example.com'],
    DataAttributes: ['data-attr', 'data-testid'],
    PersonDisplayNameProperties: ['email', 'name'],
    TestAccountFilters: '[{"key":"email","operator":"not_icontains","type":"person","value":"@example.com"}]',
    TestAccountFiltersDefaultChecked: true,
    PathCleaningFilters: '[{"regex":"/user/\\\\d+","alias":"/user/<id>"}]',
  });

  expect(stack.resolve(project.projectId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Web/), 'Id'] });
  expect(stack.resolve(project.projectUuid)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Web/), 'Uuid'] });
  expect(stack.resolve(project.apiToken)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Web/), 'ApiToken'] });
  expect(stack.resolve(project.apiHost)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Web/), 'ApiHost'] });
  expect(stack.resolve(project.projectCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Web/), 'CreatedAt'] });
  expect(project.organization).toBe(organization);
});

test('retains the project by default and leaves optional settings out', () => {
  const { stack, organization } = setup();
  new Project(stack, 'Bare', { organization, name: 'Bare' });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Organizations::Project', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::Organizations::Project'))[0].Properties;
  expect(props).toEqual({ OrganizationId: ORG_ID, Name: 'Bare' });
  Annotations.fromStack(stack).hasNoWarning('*', Match.anyValue());
});

test('warns when the removal policy is DESTROY', () => {
  const { stack, organization } = setup();
  new Project(stack, 'Scratch', { organization, name: 'Scratch', removalPolicy: RemovalPolicy.DESTROY });
  Template.fromStack(stack).hasResource('PostHog::Organizations::Project', { DeletionPolicy: 'Delete' });
  Annotations.fromStack(stack).hasWarning('/Test/Scratch', Match.stringLikeRegexp('removalPolicy is DESTROY.*all of its data'));
});

test('project helpers work on created projects', () => {
  const { stack, organization } = setup();
  const project = new Project(stack, 'Web', { organization, name: 'Web' });
  project.addAction('Signup', { name: 'Signed up', steps: [{ event: 'signed_up' }] });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Action', {
    ProjectId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Web'), 'Id'] },
  });
});

test('validates concrete values and skips tokens', () => {
  const { stack, organization } = setup();
  expect(() => new Project(stack, 'A', { organization, name: '' })).toThrow(/Project name must be between 1 and 200/);
  expect(() => new Project(stack, 'B', { organization, name: 'x', baseCurrency: 'eur' })).toThrow(/ISO 4217/);
  expect(() => new Project(stack, 'C', { organization, name: 'x', sessionRecordingSampleRate: 1.5 })).toThrow(/between 0 and 1/);
  expect(() => new Project(stack, 'D', { organization, name: 'x', sessionRecordingSampleRate: 0.125 })).toThrow(/two decimal/);
  expect(() => new Project(stack, 'E', { organization, name: 'x', sessionRecordingMinimumDuration: Duration.minutes(1) }))
    .toThrow(/sessionRecordingMinimumDuration/);
  expect(() => new Project(stack, 'F', { organization, name: 'x', tags: ['t'.repeat(256)] })).toThrow(/Project tag/);
  expect(() => new Project(stack, 'G', { organization, name: 'x', productDescription: 'd'.repeat(1001) })).toThrow(/productDescription/);
  expect(() => new Project(stack, 'H', { organization, name: 'x', testAccountFilters: [{ key: 'email' }] })).toThrow(/value is required/);

  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  const currency = new CfnParameter(stack, 'Currency', { type: 'String' });
  const rate = new CfnParameter(stack, 'Rate', { type: 'Number' });
  new Project(stack, 'Token', {
    organization,
    name: name.valueAsString,
    baseCurrency: currency.valueAsString,
    sessionRecordingSampleRate: rate.valueAsNumber,
  });
  Template.fromStack(stack).hasResourceProperties('PostHog::Organizations::Project', {
    Name: { Ref: 'Name' },
    BaseCurrency: { Ref: 'Currency' },
    SessionRecordingSampleRate: { Ref: 'Rate' },
  });
});

test('renders sample rates with two decimals', () => {
  const { stack, organization } = setup();
  new Project(stack, 'P', { organization, name: 'P', sessionRecordingSampleRate: 1 });
  Template.fromStack(stack).hasResourceProperties('PostHog::Organizations::Project', { SessionRecordingSampleRate: '1.00' });
});

test('fromProjectId still imports existing projects', () => {
  const { stack } = setup();
  const project = Project.fromProjectId(stack, 'Existing', '12345');
  expect(project.projectId).toBe('12345');
  project.addAction('A', { name: 'A' });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Action', { ProjectId: '12345' });
});
