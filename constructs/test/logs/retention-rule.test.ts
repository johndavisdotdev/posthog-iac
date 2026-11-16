import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyOperator } from '../../src/core';
import { LogFilter, RetentionRule } from '../../src/logs';
import { Project } from '../../src/organizations';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

const api = LogFilter.serviceName(PropertyOperator.EXACT, 'api');

test('creates a rule with retention days and typed filters', () => {
  const { stack, project } = setup();
  const rule = new RetentionRule(stack, 'Rule', {
    project, name: 'Keep API logs', retention: Duration.days(30), filters: api, priority: 0, enabled: true,
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Logs::RetentionRule', {
    ProjectId: '12345',
    Name: 'Keep API logs',
    Enabled: true,
    Priority: 0,
    Config: '{"retention_days":30,"filter_group":{"type":"AND","values":[{"type":"AND","values":'
      + '[{"key":"service.name","operator":"exact","type":"log_resource_attribute","value":"api"}]}]}}',
  });
  t.hasResource('PostHog::Logs::RetentionRule', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(rule.retentionRuleId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Rule/), 'Id'] });
  expect(stack.resolve(rule.retentionRuleVersion)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Rule/), 'Version'] });
  expect(stack.resolve(rule.retentionRuleCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Rule/), 'CreatedAt'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new RetentionRule(stack, 'Rule', {
    project, name: 'R', retention: Duration.hours(48), filters: api, removalPolicy: RemovalPolicy.RETAIN,
  });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Logs::RetentionRule', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::Logs::RetentionRule'))[0].Properties;
  expect(Object.keys(props)).toEqual(['ProjectId', 'Name', 'Config']);
  expect(JSON.parse(props.Config).retention_days).toBe(2);
});

test('validates retention, priority and name, and skips tokens', () => {
  const { stack, project } = setup();
  const base = { project, name: 'R', filters: api };
  expect(() => new RetentionRule(stack, 'Hours', { ...base, retention: Duration.hours(36) })).toThrow(/retention must be a whole number of days/);
  expect(() => new RetentionRule(stack, 'Zero', { ...base, retention: Duration.days(0) })).toThrow(/retention \(days\) must be between 1/);
  expect(() => new RetentionRule(stack, 'Priority', { ...base, retention: Duration.days(7), priority: -1 })).toThrow(/priority/);
  expect(() => new RetentionRule(stack, 'Name', { ...base, name: '', retention: Duration.days(7) })).toThrow(/name must be between 1 and 255/);
  const days = new CfnParameter(stack, 'Days', { type: 'Number' });
  new RetentionRule(stack, 'Token', { ...base, retention: Duration.days(days.valueAsNumber) });
  const resources = Template.fromStack(stack).findResources('PostHog::Logs::RetentionRule');
  const token = Object.entries(resources).find(([k]) => k.startsWith('Token'))![1];
  expect(JSON.stringify(token.Properties.Config)).toContain('Days');
});

test('imports an existing rule', () => {
  const { stack, project } = setup();
  const rule = RetentionRule.fromRetentionRuleId(stack, 'Existing', project, 'r');
  expect(rule.retentionRuleId).toBe('r');
  expect(rule.project).toBe(project);
});
