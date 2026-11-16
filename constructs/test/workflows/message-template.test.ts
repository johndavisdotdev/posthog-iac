import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Project } from '../../src/organizations';
import { MessageCategory, MessageTemplate, MessageTemplating } from '../../src/workflows';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function onlyProps(stack: Stack, type: string) {
  return Object.values(Template.fromStack(stack).findResources(type))[0].Properties;
}

describe('MessageTemplate', () => {
  test('creates an email template filed under a category', () => {
    const { stack, project } = setup();
    const category = new MessageCategory(stack, 'Onboarding', { project, key: 'onboarding', name: 'Onboarding' });
    const template = new MessageTemplate(stack, 'Welcome', {
      project,
      name: 'Welcome email',
      description: 'Sent after sign-up',
      tags: ['onboarding', 'onboarding'],
      templating: MessageTemplating.LIQUID,
      category,
      sensitive: false,
      email: {
        subject: 'Welcome, {{ person.properties.first_name }}',
        preheader: 'Three things to try',
        text: 'Thanks for signing up.',
        html: '<p>Thanks for signing up.</p>',
        from: 'Acme <hello@acme.com>',
        replyTo: 'support@acme.com',
      },
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('PostHog::Workflows::MessageTemplate', {
      ProjectId: '12345',
      Name: 'Welcome email',
      Description: 'Sent after sign-up',
      Tags: ['onboarding'],
      Sensitive: false,
      MessageCategory: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Onboarding'), 'Id'] },
      Content: '{"email":{"subject":"Welcome, {{ person.properties.first_name }}","preheader":"Three things to try","text":"Thanks for signing up.","html":"<p>Thanks for signing up.</p>","from":"Acme <hello@acme.com>","replyTo":"support@acme.com"},"templating":"liquid"}',
    });
    expect(stack.resolve(template.messageTemplateId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Welcome/), 'Id'] });
    expect(stack.resolve(template.transactionalHogFlowId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Welcome/), 'TransactionalHogFlowId'] });
    expect(stack.resolve(template.messageTemplateCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Welcome/), 'CreatedAt'] });
  });

  test('leaves optional properties out and honours the removal policy', () => {
    const { stack, project } = setup();
    new MessageTemplate(stack, 'Bare', { project, name: 'Bare', email: { subject: 'Hi' }, removalPolicy: RemovalPolicy.RETAIN });
    Template.fromStack(stack).hasResource('PostHog::Workflows::MessageTemplate', { DeletionPolicy: 'Retain' });
    expect(onlyProps(stack, 'PostHog::Workflows::MessageTemplate')).toEqual({ ProjectId: '12345', Name: 'Bare', Content: '{"email":{"subject":"Hi"}}' });
  });

  test('validates concrete values and skips tokens', () => {
    const { stack, project } = setup();
    expect(() => new MessageTemplate(stack, 'Name', { project, name: '', email: { subject: 'x' } })).toThrow(/name must be between 1 and 400/);
    expect(() => new MessageTemplate(stack, 'Subject', { project, name: 'x', email: { subject: '' } })).toThrow(/subject/);
    expect(() => new MessageTemplate(stack, 'Tag', { project, name: 'x', email: { subject: 'x' }, tags: ['t'.repeat(256)] })).toThrow(/tag/);
    const name = new CfnParameter(stack, 'TName', { type: 'String' });
    expect(() => new MessageTemplate(stack, 'Token', { project, name: name.valueAsString, email: { subject: 'x' } })).not.toThrow();
  });

  test('imports existing templates', () => {
    const { stack, project } = setup();
    const tpl = MessageTemplate.fromMessageTemplateId(stack, 'T', project, 'uuid');
    expect(tpl.messageTemplateId).toBe('uuid');
    expect(tpl.project).toBe(project);
  });
});
