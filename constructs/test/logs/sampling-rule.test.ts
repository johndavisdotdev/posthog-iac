import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyOperator } from '../../src/core';
import { AttributeOperator, LogFilter, RuleType, SamplingRule, SamplingSource, SeverityAction } from '../../src/logs';
import { Project } from '../../src/organizations';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function config(stack: Stack, id: string) {
  const resources = Template.fromStack(stack).findResources('PostHog::Logs::SamplingRule');
  return JSON.parse(Object.entries(resources).find(([k]) => k.startsWith(id))![1].Properties.Config);
}

const health = LogFilter.attribute('http.route', PropertyOperator.EXACT, '/health');

test('creates a path drop rule with scopes', () => {
  const { stack, project } = setup();
  const rule = new SamplingRule(stack, 'Drop', {
    project,
    name: 'Drop health checks',
    ruleType: RuleType.PATH_DROP,
    source: SamplingSource.SPANS,
    filters: health,
    dropPatterns: ['^/ready$'],
    matchAttributeKey: 'url.path',
    scopeService: 'api',
    pathPattern: '^/internal',
    attributeFilters: [
      { key: 'http.method', operator: AttributeOperator.EQUALS, value: 'GET' },
      { key: 'synthetic', operator: AttributeOperator.EXISTS },
    ],
    priority: 0,
    enabled: true,
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Logs::SamplingRule', {
    ProjectId: '12345',
    Name: 'Drop health checks',
    Enabled: true,
    Priority: 0,
    RuleType: 'path_drop',
    Source: 'spans',
    ScopeService: 'api',
    ScopePathPattern: '^/internal',
    ScopeAttributeFilters: '[{"key":"http.method","op":"eq","value":"GET"},{"key":"synthetic","op":"exists"}]',
  });
  t.hasResource('PostHog::Logs::SamplingRule', { DeletionPolicy: 'Delete' });
  expect(config(stack, 'Drop')).toEqual({
    filter_group: health.render(),
    patterns: ['^/ready$'],
    match_attribute_key: 'url.path',
  });
  expect(stack.resolve(rule.samplingRuleId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Drop/), 'Id'] });
  expect(stack.resolve(rule.samplingRuleVersion)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Drop/), 'Version'] });
  expect(stack.resolve(rule.samplingRuleCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Drop/), 'CreatedAt'] });
});

test('creates a severity sampling rule with sample rates and always-keep', () => {
  const { stack, project } = setup();
  new SamplingRule(stack, 'Severity', {
    project,
    name: 'Sample debug',
    ruleType: RuleType.SEVERITY_SAMPLING,
    severityActions: { debug: SeverityAction.drop(), info: SeverityAction.sample(0.1), error: SeverityAction.keep() },
    alwaysKeep: {
      statusCodeAtLeast: 500,
      latencyAbove: Duration.seconds(2),
      attributes: [{ key: 'tenant', operator: AttributeOperator.NOT_EQUALS, value: 'test' }],
    },
  });
  expect(config(stack, 'Severity')).toMatchInlineSnapshot(`
{
  "actions": {
    "DEBUG": {
      "type": "drop",
    },
    "ERROR": {
      "type": "keep",
    },
    "INFO": {
      "rate": 0.1,
      "type": "sample",
    },
  },
  "always_keep": {
    "attribute_predicates": [
      {
        "key": "tenant",
        "op": "ne",
        "value": "test",
      },
    ],
    "latency_ms_gt": 2000,
    "status_gte": 500,
  },
}
`);
});

test('creates rate limit rules in records or kilobytes', () => {
  const { stack, project } = setup();
  new SamplingRule(stack, 'Logs', {
    project,
    name: 'Cap api',
    ruleType: RuleType.RATE_LIMIT,
    logsPerSecond: 200,
    burstLogs: 1000,
    filters: LogFilter.serviceName(PropertyOperator.EXACT, 'api'),
  });
  new SamplingRule(stack, 'Kb', { project, name: 'Cap bytes', ruleType: RuleType.RATE_LIMIT, kbPerSecond: 500, burstKb: 500 });
  expect(config(stack, 'Logs')).toEqual({
    logs_per_second: 200,
    burst_logs: 1000,
    filter_group: LogFilter.serviceName(PropertyOperator.EXACT, 'api').render(),
  });
  expect(config(stack, 'Kb')).toEqual({ kb_per_second: 500, burst_kb: 500 });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new SamplingRule(stack, 'Bare', {
    project, name: 'Bare', ruleType: RuleType.SEVERITY_SAMPLING, removalPolicy: RemovalPolicy.RETAIN,
  });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Logs::SamplingRule', { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources('PostHog::Logs::SamplingRule'))[0].Properties).toEqual({
    ProjectId: '12345', Name: 'Bare', RuleType: 'severity_sampling', Config: '{}',
  });
});

test('validates config against the rule type', () => {
  const { stack, project } = setup();
  const base = { project, name: 'R' };
  expect(() => new SamplingRule(stack, 'A', { ...base, ruleType: RuleType.PATH_DROP })).toThrow(/needs filters or dropPatterns/);
  expect(() => new SamplingRule(stack, 'B', { ...base, ruleType: RuleType.SEVERITY_SAMPLING, filters: health })).toThrow(/filters is not supported for rule type 'severity_sampling'/);
  expect(() => new SamplingRule(stack, 'C', { ...base, ruleType: RuleType.PATH_DROP, filters: health, logsPerSecond: 1 })).toThrow(/logsPerSecond is not supported/);
  expect(() => new SamplingRule(stack, 'D', { ...base, ruleType: RuleType.PATH_DROP, filters: health, severityActions: {} })).toThrow(/severityActions is not supported/);
  expect(() => new SamplingRule(stack, 'E', { ...base, ruleType: RuleType.SEVERITY_SAMPLING, source: SamplingSource.SPANS })).toThrow(/span rules support PATH_DROP and RATE_LIMIT only/);
  expect(() => new SamplingRule(stack, 'F', { ...base, ruleType: RuleType.RATE_LIMIT })).toThrow(/exactly one of logsPerSecond, kbPerSecond/);
  expect(() => new SamplingRule(stack, 'G', { ...base, ruleType: RuleType.RATE_LIMIT, logsPerSecond: 1, kbPerSecond: 1 })).toThrow(/exactly one/);
  expect(() => new SamplingRule(stack, 'H', { ...base, ruleType: RuleType.RATE_LIMIT, logsPerSecond: 0 })).toThrow(/logsPerSecond must be between 1 and 1000000/);
  expect(() => new SamplingRule(stack, 'I', { ...base, ruleType: RuleType.RATE_LIMIT, logsPerSecond: 10, burstLogs: 5 })).toThrow(/burstLogs \(5\) must be at least logsPerSecond \(10\)/);
  expect(() => new SamplingRule(stack, 'J', { ...base, ruleType: RuleType.RATE_LIMIT, logsPerSecond: 10, burstKb: 50 })).toThrow(/burstKb needs kbPerSecond/);
  expect(() => new SamplingRule(stack, 'K', {
    ...base, ruleType: RuleType.PATH_DROP, filters: health, attributeFilters: [{ key: 'x', operator: AttributeOperator.EQUALS }],
  })).toThrow(/value is required/);
  expect(() => new SamplingRule(stack, 'L', { ...base, ruleType: RuleType.PATH_DROP, filters: health, pathPattern: 'x'.repeat(1025) })).toThrow(/pathPattern/);
});

test('validates sample rates and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => SeverityAction.sample(1.1)).toThrow(/sample rate must be between 0 and 1/);
  expect(() => SeverityAction.sample(-0.5)).toThrow(/sample rate/);
  const rate = new CfnParameter(stack, 'Rate', { type: 'Number' });
  expect(() => SeverityAction.sample(rate.valueAsNumber)).not.toThrow();
  const lps = new CfnParameter(stack, 'Lps', { type: 'Number' });
  expect(() => new SamplingRule(stack, 'Token', {
    project, name: 'T', ruleType: RuleType.RATE_LIMIT, logsPerSecond: lps.valueAsNumber, burstLogs: 5,
  })).not.toThrow();
});

test('imports an existing rule', () => {
  const { stack, project } = setup();
  const rule = SamplingRule.fromSamplingRuleId(stack, 'Existing', project, 's');
  expect(rule.samplingRuleId).toBe('s');
  expect(rule.project).toBe(project);
});
