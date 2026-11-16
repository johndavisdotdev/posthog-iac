import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Assignee } from './assignee';
import { CfnAssignmentRule, CfnAssignmentRuleAssigneeType } from './assignment-rule.generated';
import { ErrorFilter } from './error-filter';
import type { IProject } from '../organizations/project';
import { renderRuleFilters } from '../private/error-tracking';

/**
 * A PostHog error tracking assignment rule.
 */
export interface IAssignmentRule extends IResource {
  /**
   * The PostHog assignment rule ID (a UUID).
   * @attribute
   */
  readonly assignmentRuleId: string;

  /** The project the rule belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an assignment rule in a project.
 */
export interface AssignmentRuleOptions {
  /** Which exceptions the rule matches. */
  readonly filters: ErrorFilter;

  /** The user or role that new matching issues are assigned to. */
  readonly assignee: Assignee;

  /**
   * Evaluation order among assignment rules. Lower runs first and the first
   * matching rule wins.
   * @default - PostHog's default (0)
   */
  readonly order?: number;

  /**
   * What happens to the PostHog rule when it is removed from the stack.
   * PostHog hard-deletes rules.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an AssignmentRule.
 */
export interface AssignmentRuleProps extends AssignmentRuleOptions {
  /** The project to create the rule in. */
  readonly project: IProject;
}

/**
 * A PostHog error tracking assignment rule: new issues whose exceptions match
 * the filters are assigned to a user or role.
 *
 * @resource PostHog::ErrorTracking::AssignmentRule
 */
export class AssignmentRule extends Resource implements IAssignmentRule {
  /**
   * Import an existing assignment rule by its PostHog ID.
   */
  public static fromAssignmentRuleId(scope: Construct, id: string, project: IProject, assignmentRuleId: string): IAssignmentRule {
    class Import extends Resource implements IAssignmentRule {
      public readonly assignmentRuleId = assignmentRuleId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly assignmentRuleId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly assignmentRuleCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnAssignmentRule;

  constructor(scope: Construct, id: string, props: AssignmentRuleProps) {
    super(scope, id);
    if (props.filters.isEmpty) {
      throw new Error('AssignmentRule filters need at least one condition');
    }
    this.project = props.project;

    this.resource = new CfnAssignmentRule(this, 'Resource', {
      projectId: props.project.projectId,
      filters: renderRuleFilters(this, props.filters),
      assignee: {
        type: props.assignee.type as string as CfnAssignmentRuleAssigneeType,
        id: props.assignee.id,
      },
      orderKey: props.order,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.assignmentRuleId = this.resource.attrId;
    this.assignmentRuleCreatedAt = this.resource.attrCreatedAt;
  }
}
