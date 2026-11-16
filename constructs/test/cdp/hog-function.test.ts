import * as path from 'path';
import { App, CfnParameter, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { HogCode, HogFunction, HogFunctionInputType, HogFunctionType, WebhookMethod } from '../../src/cdp';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { Project } from '../../src/organizations';
import { Action } from '../../src/product-analytics';

const TYPE = 'PostHog::CDP::HogFunction';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack) {
  return Object.values(Template.fromStack(stack).findResources(TYPE))[0].Properties;
}

/** Flattens a resolved Fn::Join into its literal string parts. */
function joinedLiterals(value: any): string {
  expect(value).toHaveProperty('Fn::Join');
  return (value['Fn::Join'][1] as any[]).filter(p => typeof p === 'string').join('');
}

test('creates a destination with typed inputs, filters, masking and mappings', () => {
  const { stack, project } = setup();
  const action = Action.fromActionId(stack, 'Purchased', project, '42');
  const fn = new HogFunction(stack, 'Orders', {
    project,
    type: HogFunctionType.DESTINATION,
    name: 'Order webhook',
    description: 'Posts orders',
    enabled: true,
    code: HogCode.fromInline("fetch(inputs.url, {'method': 'POST'})"),
    inputsSchema: [
      { key: 'url', type: HogFunctionInputType.STRING, label: 'URL', required: true },
      { key: 'token', type: HogFunctionInputType.STRING, secret: true },
      { key: 'mode', type: HogFunctionInputType.CHOICE, default: 'a', additionalFields: { choices: [{ label: 'A', value: 'a' }] } },
    ],
    inputs: { url: 'https://example.com/hook', mode: 'a' },
    events: ['order_placed'],
    actions: [action],
    properties: [{ key: 'plan', value: 'pro', type: PropertyFilterType.PERSON }],
    filterTestAccounts: true,
    masking: { hash: '{person.id}', ttl: Duration.hours(1), threshold: 2 },
    mappings: [{ name: 'Big orders', events: ['order_placed'], properties: [{ key: 'total', value: 100, operator: PropertyOperator.GT }], inputs: { url: 'https://example.com/big' } }],
    iconUrl: 'https://example.com/icon.png',
    executionOrder: 3,
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties(TYPE, {
    ProjectId: '12345',
    Type: 'destination',
    Name: 'Order webhook',
    Description: 'Posts orders',
    Enabled: true,
    Hog: "fetch(inputs.url, {'method': 'POST'})",
    InputsSchema: '[{"key":"url","type":"string","label":"URL","required":true},{"key":"token","type":"string","secret":true},{"choices":[{"label":"A","value":"a"}],"key":"mode","type":"choice","default":"a"}]',
    Inputs: '{"url":{"value":"https://example.com/hook"},"mode":{"value":"a"}}',
    Filters: '{"events":[{"id":"order_placed","name":"order_placed","type":"events"}],"actions":[{"id":"42","type":"actions"}],"properties":[{"key":"plan","operator":"exact","type":"person","value":"pro"}],"filter_test_accounts":true}',
    Mappings: '[{"name":"Big orders","filters":{"events":[{"id":"order_placed","name":"order_placed","type":"events"}],"properties":[{"key":"total","operator":"gt","type":"event","value":100}]},"inputs":{"url":{"value":"https://example.com/big"}}}]',
    Masking: { Hash: '{person.id}', Ttl: 3600, Threshold: 2 },
    IconUrl: 'https://example.com/icon.png',
    ExecutionOrder: 3,
  });
  t.hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(stack.resolve(fn.hogFunctionId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Orders/), 'Id'] });
  expect(stack.resolve(fn.hogFunctionCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Orders/), 'CreatedAt'] });
  expect(stack.resolve(fn.hogFunctionUpdatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Orders/), 'UpdatedAt'] });
  expect(fn.project).toBe(project);
});

test('renders secret inputs only as dynamic references', () => {
  const { stack, project } = setup();
  const secret = new secretsmanager.Secret(stack, 'WebhookToken');
  new HogFunction(stack, 'Fn', {
    project,
    type: HogFunctionType.DESTINATION,
    name: 'Secret',
    code: HogCode.fromInline('return event'),
    inputsSchema: [{ key: 'token', type: HogFunctionInputType.STRING, secret: true }, { key: 'password', type: HogFunctionInputType.STRING, secret: true }],
    secretInputs: {
      token: secret.secretValueFromJson('token'),
      password: SecretValue.ssmSecure('/posthog/password'),
    },
  });

  const rendered = props(stack).SecretInputs;
  const literals = joinedLiterals(rendered);
  expect(literals).toContain('{"token":{"value":"{{resolve:secretsmanager:');
  expect(literals).toContain(':SecretString:token::}}"},"password":{"value":"{{resolve:ssm-secure:/posthog/password}}"}}');
  expect(JSON.stringify(rendered)).toContain('"Ref":"WebhookToken');
  expect(props(stack).Inputs).toBeUndefined();
  Annotations.fromStack(stack).hasNoWarning('*', Match.anyValue());
});

test('warns about plain-text secret inputs', () => {
  const { stack, project } = setup();
  new HogFunction(stack, 'Fn', {
    project,
    type: HogFunctionType.DESTINATION,
    name: 'Plain',
    code: HogCode.fromInline('return event'),
    secretInputs: { token: SecretValue.unsafePlainText('hunter2') },
  });
  Annotations.fromStack(stack).hasWarning('/Test/Fn', Match.stringLikeRegexp("Secret input 'token' is a plain-text value"));
});

test('validates the inputs / secretInputs split', () => {
  const { stack, project } = setup();
  const base = { project, type: HogFunctionType.DESTINATION, name: 'x', code: HogCode.fromInline('return event') };
  const secret = SecretValue.ssmSecure('/x');
  expect(() => new HogFunction(stack, 'Both', { ...base, inputs: { token: 'a' }, secretInputs: { token: secret } }))
    .toThrow(/token are in both inputs and secretInputs/);
  expect(() => new HogFunction(stack, 'Unmarked', {
    ...base,
    inputsSchema: [{ key: 'token', type: HogFunctionInputType.STRING }],
    secretInputs: { token: secret },
  })).toThrow(/secretInputs token must be marked secret/);
  expect(() => new HogFunction(stack, 'Leaked', {
    ...base,
    inputsSchema: [{ key: 'token', type: HogFunctionInputType.STRING, secret: true }],
    inputs: { token: 'plain' },
  })).toThrow(/inputs token are marked secret/);
});

test('reads Hog code from a file', () => {
  const { stack, project } = setup();
  new HogFunction(stack, 'Fn', {
    project,
    type: HogFunctionType.DESTINATION,
    name: 'From file',
    code: HogCode.fromFile(path.join(__dirname, 'fixtures', 'destination.hog')),
  });
  expect(props(stack).Hog).toBe("fetch(inputs.url, {'method': 'POST', 'body': event})\n");
  expect(() => new HogFunction(stack, 'Missing', {
    project,
    type: HogFunctionType.DESTINATION,
    name: 'Missing',
    code: HogCode.fromFile('/does/not/exist.hog'),
  })).toThrow(/file not found/);
  expect(() => HogCode.fromInline('  ')).toThrow(/empty/);
});

test('webhook() uses template-webhook with typed inputs', () => {
  const { stack, project } = setup();
  const fn = HogFunction.webhook(stack, 'Hook', {
    project,
    url: 'https://example.com/hook',
    method: WebhookMethod.PUT,
    headers: { 'Content-Type': 'application/json' },
    body: { event: '{event}', person: '{person}' },
    events: ['$pageview'],
  });
  expect(fn.project).toBe(project);
  Template.fromStack(stack).hasResourceProperties(TYPE, {
    Type: 'destination',
    TemplateId: 'template-webhook',
    Name: 'Webhook',
    Inputs: '{"url":{"value":"https://example.com/hook"},"method":{"value":"PUT"},"headers":{"value":{"Content-Type":"application/json"}},"body":{"value":{"event":"{event}","person":"{person}"}}}',
    Filters: '{"events":[{"id":"$pageview","name":"$pageview","type":"events"}]}',
  });
  expect(props(stack).Hog).toBeUndefined();
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new HogFunction(stack, 'Bare', {
    project,
    type: HogFunctionType.TRANSFORMATION,
    name: 'Bare',
    templateId: 'template-geoip',
    removalPolicy: RemovalPolicy.RETAIN,
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
  expect(props(stack)).toEqual({ ProjectId: '12345', Type: 'transformation', Name: 'Bare', TemplateId: 'template-geoip' });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  const code = HogCode.fromInline('return event');
  expect(() => new HogFunction(stack, 'Empty', { project, type: HogFunctionType.DESTINATION, name: '', code })).toThrow(/name must be between 1 and 400/);
  expect(() => new HogFunction(stack, 'NoCode', { project, type: HogFunctionType.DESTINATION, name: 'x' })).toThrow(/code, templateId or both/);
  expect(() => new HogFunction(stack, 'Ttl', {
    project, type: HogFunctionType.DESTINATION, name: 'x', code, masking: { hash: '{person.id}', ttl: Duration.days(2) },
  })).toThrow(/masking ttl/);
  expect(() => new HogFunction(stack, 'Mappings', {
    project, type: HogFunctionType.TRANSFORMATION, name: 'x', code, mappings: [{ name: 'm' }],
  })).toThrow(/mappings are only supported/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new HogFunction(stack, 'Token', { project, type: HogFunctionType.DESTINATION, name: name.valueAsString, code })).not.toThrow();
});

test('imports existing hog functions', () => {
  const { stack, project } = setup();
  const fn = HogFunction.fromHogFunctionId(stack, 'Existing', project, 'uuid-1');
  expect(fn.hogFunctionId).toBe('uuid-1');
  expect(fn.project).toBe(project);
});

test('references action IDs created in the stack', () => {
  const { stack, project } = setup();
  const action = new Action(stack, 'Signup', { project, name: 'Signed up', steps: [{ event: 'signed_up' }] });
  new HogFunction(stack, 'Fn', { project, type: HogFunctionType.DESTINATION, name: 'x', code: HogCode.fromInline('return event'), actions: [action] });
  expect(JSON.stringify(props(stack).Filters)).toContain('Fn::GetAtt');
});
