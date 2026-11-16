import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { WebExperiment } from '../../src/experiments';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::Experiments::WebExperiment';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a web experiment with typed variants and transforms', () => {
  const { stack, project } = setup();
  const web = new WebExperiment(stack, 'Hero', {
    project,
    name: 'Hero headline',
    variants: [
      { key: 'control', rolloutPercentage: 50 },
      {
        key: 'superman',
        rolloutPercentage: 50,
        transforms: [
          { selector: '#hero > h1', text: 'Here comes Superman!' },
          { selector: '#cta', html: '<b>Fly</b>', css: 'color: red' },
        ],
      },
    ],
  });
  const t = Template.fromStack(stack);
  t.hasResourceProperties(TYPE, {
    ProjectId: '12345',
    Name: 'Hero headline',
    Variants: JSON.stringify({
      control: { transforms: [], rollout_percentage: 50 },
      superman: {
        transforms: [
          { selector: '#hero > h1', text: 'Here comes Superman!' },
          { selector: '#cta', html: '<b>Fly</b>', css: 'color: red' },
        ],
        rollout_percentage: 50,
      },
    }),
  });
  t.hasResource(TYPE, { DeletionPolicy: 'Delete' });
  expect(stack.resolve(web.webExperimentId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Hero/), 'Id'] });
  expect(stack.resolve(web.featureFlagKey)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Hero/), 'FeatureFlagKey'] });
  expect(stack.resolve(web.webExperimentCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Hero/), 'CreatedAt'] });
  expect(web.project).toBe(project);
});

test('honours the removal policy', () => {
  const { stack, project } = setup();
  new WebExperiment(stack, 'W', {
    project,
    name: 'W',
    variants: [{ key: 'control', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50 }],
    removalPolicy: RemovalPolicy.RETAIN,
  });
  Template.fromStack(stack).hasResource(TYPE, { DeletionPolicy: 'Retain' });
});

test('validates variants and transforms', () => {
  const { stack, project } = setup();
  const ok = [{ key: 'control', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50 }];
  expect(() => new WebExperiment(stack, 'Empty', { project, name: '', variants: ok })).toThrow(/WebExperiment name must be between 1 and 400/);
  expect(() => new WebExperiment(stack, 'NoControl', {
    project, name: 'x', variants: [{ key: 'a', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50 }],
  })).toThrow(/exactly one variant must have the key 'control'/);
  expect(() => new WebExperiment(stack, 'Sum', {
    project, name: 'x', variants: [{ key: 'control', rolloutPercentage: 60 }, { key: 'b', rolloutPercentage: 50 }],
  })).toThrow(/add up to 100/);
  expect(() => new WebExperiment(stack, 'NoChange', {
    project, name: 'x', variants: [{ key: 'control', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50, transforms: [{ selector: 'h1' }] }],
  })).toThrow(/set at least one of text, html and css/);
  expect(() => new WebExperiment(stack, 'NoSelector', {
    project, name: 'x', variants: [{ key: 'control', rolloutPercentage: 50 }, { key: 'b', rolloutPercentage: 50, transforms: [{ selector: '', text: 't' }] }],
  })).toThrow(/selector/);
  const name = new CfnParameter(stack, 'N', { type: 'String' });
  expect(() => new WebExperiment(stack, 'Token', { project, name: name.valueAsString, variants: ok })).not.toThrow();
});

test('imports an existing web experiment', () => {
  const { stack, project } = setup();
  const web = WebExperiment.fromWebExperimentId(stack, 'Existing', project, '4');
  expect(web.webExperimentId).toBe('4');
  expect(web.project).toBe(project);
});
