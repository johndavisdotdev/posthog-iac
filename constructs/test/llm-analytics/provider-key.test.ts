import { App, CfnParameter, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Provider, ProviderKey, ProviderKeyProps } from '../../src/llm-analytics';
import { Project } from '../../src/organizations';

const API_KEY = SecretValue.secretsManager('openai-api-key');

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(project: ProviderKeyProps['project'], extra: Partial<ProviderKeyProps>): ProviderKeyProps {
  return { project, name: 'Key', provider: Provider.OPENAI, apiKey: API_KEY, ...extra };
}

test('creates a provider key with the API key as a dynamic reference', () => {
  const { stack, project } = setup();
  const key = new ProviderKey(stack, 'OpenAI', {
    project,
    provider: Provider.OPENAI,
    name: 'OpenAI production',
    apiKey: SecretValue.secretsManager('openai-api-key'),
    setAsActive: true,
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::LLMAnalytics::ProviderKey', {
    ProjectId: '12345',
    Provider: 'openai',
    Name: 'OpenAI production',
    ApiKey: '{{resolve:secretsmanager:openai-api-key:SecretString:::}}',
    SetAsActive: true,
  });
  t.hasResource('PostHog::LLMAnalytics::ProviderKey', { DeletionPolicy: 'Delete' });
  expect(key.provider).toBe(Provider.OPENAI);
  expect(key.project).toBe(project);
  const attr = (name: string) => ({ 'Fn::GetAtt': [expect.stringMatching(/^OpenAI/), name] });
  expect(stack.resolve(key.providerKeyId)).toEqual(attr('Id'));
  expect(stack.resolve(key.apiKeyMasked)).toEqual(attr('ApiKeyMasked'));
  expect(stack.resolve(key.state)).toEqual(attr('State'));
  expect(stack.resolve(key.errorMessage)).toEqual(attr('ErrorMessage'));
  expect(stack.resolve(key.providerKeyCreatedAt)).toEqual(attr('CreatedAt'));
  expect(stack.resolve(key.lastUsedAt)).toEqual(attr('LastUsedAt'));
});

test('the secret never appears in plain text', () => {
  const { stack, project } = setup();
  const param = new CfnParameter(stack, 'KeyParam', { type: 'String', noEcho: true });
  new ProviderKey(stack, 'Versioned', props(project, { apiKey: SecretValue.secretsManager('arn:aws:secretsmanager:us-east-1:111111111111:secret:openai', { versionStage: 'AWSCURRENT' }) }));
  new ProviderKey(stack, 'Sm', props(project, { apiKey: SecretValue.secretsManager('anthropic', { jsonField: 'key' }), provider: Provider.ANTHROPIC }));
  new ProviderKey(stack, 'Ref', props(project, { apiKey: SecretValue.cfnParameter(param) }));
  const keys = Object.values(Template.fromStack(stack).findResources('PostHog::LLMAnalytics::ProviderKey'))
    .map(r => r.Properties.ApiKey);
  expect(keys).toEqual([
    '{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-1:111111111111:secret:openai:SecretString::AWSCURRENT:}}',
    '{{resolve:secretsmanager:anthropic:SecretString:key::}}',
    { Ref: 'KeyParam' },
  ]);
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new ProviderKey(stack, 'Bare', props(project, { removalPolicy: RemovalPolicy.RETAIN }));
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::LLMAnalytics::ProviderKey', { DeletionPolicy: 'Retain' });
  const p = Object.values(t.findResources('PostHog::LLMAnalytics::ProviderKey'))[0].Properties;
  expect(p).toEqual({
    ProjectId: '12345',
    Provider: 'openai',
    Name: 'Key',
    ApiKey: '{{resolve:secretsmanager:openai-api-key:SecretString:::}}',
  });
});

test('renders provider-specific options', () => {
  const { stack, project } = setup();
  new ProviderKey(stack, 'Azure', props(project, {
    provider: Provider.AZURE_OPENAI, azureEndpoint: 'https://me.openai.azure.com/', apiVersion: '2024-10-21',
  }));
  new ProviderKey(stack, 'Foundry', props(project, {
    provider: Provider.ANTHROPIC, azureEndpoint: 'https://me.services.ai.azure.com/', apiVersion: '2023-06-01',
  }));
  new ProviderKey(stack, 'Compat', props(project, { provider: Provider.OPENAI_COMPATIBLE, baseUrl: 'https://llm.example.com/v1' }));
  new ProviderKey(stack, 'SysOne', props(project, {
    provider: Provider.SYSTEM_ONE, baseUrl: 'https://s1.example.com', systemOneModel: 'model-a',
  }));
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::LLMAnalytics::ProviderKey', {
    Provider: 'azure_openai', AzureEndpoint: 'https://me.openai.azure.com/', ApiVersion: '2024-10-21',
  });
  t.hasResourceProperties('PostHog::LLMAnalytics::ProviderKey', { Provider: 'anthropic', AzureEndpoint: 'https://me.services.ai.azure.com/' });
  t.hasResourceProperties('PostHog::LLMAnalytics::ProviderKey', { Provider: 'openai_compatible', BaseUrl: 'https://llm.example.com/v1' });
  t.hasResourceProperties('PostHog::LLMAnalytics::ProviderKey', {
    Provider: 'system_one', BaseUrl: 'https://s1.example.com', SystemOneModel: 'model-a',
  });
});

test.each([
  ['baseUrl on openai', { baseUrl: 'https://x.example.com' }, /baseUrl is not supported for provider 'openai'/],
  ['azureEndpoint on gemini', { provider: Provider.GEMINI, azureEndpoint: 'https://x.example.com' }, /azureEndpoint is not supported for provider 'gemini'/],
  ['apiVersion on openrouter', { provider: Provider.OPENROUTER, apiVersion: '1' }, /apiVersion is not supported/],
  ['systemOneModel on openai_compatible', { provider: Provider.OPENAI_COMPATIBLE, baseUrl: 'https://x.example.com', systemOneModel: 'm' }, /systemOneModel is not supported/],
  ['azure without endpoint', { provider: Provider.AZURE_OPENAI }, /azureEndpoint is required for provider 'azure_openai'/],
  ['openai_compatible without baseUrl', { provider: Provider.OPENAI_COMPATIBLE }, /baseUrl is required for provider 'openai_compatible'/],
  ['system_one without model', { provider: Provider.SYSTEM_ONE, baseUrl: 'https://x.example.com' }, /systemOneModel is required/],
  ['system_one url ending in /systemone', { provider: Provider.SYSTEM_ONE, baseUrl: 'https://x.example.com/systemone', systemOneModel: 'm' }, /end the URL before \/systemone/],
  ['anthropic apiVersion without endpoint', { provider: Provider.ANTHROPIC, apiVersion: '1' }, /azureEndpoint is required when apiVersion/],
  ['http base URL', { provider: Provider.OPENAI_COMPATIBLE, baseUrl: 'http://x.example.com' }, /must use https/],
  ['relative base URL', { provider: Provider.OPENAI_COMPATIBLE, baseUrl: 'x.example.com' }, /absolute https/],
  ['long apiVersion', { provider: Provider.AZURE_OPENAI, azureEndpoint: 'https://x.example.com', apiVersion: 'x'.repeat(21) }, /apiVersion must be between 1 and 20/],
  ['long systemOneModel', { provider: Provider.SYSTEM_ONE, baseUrl: 'https://x.example.com', systemOneModel: 'm'.repeat(101) }, /systemOneModel must be between 1 and 100/],
  ['empty name', { name: '' }, /ProviderKey name must be between 1 and 255/],
] as Array<[string, Partial<ProviderKeyProps>, RegExp]>)('validates per provider: %s', (_name, extra, error) => {
  const { stack, project } = setup();
  expect(() => new ProviderKey(stack, 'Key', props(project, extra))).toThrow(error);
});

test('skips validation for tokens', () => {
  const { stack, project } = setup();
  const url = new CfnParameter(stack, 'Url', { type: 'String' }).valueAsString;
  const name = new CfnParameter(stack, 'Name', { type: 'String' }).valueAsString;
  expect(() => new ProviderKey(stack, 'Key', props(project, {
    name, provider: Provider.SYSTEM_ONE, baseUrl: url, systemOneModel: name,
  }))).not.toThrow();
});

test('imports existing provider keys', () => {
  const { stack, project } = setup();
  const key = ProviderKey.fromProviderKeyId(stack, 'Existing', project, 'uuid-1', Provider.GEMINI);
  expect(key.providerKeyId).toBe('uuid-1');
  expect(key.provider).toBe(Provider.GEMINI);
  expect(key.project).toBe(project);
  expect(ProviderKey.fromProviderKeyId(stack, 'NoProvider', project, 'uuid-2').provider).toBeUndefined();
});
