import { App, CfnParameter, Duration, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { ExperimentMetric, Holdout, MetricMath, SavedMetric } from '../../src/experiments';
import { EarlyAccessStage } from '../../src/feature-flags';
import { IProject, Project } from '../../src/organizations';
import { FeatureExperiment, FeatureExperimentProps } from '../../src/patterns';
import { Cohort } from '../../src/product-analytics';

const FLAG = 'PostHog::FeatureFlags::FeatureFlag';
const EXPERIMENT = 'PostHog::Experiments::Experiment';
const DASHBOARD = 'PostHog::ProductAnalytics::Dashboard';
const INSIGHT = 'PostHog::ProductAnalytics::Insight';
const EAF = 'PostHog::FeatureFlags::EarlyAccessFeature';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

const VARIANTS = [
  { key: 'control', rolloutPercentage: 50 },
  { key: 'test', rolloutPercentage: 50, name: 'One-page checkout' },
];

const PURCHASE = ExperimentMetric.mean({ name: 'Purchases', event: 'purchase' });

function base(project: IProject, overrides: Partial<FeatureExperimentProps> = {}): FeatureExperimentProps {
  return {
    project,
    name: 'Checkout test',
    featureFlagKey: 'new-checkout',
    variants: VARIANTS,
    metrics: [PURCHASE],
    ...overrides,
  };
}

function resources(t: Template, type: string): [string, any][] {
  return Object.entries(t.findResources(type));
}

function one(t: Template, type: string): [string, any] {
  const all = resources(t, type);
  expect(all).toHaveLength(1);
  return all[0];
}

/** Resolves an Fn::Join of a JSON string with refs replaced by `<logicalId>`. */
function json(value: any): any {
  if (typeof value === 'string') return JSON.parse(value);
  const [delim, parts] = value['Fn::Join'];
  return JSON.parse(parts.map((p: any) => {
    if (typeof p === 'string') return p;
    if (p.Ref) return `<${p.Ref}>`;
    if (p['Fn::GetAtt']) return `<${p['Fn::GetAtt'].join('.')}>`;
    return '<?>';
  }).join(delim));
}

function insightQueries(t: Template): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [, r] of resources(t, INSIGHT)) out[r.Properties.Name] = json(r.Properties.Query);
  return out;
}

test('creates the flag, the experiment linked to it, and a results dashboard', () => {
  const { stack, project } = setup();
  const exp = new FeatureExperiment(stack, 'Checkout', base(project, {
    description: 'One-page checkout increases purchases',
    secondaryMetrics: [ExperimentMetric.mean({ event: 'refund', math: MetricMath.SUM, mathProperty: 'amount' })],
  }));
  const t = Template.fromStack(stack);

  const [flagId, flag] = one(t, FLAG);
  expect(flag.Properties.Key).toBe('new-checkout');
  expect(flag.Properties.Name).toBe('One-page checkout increases purchases');
  expect(json(flag.Properties.Filters)).toEqual({
    groups: [{ properties: [], rollout_percentage: 100 }],
    multivariate: {
      variants: [
        { key: 'control', rollout_percentage: 50 },
        { key: 'test', name: 'One-page checkout', rollout_percentage: 50 },
      ],
    },
  });

  const [, experiment] = one(t, EXPERIMENT);
  expect(experiment.Properties.FeatureFlagKey).toBe('new-checkout');
  expect(experiment.Properties.FeatureFlag).toBeUndefined();
  expect(experiment.Properties.Parameters).toBeUndefined();
  expect(experiment.DependsOn).toContain(flagId);
  expect(json(experiment.Properties.Metrics)).toEqual([PURCHASE.render()]);
  expect(json(experiment.Properties.MetricsSecondary)).toHaveLength(1);

  const [dashboardId, dashboard] = one(t, DASHBOARD);
  expect(dashboard.Properties.Name).toBe('Checkout test results');
  const insights = resources(t, INSIGHT);
  expect(insights).toHaveLength(3);
  for (const [, insight] of insights) {
    expect(insight.Properties.Dashboards).toEqual([{ 'Fn::GetAtt': [dashboardId, 'Id'] }]);
  }

  expect(exp.featureFlag.flagKey).toBe('new-checkout');
  expect(exp.experiment.featureFlagKey).toBe('new-checkout');
  expect(exp.dashboard).toBeDefined();
  expect(exp.insights).toHaveLength(3);
  expect(exp.earlyAccessFeature).toBeUndefined();
});

test('derives insights from each metric kind, broken down by variant', () => {
  const { stack, project } = setup();
  new FeatureExperiment(stack, 'Checkout', base(project, {
    startDate: '2026-12-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    metrics: [
      ExperimentMetric.mean({ name: 'Revenue', event: 'purchase', math: MetricMath.SUM, mathProperty: 'revenue' }),
      ExperimentMetric.funnel({
        name: 'Conversion',
        steps: [{ event: 'checkout_started' }, { event: 'purchase' }],
        conversionWindow: Duration.days(7),
      }),
      ExperimentMetric.ratio({
        numerator: { event: 'purchase', math: MetricMath.SUM, mathProperty: 'revenue' },
        denominator: { event: 'purchase' },
      }),
      ExperimentMetric.fromJson({ metric_type: 'retention', name: 'Retention', start_event: {}, completion_event: {} }),
    ],
  }));
  const q = insightQueries(Template.fromStack(stack));
  const scope = {
    breakdownFilter: { breakdown: '$feature/new-checkout', breakdown_type: 'event' },
    properties: [{ key: '$feature/new-checkout', operator: 'is_set', type: 'event' }],
    dateRange: { date_from: '2026-12-01T00:00:00Z', date_to: '2026-12-31T00:00:00Z' },
  };
  const exposure = {
    kind: 'EventsNode',
    event: '$feature_flag_called',
    name: '$feature_flag_called',
    properties: [{ key: '$feature_flag', operator: 'exact', type: 'event', value: 'new-checkout' }],
  };

  expect(q['Checkout test: exposures']).toEqual({
    kind: 'InsightVizNode',
    source: {
      kind: 'TrendsQuery',
      series: [{ ...exposure, math: 'dau' }],
      interval: 'day',
      breakdownFilter: { breakdown: '$feature_flag_response', breakdown_type: 'event' },
      dateRange: scope.dateRange,
    },
  });
  expect(q['Checkout test: Revenue']).toEqual({
    kind: 'InsightVizNode',
    source: {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'purchase', name: 'purchase', math: 'sum', math_property: 'revenue' }],
      interval: 'day',
      ...scope,
    },
  });
  expect(q['Checkout test: Conversion']).toEqual({
    kind: 'InsightVizNode',
    source: {
      kind: 'FunnelsQuery',
      series: [
        exposure,
        { kind: 'EventsNode', event: 'checkout_started', name: 'checkout_started' },
        { kind: 'EventsNode', event: 'purchase', name: 'purchase' },
      ],
      funnelsFilter: { funnelWindowInterval: 7, funnelWindowIntervalUnit: 'day' },
      ...scope,
    },
  });
  expect(q['Checkout test: purchase / purchase'].source).toMatchObject({
    kind: 'TrendsQuery',
    series: [
      { kind: 'EventsNode', event: 'purchase', math: 'sum', math_property: 'revenue' },
      { kind: 'EventsNode', event: 'purchase', math: 'total' },
    ],
    trendsFilter: { formula: 'A / B' },
    ...scope,
  });
  // Fallback: exposure events per variant.
  expect(q['Checkout test: Retention'].source).toMatchObject({
    kind: 'TrendsQuery',
    series: [{ ...exposure, math: 'total' }],
    breakdownFilter: { breakdown: '$feature_flag_response' },
  });
});

test('applies targeting and rollout to the flag', () => {
  const { stack, project } = setup();
  const cohort = Cohort.fromCohortId(stack, 'Cohort', project, '42');
  new FeatureExperiment(stack, 'Checkout', base(project, {
    targeting: {
      properties: [{ key: 'country', value: ['US'], type: PropertyFilterType.PERSON, operator: PropertyOperator.EXACT }],
      cohort,
    },
    rolloutPercentage: 20,
  }));
  const [, flag] = one(Template.fromStack(stack), FLAG);
  expect(json(flag.Properties.Filters).groups).toEqual([{
    properties: [
      { key: 'country', operator: 'exact', type: 'person', value: ['US'] },
      { key: 'id', type: 'cohort', operator: 'in', value: 42 },
    ],
    rollout_percentage: 20,
  }]);
});

test('passes saved metrics, holdout and dates to the experiment', () => {
  const { stack, project } = setup();
  const holdout = new Holdout(stack, 'Holdout', { project, name: 'Global', rolloutPercentage: 5 });
  const saved = new SavedMetric(stack, 'Saved', { project, name: 'Pageviews', query: ExperimentMetric.mean({ event: '$pageview' }) });
  new FeatureExperiment(stack, 'Checkout', base(project, {
    metrics: [],
    savedMetrics: [saved],
    holdout,
    startDate: '2026-12-01T00:00:00Z',
  }));
  const t = Template.fromStack(stack);
  const [, experiment] = one(t, EXPERIMENT);
  expect(experiment.Properties.HoldoutId).toEqual({ 'Fn::GetAtt': [stack.getLogicalId(holdout.resource), 'Id'] });
  expect(experiment.Properties.SavedMetrics).toEqual([
    { Id: { 'Fn::GetAtt': [stack.getLogicalId(saved.resource), 'Id'] }, Type: 'primary' },
  ]);
  expect(experiment.Properties.StartDate).toBe('2026-12-01T00:00:00Z');
  expect(experiment.Properties.Metrics).toBeUndefined();
  // The exposures insight plus one for the shared metric created in this app.
  expect(resources(t, INSIGHT)).toHaveLength(2);
  t.hasResourceProperties(INSIGHT, { Name: 'Checkout test: Pageviews' });
});

test('imported shared metrics get no dashboard insight', () => {
  const { stack, project } = setup();
  const saved = SavedMetric.fromSavedMetricId(stack, 'Saved', project, '9');
  new FeatureExperiment(stack, 'Checkout', base(project, { metrics: [], savedMetrics: [saved] }));
  expect(resources(Template.fromStack(stack), INSIGHT)).toHaveLength(1);
});

test('dashboard can be renamed or left out', () => {
  const named = setup();
  new FeatureExperiment(named.stack, 'Checkout', base(named.project, { resultsDashboard: { name: 'Checkout A/B' } }));
  expect(one(Template.fromStack(named.stack), DASHBOARD)[1].Properties.Name).toBe('Checkout A/B');

  const none = setup();
  const exp = new FeatureExperiment(none.stack, 'Checkout', base(none.project, { resultsDashboard: false }));
  const t = Template.fromStack(none.stack);
  expect(resources(t, DASHBOARD)).toHaveLength(0);
  expect(resources(t, INSIGHT)).toHaveLength(0);
  expect(exp.dashboard).toBeUndefined();
  expect(exp.insights).toEqual([]);
});

test('early access feature gates the experiment flag on enrollment', () => {
  const { stack, project } = setup();
  const exp = new FeatureExperiment(stack, 'Checkout', base(project, {
    earlyAccess: { name: 'New checkout', description: 'Try the new checkout', stage: EarlyAccessStage.BETA },
  }));
  const t = Template.fromStack(stack);
  const [eafId, eaf] = one(t, EAF);
  expect(eaf.Properties).toMatchObject({ Name: 'New checkout', Description: 'Try the new checkout', Stage: 'beta' });
  expect(eaf.Properties.FeatureFlagId).toBeUndefined();
  const [, flag] = one(t, FLAG);
  expect(json(flag.Properties.Filters).groups[0].properties).toEqual([{
    key: `$feature_enrollment/<${eafId}.FeatureFlagKey>`,
    operator: 'exact',
    type: 'person',
    value: ['true'],
  }]);
  expect(exp.earlyAccessFeature).toBeDefined();
});

test('early access feature without gating', () => {
  const { stack, project } = setup();
  new FeatureExperiment(stack, 'Checkout', base(project, {
    earlyAccess: { name: 'New checkout', stage: EarlyAccessStage.CONCEPT, enrolledUsersOnly: false },
  }));
  const t = Template.fromStack(stack);
  one(t, EAF);
  expect(json(one(t, FLAG)[1].Properties.Filters).groups[0].properties).toEqual([]);
});

describe('validation', () => {
  test.each([
    ['no control', [{ key: 'a', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50 }], /exactly one variant must have the key 'control'/],
    ['two controls', [{ key: 'control', rolloutPercentage: 50 }, { key: 'control', rolloutPercentage: 50 }], /duplicate variant key 'control'/],
    ['bad sum', [{ key: 'control', rolloutPercentage: 50 }, { key: 'test', rolloutPercentage: 40 }], /add up to 100, got 90/],
    ['one variant', [{ key: 'control', rolloutPercentage: 100 }], /at least two variants/],
    ['bad key', [{ key: 'control', rolloutPercentage: 50 }, { key: 'te st', rolloutPercentage: 50 }], /letters, numbers/],
  ])('rejects variants: %s', (_name, variants, error) => {
    const { stack, project } = setup();
    expect(() => new FeatureExperiment(stack, 'X', base(project, { variants }))).toThrow(error);
  });

  test('requires a primary metric', () => {
    const { stack, project } = setup();
    expect(() => new FeatureExperiment(stack, 'X', base(project, { metrics: [] }))).toThrow(/at least one primary metric/);
  });

  test('rejects an out-of-range rollout and bad dates', () => {
    const { stack, project } = setup();
    expect(() => new FeatureExperiment(stack, 'X', base(project, { rolloutPercentage: 120 }))).toThrow(/between 0 and 100/);
    expect(() => new FeatureExperiment(stack, 'Y', base(project, { startDate: 'soon' }))).toThrow(/ISO 8601/);
    expect(() => new FeatureExperiment(stack, 'Z', base(project, {
      startDate: '2026-12-02T00:00:00Z', endDate: '2026-12-01T00:00:00Z',
    }))).toThrow(/endDate must not be before startDate/);
  });

  test('skips tokens', () => {
    const { stack, project } = setup();
    const pct = new CfnParameter(stack, 'Pct', { type: 'Number' }).valueAsNumber;
    expect(() => new FeatureExperiment(stack, 'X', base(project, {
      variants: [{ key: 'control', rolloutPercentage: pct }, { key: 'test', rolloutPercentage: 10 }],
      rolloutPercentage: pct,
    }))).not.toThrow();
  });
});
