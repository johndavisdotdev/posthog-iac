import { App, CfnParameter, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Table, TableFormat } from '../../src/data-warehouse';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::DataWarehouse::Table';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack): any {
  return Object.values(Template.fromStack(stack).findResources(TYPE))[0].Properties;
}

const credential = () => ({
  accessKeyId: SecretValue.secretsManager('posthog/bucket', { jsonField: 'id' }),
  secretAccessKey: SecretValue.secretsManager('posthog/bucket', { jsonField: 'secret' }),
});

test('builds the URL from a bucket and prefix, credentials as dynamic references', () => {
  const { stack, project } = setup();
  const bucket = new s3.Bucket(stack, 'Bucket');
  const table = new Table(stack, 'Orders', {
    project,
    name: 'orders',
    format: TableFormat.PARQUET,
    bucket,
    prefix: '/orders/*.parquet',
    credential: credential(),
  });
  const bucketId = stack.getLogicalId(bucket.node.defaultChild as s3.CfnBucket);
  expect(props(stack)).toEqual({
    ProjectId: '12345',
    Name: 'orders',
    Format: 'Parquet',
    UrlPattern: { 'Fn::Join': ['', ['https://', { 'Fn::GetAtt': [bucketId, 'RegionalDomainName'] }, '/orders/*.parquet']] },
    Credential: {
      AccessKey: '{{resolve:secretsmanager:posthog/bucket:SecretString:id::}}',
      AccessSecret: '{{resolve:secretsmanager:posthog/bucket:SecretString:secret::}}',
    },
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(table.tableName).toBe('orders');
  expect(stack.resolve(table.tableId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Orders/), 'Id'] });
  expect(stack.resolve(table.tableHogqlName)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Orders/), 'HogqlName'] });
  expect(stack.resolve(table.tableCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Orders/), 'CreatedAt'] });
});

test('takes a URL and CSV options and honours the removal policy', () => {
  const { stack, project } = setup();
  new Table(stack, 'Csv', {
    project,
    name: '_raw',
    format: TableFormat.CSV_WITH_NAMES,
    url: 'https://storage.googleapis.com/b/raw/*.csv',
    credential: credential(),
    csvAllowDoubleQuotes: true,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  expect(props(stack)).toMatchObject({
    UrlPattern: 'https://storage.googleapis.com/b/raw/*.csv',
    Format: 'CSVWithNames',
    Options: { CsvAllowDoubleQuotes: true },
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
});

test('validates values, rejects plain-text credentials and skips tokens', () => {
  const { stack, project } = setup();
  const bucket = new s3.Bucket(stack, 'Bucket');
  const base = { project, format: TableFormat.PARQUET, credential: credential() };
  expect(() => new Table(stack, 'Name', { ...base, name: '1abc', url: 'https://x' })).toThrow(/Table name '1abc' is invalid/);
  expect(() => new Table(stack, 'Neither', { ...base, name: 'a' })).toThrow(/exactly one of url, bucket/);
  expect(() => new Table(stack, 'Both', { ...base, name: 'a', url: 'https://x', bucket })).toThrow(/exactly one of url, bucket/);
  expect(() => new Table(stack, 'Prefix', { ...base, name: 'a', url: 'https://x', prefix: 'p' })).toThrow(/prefix requires bucket/);
  expect(() => new Table(stack, 'Long', { ...base, name: 'a', url: 'https://' + 'x'.repeat(500) })).toThrow(/url must be between 1 and 500/);
  expect(() => new Table(stack, 'Plain', {
    ...base,
    name: 'a',
    url: 'https://x',
    credential: { accessKeyId: SecretValue.unsafePlainText('AKIA'), secretAccessKey: SecretValue.secretsManager('s') },
  })).toThrow(/accessKeyId must be a Secrets Manager dynamic reference/);
  const name = new CfnParameter(stack, 'NameParam', { type: 'String' });
  expect(() => new Table(stack, 'Token', { ...base, name: name.valueAsString, url: 'https://x' })).not.toThrow();
});

test('imports existing tables', () => {
  const { stack, project } = setup();
  const table = Table.fromTableAttributes(stack, 'Existing', { project, tableId: 't-1', tableName: 'orders' });
  expect(table.tableId).toBe('t-1');
  expect(table.tableName).toBe('orders');
  expect(table.project).toBe(project);
});
