import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Project } from '../../src/organizations';
import { SecretApiKey, SecretApiKeyScope } from '../../src/projects';

function setup() {
  const stack = new Stack(new App(), 'Test', { env: { account: '123456789012', region: 'us-east-1' } });
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a key and a handler-writable secret for its value', () => {
  const { stack, project } = setup();
  const key = new SecretApiKey(stack, 'Backend', {
    project,
    label: 'backend',
    scopes: [SecretApiKeyScope.FEATURE_FLAG_READ, SecretApiKeyScope.QUERY_READ, SecretApiKeyScope.FEATURE_FLAG_READ],
  });

  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::SecretsManager::Secret', 1);
  const secretLogicalId = Object.keys(t.findResources('AWS::SecretsManager::Secret'))[0];
  t.hasResourceProperties('AWS::SecretsManager::Secret', {
    Tags: Match.arrayWith([{ Key: 'posthog-cdk:handler-writable', Value: 'true' }]),
  });
  // The secret is created without a value: the resource type writes it.
  const secretProps = t.findResources('AWS::SecretsManager::Secret')[secretLogicalId].Properties;
  expect(secretProps.SecretString).toBeUndefined();

  t.hasResourceProperties('PostHog::Projects::SecretApiKey', {
    ProjectId: '12345',
    Label: 'backend',
    Scopes: ['feature_flag:read', 'query:read'],
    SecretsManagerSecretArn: { Ref: secretLogicalId },
  });
  t.hasResource('PostHog::Projects::SecretApiKey', { DeletionPolicy: 'Delete' });
  t.hasResource('AWS::SecretsManager::Secret', { DeletionPolicy: 'Delete' });

  expect(stack.resolve(key.secretApiKeyId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Backend/), 'Id'] });
  expect(stack.resolve(key.maskValue)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Backend/), 'MaskValue'] });
  expect(stack.resolve(key.secretApiKeyCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Backend/), 'CreatedAt'] });
  expect(key.project).toBe(project);
});

test('uses a given secret and does not create or tag one', () => {
  const { stack, project } = setup();
  const secret = secretsmanager.Secret.fromSecretCompleteArn(stack, 'Existing',
    'arn:aws:secretsmanager:us-east-1:123456789012:secret:posthog/key-AbCdEf');
  const key = new SecretApiKey(stack, 'Key', { project, label: 'k2', scopes: [SecretApiKeyScope.ENDPOINT_READ], secret });
  expect(key.secret).toBe(secret);

  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::SecretsManager::Secret', 0);
  t.hasResourceProperties('PostHog::Projects::SecretApiKey', {
    Label: 'k2',
    SecretsManagerSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:posthog/key-AbCdEf',
  });
});

test('grantRead allows reading only the key secret', () => {
  const { stack, project } = setup();
  const key = new SecretApiKey(stack, 'Key', { project, label: 'k', scopes: [SecretApiKeyScope.FEATURE_FLAG_READ] });
  const role = new iam.Role(stack, 'Reader', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  key.grantRead(role);

  const t = Template.fromStack(stack);
  const secretLogicalId = Object.keys(t.findResources('AWS::SecretsManager::Secret'))[0];
  t.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [{
        Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        Effect: 'Allow',
        Resource: { Ref: secretLogicalId },
      }],
    },
    Roles: [{ Ref: Match.stringLikeRegexp('^Reader') }],
  });
});

test('honours the removal policy on the key and the created secret', () => {
  const { stack, project } = setup();
  new SecretApiKey(stack, 'Key', { project, label: 'k', scopes: [SecretApiKeyScope.FEATURE_FLAG_READ], removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Projects::SecretApiKey', { DeletionPolicy: 'Retain' });
  t.hasResource('AWS::SecretsManager::Secret', { DeletionPolicy: 'Retain' });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new SecretApiKey(stack, 'Empty', { project, label: '', scopes: [SecretApiKeyScope.QUERY_READ] }))
    .toThrow(/label must be between 1 and 40/);
  expect(() => new SecretApiKey(stack, 'Long', { project, label: 'x'.repeat(41), scopes: [SecretApiKeyScope.QUERY_READ] }))
    .toThrow(/label must be between 1 and 40/);
  expect(() => new SecretApiKey(stack, 'NoScopes', { project, label: 'x', scopes: [] })).toThrow(/at least one scope/);
  const badSecret = secretsmanager.Secret.fromSecretAttributes(stack, 'Bad', { secretCompleteArn: 'arn:aws:secretsmanager:us-east-1:12345:secret:short-account-AbCdEf' });
  expect(() => new SecretApiKey(stack, 'BadSecret', { project, label: 'x', scopes: [SecretApiKeyScope.QUERY_READ], secret: badSecret }))
    .toThrow(/secret ARN/);
  const label = new CfnParameter(stack, 'Label', { type: 'String' });
  const arn = new CfnParameter(stack, 'Arn', { type: 'String' });
  const tokenSecret = secretsmanager.Secret.fromSecretAttributes(stack, 'TokenSecret', { secretCompleteArn: arn.valueAsString });
  expect(() => new SecretApiKey(stack, 'Token', {
    project, label: label.valueAsString, scopes: [SecretApiKeyScope.QUERY_READ], secret: tokenSecret,
  })).not.toThrow();
});

test('the key value never appears in the template, only the secret ARN', () => {
  const { stack, project } = setup();
  const key = new SecretApiKey(stack, 'Key', { project, label: 'k', scopes: [SecretApiKeyScope.FEATURE_FLAG_READ] });
  const t = Template.fromStack(stack);
  expect(JSON.stringify(t.toJSON())).not.toMatch(/phs_/);
  const props = Object.values(t.findResources('PostHog::Projects::SecretApiKey'))[0].Properties;
  expect(Object.keys(props).sort()).toEqual(['Label', 'ProjectId', 'Scopes', 'SecretsManagerSecretArn']);
  expect(props.SecretsManagerSecretArn).toEqual(stack.resolve(key.secret.secretArn));
  // Consumers read the value through a dynamic reference to the secret.
  const ref = JSON.stringify(stack.resolve(key.secret.secretValue.unsafeUnwrap()));
  expect(ref).toContain('{{resolve:secretsmanager:');
});

test('imports an existing key', () => {
  const { stack, project } = setup();
  const key = SecretApiKey.fromSecretApiKeyId(stack, 'Existing', project, 'abc');
  expect(key.secretApiKeyId).toBe('abc');
  expect(key.project.projectId).toBe('12345');
});
