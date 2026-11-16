import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Endpoint } from '../../src/data-warehouse';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::DataWarehouse::Endpoint';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack): any {
  return Object.values(Template.fromStack(stack).findResources(TYPE))[0].Properties;
}

test('creates a HogQL endpoint with freshness, materialization and attributes', () => {
  const { stack, project } = setup();
  const endpoint = new Endpoint(stack, 'Signups', {
    project,
    name: 'daily-signups',
    hogql: "SELECT count() FROM events WHERE event = 'signed_up'",
    description: 'Sign-ups per day',
    dataFreshness: Duration.hours(1),
    materialized: true,
    active: false,
    tags: ['growth', 'growth'],
    bucketOverrides: { day: 'daily' },
    optionalBreakdownProperties: ['$browser'],
  });
  expect(props(stack)).toEqual({
    ProjectId: '12345',
    Name: 'daily-signups',
    Query: '{"kind":"HogQLQuery","query":"SELECT count() FROM events WHERE event = \'signed_up\'"}',
    Description: 'Sign-ups per day',
    DataFreshnessSeconds: 3600,
    IsMaterialized: true,
    IsActive: false,
    Tags: ['growth'],
    BucketOverrides: { day: 'daily' },
    OptionalBreakdownProperties: ['$browser'],
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(endpoint.endpointName).toBe('daily-signups');
  expect(stack.resolve(endpoint.endpointId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'Id'] });
  expect(stack.resolve(endpoint.endpointUrl)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'Url'] });
  expect(stack.resolve(endpoint.endpointPath)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'EndpointPath'] });
  expect(stack.resolve(endpoint.endpointMaterializationStatus)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'MaterializationStatus'] });
  expect(stack.resolve(endpoint.endpointCurrentVersion)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'CurrentVersion'] });
});

test('takes a raw query, leaves optional props out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Endpoint(stack, 'Raw', {
    project,
    name: 'trend',
    rawQuery: { kind: 'TrendsQuery', series: [{ kind: 'EventsNode', event: '$pageview' }] },
    removalPolicy: RemovalPolicy.RETAIN,
  });
  expect(props(stack)).toEqual({
    ProjectId: '12345',
    Name: 'trend',
    Query: '{"kind":"TrendsQuery","series":[{"kind":"EventsNode","event":"$pageview"}]}',
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
});

test('validates values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new Endpoint(stack, 'Name', { project, name: '1-bad', hogql: 'SELECT 1' })).toThrow(/Endpoint name '1-bad' is invalid/);
  expect(() => new Endpoint(stack, 'None', { project, name: 'a' })).toThrow(/exactly one of hogql, rawQuery/);
  expect(() => new Endpoint(stack, 'Both', { project, name: 'a', hogql: 'SELECT 1', rawQuery: { kind: 'X' } })).toThrow(/exactly one/);
  expect(() => new Endpoint(stack, 'Kind', { project, name: 'a', rawQuery: { query: 'x' } })).toThrow(/'kind' key/);
  expect(() => new Endpoint(stack, 'Fresh', { project, name: 'a', hogql: 'SELECT 1', dataFreshness: Duration.hours(2) }))
    .toThrow(/dataFreshness must be one of 15m, 30m, 1h, 6h, 12h, 1d, 7d/);
  const name = new CfnParameter(stack, 'NameParam', { type: 'String' });
  expect(() => new Endpoint(stack, 'Token', { project, name: name.valueAsString, hogql: 'SELECT 1' })).not.toThrow();
});

test('imports existing endpoints by name', () => {
  const { stack, project } = setup();
  const endpoint = Endpoint.fromEndpointName(stack, 'Existing', project, 'daily-signups');
  expect(endpoint.endpointName).toBe('daily-signups');
  expect(endpoint.project).toBe(project);
});
