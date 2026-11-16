import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import { MessageCategory, MessageCategoryType } from '../../src/workflows';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function onlyProps(stack: Stack, type: string) {
  return Object.values(Template.fromStack(stack).findResources(type))[0].Properties;
}

describe('MessageCategory', () => {
  test('creates a category', () => {
    const { stack, project } = setup();
    const category = new MessageCategory(stack, 'Newsletter', {
      project,
      key: 'newsletter',
      name: 'Newsletter',
      description: 'Monthly newsletter',
      publicDescription: 'News, once a month',
      categoryType: MessageCategoryType.MARKETING,
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('PostHog::Workflows::MessageCategory', {
      ProjectId: '12345',
      Key: 'newsletter',
      Name: 'Newsletter',
      Description: 'Monthly newsletter',
      PublicDescription: 'News, once a month',
      CategoryType: 'marketing',
    });
    t.hasResource('PostHog::Workflows::MessageCategory', { DeletionPolicy: 'Delete' });
    expect(stack.resolve(category.messageCategoryId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Newsletter/), 'Id'] });
    expect(stack.resolve(category.messageCategoryCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Newsletter/), 'CreatedAt'] });
  });

  test('leaves optional properties out and honours the removal policy', () => {
    const { stack, project } = setup();
    new MessageCategory(stack, 'Bare', { project, key: 'k', name: 'n', removalPolicy: RemovalPolicy.RETAIN });
    Template.fromStack(stack).hasResource('PostHog::Workflows::MessageCategory', { DeletionPolicy: 'Retain' });
    expect(onlyProps(stack, 'PostHog::Workflows::MessageCategory')).toEqual({ ProjectId: '12345', Key: 'k', Name: 'n' });
  });

  test('validates concrete values and skips tokens', () => {
    const { stack, project } = setup();
    expect(() => new MessageCategory(stack, 'Key', { project, key: 'k'.repeat(65), name: 'n' })).toThrow(/key must be between 1 and 64/);
    expect(() => new MessageCategory(stack, 'Name', { project, key: 'k', name: 'n'.repeat(129) })).toThrow(/name must be between 1 and 128/);
    const key = new CfnParameter(stack, 'Key2', { type: 'String' });
    expect(() => new MessageCategory(stack, 'Token', { project, key: key.valueAsString, name: 'n' })).not.toThrow();
  });

  test('imports existing categories', () => {
    const { stack, project } = setup();
    const c = MessageCategory.fromMessageCategoryId(stack, 'C', project, 'uuid');
    expect(c.messageCategoryId).toBe('uuid');
    expect(c.project).toBe(project);
  });
});
