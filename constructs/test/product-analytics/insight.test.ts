import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import {
  Action,
  AlertThresholdType,
  AlertCondition,
  Dashboard,
  Insight,
  InsightQuery,
  InsightSeries,
  SubscriptionFrequency,
  SubscriptionTarget,
} from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

const pageviews = InsightQuery.trends({ series: [InsightSeries.event('$pageview')] });

test('creates an insight with a typed query, dashboards and attributes', () => {
  const { stack, project } = setup();
  const dashboard = new Dashboard(stack, 'Dash', { project, name: 'Growth' });
  const action = new Action(stack, 'Signup', { project, name: 'Signed up', steps: [{ event: 'signed_up' }] });
  const insight = new Insight(stack, 'Signups', {
    project,
    name: 'Sign-ups',
    description: 'Daily sign-ups',
    query: InsightQuery.trends({ series: [InsightSeries.action(action)] }),
    dashboards: [dashboard, dashboard],
    tags: ['growth', 'growth'],
    favorited: true,
  });

  const t = Template.fromStack(stack);
  const [logicalId, res] = Object.entries(t.findResources('PostHog::ProductAnalytics::Insight'))[0];
  expect(res.DeletionPolicy).toBe('Delete');
  expect(res.Properties).toEqual({
    ProjectId: '12345',
    Name: 'Sign-ups',
    Description: 'Daily sign-ups',
    Tags: ['growth'],
    Favorited: true,
    Dashboards: [{ 'Fn::GetAtt': [expect.stringMatching(/^Dash/), 'Id'] }],
    Query: {
      'Fn::Join': ['', [
        '{"kind":"InsightVizNode","source":{"kind":"TrendsQuery","series":[{"kind":"ActionsNode","id":',
        { 'Fn::GetAtt': [expect.stringMatching(/^Signup/), 'Id'] },
        ',"math":"total"}],"interval":"day"}}',
      ]],
    },
  });
  expect(logicalId).toMatch(/^Signups/);
  expect(stack.resolve(insight.insightId)).toEqual({ 'Fn::GetAtt': [logicalId, 'Id'] });
  expect(stack.resolve(insight.insightShortId)).toEqual({ 'Fn::GetAtt': [logicalId, 'ShortId'] });
  expect(stack.resolve(insight.insightCreatedAt)).toEqual({ 'Fn::GetAtt': [logicalId, 'CreatedAt'] });
  expect(insight.project).toBe(project);
  expect(insight.query.kind).toBe('TrendsQuery');
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Insight(stack, 'Bare', { project, query: InsightQuery.hogql('select 1'), removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::Insight', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::ProductAnalytics::Insight'))[0].Properties;
  expect(props).toEqual({
    ProjectId: '12345',
    Query: '{"kind":"DataVisualizationNode","source":{"kind":"HogQLQuery","query":"select 1"}}',
  });
});

test('validates names and dashboards, skipping tokens', () => {
  const { stack, project } = setup();
  expect(() => new Insight(stack, 'Long', { project, query: pageviews, name: 'x'.repeat(401) })).toThrow(/Insight name/);
  expect(() => new Insight(stack, 'LongDesc', { project, query: pageviews, description: 'x'.repeat(401) })).toThrow(/Insight description/);
  const other = Dashboard.fromDashboardId(stack, 'Other', Project.fromProjectId(stack, 'P2', '999'), '1');
  expect(() => new Insight(stack, 'Cross', { project, query: pageviews, dashboards: [other] })).toThrow(/different project/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new Insight(stack, 'Token', { project, query: pageviews, name: name.valueAsString })).not.toThrow();
});

test('imports an insight and adds alerts and subscriptions to it', () => {
  const { stack, project } = setup();
  const insight = Insight.fromInsightId(stack, 'Existing', project, '77');
  expect(insight.insightId).toBe('77');
  expect(insight.project).toBe(project);

  const alert = insight.addAlert('Drop', {
    name: 'Sign-ups dropped',
    condition: AlertCondition.RELATIVE_DECREASE,
    threshold: { upper: 20, type: AlertThresholdType.PERCENTAGE },
  });
  expect(alert.node.scope).toBe(insight);
  expect(alert.insight).toBe(insight);

  const sub = insight.addSubscription('Weekly', {
    target: SubscriptionTarget.email(['a@example.com']),
    frequency: SubscriptionFrequency.WEEKLY,
    startDate: '2026-01-05T09:00:00Z',
  });
  expect(sub.node.scope).toBe(insight);

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::Alert', { ProjectId: '12345', InsightId: '77' });
  t.hasResourceProperties('PostHog::ProductAnalytics::Subscription', { ProjectId: '12345', Insight: '77' });
});
