import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import * as patterns from '../../src/patterns';
import {
  AlertCalculationInterval,
  AlertCondition,
  AlertThresholdType,
  AnnotationCreationType,
  InsightInterval,
  InsightQuery,
  InsightSeries,
  SubscriptionFrequency,
  SubscriptionTarget,
} from '../../src/product-analytics';

const { MonitoredDashboard } = patterns;

const signups = InsightQuery.trends({ series: [InsightSeries.event('signed_up')] });
const funnel = InsightQuery.funnel({ steps: [InsightSeries.event('signed_up'), InsightSeries.event('purchased')] });

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function getAtt(t: Template, type: string, pattern: RegExp): string {
  const ids = Object.keys(t.findResources(type)).filter(id => pattern.test(id));
  expect(ids).toHaveLength(1);
  return ids[0];
}

test('creates the dashboard, insights in order, alerts and a subscription', () => {
  const { stack, project } = setup();
  const kpis = new MonitoredDashboard(stack, 'Kpis', {
    project,
    name: 'Growth KPIs',
    description: 'Weekly growth',
    pinned: true,
    tags: ['growth'],
    filters: { dateFrom: '-30d', interval: InsightInterval.WEEK },
    insights: [
      {
        name: 'Daily sign-ups',
        description: 'New accounts',
        query: signups,
        alert: {
          lower: 10,
          upper: 500,
          calculationInterval: AlertCalculationInterval.DAILY,
          subscribedUsers: ['7'],
        },
      },
      { name: 'Activation funnel', query: funnel },
      {
        name: 'Sign-up growth',
        query: signups,
        alert: {
          name: 'Growth drop',
          lower: 20,
          condition: AlertCondition.RELATIVE_DECREASE,
          thresholdType: AlertThresholdType.PERCENTAGE,
        },
      },
    ],
    subscription: {
      target: SubscriptionTarget.email(['team@example.com']),
      frequency: SubscriptionFrequency.WEEKLY,
      startDate: '2026-01-05T09:00:00Z',
      title: 'Weekly KPIs',
    },
  });

  expect(kpis.insights.map(i => i.node.id)).toEqual(['InsightDailySignUps', 'InsightActivationFunnel', 'InsightSignUpGrowth']);
  expect(kpis.alerts).toHaveLength(2);
  expect(kpis.insight('Activation funnel')).toBe(kpis.insights[1]);
  expect(kpis.alertFor('Activation funnel')).toBeUndefined();
  expect(kpis.alertFor('Daily sign-ups')).toBe(kpis.alerts[0]);
  expect(kpis.subscription).toBeDefined();

  const t = Template.fromStack(stack);
  t.resourceCountIs('PostHog::ProductAnalytics::Dashboard', 1);
  t.resourceCountIs('PostHog::ProductAnalytics::Insight', 3);
  t.resourceCountIs('PostHog::ProductAnalytics::Alert', 2);
  t.resourceCountIs('PostHog::ProductAnalytics::Subscription', 1);

  const dashboardId = getAtt(t, 'PostHog::ProductAnalytics::Dashboard', /^KpisDashboard/);
  t.hasResourceProperties('PostHog::ProductAnalytics::Dashboard', {
    ProjectId: '12345',
    Name: 'Growth KPIs',
    Description: 'Weekly growth',
    Pinned: true,
    Tags: ['growth'],
    Filters: Match.serializedJson(Match.objectLike({ date_from: '-30d', interval: 'week' })),
  });

  // Every insight is on the dashboard.
  const insights = t.findResources('PostHog::ProductAnalytics::Insight');
  for (const insight of Object.values(insights)) {
    expect((insight as any).Properties.Dashboards).toEqual([{ 'Fn::GetAtt': [dashboardId, 'Id'] }]);
  }
  t.hasResourceProperties('PostHog::ProductAnalytics::Insight', { Name: 'Daily sign-ups', Description: 'New accounts' });

  // Alerts reference their own insight.
  const dailyId = getAtt(t, 'PostHog::ProductAnalytics::Insight', /InsightDailySignUps/);
  const growthId = getAtt(t, 'PostHog::ProductAnalytics::Insight', /InsightSignUpGrowth/);
  t.hasResourceProperties('PostHog::ProductAnalytics::Alert', {
    ProjectId: '12345',
    InsightId: { 'Fn::GetAtt': [dailyId, 'Id'] },
    Name: 'Daily sign-ups alert',
    Threshold: { Configuration: { Type: 'absolute', Bounds: { Lower: 10, Upper: 500 } } },
    Condition: { Type: 'absolute_value' },
    CalculationInterval: 'daily',
    SubscribedUsers: ['7'],
  });
  t.hasResourceProperties('PostHog::ProductAnalytics::Alert', {
    InsightId: { 'Fn::GetAtt': [growthId, 'Id'] },
    Name: 'Growth drop',
    Threshold: { Configuration: { Type: 'percentage', Bounds: { Lower: 20 } } },
    Condition: { Type: 'relative_decrease' },
  });

  // The subscription delivers the whole dashboard with every insight.
  const subscription = Object.values(t.findResources('PostHog::ProductAnalytics::Subscription'))[0] as any;
  expect(subscription.Properties).toMatchObject({
    ProjectId: '12345',
    Dashboard: { 'Fn::GetAtt': [dashboardId, 'Id'] },
    TargetType: 'email',
    TargetValue: 'team@example.com',
    Frequency: 'weekly',
    Title: 'Weekly KPIs',
  });
  expect(subscription.Properties.Insight).toBeUndefined();
  expect(subscription.Properties.DashboardExportInsights).toHaveLength(3);
});

test('optional parts are left out', () => {
  const { stack, project } = setup();
  const kpis = new MonitoredDashboard(stack, 'Kpis', { project, name: 'Minimal', insights: [{ name: 'Funnel', query: funnel }] });
  expect(kpis.alerts).toEqual([]);
  expect(kpis.subscription).toBeUndefined();

  const t = Template.fromStack(stack);
  t.resourceCountIs('PostHog::ProductAnalytics::Alert', 0);
  t.resourceCountIs('PostHog::ProductAnalytics::Subscription', 0);
  t.hasResourceProperties('PostHog::ProductAnalytics::Dashboard', {
    Name: 'Minimal',
    Description: Match.absent(),
    Pinned: Match.absent(),
    Filters: Match.absent(),
  });
});

test('annotateRelease creates an annotation scoped to the dashboard', () => {
  const { stack, project } = setup();
  const kpis = new MonitoredDashboard(stack, 'Kpis', { project, name: 'KPIs', insights: [{ name: 'Sign-ups', query: signups }] });
  const a = kpis.annotateRelease('V23', new Date('2026-05-01T12:00:00Z'), 'Released v2.3');
  kpis.annotateRelease('V24', '2026-06-01T12:00:00Z', 'Released v2.4', { emoji: '🚀', creationType: AnnotationCreationType.GIT });
  expect(a.node.scope).toBe(kpis);

  const t = Template.fromStack(stack);
  const dashboardId = getAtt(t, 'PostHog::ProductAnalytics::Dashboard', /^KpisDashboard/);
  t.hasResourceProperties('PostHog::ProductAnalytics::Annotation', {
    ProjectId: '12345',
    Content: 'Released v2.3',
    DateMarker: '2026-05-01T12:00:00.000Z',
    Scope: 'dashboard',
    DashboardId: { 'Fn::GetAtt': [dashboardId, 'Id'] },
  });
  t.hasResourceProperties('PostHog::ProductAnalytics::Annotation', {
    Content: 'Released v2.4',
    DateMarker: '2026-06-01T12:00:00Z',
    Scope: 'dashboard',
    Emoji: '🚀',
    CreationType: 'GIT',
  });
});

test('alertFor and insight throw on an unknown name', () => {
  const { stack, project } = setup();
  const kpis = new MonitoredDashboard(stack, 'Kpis', { project, name: 'KPIs', insights: [{ name: 'Sign-ups', query: signups }] });
  expect(() => kpis.insight('Nope')).toThrow(/no insight named 'Nope'/);
  expect(() => kpis.alertFor('Nope')).toThrow(/no insight named 'Nope'/);
});

describe('validation', () => {
  function make(props: Partial<patterns.MonitoredDashboardProps>) {
    const { stack, project } = setup();
    return () => new MonitoredDashboard(stack, 'Kpis', { project, name: 'KPIs', insights: [], ...props });
  }

  test('requires at least one insight', () => {
    expect(make({ insights: [] })).toThrow(/at least one insight/);
  });

  test('rejects duplicate insight names', () => {
    expect(make({ insights: [{ name: 'A', query: signups }, { name: 'A', query: funnel }] })).toThrow(/duplicate insight name 'A'/);
  });

  test('rejects names that map to the same construct ID', () => {
    expect(make({ insights: [{ name: 'Sign ups', query: signups }, { name: 'sign-ups', query: funnel }] }))
      .toThrow(/map to the same construct ID 'InsightSignUps'/);
  });

  test('rejects empty insight names', () => {
    expect(make({ insights: [{ name: ' ', query: signups }] })).toThrow(/must not be empty/);
  });

  test('rejects alerts on non-trends insights', () => {
    expect(make({ insights: [{ name: 'Funnel', query: funnel, alert: { lower: 1 } }] }))
      .toThrow(/alerts only work on trends insights, got a FunnelsQuery/);
    expect(make({ insights: [{ name: 'SQL', query: InsightQuery.hogql('select 1'), alert: { upper: 1 } }] }))
      .toThrow(/got a HogQLQuery/);
  });

  test('accepts alerts on raw trends queries', () => {
    const raw = InsightQuery.fromJson({ kind: 'InsightVizNode', source: { kind: 'TrendsQuery', series: [] } });
    expect(make({ insights: [{ name: 'Raw', query: raw, alert: { upper: 1 } }] })).not.toThrow();
  });

  test('rejects an out-of-range series index', () => {
    expect(make({ insights: [{ name: 'S', query: signups, alert: { upper: 1, seriesIndex: 1 } }] }))
      .toThrow(/seriesIndex: 1 is out of range; the query has 1 series/);
    expect(make({ insights: [{ name: 'S', query: signups, alert: { upper: 1, seriesIndex: -1 } }] })).toThrow(/seriesIndex/);
  });

  test('passes threshold errors from the Alert L2 through', () => {
    expect(make({ insights: [{ name: 'S', query: signups, alert: {} }] })).toThrow(/set lower, upper or both/);
    expect(make({ insights: [{ name: 'S', query: signups, alert: { lower: 5, upper: 1 } }] })).toThrow(/must not be greater/);
    expect(make({ insights: [{ name: 'S', query: signups, alert: { upper: 5, thresholdType: AlertThresholdType.PERCENTAGE } }] }))
      .toThrow(/percentage threshold requires/);
  });

  test('a subscription delivers at most 20 insights', () => {
    const insights = Array.from({ length: 21 }, (_, i) => ({ name: `KPI ${i}`, query: signups }));
    const subscription = {
      target: SubscriptionTarget.email(['team@example.com']),
      frequency: SubscriptionFrequency.DAILY,
      startDate: '2026-01-01T09:00:00Z',
    };
    expect(make({ insights, subscription })).toThrow(/at most 20 dashboardInsights, got 21/);
    expect(make({ insights })).not.toThrow();
  });
});
