import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import { DataColorTheme } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a theme with colors', () => {
  const { stack, project } = setup();
  const theme = new DataColorTheme(stack, 'Brand', { project, name: 'Brand', colors: ['#1d4aff', '#FFF', '#12345678', '#abcd'] });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::DataColorTheme', {
    ProjectId: '12345',
    Name: 'Brand',
    Colors: ['#1d4aff', '#FFF', '#12345678', '#abcd'],
  });
  t.hasResource('PostHog::ProductAnalytics::DataColorTheme', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(theme.dataColorThemeId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Brand/), 'Id'] });
  expect(stack.resolve(theme.dataColorThemeCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Brand/), 'CreatedAt'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new DataColorTheme(stack, 'Bare', { project, name: 'Bare', colors: [], removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::DataColorTheme', { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources('PostHog::ProductAnalytics::DataColorTheme'))[0].Properties).toEqual({ ProjectId: '12345', Name: 'Bare' });
});

test('validates names and colors and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new DataColorTheme(stack, 'A', { project, name: '' })).toThrow(/name must be between 1 and 100/);
  expect(() => new DataColorTheme(stack, 'B', { project, name: 'x'.repeat(101) })).toThrow(/name/);
  expect(() => new DataColorTheme(stack, 'C', { project, name: 'C', colors: ['#1d4aff', 'blue'] })).toThrow(/colors\[1\] 'blue' is invalid/);
  expect(() => new DataColorTheme(stack, 'D', { project, name: 'D', colors: ['1d4aff'] })).toThrow(/hex color/);
  expect(() => new DataColorTheme(stack, 'E', { project, name: 'E', colors: ['#12345'] })).toThrow(/hex color/);
  const color = new CfnParameter(stack, 'Color', { type: 'String' });
  expect(() => new DataColorTheme(stack, 'Token', { project, name: 'T', colors: [color.valueAsString] })).not.toThrow();
});

test('imports existing themes', () => {
  const { stack, project } = setup();
  const theme = DataColorTheme.fromDataColorThemeId(stack, 'Existing', project, '5');
  expect(theme.dataColorThemeId).toBe('5');
  expect(theme.project).toBe(project);
});
