import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType } from '../../src/core';
import {
  FeatureFlag,
  Recurrence,
  RecurrenceInterval,
  ScheduledChange,
  ScheduledOperation,
  ScheduledOperationType,
} from '../../src/feature-flags';
import { Project } from '../../src/organizations';

const CHANGE = 'PostHog::FeatureFlags::ScheduledChange';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  const flag = new FeatureFlag(stack, 'Flag', { project, key: 'launch', active: false });
  return { stack, project, flag };
}

function changes(stack: Stack): Record<string, any>[] {
  return Object.values(Template.fromStack(stack).findResources(CHANGE)).map(r => r.Properties);
}

test('flag.scheduleChange enables the flag at a time', () => {
  const { stack, flag } = setup();
  const change = flag.scheduleChange('TurnOn', { at: '2030-03-20T09:00:00Z', operation: ScheduledOperation.enable() });
  const [props] = changes(stack);
  expect(props).toEqual({
    ProjectId: '12345',
    RecordId: { 'Fn::GetAtt': [expect.stringMatching(/^Flag/), 'Id'] },
    Payload: '{"operation":"update_status","value":true}',
    ScheduledAt: '2030-03-20T09:00:00Z',
  });
  Template.fromStack(stack).hasResource(CHANGE, { DeletionPolicy: 'Delete' });
  expect(change.node.scope).toBe(flag);
  expect(change.flag).toBe(flag);
  expect(change.project).toBe(flag.project);
  expect(stack.resolve(change.scheduledChangeId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/TurnOn/), 'Id'] });
  for (const [attr, name] of [
    [change.executedAt, 'ExecutedAt'],
    [change.lastExecutedAt, 'LastExecutedAt'],
    [change.failureReason, 'FailureReason'],
    [change.timezone, 'Timezone'],
  ]) {
    expect(stack.resolve(attr)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/TurnOn/), name] });
  }
});

test('serializes every operation', () => {
  const at = '2030-01-01T00:00:00+01:00';
  const { stack, flag } = setup();
  flag.scheduleChange('Off', { at, operation: ScheduledOperation.disable() });
  flag.scheduleChange('Rollout', { at, operation: ScheduledOperation.rolloutTo(30) });
  flag.scheduleChange('Cond', {
    at,
    operation: ScheduledOperation.addReleaseCondition({
      properties: [{ key: 'plan', value: 'pro', type: PropertyFilterType.PERSON }],
      rolloutPercentage: 100,
    }),
  });
  flag.scheduleChange('Variants', {
    at,
    operation: ScheduledOperation.updateVariants(
      [{ key: 'a', rolloutPercentage: 20 }, { key: 'b', name: 'B', rolloutPercentage: 80 }],
      { b: { color: 'red' } },
    ),
  });
  expect(changes(stack).map(p => JSON.parse(p.Payload))).toEqual([
    { operation: 'update_status', value: false },
    { operation: 'add_release_condition', value: { groups: [{ properties: [], rollout_percentage: 30 }] } },
    {
      operation: 'add_release_condition',
      value: { groups: [{ properties: [{ key: 'plan', operator: 'exact', type: 'person', value: 'pro' }], rollout_percentage: 100 }] },
    },
    {
      operation: 'update_variants',
      value: {
        variants: [{ key: 'a', rollout_percentage: 20 }, { key: 'b', name: 'B', rollout_percentage: 80 }],
        payloads: { b: '{"color":"red"}' },
      },
    },
  ]);
  expect(ScheduledOperation.enable().type).toBe(ScheduledOperationType.UPDATE_STATUS);
});

test('recurring schedules take an interval or a cron expression', () => {
  const { stack, flag } = setup();
  flag.scheduleChange('Weekly', {
    at: '2030-01-06T08:00:00Z',
    operation: ScheduledOperation.enable(),
    recurrence: Recurrence.every(RecurrenceInterval.WEEKLY),
    endDate: '2030-12-31T00:00:00Z',
  });
  flag.scheduleChange('Weekdays', {
    at: '2030-01-06T18:00:00Z',
    operation: ScheduledOperation.disable(),
    recurrence: Recurrence.cron('0 18 * * 1-5'),
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const [weekly, weekdays] = changes(stack);
  expect(weekly).toMatchObject({ IsRecurring: true, RecurrenceInterval: 'weekly', EndDate: '2030-12-31T00:00:00Z' });
  expect(weekly.CronExpression).toBeUndefined();
  expect(weekdays).toMatchObject({ IsRecurring: true, CronExpression: '0 18 * * 1-5' });
  expect(weekdays.RecurrenceInterval).toBeUndefined();
  Template.fromStack(stack).hasResource(CHANGE, { DeletionPolicy: 'Retain' });
});

test('validates timestamps, recurrence and operations', () => {
  const { stack, flag } = setup();
  const enable = ScheduledOperation.enable();
  expect(() => flag.scheduleChange('BadAt', { at: 'tomorrow', operation: enable })).toThrow(/ScheduledChange at 'tomorrow' is invalid/);
  expect(() => flag.scheduleChange('NoZone', { at: '2030-01-01T00:00:00', operation: enable })).toThrow(/time zone/);
  expect(() => flag.scheduleChange('Recur', {
    at: '2030-01-01T00:00:00Z',
    operation: ScheduledOperation.rolloutTo(50),
    recurrence: Recurrence.every(RecurrenceInterval.DAILY),
  })).toThrow(/only enable\(\) and disable\(\) can recur/);
  expect(() => flag.scheduleChange('End', { at: '2030-01-01T00:00:00Z', operation: enable, endDate: '2030-02-01T00:00:00Z' }))
    .toThrow(/endDate requires a recurrence/);
  expect(() => ScheduledOperation.rolloutTo(120)).toThrow(/between 0 and 100/);
  expect(() => ScheduledOperation.updateVariants([{ key: 'a', rolloutPercentage: 10 }])).toThrow(/sum to 100/);
  expect(() => Recurrence.cron('')).toThrow(/cron expression/);
  const at = new CfnParameter(stack, 'At', { type: 'String' });
  expect(() => flag.scheduleChange('Token', { at: at.valueAsString, operation: enable })).not.toThrow();
});

test('works with imported flags and imports scheduled changes', () => {
  const { stack, project } = setup();
  const imported = FeatureFlag.fromFlagId(stack, 'Imported', project, '77');
  new ScheduledChange(stack, 'Change', { flag: imported, at: '2030-01-01T00:00:00Z', operation: ScheduledOperation.enable() });
  expect(changes(stack)[0].RecordId).toBe('77');

  const byKey = FeatureFlag.fromFlagKey(stack, 'ByKey', project, 'k');
  expect(() => new ScheduledChange(stack, 'Bad', { flag: byKey, at: '2030-01-01T00:00:00Z', operation: ScheduledOperation.enable() }))
    .toThrow(/imported by key/);

  const existing = ScheduledChange.fromScheduledChangeId(stack, 'Existing', project, '5');
  expect(existing.scheduledChangeId).toBe('5');
  expect(existing.project).toBe(project);
});
