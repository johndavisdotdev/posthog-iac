import { App, CfnParameter, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {
  BatchExport,
  BatchExportDestination,
  BatchExportDestinationType,
  BatchExportInterval,
  BatchExportModel,
  ExportCompression,
  ExportFileFormat,
  RedshiftPropertiesDataType,
  S3Encryption,
} from '../../src/batch-exports';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::BatchExports::BatchExport';

function setup() {
  const stack = new Stack(new App(), 'Test', { env: { account: '111111111111', region: 'eu-west-1' } });
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

/** Flattens a rendered JSON property (string or Fn::Join) and parses it, with tokens as placeholders. */
function parseJsonProp(value: any): any {
  const flatten = (v: any): string => {
    if (typeof v === 'string') return v;
    if (v['Fn::Join']) return v['Fn::Join'][1].map(flatten).join(v['Fn::Join'][0]);
    if (v.Ref) return `<Ref:${v.Ref}>`;
    if (v['Fn::GetAtt']) return `<GetAtt:${v['Fn::GetAtt'].join('.')}>`;
    return `<${JSON.stringify(v).replace(/"/g, "'")}>`;
  };
  return JSON.parse(flatten(value));
}

function props(stack: Stack): any {
  const resources = Template.fromStack(stack).findResources(TYPE);
  return Object.values(resources)[0].Properties;
}

const s3Secret = () => ({
  accessKeyId: SecretValue.secretsManager('posthog/s3', { jsonField: 'accessKeyId' }),
  secretAccessKey: SecretValue.secretsManager('posthog/s3', { jsonField: 'secretAccessKey' }),
});

test('creates an S3 batch export from a bucket with credentials as dynamic references', () => {
  const { stack, project } = setup();
  const bucket = new s3.Bucket(stack, 'Bucket');
  const exp = new BatchExport(stack, 'ToS3', {
    project,
    name: 'Events to S3',
    interval: BatchExportInterval.DAY,
    model: BatchExportModel.EVENTS,
    paused: true,
    timezone: 'Europe/London',
    offsetHour: 2,
    startAt: new Date('2026-01-01T00:00:00Z'),
    filters: [{ key: '$browser', operator: PropertyOperator.IS_NOT, value: ['HeadlessChrome'], type: PropertyFilterType.EVENT }],
    destination: BatchExportDestination.s3({
      bucket,
      prefix: 'posthog/events/',
      fileFormat: ExportFileFormat.PARQUET,
      compression: ExportCompression.ZSTD,
      excludeEvents: ['$feature_flag_called'],
      ...s3Secret(),
    }),
  });

  const p = props(stack);
  expect(p).toMatchObject({
    ProjectId: '12345',
    Name: 'Events to S3',
    Interval: 'day',
    Model: 'events',
    Paused: true,
    DestinationType: 'AwsS3',
    Timezone: 'Europe/London',
    OffsetHour: 2,
    StartAt: '2026-01-01T00:00:00.000Z',
    Filters: '[{"key":"$browser","operator":"is_not","type":"event","value":["HeadlessChrome"]}]',
  });
  expect(p.DestinationIntegrationId).toBeUndefined();
  const bucketId = stack.getLogicalId(bucket.node.defaultChild as s3.CfnBucket);
  expect(parseJsonProp(p.DestinationConfig)).toEqual({
    bucket_name: `<Ref:${bucketId}>`,
    region: 'eu-west-1',
    prefix: 'posthog/events/',
    file_format: 'Parquet',
    compression: 'zstd',
    exclude_events: ['$feature_flag_called'],
  });
  expect(parseJsonProp(p.DestinationSecretConfig)).toEqual({
    aws_access_key_id: '{{resolve:secretsmanager:posthog/s3:SecretString:accessKeyId::}}',
    aws_secret_access_key: '{{resolve:secretsmanager:posthog/s3:SecretString:secretAccessKey::}}',
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(exp.destinationType).toBe(BatchExportDestinationType.S3);
  expect(stack.resolve(exp.batchExportId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^ToS3/), 'Id'] });
  expect(stack.resolve(exp.batchExportCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^ToS3/), 'CreatedAt'] });
  expect(stack.resolve(exp.batchExportLastUpdatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^ToS3/), 'LastUpdatedAt'] });
});

test('S3 by bucket name with an integration leaves secrets and optional props out', () => {
  const { stack, project } = setup();
  new BatchExport(stack, 'ToS3', {
    project,
    name: 'Bare',
    interval: BatchExportInterval.HOUR,
    removalPolicy: RemovalPolicy.RETAIN,
    destination: BatchExportDestination.s3({ bucketName: 'my-bucket', region: 'us-east-1', integrationId: '77' }),
  });
  expect(props(stack)).toEqual({
    ProjectId: '12345',
    Name: 'Bare',
    Interval: 'hour',
    DestinationType: 'AwsS3',
    DestinationIntegrationId: '77',
    DestinationConfig: '{"bucket_name":"my-bucket","region":"us-east-1"}',
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
});

test('serializes every destination type', () => {
  const secret = (field: string) => SecretValue.secretsManager('posthog/dest', { jsonField: field });
  const destinations: Record<string, BatchExportDestination> = {
    snowflake: BatchExportDestination.snowflake({
      account: 'xy12345',
      database: 'ANALYTICS',
      warehouse: 'LOAD',
      schema: 'POSTHOG',
      tableName: 'EVENTS',
      role: 'LOADER',
      user: 'posthog',
      privateKey: secret('key'),
      privateKeyPassphrase: secret('pass'),
    }),
    postgres: BatchExportDestination.postgres({
      host: 'db.example.com',
      port: 5432,
      database: 'app',
      schema: 'analytics',
      tableName: 'events',
      user: 'posthog',
      password: secret('password'),
      hasSelfSignedCert: true,
    }),
    redshift: BatchExportDestination.redshift({
      host: 'rs.example.com',
      port: 5439,
      database: 'dev',
      tableName: 'events',
      user: 'posthog',
      password: secret('password'),
      propertiesDataType: RedshiftPropertiesDataType.SUPER,
    }),
    bigQuery: BatchExportDestination.bigQuery({
      projectId: 'gcp-proj',
      datasetId: 'posthog',
      tableId: 'events',
      useJsonType: true,
      clientEmail: 'sa@gcp-proj.iam.gserviceaccount.com',
      privateKeyId: secret('kid'),
      privateKey: secret('key'),
    }),
    databricks: BatchExportDestination.databricks({
      serverHostname: 'dbc-1.cloud.databricks.com',
      httpPath: '/sql/1.0/warehouses/abc',
      catalog: 'main',
      schema: 'posthog',
      tableName: 'events',
      useVariantType: true,
      clientId: 'sp-id',
      clientSecret: secret('cs'),
    }),
    azureBlob: BatchExportDestination.azureBlob({
      containerName: 'exports',
      prefix: 'posthog/',
      fileFormat: ExportFileFormat.JSON_LINES,
      compression: ExportCompression.GZIP,
      connectionString: secret('conn'),
    }),
    raw: BatchExportDestination.raw(BatchExportDestinationType.S3_COMPATIBLE,
      { bucket_name: 'b', endpoint_url: 'https://minio.example.com' }, { aws_secret_access_key: secret('sk') }, '5'),
  };

  const rendered: Record<string, any> = {};
  for (const [name, destination] of Object.entries(destinations)) {
    const { stack, project } = setup();
    new BatchExport(stack, 'Export', { project, name, interval: BatchExportInterval.EVERY_5_MINUTES, destination });
    const p = props(stack);
    rendered[name] = {
      type: p.DestinationType,
      integration: p.DestinationIntegrationId,
      config: parseJsonProp(p.DestinationConfig),
      secrets: parseJsonProp(p.DestinationSecretConfig),
    };
    // credentials never land in the non-secret config
    expect(Object.keys(rendered[name].config)).not.toEqual(expect.arrayContaining(['password', 'private_key', 'client_secret']));
    for (const v of Object.values(rendered[name].secrets)) expect(v).toMatch(/^\{\{resolve:secretsmanager:/);
  }

  expect(rendered.snowflake).toEqual({
    type: 'Snowflake',
    config: {
      account: 'xy12345',
      database: 'ANALYTICS',
      warehouse: 'LOAD',
      schema: 'POSTHOG',
      table_name: 'EVENTS',
      role: 'LOADER',
      user: 'posthog',
      authentication_type: 'keypair',
    },
    secrets: {
      private_key: '{{resolve:secretsmanager:posthog/dest:SecretString:key::}}',
      private_key_passphrase: '{{resolve:secretsmanager:posthog/dest:SecretString:pass::}}',
    },
  });
  expect(rendered.redshift.config).toEqual({
    host: 'rs.example.com', port: 5439, database: 'dev', table_name: 'events', user: 'posthog', properties_data_type: 'super',
  });
  expect(rendered.raw).toMatchObject({ type: 'S3Compatible', integration: '5' });
  expect(rendered).toMatchSnapshot();
});

test('a Secrets Manager secret construct renders as a dynamic reference token', () => {
  const { stack, project } = setup();
  const secret = new secretsmanager.Secret(stack, 'PgSecret');
  new BatchExport(stack, 'Export', {
    project,
    name: 'pg',
    interval: BatchExportInterval.HOUR,
    destination: BatchExportDestination.postgres({ host: 'h', database: 'd', tableName: 't', user: 'u', password: secret.secretValueFromJson('password') }),
  });
  const secretConfig = JSON.stringify(props(stack).DestinationSecretConfig);
  expect(secretConfig).toContain('{{resolve:secretsmanager:');
  expect(secretConfig).toContain(stack.getLogicalId(secret.node.defaultChild as secretsmanager.CfnSecret));
});

test('never puts credentials in plain text in the template', () => {
  const { stack, project } = setup();
  new BatchExport(stack, 'Export', {
    project,
    name: 'pg',
    interval: BatchExportInterval.HOUR,
    destination: BatchExportDestination.postgres({
      host: 'h',
      database: 'd',
      tableName: 't',
      user: 'u',
      password: SecretValue.secretsManager('posthog/pg', { jsonField: 'password' }),
    }),
  });
  const template = JSON.stringify(Template.fromStack(stack).toJSON());
  expect(template).toContain('{{resolve:secretsmanager:posthog/pg:SecretString:password::}}');
  expect(template).not.toMatch(/"password":"(?!\{\{resolve)/);
  expect(() => BatchExportDestination.postgres({
    host: 'h', database: 'd', tableName: 't', password: SecretValue.ssmSecure('/posthog/pg-password'),
  })).toThrow(/SSM SecureString references are not resolved/);
  expect(() => BatchExportDestination.postgres({
    host: 'h', database: 'd', tableName: 't', password: SecretValue.unsafePlainText('hunter2'),
  })).toThrow(/password must be a Secrets Manager dynamic reference/);
});

test('validates destinations and schedule settings', () => {
  const { stack, project } = setup();
  expect(() => BatchExportDestination.s3({ bucketName: 'b', region: 'eu-west-1' })).toThrow(/specify integrationId or/);
  expect(() => BatchExportDestination.s3({ bucketName: 'b', integrationId: '1' })).toThrow(/region is required/);
  expect(() => BatchExportDestination.s3({ integrationId: '1', region: 'r' })).toThrow(/exactly one of bucket, bucketName/);
  expect(() => BatchExportDestination.snowflake({
    account: 'a',
    database: 'd',
    warehouse: 'w',
    schema: 's',
    password: SecretValue.secretsManager('p'),
    privateKey: SecretValue.secretsManager('k'),
  })).toThrow(/at most one of password, privateKey/);
  expect(() => BatchExportDestination.postgres({ database: 'd', tableName: 't', port: 70000, integrationId: '1' })).toThrow(/port/);

  const destination = BatchExportDestination.s3({ bucketName: 'b', region: 'r', integrationId: '1', encryption: S3Encryption.KMS });
  expect(() => new BatchExport(stack, 'Empty', { project, name: '', interval: BatchExportInterval.DAY, destination })).toThrow(/name must be between 1/);
  expect(() => new BatchExport(stack, 'Day', { project, name: 'x', interval: BatchExportInterval.WEEK, destination, offsetDay: 7 })).toThrow(/offsetDay/);
  expect(() => new BatchExport(stack, 'Hour', { project, name: 'x', interval: BatchExportInterval.DAY, destination, offsetHour: 24 })).toThrow(/offsetHour/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  const hour = new CfnParameter(stack, 'HourParam', { type: 'Number' });
  expect(() => new BatchExport(stack, 'Token', {
    project, name: name.valueAsString, interval: BatchExportInterval.DAY, destination, offsetHour: hour.valueAsNumber,
  })).not.toThrow();
});

test('imports existing batch exports', () => {
  const { stack, project } = setup();
  const exp = BatchExport.fromBatchExportId(stack, 'Existing', project, 'abc-123');
  expect(exp.batchExportId).toBe('abc-123');
  expect(exp.project).toBe(project);
});

test('S3 destination needs a region for buckets imported without one', () => {
  const { stack } = setup();
  const noRegion = s3.Bucket.fromBucketName(stack, 'NoRegion', 'their-bucket');
  expect(() => BatchExportDestination.s3({ bucket: noRegion, integrationId: '77' })).toThrow(/imported without a region/);
  expect(() => BatchExportDestination.s3({ bucket: noRegion, region: 'us-east-2', integrationId: '77' })).not.toThrow();
  const withRegion = s3.Bucket.fromBucketAttributes(stack, 'WithRegion', { bucketName: 'their-bucket', region: 'us-east-2' });
  expect(() => BatchExportDestination.s3({ bucket: withRegion, integrationId: '77' })).not.toThrow();
  const owned = new s3.Bucket(stack, 'Owned');
  expect(() => BatchExportDestination.s3({ bucket: owned, integrationId: '77' })).not.toThrow();
});
