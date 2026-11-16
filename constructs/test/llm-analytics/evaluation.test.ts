import { App, CfnParameter, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType } from '../../src/core';
import {
  CategorySelectionMode, Evaluation, EvaluationOutput, EvaluationOutputType, EvaluationTarget, EvaluationType,
  JudgeMethod, NumericPassingOperator, Provider, ProviderKey, SettleStrategy,
} from '../../src/llm-analytics';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::LLMAnalytics::Evaluation';
const MODEL = { provider: Provider.OPENAI, model: 'gpt-4.1-mini' };

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack) {
  return Object.values(Template.fromStack(stack).findResources(TYPE))[0].Properties;
}

test('Evaluation.llmJudge renders typed config, conditions and the provider key', () => {
  const { stack, project } = setup();
  const key = new ProviderKey(stack, 'Key', {
    project, provider: Provider.OPENAI, name: 'OpenAI', apiKey: SecretValue.secretsManager('openai'),
  });
  const evaluation = Evaluation.llmJudge(stack, 'Politeness', {
    project,
    name: 'Politeness',
    description: 'Checks that the assistant stays polite',
    enabled: true,
    prompt: 'Return true if the answer is polite.',
    judgeMethod: JudgeMethod.DECISION,
    includeMedia: false,
    model: { provider: Provider.OPENAI, model: 'gpt-4.1-mini', providerKey: key },
    output: EvaluationOutput.boolean({ allowsNa: false, decisionThreshold: 0.7 }),
    conditions: [
      { id: 'gpt-4-1', samplingPercentage: 20, properties: [{ key: '$ai_model', value: 'gpt-4.1', type: PropertyFilterType.EVENT }] },
      {},
    ],
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties(TYPE, {
    ProjectId: '12345',
    Name: 'Politeness',
    Description: 'Checks that the assistant stays polite',
    Enabled: true,
    EvaluationType: 'llm_judge',
    EvaluationConfig: '{"prompt":"Return true if the answer is polite.","judge_method":"decision","include_media":false}',
    OutputType: 'boolean',
    OutputConfig: '{"allows_na":false,"decision_threshold":0.7}',
    Conditions: '[{"id":"gpt-4-1","rollout_percentage":20,"properties":[{"key":"$ai_model","operator":"exact","type":"event","value":"gpt-4.1"}]},'
      + '{"id":"condition-1","rollout_percentage":100,"properties":[]}]',
    ModelConfiguration: {
      Provider: 'openai',
      Model: 'gpt-4.1-mini',
      ProviderKeyId: { 'Fn::GetAtt': [stack.getLogicalId(key.resource), 'Id'] },
    },
  });
  t.hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(evaluation.evaluationType).toBe(EvaluationType.LLM_JUDGE);
  expect(evaluation.project).toBe(project);
  const attr = (name: string) => ({ 'Fn::GetAtt': [expect.stringMatching(/^Politeness/), name] });
  expect(stack.resolve(evaluation.evaluationId)).toEqual(attr('Id'));
  expect(stack.resolve(evaluation.status)).toEqual(attr('Status'));
  expect(stack.resolve(evaluation.statusReason)).toEqual(attr('StatusReason'));
  expect(stack.resolve(evaluation.evaluationCreatedAt)).toEqual(attr('CreatedAt'));
  expect(stack.resolve(evaluation.evaluationUpdatedAt)).toEqual(attr('UpdatedAt'));
});

test('Evaluation.hog with numeric output and a trace target', () => {
  const { stack } = setup();
  const project = Project.fromProjectId(stack, 'P2', '1');
  Evaluation.hog(stack, 'Length', {
    project,
    name: 'Length',
    source: 'return length(output) < 500',
    output: EvaluationOutput.numeric({ min: 0, max: 10, step: 1, passingThreshold: 7, passingOperator: NumericPassingOperator.LESS_THAN_OR_EQUAL }),
    target: EvaluationTarget.TRACE,
    settle: SettleStrategy.inactivity({ quietPeriod: Duration.minutes(2), maxAge: Duration.hours(1) }),
  });
  expect(props(stack)).toEqual({
    ProjectId: '1',
    Name: 'Length',
    EvaluationType: 'hog',
    EvaluationConfig: '{"source":"return length(output) < 500"}',
    OutputType: 'numeric',
    OutputConfig: '{"min":0,"max":10,"step":1,"passing_rule":{"operator":"lte","threshold":7}}',
    Target: 'trace',
    TargetConfig: '{"strategy":"inactivity","quiet_period_seconds":120,"max_age_seconds":3600}',
  });
});

test('Evaluation.sentiment defaults to sentiment output and leaves optional properties out', () => {
  const { stack, project } = setup();
  Evaluation.sentiment(stack, 'Mood', { project, name: 'Mood', removalPolicy: RemovalPolicy.RETAIN });
  expect(props(stack)).toEqual({ ProjectId: '12345', Name: 'Mood', EvaluationType: 'sentiment', OutputType: 'sentiment' });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
});

test('generic constructor with categorical output, fixed-window settle and raw config', () => {
  const { stack, project } = setup();
  new Evaluation(stack, 'Topic', {
    project,
    name: 'Topic',
    evaluationType: EvaluationType.LLM_JUDGE,
    model: MODEL,
    rawEvaluationConfig: { prompt: 'Classify the topic', reasoning_level: 'low' },
    output: EvaluationOutput.categorical({
      options: [{ key: 'billing', label: 'Billing' }, { key: 'other', label: 'Other' }],
      selectionMode: CategorySelectionMode.SINGLE,
      passingCategories: ['billing'],
    }),
    target: EvaluationTarget.SESSION,
    settle: SettleStrategy.fixedWindow(Duration.minutes(30)),
    directoryId: 'dir-1',
  });
  Template.fromStack(stack).hasResourceProperties(TYPE, {
    EvaluationConfig: '{"prompt":"Classify the topic","reasoning_level":"low"}',
    OutputType: 'categorical',
    OutputConfig: '{"options":[{"key":"billing","label":"Billing"},{"key":"other","label":"Other"}],"selection_mode":"single","passing_rule":{"categories":["billing"]}}',
    Target: 'session',
    TargetConfig: '{"strategy":"fixed_window","window_seconds":1800}',
    DirectoryId: 'dir-1',
  });
});

test('custom output escape hatch', () => {
  const { stack, project } = setup();
  Evaluation.hog(stack, 'Raw', {
    project, name: 'Raw', source: 'return true', output: EvaluationOutput.custom(EvaluationOutputType.BOOLEAN, { new_flag: true }),
  });
  Template.fromStack(stack).hasResourceProperties(TYPE, { OutputType: 'boolean', OutputConfig: '{"new_flag":true}' });
});

test('validates that llm_judge has a model configuration and a prompt', () => {
  const { stack, project } = setup();
  expect(() => new Evaluation(stack, 'NoModel', { project, name: 'x', evaluationType: EvaluationType.LLM_JUDGE, prompt: 'p' }))
    .toThrow(/model \(the judge model configuration\) is required for evaluation type 'llm_judge'/);
  expect(() => new Evaluation(stack, 'NoPrompt', { project, name: 'x', evaluationType: EvaluationType.LLM_JUDGE, model: MODEL }))
    .toThrow(/prompt is required/);
  expect(() => Evaluation.llmJudge(stack, 'EmptyPrompt', { project, name: 'x', prompt: '', model: MODEL })).toThrow(/prompt must be/);
  expect(() => Evaluation.llmJudge(stack, 'LongModel', { project, name: 'x', prompt: 'p', model: { ...MODEL, model: 'm'.repeat(101) } }))
    .toThrow(/model must be between 1 and 100/);
});

test('rejects options of other evaluation types', () => {
  const { stack, project } = setup();
  expect(() => new Evaluation(stack, 'HogModel', { project, name: 'x', evaluationType: EvaluationType.HOG, source: 's', model: MODEL }))
    .toThrow(/model is not supported for evaluation type 'hog'/);
  expect(() => new Evaluation(stack, 'SentPrompt', { project, name: 'x', evaluationType: EvaluationType.SENTIMENT, prompt: 'p' }))
    .toThrow(/prompt is not supported/);
  expect(() => new Evaluation(stack, 'JudgeSource', { project, name: 'x', evaluationType: EvaluationType.LLM_JUDGE, model: MODEL, prompt: 'p', source: 's' }))
    .toThrow(/source is not supported for evaluation type 'llm_judge'/);
  expect(() => new Evaluation(stack, 'HogNoSource', { project, name: 'x', evaluationType: EvaluationType.HOG }))
    .toThrow(/source is required/);
});

test('validates output, target, conditions and provider key', () => {
  const { stack, project } = setup();
  const judge = { project, name: 'x', prompt: 'p', model: MODEL };
  expect(() => Evaluation.llmJudge(stack, 'A', { ...judge, output: EvaluationOutput.sentiment() })).toThrow(/sentiment output goes with sentiment evaluations only/);
  expect(() => Evaluation.sentiment(stack, 'B', { project, name: 'x', output: EvaluationOutput.boolean() })).toThrow(/cannot be used with evaluation type 'sentiment'/);
  expect(() => Evaluation.llmJudge(stack, 'C', { ...judge, settle: SettleStrategy.fixedWindow(Duration.minutes(1)) })).toThrow(/settle is only supported/);
  expect(() => Evaluation.llmJudge(stack, 'D', { ...judge, conditions: [{ samplingPercentage: 101 }] })).toThrow(/samplingPercentage must be between 0 and 100/);
  expect(() => Evaluation.llmJudge(stack, 'E', { ...judge, conditions: [{ properties: [{ key: 'k' }] }] })).toThrow(/value is required/);
  expect(() => Evaluation.llmJudge(stack, 'F', { ...judge, name: '' })).toThrow(/Evaluation name must be between 1 and 400/);
  const gemini = ProviderKey.fromProviderKeyId(stack, 'Gemini', project, 'uuid', Provider.GEMINI);
  expect(() => Evaluation.llmJudge(stack, 'G', { ...judge, model: { ...MODEL, providerKey: gemini } }))
    .toThrow(/model provider 'openai' does not match the provider key's provider 'gemini'/);
  const unknown = ProviderKey.fromProviderKeyId(stack, 'Unknown', project, 'uuid-2');
  expect(() => Evaluation.llmJudge(stack, 'H', { ...judge, model: { ...MODEL, providerKey: unknown } })).not.toThrow();
});

test('validates output models', () => {
  expect(() => EvaluationOutput.boolean({ decisionThreshold: 2 })).toThrow(/decisionThreshold must be between 0 and 1/);
  expect(() => EvaluationOutput.numeric({ min: 5, max: 1 })).toThrow(/min \(5\) must be less than max \(1\)/);
  expect(() => EvaluationOutput.numeric({ step: 0 })).toThrow(/step must be positive/);
  expect(() => EvaluationOutput.numeric({ passingOperator: NumericPassingOperator.GREATER_THAN_OR_EQUAL })).toThrow(/requires passingThreshold/);
  expect(() => EvaluationOutput.categorical({ options: [] })).toThrow(/at least one option/);
  expect(() => EvaluationOutput.categorical({ options: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] })).toThrow(/duplicate option key 'a'/);
  expect(() => EvaluationOutput.categorical({ options: [{ key: 'a', label: 'A' }], passingCategories: ['b'] })).toThrow(/'b' is not one of the option keys/);
  expect(EvaluationOutput.numeric({ passingThreshold: 3 }).config).toEqual({ passing_rule: { operator: 'gte', threshold: 3 } });
  expect(EvaluationOutput.boolean().config).toBeUndefined();
});

test('skips validation for tokens', () => {
  const { stack, project } = setup();
  const s = new CfnParameter(stack, 'S', { type: 'String' }).valueAsString;
  const n = new CfnParameter(stack, 'N', { type: 'Number' }).valueAsNumber;
  expect(() => Evaluation.llmJudge(stack, 'T', {
    project, name: s, prompt: s, model: { provider: Provider.OPENAI, model: s }, conditions: [{ samplingPercentage: n }],
  })).not.toThrow();
});

test('imports existing evaluations', () => {
  const { stack, project } = setup();
  const evaluation = Evaluation.fromEvaluationId(stack, 'Existing', project, 'uuid');
  expect(evaluation.evaluationId).toBe('uuid');
  expect(evaluation.project).toBe(project);
});
