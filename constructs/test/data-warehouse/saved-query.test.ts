import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SavedQuery } from '../../src/data-warehouse';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::DataWarehouse::SavedQuery';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack): any {
  return Object.values(Template.fromStack(stack).findResources(TYPE))[0].Properties;
}

test('renders HogQL into the query JSON with incremental materialization', () => {
  const { stack, project } = setup();
  const view = new SavedQuery(stack, 'DailyEvents', {
    project,
    name: 'daily_events',
    hogql: 'SELECT toDate(timestamp) AS day, count() AS cnt FROM events GROUP BY day',
    description: 'One row per day',
    syncFrequency: Duration.hours(1),
    incremental: { incrementalKey: 'day', uniqueKey: ['day'], lookback: Duration.days(2) },
    folderId: 'f1',
    acknowledgeBreakingChanges: true,
  });
  expect(props(stack)).toEqual({
    ProjectId: '12345',
    Name: 'daily_events',
    Query: '{"kind":"HogQLQuery","query":"SELECT toDate(timestamp) AS day, count() AS cnt FROM events GROUP BY day"}',
    Description: 'One row per day',
    SyncFrequency: '1hour',
    Incremental: { Enabled: true, IncrementalKey: 'day', UniqueKey: ['day'], LookbackSeconds: 172800 },
    FolderId: 'f1',
    AcknowledgeBreakingChanges: true,
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(view.savedQueryName).toBe('daily_events');
  expect(stack.resolve(view.savedQueryId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^DailyEvents/), 'Id'] });
  expect(stack.resolve(view.savedQueryStatus)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^DailyEvents/), 'Status'] });
  expect(stack.resolve(view.savedQueryCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^DailyEvents/), 'CreatedAt'] });
});

test('leaves optional props out, pauses materialization and honours the removal policy', () => {
  const { stack, project } = setup();
  new SavedQuery(stack, 'Bare', { project, name: 'bare', hogql: 'SELECT 1', removalPolicy: RemovalPolicy.RETAIN });
  expect(props(stack)).toEqual({ ProjectId: '12345', Name: 'bare', Query: '{"kind":"HogQLQuery","query":"SELECT 1"}' });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });

  const other = setup();
  new SavedQuery(other.stack, 'Paused', { project: other.project, name: 'p', hogql: 'SELECT 1', materializationPaused: true });
  expect(props(other.stack).SyncFrequency).toBe('never');
});

test('validates values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new SavedQuery(stack, 'Empty', { project, name: '', hogql: 'SELECT 1' })).toThrow(/name must be between 1 and 128/);
  expect(() => new SavedQuery(stack, 'NoQuery', { project, name: 'x', hogql: '' })).toThrow(/hogql/);
  expect(() => new SavedQuery(stack, 'Freq', { project, name: 'x', hogql: 'SELECT 1', syncFrequency: Duration.minutes(5) }))
    .toThrow(/syncFrequency must be one of 15m/);
  expect(() => new SavedQuery(stack, 'Both', { project, name: 'x', hogql: 'SELECT 1', syncFrequency: Duration.hours(1), materializationPaused: true }))
    .toThrow(/at most one of/);
  expect(() => new SavedQuery(stack, 'Keys', { project, name: 'x', hogql: 'SELECT 1', incremental: { incrementalKey: 'a', uniqueKey: [] } }))
    .toThrow(/uniqueKey/);
  const name = new CfnParameter(stack, 'NameParam', { type: 'String' });
  expect(() => new SavedQuery(stack, 'Token', { project, name: name.valueAsString, hogql: 'SELECT 1' })).not.toThrow();
});

test('imports existing saved queries', () => {
  const { stack, project } = setup();
  const view = SavedQuery.fromSavedQueryAttributes(stack, 'Existing', { project, savedQueryId: 'id-1', savedQueryName: 'v' });
  expect(view.savedQueryId).toBe('id-1');
  expect(view.savedQueryName).toBe('v');
  expect(view.project).toBe(project);
});
