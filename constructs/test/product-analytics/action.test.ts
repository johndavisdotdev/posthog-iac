import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { Organization, Project } from '../../src/organizations';
import { Action, StringMatching } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates an action with typed steps and property filters', () => {
  const { stack, project } = setup();
  const action = new Action(stack, 'SignedUp', {
    project,
    name: 'Signed up',
    description: 'User finished sign-up',
    tags: ['growth', 'growth', 'activation'],
    steps: [
      { event: '$pageview', url: '/signup/complete', urlMatching: StringMatching.CONTAINS },
      {
        event: 'signed_up',
        properties: [
          { key: 'plan', value: 'pro', type: PropertyFilterType.PERSON },
          { key: 'email', operator: PropertyOperator.IS_SET, type: PropertyFilterType.PERSON },
        ],
      },
    ],
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::Action', {
    ProjectId: '12345',
    Name: 'Signed up',
    Description: 'User finished sign-up',
    Tags: ['growth', 'activation'],
    Steps: [
      { Event: '$pageview', Url: '/signup/complete', UrlMatching: 'contains' },
      {
        Event: 'signed_up',
        Properties: '[{"key":"plan","operator":"exact","type":"person","value":"pro"},{"key":"email","operator":"is_set","type":"person"}]',
      },
    ],
  });
  t.hasResource('PostHog::ProductAnalytics::Action', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(action.actionId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^SignedUp/), 'Id'] });
  expect(stack.resolve(action.actionCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^SignedUp/), 'CreatedAt'] });
  expect(action.project).toBe(project);
});

test('project.addAction scopes the action to the project', () => {
  const { stack, project } = setup();
  const action = project.addAction('Purchased', { name: 'Purchased', steps: [{ event: 'purchase' }] });
  expect(action.project).toBe(project);
  expect(action.node.scope).toBe(project);
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Action', {
    ProjectId: '12345',
    Name: 'Purchased',
    Steps: [{ Event: 'purchase' }],
  });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Action(stack, 'Bare', { project, name: 'Bare', removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::Action', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::ProductAnalytics::Action'))[0].Properties;
  expect(props).toEqual({ ProjectId: '12345', Name: 'Bare' });
});

test('validates concrete names and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new Action(stack, 'Empty', { project, name: '' })).toThrow(/Action name must be between 1 and 400/);
  expect(() => new Action(stack, 'Long', { project, name: 'x', slackMessageFormat: 'y'.repeat(1201) })).toThrow(/slackMessageFormat/);
  const name = new CfnParameter(stack, 'ActionName', { type: 'String' });
  expect(() => new Action(stack, 'Token', { project, name: name.valueAsString })).not.toThrow();
});

test('rejects incomplete property filters', () => {
  const { stack, project } = setup();
  expect(() => new Action(stack, 'Bad', { project, name: 'Bad', steps: [{ properties: [{ key: 'plan' }] }] }))
    .toThrow(/value is required/);
});

test('imports existing actions, projects and organizations', () => {
  const { stack, project } = setup();
  const action = Action.fromActionId(stack, 'Existing', project, '99');
  expect(action.actionId).toBe('99');
  expect(action.project.projectId).toBe('12345');
  expect(Organization.fromOrganizationId(stack, 'Org', 'org-uuid').organizationId).toBe('org-uuid');
});

test('can reference a project ID token', () => {
  const stack = new Stack(new App(), 'Test');
  const param = new CfnParameter(stack, 'ProjectIdParam', { type: 'String' });
  const project = Project.fromProjectId(stack, 'Project', param.valueAsString);
  project.addAction('A', { name: 'A' });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Action', { ProjectId: { Ref: 'ProjectIdParam' } });
});
