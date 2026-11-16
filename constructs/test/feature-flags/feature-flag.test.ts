import { App, CfnParameter, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import {
  BucketingIdentifier,
  EvaluationRuntime,
  FeatureFlag,
} from '../../src/feature-flags';
import { IProject, Project } from '../../src/organizations';
import { ICohort } from '../../src/product-analytics';

const FLAG = 'PostHog::FeatureFlags::FeatureFlag';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function cohort(scope: Construct, id: string, project: IProject, cohortId: string): ICohort {
  class C extends Resource implements ICohort {
    public readonly cohortId = cohortId;
    public readonly project = project;
  }
  return new C(scope, id);
}

function flagProps(stack: Stack, index = 0): Record<string, any> {
  return Object.values(Template.fromStack(stack).findResources(FLAG))[index].Properties;
}

function filtersOf(stack: Stack, index = 0): any {
  return JSON.parse(flagProps(stack, index).Filters);
}

test('creates a flag with typed release conditions, variants and payloads', () => {
  const { stack, project } = setup();
  const beta = cohort(stack, 'Beta', project, '42');
  const flag = new FeatureFlag(stack, 'Checkout', {
    project,
    key: 'new-checkout',
    name: 'New checkout flow',
    active: true,
    tags: ['checkout', 'checkout', 'growth'],
    evaluationRuntime: EvaluationRuntime.CLIENT,
    bucketingIdentifier: BucketingIdentifier.DISTINCT_ID,
    releaseConditions: [
      {
        properties: [{ key: 'email', value: '@example.com', operator: PropertyOperator.ICONTAINS, type: PropertyFilterType.PERSON }],
        rolloutPercentage: 50,
      },
      { cohort: beta, variant: 'test' },
    ],
    variants: [
      { key: 'control', name: 'Current', rolloutPercentage: 50 },
      { key: 'test', rolloutPercentage: 50 },
    ],
    payloads: { test: { columns: 2, theme: 'dark' } },
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties(FLAG, {
    ProjectId: '12345',
    Key: 'new-checkout',
    Name: 'New checkout flow',
    Active: true,
    Tags: ['checkout', 'growth'],
    EvaluationRuntime: 'client',
    BucketingIdentifier: 'distinct_id',
  });
  t.hasResource(FLAG, { DeletionPolicy: 'Delete' });
  expect(filtersOf(stack)).toEqual({
    groups: [
      {
        properties: [{ key: 'email', operator: 'icontains', type: 'person', value: '@example.com' }],
        rollout_percentage: 50,
      },
      {
        properties: [{ key: 'id', type: 'cohort', operator: 'in', value: 42 }],
        rollout_percentage: 100,
        variant: 'test',
      },
    ],
    multivariate: {
      variants: [
        { key: 'control', name: 'Current', rollout_percentage: 50 },
        { key: 'test', rollout_percentage: 50 },
      ],
    },
    payloads: { test: '{"columns":2,"theme":"dark"}' },
  });
  expect(flag.flagKey).toBe('new-checkout');
  expect(flag.isMultivariate).toBe(true);
  expect(stack.resolve(flag.flagId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'Id'] });
  expect(stack.resolve(flag.flagCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'CreatedAt'] });
  expect(stack.resolve(flag.flagUpdatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'UpdatedAt'] });
  expect(flag.project).toBe(project);
});

test('renders group aggregation and a token cohort ID', () => {
  const { stack, project } = setup();
  const cohortId = new CfnParameter(stack, 'CohortId', { type: 'String' });
  new FeatureFlag(stack, 'Org', {
    project,
    key: 'org-flag',
    aggregationGroupTypeIndex: 0,
    releaseConditions: [
      {
        properties: [{ key: 'plan', value: 'enterprise', type: PropertyFilterType.GROUP, groupTypeIndex: 0 }],
        cohort: cohort(stack, 'C', project, cohortId.valueAsString),
        rolloutPercentage: 25,
      },
    ],
  });
  const resolved = stack.resolve(flagProps(stack).Filters);
  expect(JSON.stringify(resolved)).toContain('{"Ref":"CohortId"}');
  expect(JSON.stringify(resolved)).toContain('aggregation_group_type_index\\":0');
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  const flag = new FeatureFlag(stack, 'Bare', { project, key: 'bare', removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource(FLAG, { DeletionPolicy: 'Retain' });
  expect(flagProps(stack)).toEqual({ ProjectId: '12345', Key: 'bare' });
  expect(flag.isMultivariate).toBe(false);
});

test('renders an empty release condition list as groups: []', () => {
  const { stack, project } = setup();
  new FeatureFlag(stack, 'Off', { project, key: 'off', releaseConditions: [] });
  expect(filtersOf(stack)).toEqual({ groups: [] });
});

test('rawFilters is passed through and excludes typed props', () => {
  const { stack, project } = setup();
  new FeatureFlag(stack, 'Raw', {
    project,
    key: 'raw',
    rawFilters: { groups: [{ properties: [], rollout_percentage: 10 }], early_exit: true },
  });
  expect(filtersOf(stack)).toEqual({ groups: [{ properties: [], rollout_percentage: 10 }], early_exit: true });
  expect(() => new FeatureFlag(stack, 'Both', {
    project,
    key: 'both',
    rawFilters: { groups: [] },
    releaseConditions: [{ rolloutPercentage: 10 }],
  })).toThrow(/rawFilters can't be combined/);
});

test('FeatureFlag.boolean defaults to everyone and keys the payload by true', () => {
  const { stack, project } = setup();
  const flag = FeatureFlag.boolean(stack, 'Bool', { project, key: 'banner', payload: { text: 'Hello' } });
  expect(flag).toBeInstanceOf(FeatureFlag);
  expect(filtersOf(stack)).toEqual({
    groups: [{ properties: [], rollout_percentage: 100 }],
    payloads: { true: '{"text":"Hello"}' },
  });
  expect(() => FeatureFlag.boolean(stack, 'BadBool', { project, key: 'b', releaseConditions: [{ variant: 'x' }] }))
    .toThrow(/boolean flags have no variants/);
});

test('FeatureFlag.percentageRollout creates one condition', () => {
  const { stack, project } = setup();
  FeatureFlag.percentageRollout(stack, 'Ten', {
    project,
    key: 'ten-percent',
    percentage: 10,
    properties: [{ key: 'country', value: 'US', type: PropertyFilterType.PERSON }],
  });
  expect(flagProps(stack).Key).toBe('ten-percent');
  expect(filtersOf(stack)).toEqual({
    groups: [{ properties: [{ key: 'country', operator: 'exact', type: 'person', value: 'US' }], rollout_percentage: 10 }],
  });
});

test('validates variants', () => {
  const { stack, project } = setup();
  expect(() => new FeatureFlag(stack, 'Sum', {
    project,
    key: 'sum',
    variants: [{ key: 'a', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 40 }],
  })).toThrow(/must sum to 100, got 90/);
  expect(() => new FeatureFlag(stack, 'Dup', {
    project,
    key: 'dup',
    variants: [{ key: 'a', rolloutPercentage: 50 }, { key: 'a', rolloutPercentage: 50 }],
  })).toThrow(/duplicate variant key 'a'/);
  expect(() => new FeatureFlag(stack, 'Empty', { project, key: 'empty', variants: [] })).toThrow(/must not be empty/);
  expect(() => new FeatureFlag(stack, 'Range', {
    project,
    key: 'range',
    variants: [{ key: 'a', rolloutPercentage: 150 }, { key: 'b', rolloutPercentage: -50 }],
  })).toThrow(/between 0 and 100/);
  expect(() => new FeatureFlag(stack, 'Thirds', {
    project,
    key: 'thirds',
    variants: [{ key: 'a', rolloutPercentage: 33.3 }, { key: 'b', rolloutPercentage: 33.3 }, { key: 'c', rolloutPercentage: 33.4 }],
  })).not.toThrow();
  // A token percentage skips the sum check.
  const pct = new CfnParameter(stack, 'Pct', { type: 'Number' });
  expect(() => new FeatureFlag(stack, 'Token', {
    project,
    key: 'token',
    variants: [{ key: 'a', rolloutPercentage: pct.valueAsNumber }, { key: 'b', rolloutPercentage: 10 }],
  })).not.toThrow();
});

test('validates variant references and payload keys', () => {
  const { stack, project } = setup();
  const variants = [{ key: 'control', rolloutPercentage: 50 }, { key: 'test', rolloutPercentage: 50 }];
  expect(() => new FeatureFlag(stack, 'Ref', { project, key: 'r', variants, releaseConditions: [{ variant: 'other' }] }))
    .toThrow(/unknown variant 'other'/);
  expect(() => new FeatureFlag(stack, 'NoVariants', { project, key: 'n', releaseConditions: [{ variant: 'test' }] }))
    .toThrow(/has no variants/);
  expect(() => new FeatureFlag(stack, 'Payload', { project, key: 'p', variants, payloads: { other: 1 } }))
    .toThrow(/unknown variant 'other'/);
  expect(() => new FeatureFlag(stack, 'BoolPayload', { project, key: 'bp', payloads: { yes: 1 } }))
    .toThrow(/keyed by 'true'/);
  expect(() => new FeatureFlag(stack, 'Rollout', { project, key: 'ro', releaseConditions: [{ rolloutPercentage: 101 }] }))
    .toThrow(/rolloutPercentage must be between 0 and 100/);
});

test('validates required fields and incompatible settings, and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new FeatureFlag(stack, 'NoKey', { project, key: '' })).toThrow(/key must be between 1 and 400/);
  expect(() => new FeatureFlag(stack, 'LongKey', { project, key: 'k'.repeat(401) })).toThrow(/key must be between 1 and 400/);
  expect(() => new FeatureFlag(stack, 'Archived', { project, key: 'a', archived: true })).toThrow(/archived flag must be inactive/);
  expect(() => new FeatureFlag(stack, 'ArchivedOff', { project, key: 'a2', archived: true, active: false })).not.toThrow();
  expect(() => new FeatureFlag(stack, 'Device', {
    project,
    key: 'd',
    bucketingIdentifier: BucketingIdentifier.DEVICE_ID,
    ensureExperienceContinuity: true,
  })).toThrow(/incompatible/);
  expect(() => new FeatureFlag(stack, 'Agg', { project, key: 'g', aggregationGroupTypeIndex: 5 })).toThrow(/aggregationGroupTypeIndex/);
  const key = new CfnParameter(stack, 'Key', { type: 'String' });
  expect(() => new FeatureFlag(stack, 'TokenKey', { project, key: key.valueAsString })).not.toThrow();
});

test('imports existing flags by ID, key or both', () => {
  const { stack, project } = setup();
  const byId = FeatureFlag.fromFlagId(stack, 'ById', project, '7');
  expect(byId.flagId).toBe('7');
  expect(byId.project.projectId).toBe('12345');
  expect(() => byId.flagKey).toThrow(/imported by ID/);

  const byKey = FeatureFlag.fromFlagKey(stack, 'ByKey', project, 'new-checkout');
  expect(byKey.flagKey).toBe('new-checkout');
  expect(() => byKey.flagId).toThrow(/imported by key/);

  const both = FeatureFlag.fromFlagAttributes(stack, 'Both', { project, flagId: '8', flagKey: 'k' });
  expect(both.flagId).toBe('8');
  expect(both.flagKey).toBe('k');
});
