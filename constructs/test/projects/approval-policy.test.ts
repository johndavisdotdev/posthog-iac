import { App, CfnParameter, Duration, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import { IFeatureFlag } from '../../src/feature-flags';
import { IOrganization, IProject, IRole, Organization, Project } from '../../src/organizations';
import { ApprovalPolicy, OrganizationMembershipLevel } from '../../src/projects';

class FakeRole extends Resource implements IRole {
  constructor(scope: Construct, id: string, public readonly roleId: string, public readonly organization: IOrganization) {
    super(scope, id);
  }
}

class FakeFlag extends Resource implements IFeatureFlag {
  public readonly flagId = '1';
  constructor(scope: Construct, id: string, public readonly flagKey: string, public readonly project: IProject) {
    super(scope, id);
  }
}

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  const org = Organization.fromOrganizationId(stack, 'Org', 'org-uuid');
  const approvers = new FakeRole(stack, 'Approvers', 'role-approvers', org);
  const admins = new FakeRole(stack, 'Admins', 'role-admins', org);
  return { stack, project, approvers, admins };
}

test('renders typed approver config, conditions, bypasses and duration', () => {
  const { stack, project, approvers, admins } = setup();
  const checkout = new FakeFlag(stack, 'Checkout', 'checkout', project);
  const policy = new ApprovalPolicy(stack, 'FlagChanges', {
    project,
    actionKey: 'feature_flag.update',
    approverConfig: { users: [1, 2, 2], roles: [approvers], minimumApprovals: 2 },
    conditions: { featureFlags: [checkout, checkout] },
    bypassRoles: [admins, admins],
    bypassOrgMembershipLevels: [OrganizationMembershipLevel.ADMIN, OrganizationMembershipLevel.OWNER],
    allowSelfApprove: false,
    enabled: true,
    expiresAfter: Duration.days(7),
  });

  const t = Template.fromStack(stack);
  t.hasResourceProperties('PostHog::Projects::ApprovalPolicy', {
    ProjectId: '12345',
    ActionKey: 'feature_flag.update',
    ApproverConfig: '{"users":[1,2],"roles":["role-approvers"],"quorum":2}',
    Conditions: '{"flag_keys":["checkout"]}',
    BypassRoles: ['role-admins'],
    BypassOrgMembershipLevels: '[8,15]',
    AllowSelfApprove: false,
    Enabled: true,
    ExpiresAfter: '7 00:00:00',
  });
  t.hasResource('PostHog::Projects::ApprovalPolicy', { DeletionPolicy: 'Delete' });
  expect(stack.resolve(policy.approvalPolicyId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^FlagChanges/), 'Id'] });
  expect(stack.resolve(policy.approvalPolicyCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^FlagChanges/), 'CreatedAt'] });
  expect(stack.resolve(policy.approvalPolicyUpdatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^FlagChanges/), 'UpdatedAt'] });
  expect(policy.project).toBe(project);
});

test.each([
  [Duration.hours(12), '12:00:00'],
  [Duration.minutes(90), '01:30:00'],
  [Duration.seconds(86400 + 3661), '1 01:01:01'],
  [Duration.days(30), '30 00:00:00'],
])('renders expiresAfter %s as a Django duration', (duration, expected) => {
  const { stack, project } = setup();
  new ApprovalPolicy(stack, 'P', { project, actionKey: 'a', approverConfig: { users: [1] }, expiresAfter: duration });
  Template.fromStack(stack).hasResourceProperties('PostHog::Projects::ApprovalPolicy', { ExpiresAfter: expected });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new ApprovalPolicy(stack, 'Bare', { project, actionKey: 'feature_flag.update', approverConfig: { users: [7] }, removalPolicy: RemovalPolicy.RETAIN });
  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Projects::ApprovalPolicy', { DeletionPolicy: 'Retain' });
  const props = Object.values(t.findResources('PostHog::Projects::ApprovalPolicy'))[0].Properties;
  expect(props).toEqual({
    ProjectId: '12345',
    ActionKey: 'feature_flag.update',
    ApproverConfig: '{"users":[7],"roles":[],"quorum":1}',
  });
});

test('raw escape hatches are passed through as JSON', () => {
  const { stack, project } = setup();
  new ApprovalPolicy(stack, 'Raw', {
    project,
    actionKey: 'feature_flag.update',
    rawApproverConfig: { users: [1], roles: [], quorum: 1, extra: true },
    rawConditions: { flag_keys: ['a'], other: 1 },
  });
  Template.fromStack(stack).hasResourceProperties('PostHog::Projects::ApprovalPolicy', {
    ApproverConfig: '{"users":[1],"roles":[],"quorum":1,"extra":true}',
    Conditions: '{"flag_keys":["a"],"other":1}',
  });
});

test('token references render correctly inside the JSON', () => {
  const { stack, project } = setup();
  const userId = new CfnParameter(stack, 'UserId', { type: 'Number' });
  const days = new CfnParameter(stack, 'Days', { type: 'Number' });
  new ApprovalPolicy(stack, 'Tok', {
    project,
    actionKey: 'feature_flag.update',
    approverConfig: { users: [userId.valueAsNumber], minimumApprovals: 1 },
    expiresAfter: Duration.seconds(days.valueAsNumber),
  });
  const props = Object.values(Template.fromStack(stack).findResources('PostHog::Projects::ApprovalPolicy'))[0].Properties;
  expect(JSON.stringify(props.ApproverConfig)).toContain('UserId');
  expect(props.ExpiresAfter).toEqual({ Ref: 'Days' });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  const ok = { users: [1] };
  expect(() => new ApprovalPolicy(stack, 'E1', { project, actionKey: '', approverConfig: ok })).toThrow(/actionKey must be between 1 and 128/);
  expect(() => new ApprovalPolicy(stack, 'E2', { project, actionKey: 'x'.repeat(129), approverConfig: ok })).toThrow(/actionKey/);
  expect(() => new ApprovalPolicy(stack, 'E3', { project, actionKey: 'a' })).toThrow(/exactly one of approverConfig and rawApproverConfig/);
  expect(() => new ApprovalPolicy(stack, 'E4', { project, actionKey: 'a', approverConfig: ok, rawApproverConfig: {} }))
    .toThrow(/exactly one of approverConfig and rawApproverConfig/);
  expect(() => new ApprovalPolicy(stack, 'E5', { project, actionKey: 'a', approverConfig: ok, conditions: {}, rawConditions: {} }))
    .toThrow(/at most one of conditions and rawConditions/);
  expect(() => new ApprovalPolicy(stack, 'E6', { project, actionKey: 'a', approverConfig: {} })).toThrow(/at least one user or role/);
  expect(() => new ApprovalPolicy(stack, 'E7', { project, actionKey: 'a', approverConfig: { users: [1], minimumApprovals: 0 } }))
    .toThrow(/minimumApprovals must be between 1/);
  expect(() => new ApprovalPolicy(stack, 'E8', { project, actionKey: 'a', approverConfig: { users: [1, 2], minimumApprovals: 3 } }))
    .toThrow(/exceeds the number of approvers \(2\)/);
  expect(() => new ApprovalPolicy(stack, 'E9', { project, actionKey: 'a', approverConfig: ok, expiresAfter: Duration.seconds(0) }))
    .toThrow(/expiresAfter must be positive/);
  expect(() => new ApprovalPolicy(stack, 'E10', { project, actionKey: 'a', approverConfig: ok, expiresAfter: Duration.millis(1500) }))
    .toThrow();

  const key = new CfnParameter(stack, 'Key', { type: 'String' });
  const quorum = new CfnParameter(stack, 'Quorum', { type: 'Number' });
  expect(() => new ApprovalPolicy(stack, 'Token', {
    project, actionKey: key.valueAsString, approverConfig: { users: [1], minimumApprovals: quorum.valueAsNumber },
  })).not.toThrow();
});

test('empty typed conditions are left out', () => {
  const { stack, project } = setup();
  new ApprovalPolicy(stack, 'P', { project, actionKey: 'a', approverConfig: { users: [1] }, conditions: { featureFlags: [] }, bypassOrgMembershipLevels: [] });
  const props = Object.values(Template.fromStack(stack).findResources('PostHog::Projects::ApprovalPolicy'))[0].Properties;
  expect(props.Conditions).toBeUndefined();
  expect(props.BypassOrgMembershipLevels).toBeUndefined();
});

test('imports an existing approval policy', () => {
  const { stack, project } = setup();
  const policy = ApprovalPolicy.fromApprovalPolicyId(stack, 'Existing', project, 'uuid-1');
  expect(policy.approvalPolicyId).toBe('uuid-1');
  expect(policy.project.projectId).toBe('12345');
});
