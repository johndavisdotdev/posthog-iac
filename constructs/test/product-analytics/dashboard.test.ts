import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType } from '../../src/core';
import { Project } from '../../src/organizations';
import {
  Dashboard,
  GroupDisplay,
  InsightInterval,
  InsightQuery,
  InsightSeries,
  LayoutCompaction,
  SubscriptionFrequency,
  SubscriptionTarget,
  TileSpacing,
} from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a dashboard with typed filters', () => {
  const { stack, project } = setup();
  const dashboard = new Dashboard(stack, 'Growth', {
    project,
    name: 'Growth',
    description: 'Growth metrics',
    pinned: true,
    tags: ['growth', 'growth'],
    filters: {
      dateFrom: '-30d',
      interval: InsightInterval.WEEK,
      properties: [{ key: 'plan', value: 'pro', type: PropertyFilterType.PERSON }],
      breakdown: { property: '$browser' },
      filterTestAccounts: true,
      compareTo: '-1y',
    },
    rawFilters: { date_to: '-1d' },
    tileSpacing: TileSpacing.CONDENSED,
    layoutCompaction: LayoutCompaction.STABLE,
    groupDisplay: GroupDisplay.TABS,
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::Dashboard', {
    ProjectId: '12345',
    Name: 'Growth',
    Description: 'Growth metrics',
    Pinned: true,
    Tags: ['growth'],
    Filters: JSON.stringify({
      date_from: '-30d',
      interval: 'week',
      properties: [{ key: 'plan', operator: 'exact', type: 'person', value: 'pro' }],
      breakdown_filter: { breakdown: '$browser', breakdown_type: 'event' },
      filterTestAccounts: true,
      compareFilter: { compare: true, compare_to: '-1y' },
      date_to: '-1d',
    }),
    GridSpacing: 'condensed',
    LayoutCompaction: 'stable',
    GroupDisplay: 'tabs',
  });
  t.hasResource('PostHog::ProductAnalytics::Dashboard', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(dashboard.dashboardId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Growth/), 'Id'] });
  expect(stack.resolve(dashboard.dashboardCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Growth/), 'CreatedAt'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Dashboard(stack, 'Bare', { project, name: 'Bare', filters: {}, removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::Dashboard', { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources('PostHog::ProductAnalytics::Dashboard'))[0].Properties).toEqual({ ProjectId: '12345', Name: 'Bare' });
});

test('validates names and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new Dashboard(stack, 'Empty', { project, name: '' })).toThrow(/Dashboard name must be between 1 and 400/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new Dashboard(stack, 'Token', { project, name: name.valueAsString })).not.toThrow();
});

test('dashboard.addInsight places the insight on the dashboard', () => {
  const { stack, project } = setup();
  const dashboard = new Dashboard(stack, 'Growth', { project, name: 'Growth' });
  const other = Dashboard.fromDashboardId(stack, 'Other', project, '5');
  const insight = dashboard.addInsight('Pageviews', {
    name: 'Pageviews',
    query: InsightQuery.trends({ series: [InsightSeries.event('$pageview')] }),
    dashboards: [other],
  });
  expect(insight.node.scope).toBe(dashboard);
  expect(insight.project).toBe(project);
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Insight', {
    ProjectId: '12345',
    Name: 'Pageviews',
    Dashboards: [{ 'Fn::GetAtt': [Match.stringLikeRegexp('^Growth'), 'Id'] }, '5'],
  });
});

test('dashboard.addSubscription delivers the dashboard and its insights', () => {
  const { stack, project } = setup();
  const dashboard = new Dashboard(stack, 'Growth', { project, name: 'Growth' });
  const sub = dashboard.addSubscription('Weekly', {
    target: SubscriptionTarget.slack('9', '#growth'),
    frequency: SubscriptionFrequency.WEEKLY,
    startDate: new Date('2026-01-05T09:00:00Z'),
  });
  // Added after the subscription: still included.
  dashboard.addInsight('A', { query: InsightQuery.hogql('select 1') });
  expect(sub.node.scope).toBe(dashboard);
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Subscription', {
    ProjectId: '12345',
    Dashboard: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Growth'), 'Id'] },
    DashboardExportInsights: [{ 'Fn::GetAtt': [Match.stringLikeRegexp('^GrowthA'), 'Id'] }],
    TargetType: 'slack',
    TargetValue: '#growth',
    IntegrationId: '9',
    StartDate: '2026-01-05T09:00:00.000Z',
  });
});

test('imported dashboards support addInsight', () => {
  const { stack, project } = setup();
  const dashboard = Dashboard.fromDashboardId(stack, 'Existing', project, '33');
  expect(dashboard.dashboardId).toBe('33');
  dashboard.addInsight('I', { query: InsightQuery.hogql('select 1') });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Insight', { Dashboards: ['33'] });
});
