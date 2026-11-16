import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import {
  DashboardTemplate,
  DashboardTemplateScope,
  GroupDisplay,
  InsightQuery,
  InsightSeries,
  LayoutCompaction,
  TemplateTile,
  TileSpacing,
} from '../../src/product-analytics';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a template with typed tiles, variables and filters', () => {
  const { stack, project } = setup();
  const template = new DashboardTemplate(stack, 'Signups', {
    project,
    templateName: 'Sign-up tracking',
    dashboardDescription: 'Daily sign-ups for a chosen event',
    tags: ['growth'],
    scope: DashboardTemplateScope.ORGANIZATION,
    dashboardFilters: { dateFrom: '-30d' },
    variables: [{
      id: 'VARIABLE_1',
      name: 'Sign-up event',
      description: 'The event fired when a user signs up',
      defaultEvent: 'signed_up',
    }],
    tiles: [
      TemplateTile.insight('Daily sign-ups', InsightQuery.trends({ series: [InsightSeries.event('{VARIABLE_1}')] }), {
        layout: { x: 0, y: 0, w: 6, h: 5 },
        description: 'Sign-ups per day',
      }),
      TemplateTile.text('## Notes'),
    ],
    imageUrl: 'https://example.com/preview.png',
    tileSpacing: TileSpacing.STANDARD,
    layoutCompaction: LayoutCompaction.VERTICAL,
    groupDisplay: GroupDisplay.SECTIONS,
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::ProductAnalytics::DashboardTemplate', {
    ProjectId: '12345',
    TemplateName: 'Sign-up tracking',
    DashboardDescription: 'Daily sign-ups for a chosen event',
    Tags: ['growth'],
    Scope: 'organization',
    DashboardFilters: '{"date_from":"-30d"}',
    ImageUrl: 'https://example.com/preview.png',
    Customization: { TileSpacing: 'standard', LayoutCompaction: 'vertical', GroupDisplay: 'sections' },
    Variables: JSON.stringify([{
      id: 'VARIABLE_1',
      name: 'Sign-up event',
      type: 'event',
      default: { id: 'signed_up' },
      required: true,
      description: 'The event fired when a user signs up',
    }]),
    Tiles: JSON.stringify([
      {
        type: 'INSIGHT',
        name: 'Daily sign-ups',
        query: {
          kind: 'InsightVizNode',
          source: {
            kind: 'TrendsQuery',
            series: [{ kind: 'EventsNode', event: '{VARIABLE_1}', name: '{VARIABLE_1}', math: 'total' }],
            interval: 'day',
          },
        },
        description: 'Sign-ups per day',
        layouts: { sm: { x: 0, y: 0, w: 6, h: 5 } },
        color: null,
      },
      { type: 'TEXT', body: '## Notes', layouts: {} },
    ]),
  });
  t.hasResource('PostHog::ProductAnalytics::DashboardTemplate', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(template.dashboardTemplateId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Signups/), 'Id'] });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new DashboardTemplate(stack, 'Bare', { project, templateName: 'Bare', tiles: [], variables: [], removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::ProductAnalytics::DashboardTemplate', { DeletionPolicy: 'Retain' });
  expect(Object.values(t.findResources('PostHog::ProductAnalytics::DashboardTemplate'))[0].Properties)
    .toEqual({ ProjectId: '12345', TemplateName: 'Bare' });
});

test('validates names, variables and layouts, skipping tokens', () => {
  const { stack, project } = setup();
  const q = InsightQuery.hogql('select 1');
  expect(() => new DashboardTemplate(stack, 'Empty', { project, templateName: '' })).toThrow(/templateName/);
  expect(() => new DashboardTemplate(stack, 'Desc', { project, templateName: 'x', dashboardDescription: 'y'.repeat(401) })).toThrow(/dashboardDescription/);
  expect(() => new DashboardTemplate(stack, 'Var', { project, templateName: 'x', variables: [{ id: 'bad id', name: 'n' }] })).toThrow(/variable id/);
  expect(() => new DashboardTemplate(stack, 'Dup', {
    project, templateName: 'x', variables: [{ id: 'V', name: 'a' }, { id: 'V', name: 'b' }],
  })).toThrow(/more than once/);
  expect(() => TemplateTile.insight('', q)).toThrow(/tile name/);
  expect(() => TemplateTile.insight('t', q, { layout: { x: 8, y: 0, w: 6, h: 2 } })).toThrow(/must not exceed 12/);
  expect(() => TemplateTile.text('t', { layout: { x: 0, y: 0, w: 13, h: 2 } })).toThrow(/Tile layout w/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new DashboardTemplate(stack, 'Token', { project, templateName: name.valueAsString })).not.toThrow();
});

test('imports a template', () => {
  const { stack } = setup();
  expect(DashboardTemplate.fromDashboardTemplateId(stack, 'T', 'uuid').dashboardTemplateId).toBe('uuid');
});
