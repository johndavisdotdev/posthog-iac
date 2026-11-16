import { App, CfnParameter, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Organization, Role, RoleMembership } from '../../src/organizations';

const ORG_ID = '0190f0a3-0000-7000-8000-000000000001';
const USER = '0190f0a3-1111-7000-8000-000000000002';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const organization = Organization.fromOrganizationId(stack, 'Org', ORG_ID);
  return { stack, organization };
}

test('creates a role and exposes its attributes', () => {
  const { stack, organization } = setup();
  const role = new Role(stack, 'Engineers', { organization, name: 'Engineers' });
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::Role', { OrganizationId: ORG_ID, Name: 'Engineers' });
  t.hasResource('PostHog::Organizations::Role', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(role.roleId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Engineers/), 'Id'] });
  expect(stack.resolve(role.roleIsDefault)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Engineers/), 'IsDefault'] });
  expect(stack.resolve(role.roleCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Engineers/), 'CreatedAt'] });
  expect(role.organization).toBe(organization);
});

test('role.addMember creates a membership scoped to the role', () => {
  const { stack, organization } = setup();
  const role = new Role(stack, 'Engineers', { organization, name: 'Engineers' });
  const membership = role.addMember('Alice', USER);
  expect(membership.role).toBe(role);
  expect(membership.node.scope).toBe(role);
  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Organizations::RoleMembership', {
    OrganizationId: ORG_ID,
    RoleId: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Engineers'), 'Id'] },
    UserUuid: USER,
  });
  t.hasResource('PostHog::Organizations::RoleMembership', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(membership.roleMembershipId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^EngineersAlice/), 'Id'] });
  expect(stack.resolve(membership.joinedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^EngineersAlice/), 'JoinedAt'] });
});

test('memberships work with imported roles and honour the removal policy', () => {
  const { stack, organization } = setup();
  const role = Role.fromRoleId(stack, 'Existing', organization, 'role-uuid');
  expect(role.roleId).toBe('role-uuid');
  new RoleMembership(stack, 'Bob', { role, userUuid: USER, removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Organizations::RoleMembership', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::Organizations::RoleMembership'))[0].Properties;
  expect(props).toEqual({ OrganizationId: ORG_ID, RoleId: 'role-uuid', UserUuid: USER });
});

test('validates concrete values and skips tokens', () => {
  const { stack, organization } = setup();
  expect(() => new Role(stack, 'Empty', { organization, name: '' })).toThrow(/Role name must be between 1 and 200/);
  const role = new Role(stack, 'R', { organization, name: 'R', removalPolicy: RemovalPolicy.RETAIN });
  expect(() => role.addMember('Bad', 'alice@example.com')).toThrow(/expected a UUID/);
  const user = new CfnParameter(stack, 'User', { type: 'String' });
  expect(() => role.addMember('Token', user.valueAsString)).not.toThrow();
  Template.fromStack(stack).hasResource('PostHog::Organizations::Role', { DeletionPolicy: 'Retain' });
});

test('imports existing memberships', () => {
  const { stack, organization } = setup();
  const role = Role.fromRoleId(stack, 'Existing', organization, 'role-uuid');
  const membership = RoleMembership.fromRoleMembershipId(stack, 'M', role, 'membership-uuid');
  expect(membership.roleMembershipId).toBe('membership-uuid');
  expect(membership.role).toBe(role);
});
