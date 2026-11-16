import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { FlagVariant, IFeatureFlag, ReleaseCondition } from './feature-flag';
import { CfnScheduledChange, CfnScheduledChangePropsRecurrenceInterval } from './scheduled-change.generated';
import type { IProject } from '../organizations/project';
import { renderPayloads, renderReleaseCondition, renderVariants, validateVariants } from '../private/feature-flags';
import { jsonProp, validateLength, validatePattern } from '../private/helpers';

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const ISO_HINT = 'expected an ISO 8601 date-time with a time zone, e.g. 2030-06-01T14:00:00Z';

/**
 * The kind of change a scheduled change applies.
 */
export enum ScheduledOperationType {
  /** Enable or disable the flag (`update_status`). */
  UPDATE_STATUS = 'update_status',
  /** Append release condition groups (`add_release_condition`). */
  ADD_RELEASE_CONDITION = 'add_release_condition',
  /** Replace the variants and payloads (`update_variants`). */
  UPDATE_VARIANTS = 'update_variants',
}

/**
 * A change to apply to a feature flag at a scheduled time.
 */
export class ScheduledOperation {
  /** Enable the flag. Can recur. */
  public static enable(): ScheduledOperation {
    return new ScheduledOperation(ScheduledOperationType.UPDATE_STATUS, true);
  }

  /** Disable the flag. Can recur. */
  public static disable(): ScheduledOperation {
    return new ScheduledOperation(ScheduledOperationType.UPDATE_STATUS, false);
  }

  /**
   * Roll the flag out to `percentage` percent of all users, by appending a
   * release condition with no property conditions. PostHog adds it to the
   * flag's existing conditions, so users already matched by another group
   * stay matched.
   */
  public static rolloutTo(percentage: number): ScheduledOperation {
    return ScheduledOperation.addReleaseCondition({ rolloutPercentage: percentage });
  }

  /**
   * Append a release condition group to the flag's existing ones.
   */
  public static addReleaseCondition(condition: ReleaseCondition): ScheduledOperation {
    return new ScheduledOperation(ScheduledOperationType.ADD_RELEASE_CONDITION, {
      groups: [renderReleaseCondition('ScheduledOperation.addReleaseCondition', condition)],
    });
  }

  /**
   * Replace the flag's variants, and optionally its payloads (any JSON value
   * per variant key). Variant percentages must sum to 100.
   */
  public static updateVariants(variants: FlagVariant[], payloads?: { [key: string]: any }): ScheduledOperation {
    validateVariants('ScheduledOperation.updateVariants', variants);
    return new ScheduledOperation(ScheduledOperationType.UPDATE_VARIANTS, { variants: renderVariants(variants) }, payloads);
  }

  /** The kind of change. */
  public readonly type: ScheduledOperationType;

  private constructor(type: ScheduledOperationType, private readonly value: any, private readonly payloads?: { [key: string]: any }) {
    this.type = type;
  }

  /**
   * The `{operation, value}` payload PostHog stores.
   * @internal
   */
  public _render(scope: Construct): { [key: string]: any } {
    const payloads = renderPayloads(scope, this.payloads);
    const value = payloads ? { ...this.value, payloads } : this.value;
    return { operation: this.type, value };
  }
}

/**
 * How often a recurring scheduled change repeats.
 */
export enum RecurrenceInterval {
  /** Every day. */
  DAILY = 'daily',
  /** Every week. */
  WEEKLY = 'weekly',
  /** Every month. */
  MONTHLY = 'monthly',
  /** Every year. */
  YEARLY = 'yearly',
}

/**
 * A repeating schedule for a scheduled change. Only `enable()` and
 * `disable()` operations can recur.
 */
export class Recurrence {
  /** Repeat at a fixed interval, starting at the change's `at` time. */
  public static every(interval: RecurrenceInterval): Recurrence {
    return new Recurrence(interval, undefined);
  }

  /**
   * Repeat on a cron expression (five fields, e.g. `0 9 * * 1-5`),
   * evaluated in the project's time zone.
   */
  public static cron(expression: string): Recurrence {
    validateLength('Recurrence cron expression', expression, 1, 100);
    return new Recurrence(undefined, expression);
  }

  /** The fixed interval, if any. */
  public readonly interval?: RecurrenceInterval;

  /** The cron expression, if any. */
  public readonly cronExpression?: string;

  private constructor(interval: RecurrenceInterval | undefined, cronExpression: string | undefined) {
    this.interval = interval;
    this.cronExpression = cronExpression;
  }
}

/**
 * A PostHog scheduled change.
 */
export interface IScheduledChange extends IResource {
  /**
   * The PostHog scheduled change ID.
   * @attribute
   */
  readonly scheduledChangeId: string;

  /** The project the scheduled change belongs to. */
  readonly project: IProject;
}

/**
 * Options for scheduling a change to a flag (`flag.scheduleChange()`).
 */
export interface ScheduledChangeOptions {
  /**
   * When to apply the change: an ISO 8601 date-time with a time zone, e.g.
   * `2030-06-01T14:00:00Z`. For a recurring change, the first run.
   */
  readonly at: string;

  /** The change to apply. */
  readonly operation: ScheduledOperation;

  /**
   * Repeat the change. Only `enable()` and `disable()` can recur.
   * @default - runs once
   */
  readonly recurrence?: Recurrence;

  /**
   * ISO 8601 date-time after which a recurring change stops.
   * @default - never stops
   */
  readonly endDate?: string;

  /**
   * What happens to the PostHog scheduled change when it is removed from the
   * stack. PostHog hard-deletes it; a change that already ran is not undone.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a ScheduledChange.
 */
export interface ScheduledChangeProps extends ScheduledChangeOptions {
  /** The flag to change. Must be imported or created with a known ID. */
  readonly flag: IFeatureFlag;
}

/**
 * A change PostHog applies to a feature flag at a set time, once or on a
 * recurring schedule. Usually created with `flag.scheduleChange()`.
 *
 * @resource PostHog::FeatureFlags::ScheduledChange
 */
export class ScheduledChange extends Resource implements IScheduledChange {
  /**
   * Import an existing scheduled change by its PostHog ID.
   */
  public static fromScheduledChangeId(scope: Construct, id: string, project: IProject, scheduledChangeId: string): IScheduledChange {
    class Import extends Resource implements IScheduledChange {
      public readonly scheduledChangeId = scheduledChangeId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly scheduledChangeId: string;
  public readonly project: IProject;

  /** The flag the change applies to. */
  public readonly flag: IFeatureFlag;

  /**
   * When a one-off change was applied. Empty until it runs.
   * @attribute
   */
  public readonly executedAt: string;

  /**
   * When a recurring change last ran.
   * @attribute
   */
  public readonly lastExecutedAt: string;

  /**
   * Why the last run failed, if it did.
   * @attribute
   */
  public readonly failureReason: string;

  /**
   * Time zone PostHog evaluates the schedule in.
   * @attribute
   */
  public readonly timezone: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnScheduledChange;

  constructor(scope: Construct, id: string, props: ScheduledChangeProps) {
    super(scope, id);
    validatePattern('ScheduledChange at', props.at, ISO_DATE_TIME, ISO_HINT);
    validatePattern('ScheduledChange endDate', props.endDate, ISO_DATE_TIME, ISO_HINT);
    if (props.recurrence && props.operation.type !== ScheduledOperationType.UPDATE_STATUS) {
      throw new Error(`ScheduledChange '${id}': only enable() and disable() can recur, not ${props.operation.type}`);
    }
    if (props.endDate !== undefined && !props.recurrence) {
      throw new Error(`ScheduledChange '${id}': endDate requires a recurrence`);
    }

    this.flag = props.flag;
    this.project = props.flag.project;

    this.resource = new CfnScheduledChange(this, 'Resource', {
      projectId: this.project.projectId,
      recordId: props.flag.flagId,
      payload: jsonProp(this, props.operation._render(this))!,
      scheduledAt: props.at,
      isRecurring: props.recurrence ? true : undefined,
      recurrenceInterval: props.recurrence?.interval as string as CfnScheduledChangePropsRecurrenceInterval | undefined,
      cronExpression: props.recurrence?.cronExpression,
      endDate: props.endDate,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.scheduledChangeId = this.resource.attrId;
    this.executedAt = this.resource.attrExecutedAt;
    this.lastExecutedAt = this.resource.attrLastExecutedAt;
    this.failureReason = this.resource.attrFailureReason;
    this.timezone = this.resource.attrTimezone;
  }
}
