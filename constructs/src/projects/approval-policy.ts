import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnApprovalPolicy } from './approval-policy.generated';
import type { IFeatureFlag } from '../feature-flags/feature-flag';
import type { IProject } from '../organizations/project';
import type { IRole } from '../organizations/role';
import { renderApproverConfig, renderConditions, renderExpiresAfter, renderMembershipLevels } from '../private/approvals';
import { jsonProp, uniqueOrUndefined, validateLength } from '../private/helpers';

/**
 * An organization membership level.
 */
export enum OrganizationMembershipLevel {
  /** Organization members (level 1). */
  MEMBER = 'member',
  /** Organization administrators (level 8). */
  ADMIN = 'admin',
  /** Organization owners (level 15). */
  OWNER = 'owner',
}

/**
 * Who can approve a change, and how many approvals it needs.
 */
export interface ApproverConfig {
  /**
   * PostHog user IDs (numeric) of users who can approve.
   * @default - no individual users
   */
  readonly users?: number[];

  /**
   * Roles whose members can approve.
   * @default - no roles
   */
  readonly roles?: IRole[];

  /**
   * Number of approvals a change needs before it is applied (PostHog's
   * `quorum`).
   * @default 1
   */
  readonly minimumApprovals?: number;
}

/**
 * Narrows which changes of the gated action need approval.
 */
export interface ApprovalConditions {
  /**
   * Only changes to these feature flags need approval (PostHog's
   * `flag_keys`). Applies to feature flag actions.
   * @default - changes to every flag
   */
  readonly featureFlags?: IFeatureFlag[];
}

/**
 * A PostHog approval policy.
 */
export interface IApprovalPolicy extends IResource {
  /**
   * The PostHog approval policy ID (a UUID).
   * @attribute
   */
  readonly approvalPolicyId: string;

  /** The project the policy belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an approval policy (`project.addApprovalPolicy()`).
 */
export interface ApprovalPolicyOptions {
  /**
   * Key of the gated action, e.g. `feature_flag.update`. 1 to 128 characters.
   */
  readonly actionKey: string;

  /**
   * Who can approve and how many approvals are needed. Specify exactly one of
   * `approverConfig` and `rawApproverConfig`.
   * @default - use `rawApproverConfig`
   */
  readonly approverConfig?: ApproverConfig;

  /**
   * Escape hatch: PostHog's `approver_config` JSON object as-is, e.g.
   * `{ users: [1, 2], roles: [], quorum: 1 }`. Use it when the typed
   * `approverConfig` does not cover a field PostHog accepts.
   * @default - use `approverConfig`
   */
  readonly rawApproverConfig?: { [key: string]: any };

  /**
   * Restricts which changes need approval. Specify at most one of
   * `conditions` and `rawConditions`.
   * @default - every change of the action needs approval
   */
  readonly conditions?: ApprovalConditions;

  /**
   * Escape hatch: PostHog's `conditions` JSON object as-is.
   * @default - use `conditions`
   */
  readonly rawConditions?: { [key: string]: any };

  /**
   * Roles whose members can apply the change without approval.
   * @default - none
   */
  readonly bypassRoles?: IRole[];

  /**
   * Organization membership levels whose members can apply the change
   * without approval.
   * @default - none
   */
  readonly bypassOrgMembershipLevels?: OrganizationMembershipLevel[];

  /**
   * Whether the requester of a change may approve it.
   * @default false
   */
  readonly allowSelfApprove?: boolean;

  /**
   * Whether the policy is enforced.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Pending change requests expire after this duration. Whole seconds only.
   * Removing it from the stack leaves PostHog's current value in place.
   * @default - PostHog default
   */
  readonly expiresAfter?: Duration;

  /**
   * What happens to the PostHog approval policy when it is removed from the
   * stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an ApprovalPolicy.
 */
export interface ApprovalPolicyProps extends ApprovalPolicyOptions {
  /** The project to create the policy in. */
  readonly project: IProject;
}

/**
 * A PostHog approval policy: changes of one kind (the action key, e.g.
 * `feature_flag.update`) in a project must be approved by the configured
 * approvers before PostHog applies them. May need a PostHog plan that
 * includes approvals.
 *
 * @resource PostHog::Projects::ApprovalPolicy
 */
export class ApprovalPolicy extends Resource implements IApprovalPolicy {
  /**
   * Import an existing approval policy by its PostHog ID.
   */
  public static fromApprovalPolicyId(scope: Construct, id: string, project: IProject, approvalPolicyId: string): IApprovalPolicy {
    class Import extends Resource implements IApprovalPolicy {
      public readonly approvalPolicyId = approvalPolicyId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly approvalPolicyId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly approvalPolicyCreatedAt: string;

  /**
   * ISO 8601 timestamp of the last change.
   * @attribute
   */
  public readonly approvalPolicyUpdatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnApprovalPolicy;

  constructor(scope: Construct, id: string, props: ApprovalPolicyProps) {
    super(scope, id);
    validateLength('ApprovalPolicy actionKey', props.actionKey, 1, 128);
    if ((props.approverConfig === undefined) === (props.rawApproverConfig === undefined)) {
      throw new Error('ApprovalPolicy: specify exactly one of approverConfig and rawApproverConfig');
    }
    if (props.conditions !== undefined && props.rawConditions !== undefined) {
      throw new Error('ApprovalPolicy: specify at most one of conditions and rawConditions');
    }

    this.project = props.project;

    const approverConfig = props.rawApproverConfig ?? renderApproverConfig(props.approverConfig!);
    const conditions = props.rawConditions ?? renderConditions(props.conditions);

    this.resource = new CfnApprovalPolicy(this, 'Resource', {
      projectId: props.project.projectId,
      actionKey: props.actionKey,
      approverConfig: jsonProp(this, approverConfig)!,
      conditions: jsonProp(this, conditions),
      allowSelfApprove: props.allowSelfApprove,
      enabled: props.enabled,
      bypassRoles: uniqueOrUndefined(props.bypassRoles?.map(r => r.roleId)),
      bypassOrgMembershipLevels: jsonProp(this, renderMembershipLevels(props.bypassOrgMembershipLevels)),
      expiresAfter: renderExpiresAfter(props.expiresAfter),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.approvalPolicyId = this.resource.attrId;
    this.approvalPolicyCreatedAt = this.resource.attrCreatedAt;
    this.approvalPolicyUpdatedAt = this.resource.attrUpdatedAt;
  }
}
