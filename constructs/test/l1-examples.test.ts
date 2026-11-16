import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { logs, organizations, productAnalytics } from '../src';

test('Action L1 renders nested Steps with JSON-string properties', () => {
  const stack = new Stack(new App(), 'Test');
  const action = new productAnalytics.CfnAction(stack, 'SignedUp', {
    projectId: '1',
    name: 'Signed up',
    tags: ['growth'],
    steps: [
      { event: '$pageview', url: '/signup/complete', urlMatching: 'contains' },
      { event: 'signed_up', properties: JSON.stringify([{ key: 'plan', value: 'pro', type: 'person' }]) },
    ],
  });

  Template.fromStack(stack).hasResourceProperties('PostHog::ProductAnalytics::Action', {
    ProjectId: '1',
    Name: 'Signed up',
    Tags: ['growth'],
    Steps: [
      { Event: '$pageview', Url: '/signup/complete', UrlMatching: 'contains' },
      { Event: 'signed_up', Properties: '[{"key":"plan","value":"pro","type":"person"}]' },
    ],
  });
  expect(stack.resolve(action.attrId)).toEqual({ 'Fn::GetAtt': ['SignedUp', 'Id'] });
});

test('Logs Alert L1 renders string maps', () => {
  const stack = new Stack(new App(), 'Test');
  new logs.CfnAlert(stack, 'Errors', {
    projectId: '1',
    name: 'Error spike',
    labels: { team: 'platform' },
    annotations: { runbook: 'https://example.com/runbook' },
  });

  Template.fromStack(stack).hasResourceProperties('PostHog::Logs::Alert', {
    Labels: { team: 'platform' },
    Annotations: { runbook: 'https://example.com/runbook' },
  });
});

test('organization-scoped L1s can reference each other through attributes', () => {
  const stack = new Stack(new App(), 'Test');
  const role = new organizations.CfnRole(stack, 'Role', { organizationId: 'org-1', name: 'Analysts' });
  new organizations.CfnRoleMembership(stack, 'Member', {
    organizationId: 'org-1',
    roleId: role.attrId,
    userUuid: '0190a1b2-0000-7000-8000-000000000001',
  });

  Template.fromStack(stack).hasResourceProperties('PostHog::Organizations::RoleMembership', {
    RoleId: { 'Fn::GetAtt': ['Role', 'Id'] },
  });
});
