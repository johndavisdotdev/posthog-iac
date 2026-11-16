import { App, CfnParameter, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyOperator } from '../../src/core';
import { ErrorFilter, SuppressionRule } from '../../src/error-tracking';
import { Project } from '../../src/organizations';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

describe('SuppressionRule', () => {
  test('creates a sampled rule with filters', () => {
    const { stack, project } = setup();
    const rule = new SuppressionRule(stack, 'Rule', {
      project,
      filters: ErrorFilter.exceptionMessage(PropertyOperator.ICONTAINS, 'ResizeObserver loop'),
      samplingRate: 0.5,
      order: 3,
    });
    Template.fromStack(stack).hasResourceProperties('PostHog::ErrorTracking::SuppressionRule', {
      ProjectId: '12345',
      Filters: '{"type":"AND","values":[{"key":"$exception_values","operator":"icontains","type":"event","value":"ResizeObserver loop"}]}',
      SamplingRate: 0.5,
      OrderKey: 3,
    });
    expect(stack.resolve(rule.suppressionRuleId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Rule/), 'Id'] });
  });

  test('omitted or empty filters make a match-all rule', () => {
    const { stack, project } = setup();
    new SuppressionRule(stack, 'All', { project });
    new SuppressionRule(stack, 'Empty', { project, filters: ErrorFilter.all() });
    const resources = Object.values(Template.fromStack(stack).findResources('PostHog::ErrorTracking::SuppressionRule'));
    expect(resources.map(r => r.Properties)).toEqual([{ ProjectId: '12345' }, { ProjectId: '12345' }]);
  });

  test('validates the sampling rate and skips tokens', () => {
    const { stack, project } = setup();
    expect(() => new SuppressionRule(stack, 'High', { project, samplingRate: 1.5 })).toThrow(/samplingRate must be between 0 and 1/);
    expect(() => new SuppressionRule(stack, 'Low', { project, samplingRate: -0.1 })).toThrow(/samplingRate/);
    const rate = new CfnParameter(stack, 'Rate', { type: 'Number' });
    expect(() => new SuppressionRule(stack, 'Token', { project, samplingRate: rate.valueAsNumber })).not.toThrow();
  });

  test('imports an existing rule', () => {
    const { stack, project } = setup();
    expect(SuppressionRule.fromSuppressionRuleId(stack, 'Existing', project, 's').suppressionRuleId).toBe('s');
  });
});
