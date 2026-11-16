import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyOperator } from '../../src/core';
import { Assignee, ErrorFilter, GroupingRule } from '../../src/error-tracking';
import { Project } from '../../src/organizations';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

const typeError = ErrorFilter.exceptionType(PropertyOperator.EXACT, ['TypeError']);
const typeErrorJson = '{"type":"AND","values":[{"key":"$exception_types","operator":"exact","type":"event","value":["TypeError"]}]}';

function propsOf(stack: Stack, type: string) {
  return Object.values(Template.fromStack(stack).findResources(type))[0].Properties;
}

describe('GroupingRule', () => {
  test('creates a rule with assignee, description and order', () => {
    const { stack, project } = setup();
    const rule = new GroupingRule(stack, 'Rule', {
      project,
      filters: ErrorFilter.exceptionType(PropertyOperator.EXACT, ['ChunkLoadError']),
      assignee: Assignee.user(7),
      description: 'Group chunk load errors',
      order: 1,
    });
    Template.fromStack(stack).hasResourceProperties('PostHog::ErrorTracking::GroupingRule', {
      ProjectId: '12345',
      Filters: '{"type":"AND","values":[{"key":"$exception_types","operator":"exact","type":"event","value":["ChunkLoadError"]}]}',
      Assignee: { Type: 'user', Id: '7' },
      Description: 'Group chunk load errors',
      OrderKey: 1,
    });
    expect(stack.resolve(rule.groupingRuleCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Rule/), 'CreatedAt'] });
  });

  test('leaves optional properties out', () => {
    const { stack, project } = setup();
    new GroupingRule(stack, 'Rule', { project, filters: typeError });
    expect(propsOf(stack, 'PostHog::ErrorTracking::GroupingRule')).toEqual({ ProjectId: '12345', Filters: typeErrorJson });
  });

  test('rejects empty filters and imports existing rules', () => {
    const { stack, project } = setup();
    expect(() => new GroupingRule(stack, 'Rule', { project, filters: ErrorFilter.all() })).toThrow(/at least one condition/);
    expect(GroupingRule.fromGroupingRuleId(stack, 'Existing', project, 'g').groupingRuleId).toBe('g');
  });
});
