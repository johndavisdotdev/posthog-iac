import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BatchExportInterval, BatchExportModel, ExportCompression, ExportFileFormat } from '../../src/batch-exports';
import { Project } from '../../src/organizations';
import { S3BatchExport } from '../../src/patterns';

const EXPORT = 'PostHog::BatchExports::BatchExport';
const TABLE = 'PostHog::DataWarehouse::Table';

function setup() {
  const stack = new Stack(new App(), 'Test', { env: { account: '111111111111', region: 'eu-west-1' } });
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function only(t: Template, type: string): any {
  const found = Object.entries(t.findResources(type));
  expect(found).toHaveLength(1);
  return { id: found[0][0], ...(found[0][1] as any) };
}

/** Flattens a rendered string property (string or Fn::Join), with Refs as `<Ref:Id>` placeholders. */
function flatten(v: any): string {
  if (typeof v === 'string') return v;
  if (v['Fn::Join']) return v['Fn::Join'][1].map(flatten).join(v['Fn::Join'][0]);
  if (v.Ref) return `<Ref:${v.Ref}>`;
  if (v['Fn::GetAtt']) return `<GetAtt:${v['Fn::GetAtt'].join('.')}>`;
  return `<${JSON.stringify(v)}>`;
}

function policyStatements(t: Template, policyId: string): any[] {
  return t.toJSON().Resources[policyId].Properties.PolicyDocument.Statement;
}

function logicalId(stack: Stack, c: any): string {
  return stack.getLogicalId(c.node.defaultChild);
}

test('creates bucket, least-privilege user, secret and batch export', () => {
  const { stack, project } = setup();
  const exp = new S3BatchExport(stack, 'Export', {
    project,
    name: 'Events to S3',
    model: BatchExportModel.PERSONS,
    interval: BatchExportInterval.DAY,
    paused: true,
    prefix: 'exports/{year}/{month}/',
    fileFormat: ExportFileFormat.PARQUET,
    compression: ExportCompression.ZSTD,
    expiration: Duration.days(90),
  });
  const t = Template.fromStack(stack);
  const bucketId = logicalId(stack, exp.bucket);
  const secretId = logicalId(stack, exp.credentialsSecret);
  const policyId = logicalId(stack, exp.policy);

  // Bucket defaults.
  t.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: {
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
      },
      LifecycleConfiguration: {
        Rules: [{ Prefix: 'exports/', ExpirationInDays: 90, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 }, Status: 'Enabled' }],
      },
    },
  });
  t.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
  });

  // IAM policy scoped to the literal prefix.
  const statements = policyStatements(t, policyId);
  expect(statements).toEqual([{
    Effect: 'Allow',
    Action: ['s3:PutObject', 's3:AbortMultipartUpload', 's3:ListMultipartUploadParts'],
    Resource: { 'Fn::Join': ['', [{ 'Fn::GetAtt': [bucketId, 'Arn'] }, '/exports/*']] },
  }]);
  expect(t.toJSON().Resources[policyId].Properties.Users).toEqual([{ Ref: logicalId(stack, exp.user) }]);
  t.resourceCountIs('AWS::IAM::Policy', 1);
  t.resourceCountIs('AWS::IAM::AccessKey', 1);

  // Secret built from the access key.
  const secret = t.toJSON().Resources[secretId];
  const accessKeyId = only(t, 'AWS::IAM::AccessKey').id;
  expect(JSON.parse(flatten(secret.Properties.SecretString))).toEqual({
    accessKeyId: `<Ref:${accessKeyId}>`,
    secretAccessKey: `<GetAtt:${accessKeyId}.SecretAccessKey>`,
  });

  // Batch export.
  const be = only(t, EXPORT);
  expect(be.Properties).toMatchObject({
    ProjectId: '12345', Name: 'Events to S3', Model: 'persons', Interval: 'day', Paused: true, DestinationType: 'AwsS3',
  });
  expect(JSON.parse(flatten(be.Properties.DestinationConfig))).toEqual({
    bucket_name: `<Ref:${bucketId}>`,
    region: 'eu-west-1',
    prefix: 'exports/{year}/{month}/',
    file_format: 'Parquet',
    compression: 'zstd',
  });
  expect(JSON.parse(flatten(be.Properties.DestinationSecretConfig))).toEqual({
    aws_access_key_id: `{{resolve:secretsmanager:<Ref:${secretId}>:SecretString:accessKeyId::}}`,
    aws_secret_access_key: `{{resolve:secretsmanager:<Ref:${secretId}>:SecretString:secretAccessKey::}}`,
  });
  expect(be.DependsOn).toEqual(expect.arrayContaining([secretId, policyId]));
  expect(exp.table).toBeUndefined();
});

test('PostHog resources never contain the plain access key', () => {
  const { stack, project } = setup();
  new S3BatchExport(stack, 'Export', { project, readBack: { tableName: 'exported_events' } });
  const resources = Template.fromStack(stack).toJSON().Resources;
  const posthog = Object.values(resources).filter((r: any) => r.Type.startsWith('PostHog::'));
  expect(posthog).toHaveLength(2);
  for (const r of posthog as any[]) {
    const text = JSON.stringify(r.Properties);
    expect(text).not.toContain('SecretAccessKey');
    expect(text).not.toMatch(/AWS::IAM::AccessKey|AccessKey[0-9A-F]{8}"/);
  }
  // Every credential is a Secrets Manager dynamic reference.
  const be = (posthog as any[]).find(r => r.Type === EXPORT);
  const secrets = JSON.parse(flatten(be.Properties.DestinationSecretConfig));
  for (const v of Object.values(secrets)) expect(v).toMatch(/^\{\{resolve:secretsmanager:<Ref:[^>]+>:SecretString:(accessKeyId|secretAccessKey)::\}\}$/);
  const table = (posthog as any[]).find(r => r.Type === TABLE);
  for (const v of Object.values(table.Properties.Credential)) {
    expect(flatten(v)).toMatch(/^\{\{resolve:secretsmanager:<Ref:[^>]+>:SecretString:(accessKeyId|secretAccessKey)::\}\}$/);
  }
  // Access key references appear only in the Secrets Manager secrets.
  const holders = Object.values(resources)
    .filter((r: any) => JSON.stringify(r.Properties ?? {}).includes('SecretAccessKey'))
    .map((r: any) => r.Type);
  expect(holders).toEqual(['AWS::SecretsManager::Secret', 'AWS::SecretsManager::Secret']);
});

test('defaults', () => {
  const { stack, project } = setup();
  const exp = new S3BatchExport(stack, 'Export', { project });
  const t = Template.fromStack(stack);
  const be = only(t, EXPORT);
  expect(be.Properties.Name).toBe('S3 export');
  expect(be.Properties.Interval).toBe('hour');
  expect(be.Properties.Model).toBeUndefined();
  expect(be.Properties.Paused).toBeUndefined();
  expect(JSON.parse(flatten(be.Properties.DestinationConfig))).toEqual({
    bucket_name: `<Ref:${logicalId(stack, exp.bucket)}>`, region: 'eu-west-1', prefix: 'posthog/', file_format: 'JSONLines',
  });
  t.hasResourceProperties('AWS::S3::Bucket', {
    LifecycleConfiguration: { Rules: [Match.objectEquals({ Prefix: 'posthog/', AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 }, Status: 'Enabled' })] },
  });
  expect(exp.prefix).toBe('posthog/');
});

test('removal policy of a created bucket can be changed', () => {
  const { stack, project } = setup();
  new S3BatchExport(stack, 'Export', { project, removalPolicy: RemovalPolicy.DESTROY });
  Template.fromStack(stack).hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
});

test('uses an existing bucket without changing it', () => {
  const { stack, project } = setup();
  const bucket = s3.Bucket.fromBucketName(stack, 'Existing', 'my-exports');
  const exp = new S3BatchExport(stack, 'Export', { project, bucket, prefix: 'ph/', region: 'us-east-2' });
  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::S3::Bucket', 0);
  t.resourceCountIs('AWS::S3::BucketPolicy', 0);
  expect(exp.bucket).toBe(bucket);
  const be = only(t, EXPORT);
  expect(JSON.parse(flatten(be.Properties.DestinationConfig))).toEqual({ bucket_name: 'my-exports', region: 'us-east-2', prefix: 'ph/', file_format: 'JSONLines' });
  const statements = policyStatements(t, logicalId(stack, exp.policy));
  expect(flatten(statements[0].Resource)).toBe('arn:<Ref:AWS::Partition>:s3:::my-exports/ph/*');
});

test('rejects bucket-only options with an existing bucket', () => {
  const { stack, project } = setup();
  const bucket = s3.Bucket.fromBucketName(stack, 'Existing', 'my-exports');
  expect(() => new S3BatchExport(stack, 'A', { project, bucket, expiration: Duration.days(1) })).toThrow(/expiration/);
  expect(() => new S3BatchExport(stack, 'B', { project, bucket, removalPolicy: RemovalPolicy.DESTROY })).toThrow(/removalPolicy/);
});

test('KMS key encrypts a created bucket and is granted to the writer', () => {
  const { stack, project } = setup();
  const key = new kms.Key(stack, 'Key');
  const exp = new S3BatchExport(stack, 'Export', { project, encryptionKey: key });
  const t = Template.fromStack(stack);
  const keyId = logicalId(stack, key);
  t.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [{
        BucketKeyEnabled: true,
        ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: { 'Fn::GetAtt': [keyId, 'Arn'] } },
      }],
    },
  });
  const statements = policyStatements(t, logicalId(stack, exp.policy));
  expect(statements[1]).toEqual({
    Effect: 'Allow',
    Action: ['kms:GenerateDataKey', 'kms:Encrypt', 'kms:Decrypt'],
    Resource: { 'Fn::GetAtt': [keyId, 'Arn'] },
  });
  // The bucket default handles encryption; the export does not override it.
  const config = JSON.parse(flatten(only(t, EXPORT).Properties.DestinationConfig));
  expect(config.encryption).toBeUndefined();
});

test('KMS key with an existing bucket requests SSE-KMS', () => {
  const { stack, project } = setup();
  const key = kms.Key.fromKeyArn(stack, 'Key', 'arn:aws:kms:eu-west-1:111111111111:key/abcd');
  const bucket = s3.Bucket.fromBucketName(stack, 'Existing', 'my-exports');
  const exp = new S3BatchExport(stack, 'Export', { project, bucket, encryptionKey: key, region: 'eu-west-1' });
  const t = Template.fromStack(stack);
  const config = JSON.parse(flatten(only(t, EXPORT).Properties.DestinationConfig));
  expect(config).toMatchObject({ encryption: 'aws:kms', kms_key_id: 'arn:aws:kms:eu-west-1:111111111111:key/abcd' });
  expect(policyStatements(t, logicalId(stack, exp.policy))[1].Resource).toBe('arn:aws:kms:eu-west-1:111111111111:key/abcd');
});

test('readBack creates a table with separate read-only credentials', () => {
  const { stack, project } = setup();
  const key = new kms.Key(stack, 'Key');
  const exp = new S3BatchExport(stack, 'Export', {
    project,
    prefix: 'events/{year}/',
    fileFormat: ExportFileFormat.PARQUET,
    encryptionKey: key,
    readBack: { tableName: 'exported_events', removalPolicy: RemovalPolicy.RETAIN },
  });
  const t = Template.fromStack(stack);
  const bucketId = logicalId(stack, exp.bucket);
  t.resourceCountIs('AWS::IAM::User', 2);
  t.resourceCountIs('AWS::IAM::AccessKey', 2);
  t.resourceCountIs('AWS::SecretsManager::Secret', 2);
  expect(exp.readerUser).toBeDefined();
  expect(exp.readerCredentialsSecret).not.toBe(exp.credentialsSecret);

  // The reader's policy is read-only and scoped to the prefix.
  const readerPolicy = Object.entries(t.findResources('AWS::IAM::Policy'))
    .find(([, r]: any) => r.Properties.Users[0].Ref === logicalId(stack, exp.readerUser))!;
  expect(readerPolicy[1].Properties.PolicyDocument.Statement).toEqual([
    { Effect: 'Allow', Action: 's3:GetObject', Resource: { 'Fn::Join': ['', [{ 'Fn::GetAtt': [bucketId, 'Arn'] }, '/events/*']] } },
    { Effect: 'Allow', Action: 's3:ListBucket', Resource: { 'Fn::GetAtt': [bucketId, 'Arn'] }, Condition: { StringLike: { 's3:prefix': ['events/*'] } } },
    { Effect: 'Allow', Action: 'kms:Decrypt', Resource: { 'Fn::GetAtt': [logicalId(stack, key), 'Arn'] } },
  ]);
  // The writer is not widened.
  const writerActions = policyStatements(t, logicalId(stack, exp.policy)).flatMap(s => s.Action);
  expect(writerActions).not.toContain('s3:GetObject');
  expect(writerActions).not.toContain('s3:ListBucket');

  const table = only(t, TABLE);
  const readerSecretId = logicalId(stack, exp.readerCredentialsSecret);
  expect(table.DeletionPolicy).toBe('Retain');
  expect(table.Properties).toMatchObject({ ProjectId: '12345', Name: 'exported_events', Format: 'Parquet' });
  expect(flatten(table.Properties.UrlPattern)).toBe(`https://<GetAtt:${bucketId}.RegionalDomainName>/events/*/*.parquet*`);
  expect(table.Properties.Credential).toEqual({
    AccessKey: { 'Fn::Join': ['', ['{{resolve:secretsmanager:', { Ref: readerSecretId }, ':SecretString:accessKeyId::}}']] },
    AccessSecret: { 'Fn::Join': ['', ['{{resolve:secretsmanager:', { Ref: readerSecretId }, ':SecretString:secretAccessKey::}}']] },
  });
  expect(table.DependsOn).toEqual(expect.arrayContaining([readerSecretId]));
  expect(exp.table!.tableName).toBe('exported_events');
});

test('readBack of JSON lines uses JSONEachRow', () => {
  const { stack, project } = setup();
  new S3BatchExport(stack, 'Export', { project, prefix: '', readBack: { tableName: 'raw' } });
  const table = only(Template.fromStack(stack), TABLE);
  expect(table.Properties.Format).toBe('JSONEachRow');
  expect(flatten(table.Properties.UrlPattern)).toMatch(/\/\*\.jsonl\*$/);
});

test('readBack requires a prefix ending with a slash', () => {
  const { stack, project } = setup();
  expect(() => new S3BatchExport(stack, 'Export', { project, prefix: 'events', readBack: { tableName: 'raw' } })).toThrow(/end with '\/'/);
});

test('increasing keySerial rotates keys into a new secret', () => {
  const { stack, project } = setup();
  const exp = new S3BatchExport(stack, 'Export', { project, keySerial: 2 });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('AWS::IAM::AccessKey', { Serial: 2 });
  const secretId = logicalId(stack, exp.credentialsSecret);
  expect(secretId).toMatch(/^ExportCredentials2/);
  expect(flatten(only(t, EXPORT).Properties.DestinationSecretConfig)).toContain(`<Ref:${secretId}>`);
  expect(() => new S3BatchExport(stack, 'Bad', { project, keySerial: 1.5 })).toThrow(/integer/);
});

test('an imported bucket without a region needs the region prop', () => {
  const { stack, project } = setup();
  const bucket = s3.Bucket.fromBucketName(stack, 'Existing', 'my-exports');
  expect(() => new S3BatchExport(stack, 'Export', { project, bucket })).toThrow(/imported without a region/);
});
