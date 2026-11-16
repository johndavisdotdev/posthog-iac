import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import { EventDefinition, EventEnforcementMode } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates an event definition with typed props', () => {
  const { stack, project } = setup();
  const def = new EventDefinition(stack, 'SignedUp', {
    project,
    name: 'signed_up',
    description: 'User finished sign-up',
    owner: '42',
    tags: ['growth', 'growth', 'core'],
    verified: true,
    hidden: false,
    enforcementMode: EventEnforcementMode.REJECT,
    primaryProperty: 'plan',
    postToSlack: true,
    defaultColumns: ['plan', 'email'],
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::EventDefinition', {
    ProjectId: '12345',
    Name: 'signed_up',
    Description: 'User finished sign-up',
    Owner: '42',
    Tags: ['growth', 'core'],
    Verified: true,
    Hidden: false,
    EnforcementMode: 'reject',
    PrimaryProperty: 'plan',
    PostToSlack: true,
    DefaultColumns: ['plan', 'email'],
  });
  t.hasResource('PostHog::ProductAnalytics::EventDefinition', { DeletionPolicy: 'Delete' });
  expect(def.eventName).toBe('signed_up');
  expect(stack.resolve(def.eventDefinitionId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^SignedUp/), 'Id'] });
  expect(stack.resolve(def.eventDefinitionCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^SignedUp/), 'CreatedAt'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new EventDefinition(stack, 'Bare', { project, name: 'bare', tags: [], defaultColumns: [], removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::EventDefinition', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::ProductAnalytics::EventDefinition'))[0].Properties;
  expect(props).toEqual({ ProjectId: '12345', Name: 'bare' });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new EventDefinition(stack, 'Empty', { project, name: '' })).toThrow(/name must be between 1 and 400/);
  expect(() => new EventDefinition(stack, 'Primary', { project, name: 'x', primaryProperty: 'p'.repeat(401) })).toThrow(/primaryProperty/);
  expect(() => new EventDefinition(stack, 'Owner', { project, name: 'x', owner: 'jane@example.com' })).toThrow(/numeric PostHog user ID/);
  const name = new CfnParameter(stack, 'NameParam', { type: 'String' });
  const owner = new CfnParameter(stack, 'OwnerParam', { type: 'String' });
  expect(() => new EventDefinition(stack, 'Token', { project, name: name.valueAsString, owner: owner.valueAsString })).not.toThrow();
});

test('imports existing event definitions', () => {
  const { stack, project } = setup();
  const def = EventDefinition.fromEventDefinitionId(stack, 'Existing', project, 'uuid-1', 'purchase');
  expect(def.eventDefinitionId).toBe('uuid-1');
  expect(def.eventName).toBe('purchase');
  expect(def.project).toBe(project);
});
