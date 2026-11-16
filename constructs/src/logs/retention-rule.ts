import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LogFilter } from './log-filter';
import { CfnRetentionRule } from './retention-rule.generated';
import type { IProject } from '../organizations/project';
import { jsonProp, validateLength, validateRange } from '../private/helpers';
import { wholeUnits } from '../private/logs';

/**
 * A PostHog Logs retention rule.
 */
export interface IRetentionRule extends IResource {
  /**
   * The PostHog retention rule ID (a UUID).
   * @attribute
   */
  readonly retentionRuleId: string;

  /** The project the rule belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a retention rule in a project.
 */
export interface RetentionRuleOptions {
  /** User-visible label for the rule. */
  readonly name: string;

  /**
   * How long matching logs are kept, in whole days. Must be a retention tier
   * the organization is entitled to.
   */
  readonly retention: Duration;

  /** Which logs the rule applies to. */
  readonly filters: LogFilter;

  /**
   * Evaluation order. Lower numbers are evaluated first and the first
   * matching rule wins.
   * @default - appended after the existing rules
   */
  readonly priority?: number;

  /**
   * Whether the rule is active.
   * @default false
   */
  readonly enabled?: boolean;

  /**
   * What happens to the PostHog rule when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a RetentionRule.
 */
export interface RetentionRuleProps extends RetentionRuleOptions {
  /** The project to create the rule in. */
  readonly project: IProject;
}

/**
 * A PostHog Logs retention rule: logs matching the filters are kept for the
 * rule's retention period instead of the environment's default.
 *
 * @resource PostHog::Logs::RetentionRule
 */
export class RetentionRule extends Resource implements IRetentionRule {
  /**
   * Import an existing retention rule by its PostHog ID.
   */
  public static fromRetentionRuleId(scope: Construct, id: string, project: IProject, retentionRuleId: string): IRetentionRule {
    class Import extends Resource implements IRetentionRule {
      public readonly retentionRuleId = retentionRuleId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly retentionRuleId: string;
  public readonly project: IProject;

  /**
   * Version number PostHog increments on each update.
   * @attribute
   */
  public readonly retentionRuleVersion: number;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly retentionRuleCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnRetentionRule;

  constructor(scope: Construct, id: string, props: RetentionRuleProps) {
    super(scope, id);
    validateLength('RetentionRule name', props.name, 1, 255);
    validateRange('RetentionRule priority', props.priority, 0, Number.MAX_SAFE_INTEGER);
    const retentionDays = wholeUnits('RetentionRule retention', props.retention, 'days');
    validateRange('RetentionRule retention (days)', retentionDays, 1, Number.MAX_SAFE_INTEGER);

    this.project = props.project;

    this.resource = new CfnRetentionRule(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      enabled: props.enabled,
      priority: props.priority,
      config: jsonProp(this, { retention_days: retentionDays, filter_group: props.filters.render() })!,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.retentionRuleId = this.resource.attrId;
    this.retentionRuleVersion = this.resource.attrVersion;
    this.retentionRuleCreatedAt = this.resource.attrCreatedAt;
  }
}
