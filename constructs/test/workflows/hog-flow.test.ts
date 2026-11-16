import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType } from '../../src/core';
import { Project } from '../../src/organizations';
import { Action } from '../../src/product-analytics';
import {
  EmailRateLimitPeriod,
  HogFlow,
  HogFlowAction,
  HogFlowEdgeType,
  HogFlowExitCondition,
  HogFlowOriginProduct,
  HogFlowStatus,
  HogFlowTrigger,
  HogFlowVariableType,
  MessageCategory,
  MessageTemplate,
} from '../../src/workflows';

const TYPE = 'PostHog::Workflows::HogFlow';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack) {
  return Object.values(Template.fromStack(stack).findResources(TYPE))[0].Properties;
}

/** Parses a JSON property; tokens become their resolved CloudFormation form. */
function parsed(stack: Stack, value: any): any {
  if (typeof value === 'string') return JSON.parse(value);
  return stack.resolve(value);
}

test('chains a linear workflow and appends an exit step', () => {
  const { stack, project } = setup();
  const flow = new HogFlow(stack, 'Onboarding', {
    project,
    name: 'Onboarding',
    description: 'Follow up after sign-up',
    tags: ['growth'],
    status: HogFlowStatus.DRAFT,
    trigger: HogFlowTrigger.event({ name: 'Signed up', events: ['signed_up'], properties: [{ key: 'plan', value: 'pro', type: PropertyFilterType.PERSON }] }),
    actions: [
      HogFlowAction.delay('wait', { name: 'Wait a day', duration: Duration.days(1) }),
      HogFlowAction.webhook('notify', { url: 'https://example.com/hook', method: 'POST', body: { person: '{person.id}' } }),
    ],
  });

  const p = props(stack);
  expect(p).toMatchObject({ ProjectId: '12345', Name: 'Onboarding', Description: 'Follow up after sign-up', Tags: ['growth'], Status: 'draft' });
  const actions = parsed(stack, p.Actions);
  expect(actions.map((a: any) => a.id)).toEqual(['trigger_node', 'wait', 'notify', 'exit_node']);
  expect(actions).toMatchSnapshot();
  expect(parsed(stack, p.Edges)).toEqual([
    { from: 'trigger_node', to: 'wait', type: 'continue' },
    { from: 'wait', to: 'notify', type: 'continue' },
    { from: 'notify', to: 'exit_node', type: 'continue' },
  ]);
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(stack.resolve(flow.hogFlowId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'Id'] });
  expect(stack.resolve(flow.hogFlowVersion)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'Version'] });
  expect(stack.resolve(flow.hogFlowTrigger)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'Trigger'] });
  expect(stack.resolve(flow.hogFlowCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Onboarding/), 'CreatedAt'] });
});

test('renders email steps with messaging templates and categories', () => {
  const { stack, project } = setup();
  const category = MessageCategory.fromMessageCategoryId(stack, 'Category', project, 'category-uuid');
  const template = MessageTemplate.fromMessageTemplateId(stack, 'Template', project, 'template-uuid');
  const action = Action.fromActionId(stack, 'Purchased', project, '7');
  new HogFlow(stack, 'Flow', {
    project,
    name: 'Emails',
    trigger: HogFlowTrigger.event({ actions: [action], filterTestAccounts: true }),
    actions: [
      HogFlowAction.sendEmail('welcome', { template, category }),
      HogFlowAction.sendEmail('inline', { to: 'ops@example.com', email: { subject: 'New buyer', text: 'See PostHog' } }),
      HogFlowAction.exit('done', { reason: 'Sent' }),
    ],
  });
  const actions = parsed(stack, props(stack).Actions);
  expect(actions).toMatchSnapshot();
  expect(actions.map((a: any) => a.id)).toEqual(['trigger_node', 'welcome', 'inline', 'done']);
});

test('references messaging resources created in the stack', () => {
  const { stack, project } = setup();
  const category = new MessageCategory(stack, 'Category', { project, key: 'onboarding', name: 'Onboarding' });
  const template = new MessageTemplate(stack, 'Template', { project, name: 'Welcome', email: { subject: 'Hi' } });
  new HogFlow(stack, 'Flow', {
    project,
    name: 'Emails',
    trigger: HogFlowTrigger.event({ events: ['signed_up'] }),
    actions: [HogFlowAction.sendEmail('welcome', { template, category })],
  });
  const rendered = JSON.stringify(stack.resolve(props(stack).Actions));
  expect(rendered).toContain('Fn::Join');
  expect(rendered).toMatch(/"Fn::GetAtt":\["Template[0-9A-F]+","Id"\]/);
  expect(rendered).toMatch(/"Fn::GetAtt":\["Category[0-9A-F]+","Id"\]/);
});

test('supports explicit edges, branches and raw escape hatches', () => {
  const { stack, project } = setup();
  new HogFlow(stack, 'Flow', {
    project,
    name: 'Branching',
    trigger: HogFlowTrigger.custom({ config: { type: 'webhook' } }),
    actions: [
      HogFlowAction.custom('branch', { type: 'conditional_branch', config: { conditions: [{ filters: { properties: [] } }] } }),
      HogFlowAction.fromTemplate('slack', { templateId: 'template-slack', inputs: { channel: '#growth' } }),
      HogFlowAction.exit('exit'),
    ],
    rawActions: [{ id: 'raw_exit', name: 'Raw exit', type: 'exit', config: { reason: 'raw' } }],
    edges: [
      { from: 'trigger_node', to: 'branch' },
      { from: 'branch', to: 'slack', type: HogFlowEdgeType.BRANCH, index: 0 },
      { from: 'branch', to: 'exit' },
      { from: 'slack', to: 'exit' },
    ],
    rawEdges: [{ from: 'branch', to: 'raw_exit', type: 'branch', index: 1 }],
  });
  const p = props(stack);
  expect(parsed(stack, p.Actions)).toMatchSnapshot();
  expect(parsed(stack, p.Edges)).toEqual([
    { from: 'trigger_node', to: 'branch', type: 'continue' },
    { from: 'branch', to: 'slack', type: 'branch', index: 0 },
    { from: 'branch', to: 'exit', type: 'continue' },
    { from: 'slack', to: 'exit', type: 'continue' },
    { from: 'branch', to: 'raw_exit', type: 'branch', index: 1 },
  ]);
});

test('renders conversion, masking, rate limit and variables', () => {
  const { stack, project } = setup();
  new HogFlow(stack, 'Flow', {
    project,
    name: 'Full',
    status: HogFlowStatus.ACTIVE,
    originProduct: HogFlowOriginProduct.LOOPS,
    exitCondition: HogFlowExitCondition.EXIT_ON_CONVERSION,
    conversion: { events: ['purchased'], properties: [{ key: 'paid', value: true, type: PropertyFilterType.PERSON }], window: Duration.days(7) },
    triggerMasking: { hash: '{person.id}', ttl: Duration.days(30), threshold: 2 },
    emailSendingRateLimit: { count: 100, period: EmailRateLimitPeriod.HOUR },
    variables: [{ key: 'coupon', type: HogFlowVariableType.STRING, default: 'WELCOME' }],
    trigger: HogFlowTrigger.event({ events: ['signed_up'] }),
  });
  Template.fromStack(stack).hasResourceProperties(TYPE, {
    Status: 'active',
    OriginProduct: 'loops',
    ExitCondition: 'exit_on_conversion',
    Conversion: '{"filters":[{"key":"paid","operator":"exact","type":"person","value":true}],"events":[{"filters":{"events":[{"id":"purchased","name":"purchased","type":"events"}]}}],"window":"7d"}',
    TriggerMasking: { Hash: '{person.id}', Ttl: 2592000, Threshold: 2 },
    EmailSendingRateLimit: { Count: 100, Period: 'hour' },
    Variables: '[{"key":"coupon","type":"string","default":"WELCOME"}]',
    Edges: '[{"from":"trigger_node","to":"exit_node","type":"continue"}]',
  });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new HogFlow(stack, 'Bare', {
    project,
    name: 'Bare',
    rawActions: [{ id: 't', name: 't', type: 'trigger', config: { type: 'manual' } }],
    removalPolicy: RemovalPolicy.RETAIN,
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
  expect(props(stack)).toEqual({ ProjectId: '12345', Name: 'Bare', Actions: '[{"id":"t","name":"t","type":"trigger","config":{"type":"manual"}}]' });
});

test('validates the graph and concrete values, and skips tokens', () => {
  const { stack, project } = setup();
  const trigger = HogFlowTrigger.event({ events: ['e'] });
  expect(() => new HogFlow(stack, 'NoTrigger', { project, name: 'x' })).toThrow(/exactly one trigger step is required, got 0/);
  expect(() => new HogFlow(stack, 'TwoTriggers', {
    project, name: 'x', trigger, rawActions: [{ id: 'raw', type: 'trigger', config: {} }],
  })).toThrow(/got 2/);
  expect(() => new HogFlow(stack, 'Dup', {
    project, name: 'x', trigger, actions: [HogFlowAction.exit('a'), HogFlowAction.exit('a')], edges: [],
  })).toThrow(/duplicate step IDs: a/);
  expect(() => new HogFlow(stack, 'Unknown', {
    project, name: 'x', trigger, edges: [{ from: 'trigger_node', to: 'missing' }],
  })).toThrow(/unknown step 'missing'/);
  expect(() => new HogFlow(stack, 'Branch', {
    project, name: 'x', trigger, actions: [HogFlowAction.exit('a')], edges: [{ from: 'trigger_node', to: 'a', type: HogFlowEdgeType.BRANCH }],
  })).toThrow(/requires index/);
  expect(() => new HogFlow(stack, 'Conversion', {
    project, name: 'x', trigger, exitCondition: HogFlowExitCondition.EXIT_ON_TRIGGER_NOT_MATCHED_OR_CONVERSION,
  })).toThrow(/requires conversion/);
  expect(() => new HogFlow(stack, 'Ttl', { project, name: 'x', trigger, triggerMasking: { hash: 'h', ttl: Duration.seconds(10) } })).toThrow(/ttl/);
  expect(() => new HogFlow(stack, 'Name', { project, name: '', trigger })).toThrow(/name must be between 1 and 400/);
  expect(() => HogFlowAction.delay('d', { duration: Duration.seconds(30) })).toThrow(/whole number of minutes/);
  expect(HogFlowAction.delay('d', { duration: Duration.minutes(90) })._render()).toMatchObject({ config: { delay_duration: '90m' } });
  expect(HogFlowAction.delay('d', { duration: Duration.hours(6) })._render()).toMatchObject({ config: { delay_duration: '6h' } });
  expect(() => HogFlowTrigger.event({})).toThrow(/at least one event or action/);
  expect(() => HogFlowAction.sendEmail('e', {})).toThrow(/exactly one of email, template/);
  expect(() => HogFlowAction.custom('c', { type: 'trigger', config: {} })).toThrow(/use HogFlowTrigger/);
  const name = new CfnParameter(stack, 'FlowName', { type: 'String' });
  expect(() => new HogFlow(stack, 'Token', { project, name: name.valueAsString, trigger })).not.toThrow();
});

test('imports existing workflows', () => {
  const { stack, project } = setup();
  const flow = HogFlow.fromHogFlowId(stack, 'F', project, 'uuid');
  expect(flow.hogFlowId).toBe('uuid');
  expect(flow.project).toBe(project);
});
