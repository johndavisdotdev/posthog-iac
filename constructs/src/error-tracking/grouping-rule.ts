import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Assignee } from './assignee';
import { ErrorFilter } from './error-filter';
import { CfnGroupingRule, CfnGroupingRuleAssigneeType } from './grouping-rule.generated';
import type { IProject } from '../organizations/project';
import { renderRuleFilters } from '../private/error-tracking';

/**
 * A PostHog error tracking grouping rule.
 */
export interface IGroupingRule extends IResource {
  /**
   * The PostHog grouping rule ID (a UUID).
   * @attribute
   */
  readonly groupingRuleId: string;

  /** The project the rule belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a grouping rule in a project.
 */
export interface GroupingRuleOptions {
  /** Which exceptions are grouped into the same issue. */
  readonly filters: ErrorFilter;

  /**
   * User or role to assign to issues the rule creates.
   *
   * PostHog cannot change it after creation, so changing it replaces the rule.
   * @default - issues are not assigned
   */
  readonly assignee?: Assignee;

  /**
   * What the rule is for.
   *
   * PostHog cannot change it after creation, so changing it replaces the rule.
   * @default - none
   */
  readonly description?: string;

  /**
   * Evaluation order among grouping rules. Lower runs first.
   * @default - PostHog's default
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
 * Properties for a GroupingRule.
 */
export interface GroupingRuleProps extends GroupingRuleOptions {
  /** The project to create the rule in. */
  readonly project: IProject;
}

/**
 * A PostHog error tracking grouping rule: exceptions that match the filters
 * are grouped into the same issue, optionally assigned to a user or role.
 *
 * @resource PostHog::ErrorTracking::GroupingRule
 */
export class GroupingRule extends Resource implements IGroupingRule {
  /**
   * Import an existing grouping rule by its PostHog ID.
   */
  public static fromGroupingRuleId(scope: Construct, id: string, project: IProject, groupingRuleId: string): IGroupingRule {
    class Import extends Resource implements IGroupingRule {
      public readonly groupingRuleId = groupingRuleId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly groupingRuleId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly groupingRuleCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnGroupingRule;

  constructor(scope: Construct, id: string, props: GroupingRuleProps) {
    super(scope, id);
    if (props.filters.isEmpty) {
      throw new Error('GroupingRule filters need at least one condition');
    }
    this.project = props.project;

    this.resource = new CfnGroupingRule(this, 'Resource', {
      projectId: props.project.projectId,
      filters: renderRuleFilters(this, props.filters),
      assignee: props.assignee && {
        type: props.assignee.type as string as CfnGroupingRuleAssigneeType,
        id: props.assignee.id,
      },
      description: props.description,
      orderKey: props.order,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.groupingRuleId = this.resource.attrId;
    this.groupingRuleCreatedAt = this.resource.attrCreatedAt;
  }
}
