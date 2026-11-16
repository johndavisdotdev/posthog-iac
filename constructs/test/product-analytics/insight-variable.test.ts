import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import { Insight, InsightQuery, InsightVariable, VariableType, VariableValue } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a List variable and references it from a HogQL insight', () => {
  const { stack, project } = setup();
  const country = new InsightVariable(stack, 'Country', {
    project,
    name: 'Country',
    type: VariableType.LIST,
    values: ['US', 'DE', 'FR'],
    isMulti: true,
    defaultValue: VariableValue.list(['US', 'DE']),
  });
  new Insight(stack, 'ByCountry', {
    project,
    query: InsightQuery.hogql(`select count() from events where properties.$geoip_country_code in ${country.placeholder}`, { variables: [country] }),
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::InsightVariable', {
    ProjectId: '12345',
    Name: 'Country',
    Type: 'List',
    Values: ['US', 'DE', 'FR'],
    IsMulti: true,
    DefaultValue: '["US","DE"]',
  });
  t.hasResource('PostHog::ProductAnalytics::InsightVariable', { DeletionPolicy: 'Delete' });
  const query = Object.values(t.findResources('PostHog::ProductAnalytics::Insight'))[0].Properties.Query;
  const joined = JSON.stringify(query);
  expect(joined).toContain('CodeName');
  expect(joined).toContain('"variables\\":{\\""');
  expect(stack.resolve(country.variableId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Country/), 'Id'] });
  expect(stack.resolve(country.codeName)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Country/), 'CodeName'] });
});

test.each([
  [VariableType.STRING, VariableValue.string('hello'), 'hello'],
  [VariableType.LIST, VariableValue.string('US'), 'US'],
  [VariableType.NUMBER, VariableValue.number(42), '42'],
  [VariableType.BOOLEAN, VariableValue.boolean(false), 'false'],
  [VariableType.DATE, VariableValue.date(new Date(Date.UTC(2026, 0, 1))), '2026-01-01T00:00:00.000Z'],
  [VariableType.DATE, VariableValue.date('-7d'), '-7d'],
])('renders a typed %s default', (type, value, expected) => {
  const { stack, project } = setup();
  new InsightVariable(stack, 'V', { project, name: 'v', type, defaultValue: value });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::InsightVariable', { Type: type, DefaultValue: expected });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new InsightVariable(stack, 'Bare', { project, name: 'Bare', type: VariableType.STRING, removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::InsightVariable', { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources('PostHog::ProductAnalytics::InsightVariable'))[0].Properties)
    .toEqual({ ProjectId: '12345', Name: 'Bare', Type: 'String' });
});

test('validates names, defaults and list options, skipping tokens', () => {
  const { stack, project } = setup();
  expect(() => new InsightVariable(stack, 'Empty', { project, name: '', type: VariableType.STRING })).toThrow(/name/);
  expect(() => new InsightVariable(stack, 'Mismatch', { project, name: 'x', type: VariableType.NUMBER, defaultValue: VariableValue.string('a') }))
    .toThrow(/does not fit a Number variable/);
  expect(() => new InsightVariable(stack, 'NotMulti', { project, name: 'x', type: VariableType.LIST, defaultValue: VariableValue.list(['a']) }))
    .toThrow(/requires isMulti/);
  expect(() => new InsightVariable(stack, 'Values', { project, name: 'x', type: VariableType.STRING, values: ['a'] }))
    .toThrow(/only valid for List/);
  expect(() => VariableValue.date(new Date('nope'))).toThrow(/Invalid Date/);
  const n = new CfnParameter(stack, 'N', { type: 'Number' });
  new InsightVariable(stack, 'Token', { project, name: 'x', type: VariableType.NUMBER, defaultValue: VariableValue.number(n.valueAsNumber) });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::InsightVariable', { DefaultValue: { Ref: 'N' } });
});

test('imports a variable', () => {
  const { stack, project } = setup();
  const v = InsightVariable.fromInsightVariableAttributes(stack, 'V', { project, variableId: 'uuid', codeName: 'country' });
  expect(v.variableId).toBe('uuid');
  expect(v.codeName).toBe('country');
  expect(v.project).toBe(project);
});
