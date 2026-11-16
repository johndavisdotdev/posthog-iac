import { App, CfnParameter, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { IProject, Project } from '../../src/organizations';
import { Annotation, AnnotationCreationType, AnnotationScope, IDashboard, IInsight } from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function dashboard(stack: Stack, project: IProject, dashboardId: string): IDashboard {
  class D extends Resource implements IDashboard {
    public readonly dashboardId = dashboardId;
    public readonly project = project;
  }
  return new D(stack, `Dashboard${dashboardId}`);
}

function insight(stack: Stack, project: IProject, insightId: string): IInsight {
  class I extends Resource implements IInsight {
    public readonly insightId = insightId;
    public readonly project = project;
  }
  return new I(stack, `Insight${insightId}`);
}

test('creates a project annotation with typed props', () => {
  const { stack, project } = setup();
  const a = new Annotation(stack, 'Release', {
    project,
    content: 'Released v2.3',
    date: '2026-05-01T12:00:00Z',
    emoji: '🚀',
    creationType: AnnotationCreationType.GIT,
    hidden: true,
  });
  const t = Template.fromStack(stack);
  const props = Object.values(t.findResources('PostHog::ProductAnalytics::Annotation'))[0].Properties;
  expect(props).toEqual({
    ProjectId: '12345',
    Content: 'Released v2.3',
    DateMarker: '2026-05-01T12:00:00Z',
    Scope: 'project',
    Emoji: '🚀',
    CreationType: 'GIT',
    HiddenInUserInterface: true,
  });
  t.hasResource('PostHog::ProductAnalytics::Annotation', { DeletionPolicy: 'Delete' });
  expect(a.scope).toBe(AnnotationScope.PROJECT);
  expect(stack.resolve(a.annotationId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Release/), 'Id'] });
  expect(stack.resolve(a.annotationUpdatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Release/), 'UpdatedAt'] });
});

test('derives the scope from the dashboard or insight', () => {
  const { stack, project } = setup();
  const d = new Annotation(stack, 'D', { project, content: 'x', date: '2026-05-01', dashboard: dashboard(stack, project, '7') });
  const i = new Annotation(stack, 'I', { project, content: 'y', date: '2026-05-01', insight: insight(stack, project, '9') });
  expect(d.scope).toBe(AnnotationScope.DASHBOARD);
  expect(i.scope).toBe(AnnotationScope.INSIGHT);
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::Annotation', { Content: 'x', Scope: 'dashboard', DashboardId: '7' });
  t.hasResourceProperties('PostHog::ProductAnalytics::Annotation', { Content: 'y', Scope: 'dashboard_item', DashboardItem: '9' });
});

test('organization scope and removal policy', () => {
  const { stack, project } = setup();
  new Annotation(stack, 'Org', {
    project,
    content: 'Incident',
    date: Annotation.isoDate(new Date(Date.UTC(2026, 4, 1, 12))),
    scope: AnnotationScope.ORGANIZATION,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::Annotation', { DeletionPolicy: 'Retain' });
  t.hasResourceProperties('PostHog::ProductAnalytics::Annotation', { Scope: 'organization', DateMarker: '2026-05-01T12:00:00.000Z' });
});

test('validates the scope against the dashboard and insight', () => {
  const { stack, project } = setup();
  const base = { project, content: 'x', date: '2026-05-01T00:00:00Z' };
  expect(() => new Annotation(stack, 'A', { ...base, scope: AnnotationScope.DASHBOARD })).toThrow(/requires a dashboard/);
  expect(() => new Annotation(stack, 'B', { ...base, scope: AnnotationScope.INSIGHT })).toThrow(/requires an insight/);
  expect(() => new Annotation(stack, 'C', { ...base, scope: AnnotationScope.PROJECT, dashboard: dashboard(stack, project, '1') }))
    .toThrow(/dashboard can only be set with scope DASHBOARD/);
  expect(() => new Annotation(stack, 'D', { ...base, dashboard: dashboard(stack, project, '2'), insight: insight(stack, project, '3') }))
    .toThrow(/dashboard can only be set/);
  expect(() => new Annotation(stack, 'E', { ...base, scope: AnnotationScope.DASHBOARD, dashboard: dashboard(stack, project, '4'), insight: insight(stack, project, '5') }))
    .toThrow(/insight can only be set with scope INSIGHT/);
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new Annotation(stack, 'Empty', { project, content: '', date: '2026-05-01' })).toThrow(/content must be between 1 and 8192/);
  expect(() => new Annotation(stack, 'Emoji', { project, content: 'x', date: '2026-05-01', emoji: 'x'.repeat(17) })).toThrow(/emoji/);
  expect(() => new Annotation(stack, 'Date', { project, content: 'x', date: 'yesterday' })).toThrow(/ISO 8601/);
  expect(() => new Annotation(stack, 'Date2', { project, content: 'x', date: '2026-13-45T00:00:00Z' })).toThrow(/ISO 8601/);
  const date = new CfnParameter(stack, 'DateParam', { type: 'String' });
  const content = new CfnParameter(stack, 'ContentParam', { type: 'String' });
  expect(() => new Annotation(stack, 'Token', { project, content: content.valueAsString, date: date.valueAsString })).not.toThrow();
});

test('imports existing annotations', () => {
  const { stack, project } = setup();
  const a = Annotation.fromAnnotationId(stack, 'Existing', project, '42');
  expect(a.annotationId).toBe('42');
  expect(a.project).toBe(project);
});

test('accepts a Date', () => {
  const { stack, project } = setup();
  new Annotation(stack, 'Release', { project, content: 'v2.3', date: new Date(Date.UTC(2026, 4, 1, 12)) });
  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Annotation', { DateMarker: '2026-05-01T12:00:00.000Z' });
});
