import { App, CfnParameter, Duration, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType } from '../../src/core';
import { IFeatureFlag } from '../../src/feature-flags';
import { Project } from '../../src/organizations';
import {
  ProductTour,
  ProductTourDisplayFrequency,
  ProductTourProgressionTrigger,
  ProductTourStepPlacement,
  ProductTourStepType,
  UrlMatchType,
} from '../../src/surveys';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack): Record<string, any> {
  return Object.values(Template.fromStack(stack).findResources('PostHog::Surveys::ProductTour'))[0].Properties;
}

test('creates a product tour with typed steps, display settings and targeting', () => {
  const { stack, project } = setup();
  class F extends Resource implements IFeatureFlag {
    public readonly flagId = '5';
    public readonly flagKey = 'tours';
    public readonly project = project;
  }
  const tour = new ProductTour(stack, 'Onboarding', {
    project,
    name: 'Onboarding tour',
    description: 'First project',
    autoLaunch: true,
    steps: [
      { selector: '#new-project', title: 'Create a project', body: 'Click <here> & go', placement: ProductTourStepPlacement.BOTTOM },
      { type: ProductTourStepType.ELEMENT, selector: '.nav', title: 'Navigate', progressionTrigger: ProductTourProgressionTrigger.CLICK, id: 's2' },
      { title: 'All set!', rawStep: { maxWidth: 400 } },
    ],
    appearance: { backgroundColor: '#fff', showOverlay: true, borderRadius: 8 },
    conditions: { url: '/app', urlMatchType: UrlMatchType.EXACT, autoShowDelay: Duration.seconds(2) },
    displayFrequency: ProductTourDisplayFrequency.SHOW_ONCE,
    targeting: [{ properties: [{ key: 'plan', value: 'pro', type: PropertyFilterType.PERSON }], rolloutPercentage: 50 }],
    linkedFlag: new F(stack, 'Flag'),
    startDate: '2026-12-01T00:00:00Z',
  });

  Template.fromStack(stack).hasResource('PostHog::Surveys::ProductTour', { DeletionPolicy: 'Delete' });
  const p = props(stack);
  expect(p).toMatchObject({
    ProjectId: '12345',
    Name: 'Onboarding tour',
    Description: 'First project',
    AutoLaunch: true,
    LinkedFlagId: '5',
    StartDate: '2026-12-01T00:00:00Z',
  });
  expect(JSON.parse(p.TargetingFlagFilters)).toEqual({
    groups: [{ properties: [{ key: 'plan', operator: 'exact', type: 'person', value: 'pro' }], rollout_percentage: 50 }],
  });
  const content = JSON.parse(p.Content);
  expect(content).toMatchSnapshot();
  expect(content.steps[0].contentHtml).toBe('<h2>Create a project</h2><p>Click &lt;here&gt; &amp; go</p>');
  expect(content.steps[2]).toMatchObject({ type: 'modal', maxWidth: 400 });
  expect(content.conditions).toEqual({ url: '/app', urlMatchType: 'exact', autoShowDelaySeconds: 2 });
  expect(stack.resolve(tour.productTourId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'Id'] });
  expect(stack.resolve(tour.productTourInternalTargetingFlagId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'InternalTargetingFlagId'] });
  expect(stack.resolve(tour.productTourCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'CreatedAt'] });
  expect(stack.resolve(tour.productTourUpdatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'UpdatedAt'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new ProductTour(stack, 'Bare', { project, name: 'Bare', removalPolicy: RemovalPolicy.RETAIN });
  Template.fromStack(stack).hasResource('PostHog::Surveys::ProductTour', { DeletionPolicy: 'Retain' });
  expect(props(stack)).toEqual({ ProjectId: '12345', Name: 'Bare' });
});

test('merges raw content', () => {
  const { stack, project } = setup();
  new ProductTour(stack, 'Raw', { project, name: 'Raw', rawContent: { type: 'announcement' } });
  expect(JSON.parse(props(stack).Content)).toEqual({ type: 'announcement' });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new ProductTour(stack, 'E1', { project, name: '' })).toThrow(/Product tour name/);
  expect(() => new ProductTour(stack, 'E2', { project, name: 'x', steps: [{ type: ProductTourStepType.ELEMENT, title: 't' }] }))
    .toThrow(/require a selector/);
  expect(() => new ProductTour(stack, 'E3', { project, name: 'x', steps: [{ title: 't', placement: ProductTourStepPlacement.TOP }] }))
    .toThrow(/placement only applies/);
  expect(() => new ProductTour(stack, 'E4', { project, name: 'x', steps: [{ title: '' }] })).toThrow(/title/);
  expect(() => new ProductTour(stack, 'E5', { project, name: 'x', endDate: 'soon' })).toThrow(/ISO 8601/);
  expect(() => new ProductTour(stack, 'E6', { project, name: 'x', targeting: [{ rolloutPercentage: -1 }] })).toThrow(/rolloutPercentage/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new ProductTour(stack, 'Token', {
    project,
    name: name.valueAsString,
    steps: [{ selector: name.valueAsString, title: name.valueAsString }],
  })).not.toThrow();
});

test('imports existing product tours', () => {
  const { stack, project } = setup();
  const tour = ProductTour.fromProductTourId(stack, 'Existing', project, 'uuid-2');
  expect(tour.productTourId).toBe('uuid-2');
  expect(tour.project).toBe(project);
});
