import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import {
  Alert,
  AlertCalculationInterval,
  AlertCondition,
  AlertThresholdType,
  Insight,
  InsightQuery,
  InsightSeries,
} from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  const insight = new Insight(stack, 'Signups', { project, query: InsightQuery.trends({ series: [InsightSeries.event('signed_up')] }) });
  return { stack, project, insight };
}

test('creates an alert with a typed threshold referencing the insight', () => {
  const { stack, project } = setup();
  const insight = new Insight(stack, 'SignupsAndLogins', {
    project,
    query: InsightQuery.trends({ series: [InsightSeries.event('signed_up'), InsightSeries.event('logged_in')] }),
  });
  const alert = new Alert(stack, 'Spike', {
    insight,
    name: 'Sign-up spike',
    condition: AlertCondition.RELATIVE_INCREASE,
    threshold: { lower: 5, upper: 50, type: AlertThresholdType.PERCENTAGE },
    calculationInterval: AlertCalculationInterval.HOURLY,
    subscribedUsers: ['1', '2', '2'],
    enabled: false,
    seriesIndex: 1,
    checkOngoingInterval: true,
    skipWeekend: true,
    quietHours: [{ start: '22:00', end: '06:00' }],
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::Alert', {
    ProjectId: '12345',
    InsightId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^SignupsAndLogins'), 'Id'] },
    Name: 'Sign-up spike',
    SubscribedUsers: ['1', '2'],
    Threshold: { Configuration: { Type: 'percentage', Bounds: { Lower: 5, Upper: 50 } } },
    Condition: { Type: 'relative_increase' },
    Enabled: false,
    CalculationInterval: 'hourly',
    Config: '{"type":"TrendsAlertConfig","series_index":1,"check_ongoing_interval":true}',
    SkipWeekend: true,
    ScheduleRestriction: { BlockedWindows: [{ Start: '22:00', End: '06:00' }] },
  });
  t.hasResource('PostHog::ProductAnalytics::Alert', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(alert.alertId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Spike/), 'Id'] });
  expect(stack.resolve(alert.alertInsightShortId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Spike/), 'InsightShortId'] });
  expect(stack.resolve(alert.alertCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Spike/), 'CreatedAt'] });
});

test('defaults and removal policy', () => {
  const { stack, insight } = setup();
  insight.addAlert('Low', { name: 'Low', threshold: { lower: 10 }, removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::Alert', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::ProductAnalytics::Alert'))[0].Properties;
  expect(props).toEqual({
    ProjectId: '12345',
    InsightId: { 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'Id'] },
    Name: 'Low',
    Threshold: { Configuration: { Type: 'absolute', Bounds: { Lower: 10 } } },
    Condition: { Type: 'absolute_value' },
    Config: '{"type":"TrendsAlertConfig","series_index":0}',
  });
});

test('rawConfig replaces the generated config', () => {
  const { stack, insight } = setup();
  insight.addAlert('Raw', { name: 'Raw', threshold: { upper: 1 }, rawConfig: { type: 'TrendsAlertConfig', series_index: 2 } });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Alert', {
    Config: '{"type":"TrendsAlertConfig","series_index":2}',
  });
});

test('validates thresholds, names and quiet hours, skipping tokens', () => {
  const { stack, insight } = setup();
  expect(() => insight.addAlert('NoBounds', { name: 'x', threshold: {} })).toThrow(/set lower, upper or both/);
  expect(() => insight.addAlert('Inverted', { name: 'x', threshold: { lower: 5, upper: 1 } })).toThrow(/must not be greater/);
  expect(() => insight.addAlert('Pct', { name: 'x', threshold: { upper: 5, type: AlertThresholdType.PERCENTAGE } }))
    .toThrow(/percentage threshold requires/);
  expect(() => insight.addAlert('Name', { name: '', threshold: { upper: 1 } })).toThrow(/Alert name/);
  expect(() => insight.addAlert('Series', { name: 'x', threshold: { upper: 1 }, seriesIndex: -1 })).toThrow(/seriesIndex/);
  expect(() => insight.addAlert('Quiet', { name: 'x', threshold: { upper: 1 }, quietHours: [{ start: '25:00', end: '01:00' }] }))
    .toThrow(/quiet hours start/);
  const many = Array.from({ length: 6 }, () => ({ start: '01:00', end: '02:00' }));
  expect(() => insight.addAlert('Many', { name: 'x', threshold: { upper: 1 }, quietHours: many })).toThrow(/at most five/);
  const upper = new CfnParameter(stack, 'Upper', { type: 'Number' });
  expect(() => insight.addAlert('Token', { name: 'x', threshold: { lower: 100, upper: upper.valueAsNumber } })).not.toThrow();
});

test('imports an alert', () => {
  const { stack } = setup();
  expect(Alert.fromAlertId(stack, 'A', 'uuid').alertId).toBe('uuid');
});

test('rejects alerts on insights that are not trends', () => {
  const { stack, project } = setup();
  const funnel = new Insight(stack, 'Funnel', {
    project,
    query: InsightQuery.funnel({ steps: [InsightSeries.event('a'), InsightSeries.event('b')] }),
  });
  expect(() => new Alert(stack, 'A', { insight: funnel, name: 'A', threshold: { lower: 1 } }))
    .toThrow(/alerts only work on trends insights, got a FunnelsQuery/);
});

test('rejects a seriesIndex past the last series', () => {
  const { stack, insight } = setup();
  expect(() => new Alert(stack, 'A', { insight, name: 'A', threshold: { lower: 1 }, seriesIndex: 1 }))
    .toThrow(/seriesIndex: 1 is out of range; the query has 1 series/);
});

test('skips the query checks for imported insights and raw configs', () => {
  const { stack, project } = setup();
  const imported = Insight.fromInsightId(stack, 'Imported', project, '7');
  expect(() => new Alert(stack, 'A', { insight: imported, name: 'A', threshold: { lower: 1 }, seriesIndex: 3 })).not.toThrow();
  const funnel = new Insight(stack, 'Funnel', {
    project,
    query: InsightQuery.funnel({ steps: [InsightSeries.event('a'), InsightSeries.event('b')] }),
  });
  expect(() => new Alert(stack, 'B', { insight: funnel, name: 'B', threshold: { lower: 1 }, rawConfig: { type: 'FunnelsAlertConfig' } }))
    .not.toThrow();
});
