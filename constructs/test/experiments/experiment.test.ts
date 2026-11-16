import { App, CfnParameter, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import {
  Experiment,
  ExperimentConclusion,
  ExperimentMetric,
  ExperimentType,
  Holdout,
  MetricMath,
  MultipleVariantHandling,
  SavedMetric,
  StatsMethod,
} from '../../src/experiments';
import { FeatureFlag, IFeatureFlag } from '../../src/feature-flags';
import { IProject, Project } from '../../src/organizations';
import { Action } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

const TYPE = 'PostHog::Experiments::Experiment';

class FakeFlag extends Resource implements IFeatureFlag {
  public readonly flagId = '1';
  constructor(scope: Construct, id: string, public readonly project: IProject, public readonly flagKey: string) {
    super(scope, id);
  }
}

function props(t: Template): Record<string, any> {
  return Object.values(t.findResources(TYPE))[0].Properties;
}

test('creates an experiment with typed variants, metrics and settings', () => {
  const { stack, project } = setup();
  const holdout = Holdout.fromHoldoutId(stack, 'Holdout', project, '7');
  const shared = SavedMetric.fromSavedMetricId(stack, 'Shared', project, '11');
  const shared2 = SavedMetric.fromSavedMetricId(stack, 'Shared2', project, '12');
  const exposure = Action.fromActionId(stack, 'Exposure', project, '5');

  const experiment = new Experiment(stack, 'Checkout', {
    project,
    name: 'Checkout button colour',
    description: 'A green button increases purchases',
    featureFlagKey: 'checkout-button-colour',
    variants: [
      { key: 'control', rolloutPercentage: 50 },
      { key: 'green', rolloutPercentage: 50, name: 'Green', note: 'Background #2f9e44' },
    ],
    minimumDetectableEffect: 20,
    metrics: [ExperimentMetric.mean({ event: 'purchase_completed' })],
    secondaryMetrics: [ExperimentMetric.mean({ event: 'purchase_completed', math: MetricMath.SUM, mathProperty: 'amount' })],
    savedMetrics: [shared],
    secondarySavedMetrics: [shared2],
    holdout,
    exposureCriteria: {
      filterTestAccounts: true,
      action: exposure,
      properties: [{ key: 'plan', value: 'pro' }],
      multipleVariantHandling: MultipleVariantHandling.FIRST_SEEN,
    },
    statsMethod: StatsMethod.FREQUENTIST,
    type: ExperimentType.PRODUCT,
    startDate: '2026-12-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    excludedVariants: ['green'],
    archived: false,
    conclusion: ExperimentConclusion.WON,
    conclusionComment: 'Green won',
    repository: 'acme/web',
    onlyCountMaturedUsers: true,
    allowUnknownEvents: true,
    tags: ['growth', 'growth', 'checkout'],
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties(TYPE, {
    ProjectId: '12345',
    Name: 'Checkout button colour',
    Description: 'A green button increases purchases',
    FeatureFlagKey: 'checkout-button-colour',
    HoldoutId: '7',
    Type: 'product',
    StartDate: '2026-12-01T00:00:00Z',
    EndDate: '2026-12-31T00:00:00Z',
    Parameters: JSON.stringify({
      feature_flag_variants: [
        { key: 'control', rollout_percentage: 50 },
        { key: 'green', name: 'Green', rollout_percentage: 50 },
      ],
      variant_notes: { green: 'Background #2f9e44' },
      minimum_detectable_effect: 20,
    }),
    ExposureCriteria: JSON.stringify({
      filterTestAccounts: true,
      exposure_config: { kind: 'ActionsNode', id: 5, properties: [{ key: 'plan', operator: 'exact', type: 'event', value: 'pro' }] },
      multiple_variant_handling: 'first_seen',
    }),
    Metrics: '[{"kind":"ExperimentMetric","metric_type":"mean","source":{"kind":"EventsNode","event":"purchase_completed"}}]',
    MetricsSecondary: '[{"kind":"ExperimentMetric","metric_type":"mean","source":{"kind":"EventsNode","event":"purchase_completed","math":"sum","math_property":"amount"}}]',
    StatsConfig: '{"method":"frequentist"}',
    SavedMetrics: [{ Id: '11', Type: 'primary' }, { Id: '12', Type: 'secondary' }],
    ExcludedVariants: ['green'],
    Archived: false,
    Conclusion: 'won',
    ConclusionComment: 'Green won',
    Repository: 'acme/web',
    OnlyCountMaturedUsers: true,
    AllowUnknownEvents: true,
    Tags: ['growth', 'checkout'],
  });
  t.hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(stack.resolve(experiment.experimentId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'Id'] });
  expect(stack.resolve(experiment.experimentFeatureFlagId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'FeatureFlagId'] });
  expect(stack.resolve(experiment.experimentStatus)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'Status'] });
  expect(stack.resolve(experiment.experimentCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'CreatedAt'] });
  expect(experiment.featureFlagKey).toBe('checkout-button-colour');
  expect(experiment.project).toBe(project);
});

test('renders a custom exposure event', () => {
  const { stack, project } = setup();
  new Experiment(stack, 'E', {
    project,
    name: 'E',
    featureFlagKey: 'e',
    exposureCriteria: { event: '$pageview', properties: [{ key: '$current_url', value: '/checkout' }] },
  });
  Template.fromStack(stack).hasResourceProperties(TYPE, {
    ExposureCriteria: '{"exposure_config":{"kind":"ExperimentEventExposureConfig","event":"$pageview","properties":[{"key":"$current_url","operator":"exact","type":"event","value":"/checkout"}]}}',
  });
});

test('references created holdouts, shared metrics and feature flags by token', () => {
  const { stack, project } = setup();
  const holdout = new Holdout(stack, 'Holdout', { project, name: 'Global', rolloutPercentage: 10 });
  const shared = new SavedMetric(stack, 'Shared', { project, name: 'Sign-ups', query: ExperimentMetric.mean({ event: 'signed_up' }) });
  const flagKey = new CfnParameter(stack, 'FlagKey', { type: 'String' });
  const flag = new FakeFlag(stack, 'Flag', project, flagKey.valueAsString);
  new Experiment(stack, 'E', { project, name: 'E', featureFlag: flag, holdout, savedMetrics: [shared] });
  Template.fromStack(stack).hasResourceProperties(TYPE, {
    FeatureFlagKey: { Ref: 'FlagKey' },
    HoldoutId: stack.resolve(holdout.holdoutId),
    SavedMetrics: [{ Id: stack.resolve(shared.savedMetricId), Type: 'primary' }],
  });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Experiment(stack, 'Bare', { project, name: 'Bare', featureFlagKey: 'bare', removalPolicy: RemovalPolicy.RETAIN, exposureCriteria: {} });
  const t = Template.fromStack(stack);
  t.hasResource(TYPE, { DeletionPolicy: 'Retain' });
  expect(props(t)).toEqual({ ProjectId: '12345', Name: 'Bare', FeatureFlagKey: 'bare' });
});

test('validates variants', () => {
  const { stack, project } = setup();
  const base = { project, name: 'E', featureFlagKey: 'e' };
  expect(() => new Experiment(stack, 'One', { ...base, variants: [{ key: 'control', rolloutPercentage: 100 }] }))
    .toThrow(/at least two variants/);
  expect(() => new Experiment(stack, 'NoControl', { ...base, variants: [{ key: 'a', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50 }] }))
    .toThrow(/exactly one variant must have the key 'control'/);
  expect(() => new Experiment(stack, 'Dup', { ...base, variants: [{ key: 'control', rolloutPercentage: 50 }, { key: 'control', rolloutPercentage: 50 }] }))
    .toThrow(/duplicate variant key 'control'/);
  expect(() => new Experiment(stack, 'Sum', { ...base, variants: [{ key: 'control', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 40 }] }))
    .toThrow(/add up to 100, got 90/);
  expect(() => new Experiment(stack, 'Range', { ...base, variants: [{ key: 'control', rolloutPercentage: 150 }, { key: 'b', rolloutPercentage: -50 }] }))
    .toThrow(/between 0 and 100/);
  expect(() => new Experiment(stack, 'Key', { ...base, variants: [{ key: 'control', rolloutPercentage: 50 }, { key: 'b c', rolloutPercentage: 50 }] }))
    .toThrow(/variant key 'b c' is invalid/);
  const pct = new CfnParameter(stack, 'Pct', { type: 'Number' });
  expect(() => new Experiment(stack, 'Token', { ...base, variants: [{ key: 'control', rolloutPercentage: pct.valueAsNumber }, { key: 'b', rolloutPercentage: 50 }] }))
    .not.toThrow();
});

test('validates other concrete values and skips tokens', () => {
  const { stack, project } = setup();
  const base = { project, name: 'E', featureFlagKey: 'e' };
  expect(() => new Experiment(stack, 'Empty', { ...base, name: '' })).toThrow(/Experiment name must be between 1 and 400/);
  expect(() => new Experiment(stack, 'BadKey', { ...base, featureFlagKey: 'has space' })).toThrow(/featureFlagKey 'has space' is invalid/);
  expect(() => new Experiment(stack, 'NoFlag', { project, name: 'E' })).toThrow(/exactly one of featureFlagKey, featureFlag/);
  expect(() => new Experiment(stack, 'Desc', { ...base, description: 'x'.repeat(3001) })).toThrow(/description/);
  expect(() => new Experiment(stack, 'Date', { ...base, startDate: 'tomorrow' })).toThrow(/not an ISO 8601 timestamp/);
  expect(() => new Experiment(stack, 'Order', { ...base, startDate: '2026-12-02', endDate: '2026-12-01' })).toThrow(/endDate must not be before startDate/);
  expect(() => new Experiment(stack, 'Repo', { ...base, repository: 'no-slash' })).toThrow(/organization\/repository/);
  expect(() => new Experiment(stack, 'ExclControl', { ...base, excludedVariants: ['control'] })).toThrow(/control variant cannot be excluded/);
  expect(() => new Experiment(stack, 'ExclUnknown', {
    ...base,
    variants: [{ key: 'control', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50 }],
    excludedVariants: ['c'],
  })).toThrow(/'c' is not one of the variants/);
  expect(() => new Experiment(stack, 'Tags', { ...base, tags: Array.from({ length: 101 }, (_, i) => `t${i}`) })).toThrow(/at most 100 tags/);
  const action = Action.fromActionId(stack, 'A', project, '1');
  expect(() => new Experiment(stack, 'Exp1', { ...base, exposureCriteria: { event: 'x', action } })).toThrow(/at most one of event and action/);
  expect(() => new Experiment(stack, 'Exp2', { ...base, exposureCriteria: { properties: [{ key: 'a', value: 'b' }] } })).toThrow(/properties need a custom exposure/);

  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  const key = new CfnParameter(stack, 'Key', { type: 'String' });
  const start = new CfnParameter(stack, 'Start', { type: 'String' });
  expect(() => new Experiment(stack, 'Token', {
    project, name: name.valueAsString, featureFlagKey: key.valueAsString, startDate: start.valueAsString, endDate: '2026-01-01',
  })).not.toThrow();
});

test('rejects a feature flag from another project', () => {
  const { stack, project } = setup();
  const other = Project.fromProjectId(stack, 'Other', '999');
  const flag = new FakeFlag(stack, 'Flag', other, 'k');
  expect(() => new Experiment(stack, 'E', { project, name: 'E', featureFlag: flag })).toThrow(/must belong to the experiment project/);
});

test('imports an existing experiment', () => {
  const { stack, project } = setup();
  const experiment = Experiment.fromExperimentId(stack, 'Existing', project, '77');
  expect(experiment.experimentId).toBe('77');
  expect(experiment.project).toBe(project);
});

test('depends on a feature flag construct so the flag is created first', () => {
  const { stack, project } = setup();
  const flag = new FeatureFlag(stack, 'RealFlag', { project, key: 'checkout' });
  new Experiment(stack, 'E', { project, name: 'E', featureFlag: flag });
  const t = Template.fromStack(stack);
  const flagId = Object.keys(t.findResources('PostHog::FeatureFlags::FeatureFlag'))[0];
  const [exp] = Object.values(t.findResources(TYPE));
  expect(exp.DependsOn).toContain(flagId);
});
