import { App, CfnParameter, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {
  IncrementalFieldType,
  Source,
  SourceAccessMethod,
  SourceConfig,
  SourceSyncType,
} from '../../src/data-warehouse';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::DataWarehouse::Source';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack): any {
  return Object.values(Template.fromStack(stack).findResources(TYPE))[0].Properties;
}

test('creates a Stripe source with typed schemas and sync frequency', () => {
  const { stack, project } = setup();
  const source = new Source(stack, 'Stripe', {
    project,
    config: SourceConfig.stripe({
      secretKey: SecretValue.secretsManager('posthog/stripe', { jsonField: 'key' }),
      accountId: 'acct_123',
    }),
    prefix: 'stripe_',
    description: 'Billing data',
    syncFrequency: Duration.hours(6),
    schemas: [
      { name: 'Customer' },
      {
        name: 'Charge',
        syncType: SourceSyncType.INCREMENTAL,
        incrementalField: 'created',
        incrementalFieldType: IncrementalFieldType.INTEGER,
        syncFrequency: Duration.minutes(30),
      },
      { name: 'Invoice', shouldSync: false },
    ],
    autoSyncNewSchemas: true,
    autoSyncSchemaPatterns: ['raw_*', 'raw_*'],
  });

  const p = props(stack);
  expect(p).toMatchObject({
    ProjectId: '12345',
    SourceType: 'Stripe',
    Prefix: 'stripe_',
    Description: 'Billing data',
    AutoSyncNewSchemas: true,
    AutoSyncSchemaPatterns: ['raw_*'],
  });
  expect(JSON.parse(p.Payload)).toEqual({
    stripe_account_id: 'acct_123',
    stripe_secret_key: '{{resolve:secretsmanager:posthog/stripe:SecretString:key::}}',
    schemas: [
      { name: 'Customer', should_sync: true, sync_type: 'full_refresh', sync_frequency: '6hour' },
      {
        name: 'Charge',
        should_sync: true,
        sync_type: 'incremental',
        incremental_field: 'created',
        incremental_field_type: 'integer',
        sync_frequency: '30min',
      },
      { name: 'Invoice', should_sync: false, sync_type: 'full_refresh', sync_frequency: '6hour' },
    ],
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(source.sourceType).toBe('Stripe');
  expect(stack.resolve(source.sourceId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Stripe/), 'Id'] });
  expect(stack.resolve(source.sourceStatus)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Stripe/), 'Status'] });
  expect(stack.resolve(source.sourceCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Stripe/), 'CreatedAt'] });
});

test('creates a Postgres source with the password from a secret construct', () => {
  const { stack, project } = setup();
  const secret = new secretsmanager.Secret(stack, 'DbSecret');
  new Source(stack, 'Db', {
    project,
    config: SourceConfig.postgres({ host: 'db.example.com', database: 'app', user: 'reader', password: secret.secretValueFromJson('password') }),
    accessMethod: SourceAccessMethod.DIRECT,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const p = props(stack);
  expect(p.SourceType).toBe('Postgres');
  expect(p.AccessMethod).toBe('direct');
  const payload = JSON.stringify(p.Payload);
  expect(payload).toContain('\\"host\\":\\"db.example.com\\",\\"port\\":5432,\\"database\\":\\"app\\",\\"schema\\":\\"public\\",\\"user\\":\\"reader\\"');
  expect(payload).toContain('{{resolve:secretsmanager:');
  expect(payload).toContain(stack.getLogicalId(secret.node.defaultChild as secretsmanager.CfnSecret));
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
});

test('hubspot and raw sources; optional props left out', () => {
  const { stack, project } = setup();
  new Source(stack, 'Hubspot', { project, config: SourceConfig.hubspot({ integrationId: '42' }) });
  expect(props(stack)).toEqual({ ProjectId: '12345', SourceType: 'Hubspot', Payload: '{"hubspot_integration_id":"42"}' });

  const other = setup();
  new Source(other.stack, 'MySql', {
    project: other.project,
    config: SourceConfig.raw('MySQL', { host: 'h', port: 3306 }, { password: SecretValue.secretsManager('mysql') }),
  });
  expect(JSON.parse(props(other.stack).Payload)).toEqual({ host: 'h', port: 3306, password: '{{resolve:secretsmanager:mysql:SecretString:::}}' });
});

test('never puts credentials in plain text', () => {
  expect(() => SourceConfig.stripe({ secretKey: SecretValue.unsafePlainText('sk_live_x') })).toThrow(/plain-text/);
  expect(() => SourceConfig.raw('MySQL', {}, { password: SecretValue.ssmSecure('/p') })).toThrow(/SSM SecureString/);
});

test('validates values and skips tokens', () => {
  const { stack, project } = setup();
  const config = SourceConfig.hubspot({ integrationId: '1' });
  expect(() => new Source(stack, 'Freq', { project, config, syncFrequency: Duration.hours(1) })).toThrow(/requires schemas/);
  expect(() => new Source(stack, 'Bad', { project, config, syncFrequency: Duration.hours(2), schemas: [{ name: 'a' }] }))
    .toThrow(/must be one of 5m, 30m, 1h, 6h, 12h, 1d, 7d, 30d, got 2 hours/);
  expect(() => new Source(stack, 'Inc', { project, config, schemas: [{ name: 'a', syncType: SourceSyncType.APPEND }] }))
    .toThrow(/incrementalField is required/);
  expect(() => new Source(stack, 'Prefix', { project, config, prefix: 'x'.repeat(101) })).toThrow(/prefix/);
  expect(() => SourceConfig.postgres({ host: 'h', database: 'd', user: 'u', port: 0, password: SecretValue.secretsManager('s') })).toThrow(/port/);
  expect(() => SourceConfig.raw('', {})).toThrow(/Source type/);
  const prefix = new CfnParameter(stack, 'PrefixParam', { type: 'String' });
  expect(() => new Source(stack, 'Token', { project, config, prefix: prefix.valueAsString })).not.toThrow();
});

test('imports existing sources', () => {
  const { stack, project } = setup();
  const source = Source.fromSourceId(stack, 'Existing', project, 'uuid-1');
  expect(source.sourceId).toBe('uuid-1');
  expect(source.project).toBe(project);
});
