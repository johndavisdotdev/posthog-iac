import { App, Duration, Stack } from 'aws-cdk-lib';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { ExperimentMetric, FunnelOrder, MetricGoal, MetricMath } from '../../src/experiments';
import { Project } from '../../src/organizations';
import { Action } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('mean metric serialization', () => {
  const metric = ExperimentMetric.mean({
    name: 'Revenue',
    event: 'purchase',
    math: MetricMath.SUM,
    mathProperty: 'amount',
    properties: [{ key: 'currency', value: 'USD' }],
    goal: MetricGoal.INCREASE,
    conversionWindow: Duration.days(14),
    upperBoundPercentile: 0.99,
    uuid: 'revenue-1',
  });
  expect(metric.render()).toEqual({
    kind: 'ExperimentMetric',
    metric_type: 'mean',
    uuid: 'revenue-1',
    name: 'Revenue',
    goal: 'increase',
    conversion_window: 14,
    conversion_window_unit: 'day',
    source: {
      kind: 'EventsNode',
      event: 'purchase',
      math: 'sum',
      math_property: 'amount',
      properties: [{ key: 'currency', operator: 'exact', type: 'event', value: 'USD' }],
    },
    upper_bound_percentile: 0.99,
  });
});

test('minimal mean metric leaves optional keys out', () => {
  expect(ExperimentMetric.mean({ event: '$pageview' }).render()).toEqual({
    kind: 'ExperimentMetric',
    metric_type: 'mean',
    source: { kind: 'EventsNode', event: '$pageview' },
  });
});

test('mean metric on an action renders a numeric ActionsNode id', () => {
  const { stack, project } = setup();
  const imported = Action.fromActionId(stack, 'Imported', project, '42');
  expect(ExperimentMetric.mean({ action: imported, math: MetricMath.DAU }).render().source)
    .toEqual({ kind: 'ActionsNode', id: 42, math: 'dau' });

  const created = new Action(stack, 'Created', { project, name: 'Signed up' });
  const json = stack.resolve(stack.toJsonString(ExperimentMetric.mean({ action: created }).render()));
  expect(json).toEqual({
    'Fn::Join': ['', [
      '{"kind":"ExperimentMetric","metric_type":"mean","source":{"kind":"ActionsNode","id":',
      { 'Fn::GetAtt': [expect.stringMatching(/^Created/), 'Id'] },
      '}}',
    ]],
  });
});

test('funnel metric serialization', () => {
  const metric = ExperimentMetric.funnel({
    name: 'Sign-up funnel',
    steps: [
      { event: '$pageview', properties: [{ key: '$current_url', value: '/signup', operator: PropertyOperator.ICONTAINS }] },
      { event: 'signed_up' },
    ],
    orderType: FunnelOrder.UNORDERED,
    conversionWindow: Duration.hours(36),
  });
  expect(metric.render()).toEqual({
    kind: 'ExperimentMetric',
    metric_type: 'funnel',
    name: 'Sign-up funnel',
    conversion_window: 36,
    conversion_window_unit: 'hour',
    series: [
      { kind: 'EventsNode', event: '$pageview', properties: [{ key: '$current_url', operator: 'icontains', type: 'event', value: '/signup' }] },
      { kind: 'EventsNode', event: 'signed_up' },
    ],
    funnel_order_type: 'unordered',
  });
});

test('ratio metric serialization', () => {
  const metric = ExperimentMetric.ratio({
    name: 'Revenue per order',
    numerator: { event: 'purchase', math: MetricMath.SUM, mathProperty: 'amount' },
    denominator: { event: 'purchase' },
    goal: MetricGoal.DECREASE,
    conversionWindow: Duration.seconds(90),
  });
  expect(metric.render()).toEqual({
    kind: 'ExperimentMetric',
    metric_type: 'ratio',
    name: 'Revenue per order',
    goal: 'decrease',
    conversion_window: 90,
    conversion_window_unit: 'second',
    numerator: { kind: 'EventsNode', event: 'purchase', math: 'sum', math_property: 'amount' },
    denominator: { kind: 'EventsNode', event: 'purchase' },
  });
});

test('fromJson passes raw metrics through and defaults kind', () => {
  const raw = { metric_type: 'quantile', quantile: 0.9, source: { kind: 'EventsNode', event: 'load', math_property: 'ms' } };
  expect(ExperimentMetric.fromJson(raw).render()).toEqual({ kind: 'ExperimentMetric', ...raw });
  expect(() => ExperimentMetric.fromJson({ kind: 'ExperimentTrendsQuery', metric_type: 'mean' })).toThrow(/kind must be 'ExperimentMetric'/);
  expect(() => ExperimentMetric.fromJson({ kind: 'ExperimentMetric' })).toThrow(/metric_type is required/);
});

test('validates metric sources', () => {
  const { stack, project } = setup();
  const action = Action.fromActionId(stack, 'A', project, '1');
  expect(() => ExperimentMetric.mean({})).toThrow(/exactly one of event, action/);
  expect(() => ExperimentMetric.mean({ event: 'x', action })).toThrow(/exactly one of event, action/);
  expect(() => ExperimentMetric.mean({ event: 'x', math: MetricMath.AVG })).toThrow(/mathProperty is required/);
  expect(() => ExperimentMetric.mean({ event: 'x', math: MetricMath.HOGQL })).toThrow(/mathHogql is required/);
  expect(() => ExperimentMetric.mean({ event: 'x', math: MetricMath.UNIQUE_GROUP })).toThrow(/mathGroupTypeIndex is required/);
  expect(() => ExperimentMetric.mean({ event: 'x', math: MetricMath.UNIQUE_GROUP, mathGroupTypeIndex: 5 })).toThrow(/between 0 and 4/);
  expect(() => ExperimentMetric.mean({ event: 'x', lowerBoundPercentile: 1.5 })).toThrow(/between 0 and 1/);
  expect(() => ExperimentMetric.mean({ event: 'x', lowerBoundPercentile: 0.9, upperBoundPercentile: 0.1 })).toThrow(/less than/);
  expect(() => ExperimentMetric.mean({ event: 'x', conversionWindow: Duration.millis(1500) })).toThrow(/whole number of seconds/);
  expect(() => ExperimentMetric.funnel({ steps: [] })).toThrow(/at least one step/);
  expect(() => ExperimentMetric.ratio({ numerator: { event: 'a' }, denominator: {} })).toThrow(/denominator/);
  expect(() => ExperimentMetric.mean({ action: Action.fromActionId(stack, 'B', project, 'abc') })).toThrow(/not a numeric PostHog ID/);
  expect(() => ExperimentMetric.mean({ event: 'x', properties: [{ key: 'p', type: PropertyFilterType.PERSON }] })).toThrow(/value is required/);
});
