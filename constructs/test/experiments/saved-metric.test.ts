import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ExperimentMetric, SavedMetric } from '../../src/experiments';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::Experiments::SavedMetric';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a shared metric from a typed query', () => {
  const { stack, project } = setup();
  const metric = new SavedMetric(stack, 'Funnel', {
    project,
    name: 'Sign-up funnel',
    description: 'Pageview to completed sign-up',
    tags: ['growth', 'growth'],
    query: ExperimentMetric.funnel({ steps: [{ event: '$pageview' }, { event: 'signed_up' }] }),
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties(TYPE, {
    ProjectId: '12345',
    Name: 'Sign-up funnel',
    Description: 'Pageview to completed sign-up',
    Tags: ['growth'],
    Query: '{"kind":"ExperimentMetric","metric_type":"funnel","series":[{"kind":"EventsNode","event":"$pageview"},{"kind":"EventsNode","event":"signed_up"}]}',
  });
  t.hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(stack.resolve(metric.savedMetricId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Funnel/), 'Id'] });
  expect(stack.resolve(metric.savedMetricCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Funnel/), 'CreatedAt'] });
  expect(metric.project).toBe(project);
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new SavedMetric(stack, 'Bare', {
    project,
    name: 'Bare',
    query: ExperimentMetric.fromJson({ metric_type: 'retention' }),
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const t = Template.fromStack(stack);
  t.hasResource(TYPE, { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources(TYPE))[0].Properties).toEqual({
    ProjectId: '12345',
    Name: 'Bare',
    Query: '{"metric_type":"retention","kind":"ExperimentMetric"}',
  });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  const query = ExperimentMetric.mean({ event: 'x' });
  expect(() => new SavedMetric(stack, 'Empty', { project, name: '', query })).toThrow(/SavedMetric name must be between 1 and 400/);
  expect(() => new SavedMetric(stack, 'Desc', { project, name: 'x', query, description: 'y'.repeat(401) })).toThrow(/description/);
  const name = new CfnParameter(stack, 'N', { type: 'String' });
  expect(() => new SavedMetric(stack, 'Token', { project, name: name.valueAsString, query })).not.toThrow();
});

test('imports an existing shared metric', () => {
  const { stack, project } = setup();
  const metric = SavedMetric.fromSavedMetricId(stack, 'Existing', project, '8');
  expect(metric.savedMetricId).toBe('8');
  expect(metric.project).toBe(project);
});

test('exposes its query and name', () => {
  const { stack, project } = setup();
  const query = ExperimentMetric.mean({ event: '$pageview' });
  const metric = new SavedMetric(stack, 'Views', { project, name: 'Views', query });
  expect(metric.query).toBe(query);
  expect(metric.name).toBe('Views');
});
