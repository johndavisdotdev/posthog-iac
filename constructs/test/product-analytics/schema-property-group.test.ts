import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import { PropertyType, SchemaPropertyGroup } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function propsOf(stack: Stack): any {
  return Object.values(Template.fromStack(stack).findResources('PostHog::ProductAnalytics::SchemaPropertyGroup'))[0].Properties;
}

test('renders typed properties through the L1', () => {
  const { stack, project } = setup();
  const group = new SchemaPropertyGroup(stack, 'Checkout', {
    project,
    name: 'Checkout',
    description: 'Checkout event properties',
    properties: [
      { name: 'amount', type: PropertyType.NUMERIC, required: true, description: 'Order total' },
      { name: 'currency', type: PropertyType.STRING, optionalInTypes: true },
    ],
  });
  expect(propsOf(stack)).toEqual({
    ProjectId: '12345',
    Name: 'Checkout',
    Description: 'Checkout event properties',
    Properties: [
      { Name: 'amount', PropertyType: 'Numeric', IsRequired: true, Description: 'Order total' },
      { Name: 'currency', PropertyType: 'String', IsOptionalInTypes: true },
    ],
  });
  expect(group.resource.props.properties).toHaveLength(2);
  Template.fromStack(stack).hasResource('PostHog::ProductAnalytics::SchemaPropertyGroup', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(group.schemaPropertyGroupId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Checkout/), 'Id'] });
});

test('addProperty appends to the constructor properties', () => {
  const { stack, project } = setup();
  const group = new SchemaPropertyGroup(stack, 'G', {
    project,
    name: 'G',
    properties: [{ name: 'a', type: PropertyType.BOOLEAN }],
  });
  group.addProperty({ name: 'b', type: PropertyType.DATE_TIME, required: false });
  group.addProperty({ name: 'c', type: PropertyType.ARRAY });
  expect(propsOf(stack).Properties).toEqual([
    { Name: 'a', PropertyType: 'Boolean' },
    { Name: 'b', PropertyType: 'DateTime', IsRequired: false },
    { Name: 'c', PropertyType: 'Array' },
  ]);
});

test('addProperty works without constructor properties', () => {
  const { stack, project } = setup();
  const group = new SchemaPropertyGroup(stack, 'G', { project, name: 'G', removalPolicy: RemovalPolicy.RETAIN });
  expect(group.resource.props.properties).toBeUndefined();
  group.addProperty({ name: 'meta', type: PropertyType.OBJECT });
  expect(propsOf(stack)).toEqual({ ProjectId: '12345', Name: 'G', Properties: [{ Name: 'meta', PropertyType: 'Object' }] });
  Template.fromStack(stack).hasResource('PostHog::ProductAnalytics::SchemaPropertyGroup', { DeletionPolicy: 'Retain' });
});

test('validates names and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new SchemaPropertyGroup(stack, 'A', { project, name: '' })).toThrow(/name must be between 1 and 400/);
  expect(() => new SchemaPropertyGroup(stack, 'B', {
    project,
    name: 'B',
    properties: [{ name: 'x', type: PropertyType.STRING }, { name: 'x', type: PropertyType.NUMERIC }],
  })).toThrow(/'x' is defined more than once/);
  const group = new SchemaPropertyGroup(stack, 'C', { project, name: 'C', properties: [{ name: 'x', type: PropertyType.STRING }] });
  expect(() => group.addProperty({ name: 'x', type: PropertyType.STRING })).toThrow(/more than once/);
  expect(() => group.addProperty({ name: '', type: PropertyType.STRING })).toThrow(/property name/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new SchemaPropertyGroup(stack, 'Token', { project, name: name.valueAsString, properties: [{ name: name.valueAsString, type: PropertyType.STRING }] }))
    .not.toThrow();
});

test('imports existing groups', () => {
  const { stack, project } = setup();
  const g = SchemaPropertyGroup.fromSchemaPropertyGroupId(stack, 'Existing', project, '3');
  expect(g.schemaPropertyGroupId).toBe('3');
  expect(g.project).toBe(project);
});
