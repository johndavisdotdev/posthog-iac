import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyOperator } from '../../src/core';
import { Alert, AlertThreshold, LogFilter, LogSeverity, ThresholdOperator } from '../../src/logs';
import { Project } from '../../src/organizations';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates an alert with every typed property', () => {
  const { stack, project } = setup();
  const alert = new Alert(stack, 'Alert', {
    project,
    name: 'API errors',
    threshold: AlertThreshold.above(50),
    window: Duration.minutes(15),
    evaluationPeriods: 3,
    datapointsToAlarm: 2,
    severityLevels: [LogSeverity.ERROR, LogSeverity.FATAL, LogSeverity.ERROR],
    serviceNames: ['api'],
    filters: LogFilter.message(PropertyOperator.ICONTAINS, 'timeout'),
    blockedWindows: [{ start: '22:00', end: '06:00' }],
    labels: { team: 'checkout', severity: 'critical' },
    annotations: { runbook_url: 'https://example.com/runbook' },
    cooldown: Duration.hours(1),
    enabled: true,
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Logs::Alert', {
    ProjectId: '12345',
    Name: 'API errors',
    Enabled: true,
    Filters: {
      SeverityLevels: ['error', 'fatal'],
      ServiceNames: ['api'],
      FilterGroup: '{"type":"AND","values":[{"type":"AND","values":[{"key":"message","operator":"icontains","type":"log","value":"timeout"}]}]}',
    },
    ThresholdCount: 50,
    ThresholdOperator: 'above',
    WindowMinutes: 15,
    EvaluationPeriods: 3,
    DatapointsToAlarm: 2,
    CooldownMinutes: 60,
    ScheduleRestriction: { BlockedWindows: [{ Start: '22:00', End: '06:00' }] },
    Labels: { team: 'checkout', severity: 'critical' },
    Annotations: { runbook_url: 'https://example.com/runbook' },
  });
  t.hasResource('PostHog::Logs::Alert', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(alert.alertId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Alert/), 'Id'] });
  expect(stack.resolve(alert.alertCheckIntervalMinutes)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Alert/), 'CheckIntervalMinutes'] });
  expect(stack.resolve(alert.alertPlatformOwned)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Alert/), 'PlatformOwned'] });
  expect(stack.resolve(alert.alertCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Alert/), 'CreatedAt'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Alert(stack, 'Alert', { project, name: 'Fatal', severityLevels: [LogSeverity.FATAL], removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Logs::Alert', { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources('PostHog::Logs::Alert'))[0].Properties).toEqual({
    ProjectId: '12345',
    Name: 'Fatal',
    Filters: { SeverityLevels: ['fatal'] },
  });
});

test('below thresholds and disabled alerts without filters', () => {
  const { stack, project } = setup();
  const threshold = AlertThreshold.below(1);
  expect(threshold.operator).toBe(ThresholdOperator.BELOW);
  new Alert(stack, 'Alert', { project, name: 'Heartbeat', threshold, enabled: false });
  Template.fromStack(stack).hasResourceProperties('PostHog::Logs::Alert', {
    Name: 'Heartbeat', Enabled: false, ThresholdCount: 1, ThresholdOperator: 'below',
  });
});

test('validates window, cooldown and evaluation periods', () => {
  const { stack, project } = setup();
  const base = { project, name: 'A', serviceNames: ['api'] };
  expect(() => new Alert(stack, 'W1', { ...base, window: Duration.minutes(7) })).toThrow(/window must be 5, 10, 15, 30 or 60 minutes, got 7/);
  expect(() => new Alert(stack, 'W2', { ...base, window: Duration.seconds(90) })).toThrow(/window must be a whole number of minutes/);
  expect(() => new Alert(stack, 'W3', { ...base, window: Duration.hours(1) })).not.toThrow();
  expect(() => new Alert(stack, 'C1', { ...base, cooldown: Duration.seconds(30) })).toThrow(/cooldown must be a whole number of minutes/);
  expect(() => new Alert(stack, 'E1', { ...base, evaluationPeriods: 11 })).toThrow(/evaluationPeriods must be between 1 and 10/);
  expect(() => new Alert(stack, 'E2', { ...base, evaluationPeriods: 2, datapointsToAlarm: 3 })).toThrow(/cannot exceed evaluationPeriods/);
  const minutes = new CfnParameter(stack, 'Minutes', { type: 'Number' });
  expect(() => new Alert(stack, 'Token', { ...base, window: Duration.minutes(minutes.valueAsNumber) })).not.toThrow();
});

test('validates thresholds, blocked windows, labels, names and filters', () => {
  const { stack, project } = setup();
  const base = { project, name: 'A', serviceNames: ['api'] };
  expect(() => AlertThreshold.above(-1)).toThrow(/count must be between 0/);
  expect(() => AlertThreshold.above(1.5)).toThrow(/whole number/);
  expect(() => new Alert(stack, 'B1', { ...base, blockedWindows: [{ start: '25:00', end: '06:00' }] })).toThrow(/start '25:00' is invalid/);
  const six = Array.from({ length: 6 }, () => ({ start: '01:00', end: '02:00' }));
  expect(() => new Alert(stack, 'B2', { ...base, blockedWindows: six })).toThrow(/at most 5 blocked windows/);
  expect(() => new Alert(stack, 'L1', { ...base, labels: { 'bad-name': 'x' } })).toThrow(/labels name 'bad-name' is invalid/);
  expect(() => new Alert(stack, 'L2', { ...base, labels: { posthog_team: 'x' } })).toThrow(/reserved/);
  expect(() => new Alert(stack, 'L3', { ...base, labels: { alertname: 'x' } })).toThrow(/reserved/);
  expect(() => new Alert(stack, 'N', { ...base, name: 'x'.repeat(256) })).toThrow(/name must be between 1 and 255/);
  expect(() => new Alert(stack, 'F', { project, name: 'No filters' })).toThrow(/needs at least one of severityLevels, serviceNames or filters/);
});

test('imports an existing alert', () => {
  const { stack, project } = setup();
  const alert = Alert.fromAlertId(stack, 'Existing', project, 'alert-uuid');
  expect(alert.alertId).toBe('alert-uuid');
  expect(alert.project).toBe(project);
});
