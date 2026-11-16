import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyOperator } from '../../src/core';
import { Alert, AlertTrigger, ErrorFilter } from '../../src/error-tracking';
import { Project } from '../../src/organizations';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

const slack = { integrationId: 9, channel: 'C0123ABCD' };

test('creates an alert with typed triggers, destinations, filters and throttle', () => {
  const { stack, project } = setup();
  const alert = new Alert(stack, 'Alert', {
    project,
    name: 'New and reopened issues',
    triggers: [AlertTrigger.ISSUE_CREATED, AlertTrigger.ISSUE_REOPENED, AlertTrigger.ISSUE_CREATED],
    destinations: [{ ...slack, channelName: '#errors' }],
    filters: ErrorFilter.all(
      ErrorFilter.exceptionType(PropertyOperator.EXACT, ['TypeError']),
      ErrorFilter.all(ErrorFilter.stackFrameSource(PropertyOperator.ICONTAINS, 'checkout')),
    ),
    filterTestAccounts: true,
    throttle: Duration.hours(1),
    enabled: false,
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ErrorTracking::Alert', {
    ProjectId: '12345',
    Name: 'New and reopened issues',
    Enabled: false,
    Triggers: ['issue_created', 'issue_reopened'],
    Destinations: [{ ChannelType: 'slack', IntegrationId: 9, Config: { Channel: 'C0123ABCD', ChannelName: '#errors' } }],
    Filters: '{"properties":[{"key":"$exception_types","operator":"exact","type":"event","value":["TypeError"]},'
      + '{"key":"$exception_sources","operator":"icontains","type":"event","value":"checkout"}],"filter_test_accounts":true}',
    ThrottleSeconds: 3600,
  });
  t.hasResource('PostHog::ErrorTracking::Alert', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(alert.alertId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Alert/), 'Id'] });
  expect(stack.resolve(alert.alertCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Alert/), 'CreatedAt'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Alert(stack, 'Alert', {
    project, name: 'Spikes', triggers: [AlertTrigger.ISSUE_SPIKING], destinations: [slack], removalPolicy: RemovalPolicy.RETAIN,
  });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ErrorTracking::Alert', { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources('PostHog::ErrorTracking::Alert'))[0].Properties).toEqual({
    ProjectId: '12345',
    Name: 'Spikes',
    Triggers: ['issue_spiking'],
    Destinations: [{ ChannelType: 'slack', IntegrationId: 9, Config: { Channel: 'C0123ABCD' } }],
  });
});

test('validates the throttle duration', () => {
  const { stack, project } = setup();
  const base = { project, name: 'A', triggers: [AlertTrigger.ISSUE_CREATED], destinations: [slack] };
  expect(() => new Alert(stack, 'Long', { ...base, throttle: Duration.days(31) })).toThrow(/throttle \(seconds\) must be between 0 and 2592000/);
  expect(() => new Alert(stack, 'Fraction', { ...base, throttle: Duration.millis(1500) })).toThrow(/whole number of seconds/);
  const seconds = new CfnParameter(stack, 'Seconds', { type: 'Number' });
  expect(() => new Alert(stack, 'Token', { ...base, throttle: Duration.seconds(seconds.valueAsNumber) })).not.toThrow();
});

test('validates names, triggers, destinations and OR filters', () => {
  const { stack, project } = setup();
  const base = { project, name: 'A', triggers: [AlertTrigger.ISSUE_CREATED], destinations: [slack] };
  expect(() => new Alert(stack, 'Name', { ...base, name: '' })).toThrow(/Alert name must be between 1 and 400/);
  expect(() => new Alert(stack, 'Triggers', { ...base, triggers: [] })).toThrow(/at least one trigger/);
  expect(() => new Alert(stack, 'Destinations', { ...base, destinations: [] })).toThrow(/at least one destination/);
  expect(() => new Alert(stack, 'Channel', { ...base, destinations: [{ integrationId: 1, channel: '' }] })).toThrow(/channel/);
  expect(() => new Alert(stack, 'Or', {
    ...base,
    filters: ErrorFilter.any(
      ErrorFilter.exceptionType(PropertyOperator.EXACT, ['A']),
      ErrorFilter.exceptionType(PropertyOperator.EXACT, ['B']),
    ),
  })).toThrow(/only support AND-combined conditions/);
  const name = new CfnParameter(stack, 'AlertName', { type: 'String' });
  expect(() => new Alert(stack, 'Token', { ...base, name: name.valueAsString })).not.toThrow();
});

test('imports an existing alert', () => {
  const { stack, project } = setup();
  const alert = Alert.fromAlertId(stack, 'Existing', project, 'alert-uuid');
  expect(alert.alertId).toBe('alert-uuid');
  expect(alert.project).toBe(project);
});
