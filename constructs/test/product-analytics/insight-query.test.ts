import { App, CfnParameter, Duration, Stack } from 'aws-cdk-lib';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { Project } from '../../src/organizations';
import {
  Action,
  BreakdownType,
  ChartDisplay,
  FunnelOrder,
  InsightInterval,
  InsightQuery,
  InsightSeries,
  InsightVariable,
  RetentionPeriod,
  RetentionType,
  SeriesMath,
} from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('trends query renders an InsightVizNode wrapping a TrendsQuery', () => {
  const { stack, project } = setup();
  const signup = Action.fromActionId(stack, 'Signup', project, '42');
  const query = InsightQuery.trends({
    series: [
      InsightSeries.event('$pageview', {
        math: SeriesMath.DAU,
        properties: [{ key: '$browser', value: 'Chrome' }],
      }),
      InsightSeries.action(signup, { customName: 'Sign-ups' }),
      InsightSeries.event('purchase', { math: SeriesMath.SUM, mathProperty: 'revenue' }),
    ],
    interval: InsightInterval.WEEK,
    dateRange: { from: '-90d', to: '-1d' },
    breakdown: { property: '$geoip_country_code', limit: 10 },
    display: ChartDisplay.BAR,
    formula: 'B / A',
    compare: true,
    properties: [{ key: 'email', operator: PropertyOperator.IS_SET, type: PropertyFilterType.PERSON }],
    filterTestAccounts: true,
  });

  expect(query.kind).toBe('TrendsQuery');
  expect(query.toJson()).toEqual({
    kind: 'InsightVizNode',
    source: {
      kind: 'TrendsQuery',
      series: [
        {
          kind: 'EventsNode',
          event: '$pageview',
          name: '$pageview',
          math: 'dau',
          properties: [{ key: '$browser', operator: 'exact', type: 'event', value: 'Chrome' }],
        },
        { kind: 'ActionsNode', id: 42, math: 'total', custom_name: 'Sign-ups' },
        { kind: 'EventsNode', event: 'purchase', name: 'purchase', math: 'sum', math_property: 'revenue' },
      ],
      interval: 'week',
      dateRange: { date_from: '-90d', date_to: '-1d' },
      breakdownFilter: { breakdown: '$geoip_country_code', breakdown_type: 'event', breakdown_limit: 10 },
      properties: [{ key: 'email', operator: 'is_set', type: 'person' }],
      filterTestAccounts: true,
      trendsFilter: { display: 'ActionsBar', formula: 'B / A' },
      compareFilter: { compare: true },
    },
  });
  expect(query.toSourceJson()).toBe(query.toJson().source);
});

test('trends query defaults', () => {
  const query = InsightQuery.trends({ series: [InsightSeries.allEvents()] });
  expect(query.toJson()).toEqual({
    kind: 'InsightVizNode',
    source: {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: null, name: 'All events', math: 'total' }],
      interval: 'day',
    },
  });
});

test('funnel query renders a FunnelsQuery with conversion window', () => {
  const query = InsightQuery.funnel({
    steps: [InsightSeries.event('$pageview', { math: SeriesMath.DAU }), InsightSeries.event('signed_up')],
    conversionWindow: Duration.days(7),
    order: FunnelOrder.STRICT,
    breakdown: { property: 'company', type: BreakdownType.GROUP, groupTypeIndex: 0 },
  });
  expect(query.toJson()).toEqual({
    kind: 'InsightVizNode',
    source: {
      kind: 'FunnelsQuery',
      series: [
        { kind: 'EventsNode', event: '$pageview', name: '$pageview' },
        { kind: 'EventsNode', event: 'signed_up', name: 'signed_up' },
      ],
      breakdownFilter: { breakdown: 'company', breakdown_type: 'group', breakdown_group_type_index: 0 },
      funnelsFilter: { funnelOrderType: 'strict', funnelWindowInterval: 1, funnelWindowIntervalUnit: 'week' },
    },
  });
});

test.each([
  [Duration.days(14), 2, 'week'],
  [Duration.days(3), 3, 'day'],
  [Duration.hours(36), 36, 'hour'],
  [Duration.minutes(90), 90, 'minute'],
  [Duration.seconds(45), 45, 'second'],
])('funnel conversion window %s', (window, interval, unit) => {
  const query = InsightQuery.funnel({ steps: [InsightSeries.event('a'), InsightSeries.event('b')], conversionWindow: window });
  expect(query.toSourceJson().funnelsFilter).toEqual({ funnelWindowInterval: interval, funnelWindowIntervalUnit: unit });
});

test('retention query renders a RetentionQuery', () => {
  const { stack, project } = setup();
  const action = Action.fromActionId(stack, 'Active', project, '7');
  const query = InsightQuery.retention({
    targetEntity: InsightSeries.event('signed_up'),
    returningEntity: InsightSeries.action(action),
    period: RetentionPeriod.WEEK,
    totalIntervals: 12,
    retentionType: RetentionType.RECURRING,
  });
  expect(query.toJson()).toEqual({
    kind: 'InsightVizNode',
    source: {
      kind: 'RetentionQuery',
      retentionFilter: {
        targetEntity: { kind: 'EventsNode', type: 'events', id: 'signed_up', name: 'signed_up' },
        returningEntity: { kind: 'ActionsNode', type: 'actions', id: 7 },
        period: 'Week',
        retentionType: 'retention_recurring',
        totalIntervals: 12,
      },
    },
  });
});

test('retention returning entity defaults to the target entity', () => {
  const query = InsightQuery.retention({ targetEntity: InsightSeries.event('$pageview') });
  const filter = query.toSourceJson().retentionFilter;
  expect(filter.returningEntity).toEqual(filter.targetEntity);
  expect(filter.period).toBe('Day');
  expect(filter.retentionType).toBe('retention_first_time');
});

test('hogql query renders a DataVisualizationNode or DataTableNode', () => {
  expect(InsightQuery.hogql('select 1', { display: ChartDisplay.NUMBER }).toJson()).toEqual({
    kind: 'DataVisualizationNode',
    source: { kind: 'HogQLQuery', query: 'select 1' },
    display: 'BoldNumber',
  });
  const table = InsightQuery.hogql('select event from events', { dataTable: true });
  expect(table.toJson()).toEqual({ kind: 'DataTableNode', source: { kind: 'HogQLQuery', query: 'select event from events' } });
  expect(table.kind).toBe('HogQLQuery');
});

test('hogql query references SQL variables by ID', () => {
  const { stack, project } = setup();
  const v = InsightVariable.fromInsightVariableAttributes(stack, 'V', { project, variableId: 'uuid-1', codeName: 'country' });
  expect(InsightQuery.hogql('select {variables.country}', { variables: [v] }).toSourceJson().variables).toEqual({
    'uuid-1': { variableId: 'uuid-1', code_name: 'country' },
  });
});

test('fromJson passes raw queries through', () => {
  const raw = { kind: 'InsightVizNode', source: { kind: 'LifecycleQuery', series: [] } };
  const query = InsightQuery.fromJson(raw);
  expect(query.toJson()).toBe(raw);
  expect(query.kind).toBe('LifecycleQuery');
  expect(InsightQuery.fromJson({ kind: 'HogQLQuery', query: 'select 1' }).kind).toBe('HogQLQuery');
});

test('action IDs that are tokens render as unquoted numbers', () => {
  const { stack, project } = setup();
  const param = new CfnParameter(stack, 'ActionId', { type: 'String' });
  const action = Action.fromActionId(stack, 'A', project, param.valueAsString);
  const json = stack.resolve(stack.toJsonString(InsightQuery.trends({ series: [InsightSeries.action(action)] }).toJson()));
  expect(json).toEqual({
    'Fn::Join': ['', [expect.stringContaining('"id":'), { Ref: 'ActionId' }, expect.stringMatching(/^,"math"/)]],
  });
});

test('validates queries', () => {
  const { stack, project } = setup();
  expect(() => InsightQuery.trends({ series: [] })).toThrow(/at least one series/);
  expect(() => InsightQuery.funnel({ steps: [InsightSeries.event('a')] })).toThrow(/at least two steps/);
  expect(() => InsightQuery.funnel({ steps: [InsightSeries.event('a'), InsightSeries.event('b')], conversionWindow: Duration.millis(1500) }))
    .toThrow(/whole number of seconds/);
  expect(() => InsightQuery.retention({ targetEntity: InsightSeries.event('a'), totalIntervals: 0 })).toThrow(/totalIntervals/);
  expect(() => InsightQuery.hogql(' ')).toThrow(/must not be empty/);
  expect(() => InsightQuery.hogql('select 1', { dataTable: true, display: ChartDisplay.LINE })).toThrow(/display/);
  expect(() => InsightQuery.fromJson({ source: {} })).toThrow(/kind/);
  expect(() => InsightSeries.event('')).toThrow(/must not be empty/);
  expect(() => InsightSeries.event('x', { math: SeriesMath.P90 })).toThrow(/requires mathProperty/);
  expect(() => InsightQuery.trends({ series: [InsightSeries.event('x')], breakdown: { property: 'c', type: BreakdownType.GROUP } }))
    .toThrow(/groupTypeIndex/);
  const bad = Action.fromActionId(stack, 'Bad', project, 'abc');
  expect(() => InsightQuery.trends({ series: [InsightSeries.action(bad)] })).toThrow(/numeric PostHog ID/);
});
