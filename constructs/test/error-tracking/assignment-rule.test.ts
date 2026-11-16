import { App, CfnParameter, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import { PropertyOperator } from '../../src/core';
import { Assignee, AssigneeType, AssignmentRule, ErrorFilter } from '../../src/error-tracking';
import { IOrganization, IRole, Organization, Project } from '../../src/organizations';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

class TestRole extends Resource implements IRole {
  constructor(scope: Construct, id: string, public readonly roleId: string, public readonly organization: IOrganization) {
    super(scope, id);
  }
}

const typeError = ErrorFilter.exceptionType(PropertyOperator.EXACT, ['TypeError']);
const typeErrorJson = '{"type":"AND","values":[{"key":"$exception_types","operator":"exact","type":"event","value":["TypeError"]}]}';

function propsOf(stack: Stack, type: string) {
  return Object.values(Template.fromStack(stack).findResources(type))[0].Properties;
}

describe('AssignmentRule', () => {
  test('assigns to a user with typed filters and order', () => {
    const { stack, project } = setup();
    const rule = new AssignmentRule(stack, 'Rule', { project, filters: typeError, assignee: Assignee.user(42), order: 2 });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('PostHog::ErrorTracking::AssignmentRule', {
      ProjectId: '12345',
      Filters: typeErrorJson,
      Assignee: { Type: 'user', Id: '42' },
      OrderKey: 2,
    });
    t.hasResource('PostHog::ErrorTracking::AssignmentRule', { DeletionPolicy: 'Delete' });
    expect(stack.resolve(rule.assignmentRuleId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Rule/), 'Id'] });
    expect(stack.resolve(rule.assignmentRuleCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Rule/), 'CreatedAt'] });
    expect(rule.project).toBe(project);
  });

  test('assigns to a role and leaves order out', () => {
    const { stack, project } = setup();
    const role = new TestRole(stack, 'Role', 'role-uuid', Organization.fromOrganizationId(stack, 'Org', 'org'));
    const assignee = Assignee.role(role);
    expect(assignee.type).toBe(AssigneeType.ROLE);
    new AssignmentRule(stack, 'Rule', { project, filters: typeError, assignee, removalPolicy: RemovalPolicy.RETAIN });
    expect(propsOf(stack, 'PostHog::ErrorTracking::AssignmentRule')).toEqual({
      ProjectId: '12345',
      Filters: typeErrorJson,
      Assignee: { Type: 'role', Id: 'role-uuid' },
    });
    Template.fromStack(stack).hasResource('PostHog::ErrorTracking::AssignmentRule', { DeletionPolicy: 'Retain' });
  });

  test('accepts a user ID token', () => {
    const { stack, project } = setup();
    const userId = new CfnParameter(stack, 'UserId', { type: 'Number' });
    new AssignmentRule(stack, 'Rule', { project, filters: typeError, assignee: Assignee.user(userId.valueAsNumber) });
    expect(stack.resolve(propsOf(stack, 'PostHog::ErrorTracking::AssignmentRule').Assignee.Id)).toEqual({ Ref: 'UserId' });
  });

  test('rejects empty filters', () => {
    const { stack, project } = setup();
    expect(() => new AssignmentRule(stack, 'Rule', { project, filters: ErrorFilter.all(), assignee: Assignee.user(1) }))
      .toThrow(/at least one condition/);
  });

  test('imports an existing rule', () => {
    const { stack, project } = setup();
    const rule = AssignmentRule.fromAssignmentRuleId(stack, 'Existing', project, 'rule-uuid');
    expect(rule.assignmentRuleId).toBe('rule-uuid');
    expect(rule.project).toBe(project);
  });
});
