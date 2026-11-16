import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import {
  Dashboard,
  Insight,
  InsightQuery,
  Subscription,
  SubscriptionFrequency,
  SubscriptionTarget,
  Weekday,
} from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  const insight = new Insight(stack, 'Signups', { project, query: InsightQuery.hogql('select 1') });
  return { stack, project, insight };
}

const schedule = {
  frequency: SubscriptionFrequency.WEEKLY,
  startDate: '2026-01-05T09:00:00Z',
};

test('creates an insight subscription to email', () => {
  const { stack, insight } = setup();
  const sub = new Subscription(stack, 'Weekly', {
    insight,
    title: 'Weekly sign-ups',
    target: SubscriptionTarget.email(['growth@example.com', 'ceo@example.com', 'ceo@example.com']),
    frequency: SubscriptionFrequency.MONTHLY,
    interval: 2,
    byweekday: [Weekday.MONDAY, Weekday.MONDAY, Weekday.FRIDAY],
    bysetpos: -1,
    count: 10,
    startDate: new Date(Date.UTC(2026, 0, 5, 9)),
    untilDate: '2027-01-01T00:00:00Z',
    enabled: false,
  });

  const t = Template.fromStack(stack);
  const [logicalId, res] = Object.entries(t.findResources('PostHog::ProductAnalytics::Subscription'))[0];
  expect(res.DeletionPolicy).toBe('Delete');
  expect(res.Properties).toEqual({
    ProjectId: '12345',
    Title: 'Weekly sign-ups',
    Insight: { 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'Id'] },
    TargetType: 'email',
    TargetValue: 'growth@example.com,ceo@example.com',
    Frequency: 'monthly',
    Interval: 2,
    Byweekday: ['monday', 'friday'],
    Bysetpos: -1,
    Count: 10,
    StartDate: '2026-01-05T09:00:00.000Z',
    UntilDate: '2027-01-01T00:00:00Z',
    Enabled: false,
  });
  expect(stack.resolve(sub.subscriptionId)).toEqual({ 'Fn::GetAtt': [logicalId, 'Id'] });
  expect(stack.resolve(sub.subscriptionSummary)).toEqual({ 'Fn::GetAtt': [logicalId, 'Summary'] });
  expect(stack.resolve(sub.subscriptionNextDeliveryDate)).toEqual({ 'Fn::GetAtt': [logicalId, 'NextDeliveryDate'] });
});

test('dashboard subscription with explicit insights to Teams, and removal policy', () => {
  const { stack, project, insight } = setup();
  const dashboard = Dashboard.fromDashboardId(stack, 'Dash', project, '8');
  new Subscription(stack, 'Teams', {
    dashboard,
    dashboardInsights: [insight],
    target: SubscriptionTarget.teams('https://example.webhook.office.com/x'),
    removalPolicy: RemovalPolicy.RETAIN,
    ...schedule,
  });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::Subscription', { DeletionPolicy: 'Retain' });
  t.hasResourceProperties('PostHog::ProductAnalytics::Subscription', {
    Dashboard: '8',
    DashboardExportInsights: [{ 'Fn::GetAtt': [Match.stringLikeRegexp('^Signups'), 'Id'] }],
    TargetType: 'teams',
    TargetValue: 'https://example.webhook.office.com/x',
    StartDate: '2026-01-05T09:00:00Z',
  });
});

test('requires exactly one of insight and dashboard', () => {
  const { stack, project, insight } = setup();
  const target = SubscriptionTarget.email(['a@example.com']);
  expect(() => new Subscription(stack, 'None', { target, ...schedule })).toThrow(/exactly one of insight, dashboard \(got none\)/);
  const dashboard = new Dashboard(stack, 'D', { project, name: 'D' });
  expect(() => new Subscription(stack, 'Both', { insight, dashboard, target, ...schedule })).toThrow(/got insight, dashboard/);
});

test('validates targets, schedules and dashboard insights', () => {
  const { stack, project, insight } = setup();
  const target = SubscriptionTarget.email(['a@example.com']);
  expect(() => SubscriptionTarget.email([])).toThrow(/at least one address/);
  expect(() => SubscriptionTarget.email(['not-an-email'])).toThrow(/not an email address/);
  expect(() => SubscriptionTarget.slack('1', '')).toThrow(/channel/);
  expect(() => SubscriptionTarget.teams('')).toThrow(/webhookUrl/);
  expect(() => insight.addSubscription('Title', { target, ...schedule, title: 'x'.repeat(101) })).toThrow(/title/);
  expect(() => insight.addSubscription('Interval', { target, ...schedule, interval: 0 })).toThrow(/interval/);
  expect(() => new Subscription(stack, 'Extra', { insight, dashboardInsights: [insight], target, ...schedule }))
    .toThrow(/only valid for dashboard/);
  const dashboard = new Dashboard(stack, 'D', { project, name: 'D' });
  const many = Array.from({ length: 21 }, (_, i) => Insight.fromInsightId(stack, `I${i}`, project, `${i}`));
  expect(() => dashboard.addSubscription('Many', { target, ...schedule, dashboardInsights: many })).toThrow(/at most 20/);
  expect(() => SubscriptionTarget.email([new CfnParameter(stack, 'Email', { type: 'String' }).valueAsString])).not.toThrow();
});

test('a dashboard subscription without insights fails synthesis', () => {
  const { stack, project } = setup();
  const dashboard = new Dashboard(stack, 'Empty', { project, name: 'Empty' });
  dashboard.addSubscription('Weekly', { target: SubscriptionTarget.email(['a@example.com']), ...schedule });
  expect(() => Template.fromStack(stack)).toThrow(/needs at least one insight/);
});

test('a dashboard subscription with more than 20 placed insights fails synthesis', () => {
  const { stack, project } = setup();
  const dashboard = new Dashboard(stack, 'Big', { project, name: 'Big' });
  for (let i = 0; i < 21; i++) dashboard.addInsight(`I${i}`, { query: InsightQuery.hogql('select 1') });
  dashboard.addSubscription('Weekly', { target: SubscriptionTarget.email(['a@example.com']), ...schedule });
  expect(() => Template.fromStack(stack)).toThrow(/at most 20 insights/);
});

test('imports a subscription', () => {
  const { stack } = setup();
  expect(Subscription.fromSubscriptionId(stack, 'S', '3').subscriptionId).toBe('3');
});
