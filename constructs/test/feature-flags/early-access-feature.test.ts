import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { EarlyAccessFeature, EarlyAccessStage, FeatureFlag, ScheduledChange, ScheduledOperation } from '../../src/feature-flags';
import { Project } from '../../src/organizations';

const EAF = 'PostHog::FeatureFlags::EarlyAccessFeature';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack): Record<string, any> {
  return Object.values(Template.fromStack(stack).findResources(EAF))[0].Properties;
}

test('creates an early access feature linked to a flag', () => {
  const { stack, project } = setup();
  const flag = new FeatureFlag(stack, 'Flag', { project, key: 'ai-search' });
  const feature = new EarlyAccessFeature(stack, 'AiSearch', {
    project,
    name: 'AI search',
    description: 'Search with natural language',
    stage: EarlyAccessStage.GENERAL_AVAILABILITY,
    featureFlag: flag,
    documentationUrl: 'https://example.com/docs/ai-search',
    imageUrl: 'https://example.com/ai-search.png',
    payload: { beta: true },
  });

  expect(props(stack)).toEqual({
    ProjectId: '12345',
    Name: 'AI search',
    Description: 'Search with natural language',
    Stage: 'general-availability',
    FeatureFlagId: { 'Fn::GetAtt': [expect.stringMatching(/^Flag/), 'Id'] },
    DocumentationUrl: 'https://example.com/docs/ai-search',
    ImageUrl: 'https://example.com/ai-search.png',
    Payload: '{"beta":true}',
  });
  Template.fromStack(stack).hasResource(EAF, { DeletionPolicy: 'Delete' });
  expect(feature.featureFlag).toBe(flag);
  expect(feature.project).toBe(project);
  expect(stack.resolve(feature.earlyAccessFeatureId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^AiSearch/), 'Id'] });
  expect(stack.resolve(feature.featureFlagId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^AiSearch/), 'LinkedFeatureFlagId'] });
  expect(stack.resolve(feature.featureFlagKey)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^AiSearch/), 'FeatureFlagKey'] });
  expect(stack.resolve(feature.earlyAccessFeatureCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^AiSearch/), 'CreatedAt'] });
});

test('exposes the flag PostHog creates, which changes can be scheduled on', () => {
  const { stack, project } = setup();
  const feature = new EarlyAccessFeature(stack, 'Bare', {
    project,
    name: 'Bare',
    stage: EarlyAccessStage.CONCEPT,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  // The linked flag works with ScheduledChange through its ID.
  new ScheduledChange(stack, 'Later', {
    flag: feature.featureFlag,
    at: '2030-01-01T00:00:00Z',
    operation: ScheduledOperation.disable(),
  });
  expect(props(stack)).toEqual({ ProjectId: '12345', Name: 'Bare', Stage: 'concept' });
  Template.fromStack(stack).hasResource(EAF, { DeletionPolicy: 'Retain' });
  expect(stack.resolve(feature.featureFlag.flagId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Bare/), 'LinkedFeatureFlagId'] });
  expect(stack.resolve(feature.featureFlag.flagKey)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Bare/), 'FeatureFlagKey'] });

  Template.fromStack(stack).hasResourceProperties('PostHog::FeatureFlags::ScheduledChange', {
    RecordId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Bare'), 'LinkedFeatureFlagId'] },
  });
});

test('validates names, URLs, the flag project and multivariate flags', () => {
  const { stack, project } = setup();
  const stage = EarlyAccessStage.BETA;
  expect(() => new EarlyAccessFeature(stack, 'Empty', { project, name: '', stage })).toThrow(/name must be between 1 and 200/);
  expect(() => new EarlyAccessFeature(stack, 'Url', { project, name: 'x', stage, documentationUrl: 'u'.repeat(801) }))
    .toThrow(/documentationUrl/);
  const other = Project.fromProjectId(stack, 'Other', '999');
  expect(() => new EarlyAccessFeature(stack, 'OtherProject', {
    project,
    name: 'x',
    stage,
    featureFlag: FeatureFlag.fromFlagId(stack, 'OtherFlag', other, '1'),
  })).toThrow(/belongs to project 999/);
  const multi = new FeatureFlag(stack, 'Multi', {
    project,
    key: 'multi',
    variants: [{ key: 'a', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50 }],
  });
  expect(() => new EarlyAccessFeature(stack, 'Multivariate', { project, name: 'x', stage, featureFlag: multi }))
    .toThrow(/not multivariate/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new EarlyAccessFeature(stack, 'Token', { project, name: name.valueAsString, stage })).not.toThrow();
});

test('imports existing early access features', () => {
  const { stack, project } = setup();
  const feature = EarlyAccessFeature.fromEarlyAccessFeatureId(stack, 'Existing', project, 'uuid-1');
  expect(feature.earlyAccessFeatureId).toBe('uuid-1');
  expect(feature.project).toBe(project);
});
