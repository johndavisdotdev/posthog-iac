import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyOperator } from '../../src/core';
import { Project } from '../../src/organizations';
import { Action, Cohort, CohortCountOperator, CohortCriteria, CohortType } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function filtersOf(stack: Stack): any {
  const t = Template.fromStack(stack);
  const props = Object.values(t.findResources('PostHog::ProductAnalytics::Cohort'))[0].Properties;
  return props.Filters;
}

test('renders the README example shape', () => {
  const { stack, project } = setup();
  new Cohort(stack, 'Active', {
    project,
    name: 'Active customers',
    description: 'Company email, active in the last 30 days',
    criteria: CohortCriteria.all(
      CohortCriteria.personProperty({ key: 'email', value: '@example.com', operator: PropertyOperator.ICONTAINS }),
      CohortCriteria.performedEvent('$pageview', { within: Duration.days(30) }),
    ),
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::Cohort', {
    ProjectId: '12345',
    Name: 'Active customers',
    Description: 'Company email, active in the last 30 days',
  });
  t.hasResource('PostHog::ProductAnalytics::Cohort', { DeletionPolicy: 'Delete' });
  expect(JSON.parse(filtersOf(stack))).toEqual({
    properties: {
      type: 'AND',
      values: [{
        type: 'AND',
        values: [
          { key: 'email', operator: 'icontains', type: 'person', value: '@example.com' },
          { key: '$pageview', type: 'behavioral', value: 'performed_event', event_type: 'events', time_value: 30, time_interval: 'day' },
        ],
      }],
    },
  });
});

test('wraps a single condition in a group of groups', () => {
  const { stack, project } = setup();
  new Cohort(stack, 'C', { project, name: 'Pro', criteria: CohortCriteria.personProperty({ key: 'plan', value: 'pro' }) });
  expect(JSON.parse(filtersOf(stack))).toEqual({
    properties: { type: 'AND', values: [{ type: 'AND', values: [{ key: 'plan', operator: 'exact', type: 'person', value: 'pro' }] }] },
  });
});

test('serializes nested groups, behavioral variants, actions and cohort membership', () => {
  const { stack, project } = setup();
  const action = Action.fromActionId(stack, 'Act', project, '55');
  const churned = Cohort.fromCohortId(stack, 'Churned', project, '77');
  const beta = new Cohort(stack, 'Beta', { project, name: 'Beta', isStatic: true });
  new Cohort(stack, 'Power', {
    project,
    name: 'Power users',
    criteria: CohortCriteria.any(
      CohortCriteria.all(
        CohortCriteria.performedEventTimes('export', { count: 5, within: Duration.days(7) }),
        CohortCriteria.didNotPerformEvent('cancel', { eventProperties: [{ key: 'reason', value: 'price' }] }),
      ),
      CohortCriteria.performedEventTimes('login', { count: 1, operator: CohortCountOperator.EXACTLY }),
      CohortCriteria.performedEventForFirstTime('signed_up', { within: Duration.days(14) }),
      CohortCriteria.performedAction(action),
      CohortCriteria.all(CohortCriteria.inCohort(beta), CohortCriteria.notInCohort(churned)),
      CohortCriteria.fromJson({ key: '$pageview', type: 'behavioral', value: 'performed_event_regularly' }),
    ),
  });
  const cohorts = Template.fromStack(stack).findResources('PostHog::ProductAnalytics::Cohort');
  const power = Object.entries(cohorts).find(([k]) => k.startsWith('Power'))![1];
  const rendered = JSON.parse(JSON.stringify(stack.resolve(power.Properties.Filters)));
  // The beta cohort's ID is a token, so Filters is an Fn::Join.
  expect(rendered['Fn::Join']).toBeDefined();
  const joined = (rendered['Fn::Join'][1] as any[]).map(p => (typeof p === 'string' ? p : 'BETA_ID')).join('');
  expect(JSON.parse(joined)).toEqual({
    properties: {
      type: 'OR',
      values: [
        {
          type: 'AND',
          values: [
            { key: 'export', type: 'behavioral', value: 'performed_event_multiple', event_type: 'events', time_value: 7, time_interval: 'day', operator: 'gte', operator_value: 5 },
            {
              key: 'cancel',
              type: 'behavioral',
              value: 'performed_event',
              event_type: 'events',
              time_value: 30,
              time_interval: 'day',
              event_filters: [{ key: 'reason', operator: 'exact', type: 'event', value: 'price' }],
              negation: true,
            },
          ],
        },
        { type: 'OR', values: [{ key: 'login', type: 'behavioral', value: 'performed_event_multiple', event_type: 'events', time_value: 30, time_interval: 'day', operator: 'exact', operator_value: 1 }] },
        { type: 'OR', values: [{ key: 'signed_up', type: 'behavioral', value: 'performed_event_first_time', event_type: 'events', time_value: 14, time_interval: 'day' }] },
        { type: 'OR', values: [{ key: '55', type: 'behavioral', value: 'performed_event', event_type: 'actions', time_value: 30, time_interval: 'day' }] },
        {
          type: 'AND',
          values: [
            { key: 'id', type: 'cohort', value: 'BETA_ID' },
            { key: 'id', type: 'cohort', value: '77', negation: true },
          ],
        },
        { type: 'OR', values: [{ key: '$pageview', type: 'behavioral', value: 'performed_event_regularly' }] },
      ],
    },
  });
});

test('static cohorts, raw filters, raw query and optional props', () => {
  const { stack, project } = setup();
  new Cohort(stack, 'Static', { project, name: 'Static', isStatic: true, cohortType: CohortType.STATIC, removalPolicy: RemovalPolicy.RETAIN });
  new Cohort(stack, 'Raw', { project, name: 'Raw', rawFilters: { properties: { type: 'OR', values: [] } } });
  new Cohort(stack, 'Query', { project, name: 'Query', rawQuery: { kind: 'HogQLQuery', query: 'select 1' }, cohortType: CohortType.ANALYTICAL });
  const t = Template.fromStack(stack);
  const all = Object.values(t.findResources('PostHog::ProductAnalytics::Cohort'));
  expect(all.map(r => r.Properties)).toEqual([
    { ProjectId: '12345', Name: 'Static', IsStatic: true, CohortType: 'static' },
    { ProjectId: '12345', Name: 'Raw', Filters: '{"properties":{"type":"OR","values":[]}}' },
    { ProjectId: '12345', Name: 'Query', Query: '{"kind":"HogQLQuery","query":"select 1"}', CohortType: 'analytical' },
  ]);
  expect(all[0].DeletionPolicy).toBe('Retain');
});

test('validates cohort definitions', () => {
  const { stack, project } = setup();
  const criteria = CohortCriteria.performedEvent('x');
  expect(() => new Cohort(stack, 'A', { project, name: '' })).toThrow(/Cohort name must be between 1 and 400/);
  expect(() => new Cohort(stack, 'B', { project, name: 'b', description: 'd'.repeat(1001) })).toThrow(/description/);
  expect(() => new Cohort(stack, 'C', { project, name: 'c', isStatic: true, criteria })).toThrow(/static cohort can't have criteria/);
  expect(() => new Cohort(stack, 'D', { project, name: 'd', criteria, rawFilters: {} })).toThrow(/at most one of/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new Cohort(stack, 'Token', { project, name: name.valueAsString })).not.toThrow();
});

test('validates criteria', () => {
  expect(() => CohortCriteria.all()).toThrow(/at least one criterion/);
  expect(() => CohortCriteria.any(CohortCriteria.didNotPerformEvent('x'))).toThrow(/negated conditions only/);
  expect(() => CohortCriteria.performedEvent('x', { within: Duration.hours(36) })).toThrow();
  expect(() => CohortCriteria.performedEvent('x', { within: Duration.hours(12) })).toThrow();
  expect(() => CohortCriteria.performedEventTimes('x', { count: -1 })).toThrow(/count/);
  expect(() => CohortCriteria.personProperty({ key: 'plan' })).toThrow(/value is required/);
  expect(() => CohortCriteria.personProperty({ key: 'plan', operator: PropertyOperator.IS_SET })).not.toThrow();
});

test('imports existing cohorts', () => {
  const { stack, project } = setup();
  const c = Cohort.fromCohortId(stack, 'Existing', project, '8');
  expect(c.cohortId).toBe('8');
  expect(c.project).toBe(project);
  const created = new Cohort(stack, 'New', { project, name: 'n' });
  expect(stack.resolve(created.cohortCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^New/), 'CreatedAt'] });
});
