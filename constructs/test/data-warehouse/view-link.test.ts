import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { JoinTable, SavedQuery, Table, ViewLink } from '../../src/data-warehouse';
import { Project } from '../../src/organizations';

const TYPE = 'PostHog::DataWarehouse::ViewLink';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

test('creates a typed join onto a saved query and depends on it', () => {
  const { stack, project } = setup();
  const view = new SavedQuery(stack, 'Customers', { project, name: 'stripe_customers', hogql: 'SELECT * FROM stripe_customer' });
  const link = new ViewLink(stack, 'PersonCustomer', {
    project,
    source: { table: JoinTable.named('persons'), key: 'properties.email' },
    joining: { table: JoinTable.savedQuery(view), key: 'email' },
    fieldName: 'stripe_customer',
    configuration: { experimentsOptimized: true, experimentsTimestampKey: 'created', rawConfiguration: { extra: 1 } },
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties(TYPE, {
    ProjectId: '12345',
    SourceTableName: 'persons',
    SourceTableKey: 'properties.email',
    JoiningTableName: 'stripe_customers',
    JoiningTableKey: 'email',
    FieldName: 'stripe_customer',
    Configuration: '{"experiments_optimized":true,"experiments_timestamp_key":"created","extra":1}',
  });
  const linkResource = Object.values(t.findResources(TYPE))[0];
  expect(linkResource.DependsOn).toEqual([stack.getLogicalId(view.resource)]);
  expect(linkResource.DeletionPolicy).toBe('Delete');
  expect(stack.resolve(link.viewLinkId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^PersonCustomer/), 'Id'] });
  expect(stack.resolve(link.viewLinkCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^PersonCustomer/), 'CreatedAt'] });
});

test('joins an imported table and leaves configuration out', () => {
  const { stack, project } = setup();
  const table = Table.fromTableAttributes(stack, 'Orders', { project, tableId: 't', tableName: 'orders' });
  new ViewLink(stack, 'Link', {
    project,
    source: { table: JoinTable.table(table), key: 'customer_id' },
    joining: { table: JoinTable.named('persons'), key: 'id' },
    fieldName: 'customer',
    configuration: {},
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const resource = Object.values(Template.fromStack(stack).findResources(TYPE))[0];
  expect(resource.Properties).toEqual({
    ProjectId: '12345',
    SourceTableName: 'orders',
    SourceTableKey: 'customer_id',
    JoiningTableName: 'persons',
    JoiningTableKey: 'id',
    FieldName: 'customer',
  });
  expect(resource.DeletionPolicy).toBe('Retain');
});

test('validates values and skips tokens', () => {
  const { stack, project } = setup();
  const side = { table: JoinTable.named('events'), key: 'distinct_id' };
  expect(() => new ViewLink(stack, 'Empty', { project, source: side, joining: side, fieldName: '' })).toThrow(/fieldName must be between 1 and 400/);
  expect(() => new ViewLink(stack, 'Key', { project, source: { ...side, key: 'x'.repeat(401) }, joining: side, fieldName: 'f' })).toThrow(/source key/);
  const field = new CfnParameter(stack, 'Field', { type: 'String' });
  expect(() => new ViewLink(stack, 'Token', { project, source: side, joining: side, fieldName: field.valueAsString })).not.toThrow();
});

test('imports existing joins', () => {
  const { stack, project } = setup();
  const link = ViewLink.fromViewLinkId(stack, 'Existing', project, 'vl-1');
  expect(link.viewLinkId).toBe('vl-1');
  expect(link.project).toBe(project);
});
