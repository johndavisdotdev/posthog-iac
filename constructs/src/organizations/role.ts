import { IResolvable, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IOrganization } from './organization';
import { RoleMembership } from './role-membership';
import { CfnRole } from './role.generated';
import { validateLength } from '../private/helpers';

/**
 * A PostHog organization role.
 */
export interface IRole extends IResource {
  /**
   * The PostHog role ID (a UUID).
   * @attribute
   */
  readonly roleId: string;

  /** The organization the role belongs to. */
  readonly organization: IOrganization;
}

/**
 * Behaviour shared by created and imported roles.
 */
export abstract class RoleBase extends Resource implements IRole {
  public abstract readonly roleId: string;
  public abstract readonly organization: IOrganization;

  /**
   * Add an organization member to this role.
   *
   * @param id construct ID of the membership
   * @param userUuid UUID of a user who is already a member of the organization
   */
  public addMember(id: string, userUuid: string): RoleMembership {
    return new RoleMembership(this, id, { role: this, userUuid });
  }
}

/**
 * Options for creating a role in an organization.
 */
export interface RoleOptions {
  /** Name of the role. */
  readonly name: string;

  /**
   * What happens to the PostHog role when it is removed from the stack.
   * Deleting a role also removes its memberships.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Role.
 */
export interface RoleProps extends RoleOptions {
  /** The organization to create the role in. */
  readonly organization: IOrganization;
}

/**
 * A PostHog role: a named group of organization members that project,
 * resource and feature access can be granted to. Add members with
 * `addMember()`.
 *
 * @resource PostHog::Organizations::Role
 */
export class Role extends RoleBase {
  /**
   * Import an existing role by its PostHog ID.
   */
  public static fromRoleId(scope: Construct, id: string, organization: IOrganization, roleId: string): IRole {
    class Import extends RoleBase {
      public readonly roleId = roleId;
      public readonly organization = organization;
    }
    return new Import(scope, id);
  }

  public readonly roleId: string;
  public readonly organization: IOrganization;

  /**
   * Whether this is the organization's default role for new members.
   * @attribute
   */
  public readonly roleIsDefault: IResolvable;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly roleCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnRole;

  constructor(scope: Construct, id: string, props: RoleProps) {
    super(scope, id);
    validateLength('Role name', props.name, 1, 200);

    this.organization = props.organization;

    this.resource = new CfnRole(this, 'Resource', {
      organizationId: props.organization.organizationId,
      name: props.name,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.roleId = this.resource.attrId;
    this.roleIsDefault = this.resource.attrIsDefault;
    this.roleCreatedAt = this.resource.attrCreatedAt;
  }
}
