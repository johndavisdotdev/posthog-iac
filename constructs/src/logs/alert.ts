import { Duration, IResolvable, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnAlert, CfnAlertFiltersSeverityLevels, CfnAlertPropsThresholdOperator, CfnAlertPropsWindowMinutes } from './alert.generated';
import { LogFilter } from './log-filter';
import type { IProject } from '../organizations/project';
import { isConcreteNumber, jsonProp, mapOrUndefined, uniqueOrUndefined, validateLength, validatePattern, validateRange } from '../private/helpers';
import { wholeUnits } from '../private/logs';

const WINDOW_MINUTES = [5, 10, 15, 30, 60];
const TIME_OF_DAY = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const LABEL_NAME = /^[A-Za-z0-9_]+$/;

/**
 * Log severity level.
 */
export enum LogSeverity {
  /** Trace. */
  TRACE = 'trace',
  /** Debug. */
  DEBUG = 'debug',
  /** Info. */
  INFO = 'info',
  /** Warning. */
  WARN = 'warn',
  /** Error. */
  ERROR = 'error',
  /** Fatal. */
  FATAL = 'fatal',
}

/**
 * Whether a logs alert fires above or below its threshold.
 */
export enum ThresholdOperator {
  /** Fires when the count is above the threshold. */
  ABOVE = 'above',
  /** Fires when the count is below the threshold. */
  BELOW = 'below',
}

/**
 * When a logs alert fires: the number of matching log entries in the window
 * and whether the count must be above or below it.
 */
export class AlertThreshold {
  /**
   * Fire when more than `count` matching entries arrive in the window. Use 0
   * to fire on any matching entry.
   */
  public static above(count: number): AlertThreshold {
    return new AlertThreshold(ThresholdOperator.ABOVE, count);
  }

  /** Fire when fewer than `count` matching entries arrive in the window. */
  public static below(count: number): AlertThreshold {
    return new AlertThreshold(ThresholdOperator.BELOW, count);
  }

  private constructor(
    /** Above or below. */
    public readonly operator: ThresholdOperator,
    /** The number of matching entries. */
    public readonly count: number,
  ) {
    validateRange('AlertThreshold count', count, 0, Number.MAX_SAFE_INTEGER);
    if (isConcreteNumber(count) && !Number.isInteger(count)) {
      throw new Error(`AlertThreshold count must be a whole number, got ${count}`);
    }
  }
}

/**
 * A local time window (project timezone) when a logs alert must not run.
 */
export interface BlockedWindow {
  /** Start time, `HH:MM` (24-hour), inclusive. */
  readonly start: string;

  /** End time, `HH:MM` (24-hour), exclusive. Windows span at least 30 minutes. */
  readonly end: string;
}

/**
 * A PostHog logs alert.
 */
export interface IAlert extends IResource {
  /**
   * The PostHog logs alert ID (a UUID).
   * @attribute
   */
  readonly alertId: string;

  /** The project the alert belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a logs alert in a project.
 */
export interface AlertOptions {
  /** Name of the alert. */
  readonly name: string;

  /**
   * When the alert fires.
   * @default - above 100 entries
   */
  readonly threshold?: AlertThreshold;

  /**
   * Time window over which entries are counted: 5, 10, 15, 30 or 60 minutes.
   * @default Duration.minutes(5)
   */
  readonly window?: Duration;

  /**
   * Number of check periods in the sliding evaluation window (M in N-of-M),
   * 1 to 10.
   * @default 1
   */
  readonly evaluationPeriods?: number;

  /**
   * Number of periods within the evaluation window that must breach the
   * threshold to fire (N in N-of-M), 1 to `evaluationPeriods`.
   * @default 1
   */
  readonly datapointsToAlarm?: number;

  /**
   * Severity levels to count. An enabled alert needs at least one of
   * `severityLevels`, `serviceNames` or `filters`.
   * @default - any severity
   */
  readonly severityLevels?: LogSeverity[];

  /**
   * Service names to count.
   * @default - any service
   */
  readonly serviceNames?: string[];

  /**
   * Further conditions log entries must match.
   * @default - none
   */
  readonly filters?: LogFilter;

  /**
   * Quiet hours: up to five local time windows (project timezone) when the
   * alert does not run.
   * @default - no quiet hours
   */
  readonly blockedWindows?: BlockedWindow[];

  /**
   * Labels saying who owns the alert and how urgent it is, e.g.
   * `{ team: 'checkout' }`. `alertname` and names starting with `posthog_`
   * are reserved. Only alerts evaluated by the PostHog alerts platform can
   * have labels.
   * @default - none
   */
  readonly labels?: { [key: string]: string };

  /**
   * Context for responders, e.g. `{ runbook_url: 'https://...' }`. Only
   * alerts evaluated by the PostHog alerts platform can have annotations.
   * @default - none
   */
  readonly annotations?: { [key: string]: string };

  /**
   * Minimum time between notifications, in whole minutes.
   * @default - no minimum
   */
  readonly cooldown?: Duration;

  /**
   * Whether the alert is evaluated.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * What happens to the PostHog alert when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a logs Alert.
 */
export interface AlertProps extends AlertOptions {
  /** The project to create the alert in. */
  readonly project: IProject;
}

/**
 * A PostHog logs alert: counts log entries matching a filter over a time
 * window and fires when the count crosses a threshold. Notification
 * destinations are managed separately.
 *
 * @resource PostHog::Logs::Alert
 */
export class Alert extends Resource implements IAlert {
  /**
   * Import an existing logs alert by its PostHog ID.
   */
  public static fromAlertId(scope: Construct, id: string, project: IProject, alertId: string): IAlert {
    class Import extends Resource implements IAlert {
      public readonly alertId = alertId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly alertId: string;
  public readonly project: IProject;

  /**
   * How often PostHog evaluates the alert, in minutes.
   * @attribute
   */
  public readonly alertCheckIntervalMinutes: number;

  /**
   * Whether the PostHog alerts platform evaluates the alert.
   * @attribute
   */
  public readonly alertPlatformOwned: IResolvable;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly alertCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnAlert;

  constructor(scope: Construct, id: string, props: AlertProps) {
    super(scope, id);
    validateLength('Alert name', props.name, 1, 255);

    const windowMinutes = wholeUnits('Alert window', props.window, 'minutes');
    if (isConcreteNumber(windowMinutes) && !WINDOW_MINUTES.includes(windowMinutes)) {
      throw new Error(`Alert window must be 5, 10, 15, 30 or 60 minutes, got ${windowMinutes}`);
    }
    validateRange('Alert evaluationPeriods', props.evaluationPeriods, 1, 10);
    validateRange('Alert datapointsToAlarm', props.datapointsToAlarm, 1, 10);
    if (isConcreteNumber(props.datapointsToAlarm) && isConcreteNumber(props.evaluationPeriods)
      && props.datapointsToAlarm > props.evaluationPeriods) {
      throw new Error(`Alert datapointsToAlarm (${props.datapointsToAlarm}) cannot exceed evaluationPeriods (${props.evaluationPeriods})`);
    }
    const cooldownMinutes = wholeUnits('Alert cooldown', props.cooldown, 'minutes');
    validateRange('Alert cooldown (minutes)', cooldownMinutes, 0, Number.MAX_SAFE_INTEGER);

    const windows = props.blockedWindows ?? [];
    if (windows.length > 5) {
      throw new Error(`Alert can have at most 5 blocked windows, got ${windows.length}`);
    }
    windows.forEach((w, i) => {
      validatePattern(`Alert blocked window ${i} start`, w.start, TIME_OF_DAY, 'use HH:MM (24-hour)');
      validatePattern(`Alert blocked window ${i} end`, w.end, TIME_OF_DAY, 'use HH:MM (24-hour)');
    });
    validateLabels('Alert labels', props.labels, true);
    validateLabels('Alert annotations', props.annotations, false);

    const severityLevels = uniqueOrUndefined(props.severityLevels);
    const serviceNames = uniqueOrUndefined(props.serviceNames);
    if (props.enabled !== false && !severityLevels && !serviceNames && !props.filters) {
      throw new Error('An enabled logs Alert needs at least one of severityLevels, serviceNames or filters');
    }

    this.project = props.project;

    this.resource = new CfnAlert(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      enabled: props.enabled,
      filters: severityLevels || serviceNames || props.filters ? {
        severityLevels: severityLevels?.map(s => s as CfnAlertFiltersSeverityLevels),
        serviceNames,
        filterGroup: jsonProp(this, props.filters?.render()),
      } : undefined,
      thresholdCount: props.threshold?.count,
      thresholdOperator: props.threshold?.operator as string as CfnAlertPropsThresholdOperator | undefined,
      windowMinutes: windowMinutes as CfnAlertPropsWindowMinutes | undefined,
      evaluationPeriods: props.evaluationPeriods,
      datapointsToAlarm: props.datapointsToAlarm,
      cooldownMinutes,
      scheduleRestriction: windows.length > 0 ? { blockedWindows: windows.map(w => ({ start: w.start, end: w.end })) } : undefined,
      labels: mapOrUndefined(props.labels),
      annotations: mapOrUndefined(props.annotations),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.alertId = this.resource.attrId;
    this.alertCheckIntervalMinutes = this.resource.attrCheckIntervalMinutes;
    this.alertPlatformOwned = this.resource.attrPlatformOwned;
    this.alertCreatedAt = this.resource.attrCreatedAt;
  }
}

function validateLabels(what: string, map: { [key: string]: string } | undefined, reserved: boolean): void {
  for (const key of Object.keys(map ?? {})) {
    validatePattern(`${what} name`, key, LABEL_NAME, 'use letters, digits and underscores');
    if (reserved && (key === 'alertname' || key.startsWith('posthog_'))) {
      throw new Error(`${what} name '${key}' is reserved`);
    }
  }
}
