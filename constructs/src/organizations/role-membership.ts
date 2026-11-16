import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IRole } from './role';
import { CfnRoleMembership } from './role-membership.generated';
import { validateUuid } from '../private/organizations';

/**
 * A member's assignment to a PostHog role.
 */
export interface IRoleMembership extends IResource {
  /**
   * The PostHog role membership ID (a UUID).
   * @attribute
   */
  readonly roleMembershipId: string;

  /** The role the member is assigned to. */
  readonly role: IRole;
}

/**
 * Properties for a RoleMembership.
 */
export interface RoleMembershipProps {
  /** The role to add the member to. */
  readonly role: IRole;

  /**
   * UUID of the user to add. The user must already be a member of the
   * role's organization. Changing it replaces the membership.
   */
  readonly userUuid: string;

  /**
   * What happens to the membership when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Adds an organization member to a PostHog role. Memberships cannot be
 * changed in place; changing a property replaces the membership. Usually
 * created with `role.addMember()`.
 *
 * @resource PostHog::Organizations::RoleMembership
 */
export class RoleMembership extends Resource implements IRoleMembership {
  /**
   * Import an existing role membership by its PostHog ID.
   */
  public static fromRoleMembershipId(scope: Construct, id: string, role: IRole, roleMembershipId: string): IRoleMembership {
    class Import extends Resource implements IRoleMembership {
      public readonly roleMembershipId = roleMembershipId;
      public readonly role = role;
    }
    return new Import(scope, id);
  }

  public readonly roleMembershipId: string;
  public readonly role: IRole;

  /**
   * ISO 8601 timestamp of when the user joined the role.
   * @attribute
   */
  public readonly joinedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnRoleMembership;

  constructor(scope: Construct, id: string, props: RoleMembershipProps) {
    super(scope, id);
    validateUuid('RoleMembership userUuid', props.userUuid);

    this.role = props.role;

    this.resource = new CfnRoleMembership(this, 'Resource', {
      organizationId: props.role.organization.organizationId,
      roleId: props.role.roleId,
      userUuid: props.userUuid,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.roleMembershipId = this.resource.attrId;
    this.joinedAt = this.resource.attrJoinedAt;
  }
}
