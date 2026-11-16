import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType } from '../../src/core';
import { Holdout } from '../../src/experiments';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::Experiments::Holdout';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a holdout with typed filters', () => {
  const { stack, project } = setup();
  const holdout = new Holdout(stack, 'Global', {
    project,
    name: 'Global holdout',
    description: '10% of users never see experiments',
    rolloutPercentage: 10,
    properties: [{ key: 'country', value: ['US', 'CA'], type: PropertyFilterType.PERSON }],
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties(TYPE, {
    ProjectId: '12345',
    Name: 'Global holdout',
    Description: '10% of users never see experiments',
    Filters: '[{"properties":[{"key":"country","operator":"exact","type":"person","value":["US","CA"]}],"rollout_percentage":10}]',
  });
  t.hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(stack.resolve(holdout.holdoutId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Global/), 'Id'] });
  expect(stack.resolve(holdout.holdoutCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Global/), 'CreatedAt'] });
  expect(holdout.project).toBe(project);
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Holdout(stack, 'Bare', { project, name: 'Bare', rolloutPercentage: 5, removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource(TYPE, { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources(TYPE))[0].Properties).toEqual({
    ProjectId: '12345',
    Name: 'Bare',
    Filters: '[{"properties":[],"rollout_percentage":5}]',
  });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new Holdout(stack, 'Empty', { project, name: '', rolloutPercentage: 1 })).toThrow(/Holdout name must be between 1 and 400/);
  expect(() => new Holdout(stack, 'Desc', { project, name: 'x', rolloutPercentage: 1, description: 'y'.repeat(401) })).toThrow(/description/);
  expect(() => new Holdout(stack, 'Pct', { project, name: 'x', rolloutPercentage: 101 })).toThrow(/rolloutPercentage must be between 0 and 100/);
  const pct = new CfnParameter(stack, 'P', { type: 'Number' });
  expect(() => new Holdout(stack, 'Token', { project, name: 'x', rolloutPercentage: pct.valueAsNumber })).not.toThrow();
});

test('imports an existing holdout', () => {
  const { stack, project } = setup();
  const holdout = Holdout.fromHoldoutId(stack, 'Existing', project, '3');
  expect(holdout.holdoutId).toBe('3');
  expect(holdout.project).toBe(project);
});
