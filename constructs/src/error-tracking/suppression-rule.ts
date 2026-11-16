import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ErrorFilter } from './error-filter';
import { CfnSuppressionRule } from './suppression-rule.generated';
import type { IProject } from '../organizations/project';
import { renderRuleFilters } from '../private/error-tracking';
import { validateRange } from '../private/helpers';

/**
 * A PostHog error tracking suppression rule.
 */
export interface ISuppressionRule extends IResource {
  /**
   * The PostHog suppression rule ID (a UUID).
   * @attribute
   */
  readonly suppressionRuleId: string;

  /** The project the rule belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a suppression rule in a project.
 */
export interface SuppressionRuleOptions {
  /**
   * Which incoming exceptions are suppressed.
   * @default - every exception (a match-all rule)
   */
  readonly filters?: ErrorFilter;

  /**
   * Probability that a matching exception is dropped, from 0 to 1: 1 drops
   * every match, 0.5 drops half and 0 drops none.
   * @default 1
   */
  readonly samplingRate?: number;

  /**
   * Evaluation order among suppression rules. Lower runs first.
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
 * Properties for a SuppressionRule.
 */
export interface SuppressionRuleProps extends SuppressionRuleOptions {
  /** The project to create the rule in. */
  readonly project: IProject;
}

/**
 * A PostHog error tracking suppression rule: incoming exceptions that match
 * the filters are dropped (optionally sampled) before they create or update
 * issues.
 *
 * @resource PostHog::ErrorTracking::SuppressionRule
 */
export class SuppressionRule extends Resource implements ISuppressionRule {
  /**
   * Import an existing suppression rule by its PostHog ID.
   */
  public static fromSuppressionRuleId(scope: Construct, id: string, project: IProject, suppressionRuleId: string): ISuppressionRule {
    class Import extends Resource implements ISuppressionRule {
      public readonly suppressionRuleId = suppressionRuleId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly suppressionRuleId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly suppressionRuleCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSuppressionRule;

  constructor(scope: Construct, id: string, props: SuppressionRuleProps) {
    super(scope, id);
    validateRange('SuppressionRule samplingRate', props.samplingRate, 0, 1);
    this.project = props.project;

    this.resource = new CfnSuppressionRule(this, 'Resource', {
      projectId: props.project.projectId,
      filters: props.filters && !props.filters.isEmpty ? renderRuleFilters(this, props.filters) : undefined,
      samplingRate: props.samplingRate,
      orderKey: props.order,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.suppressionRuleId = this.resource.attrId;
    this.suppressionRuleCreatedAt = this.resource.attrCreatedAt;
  }
}
