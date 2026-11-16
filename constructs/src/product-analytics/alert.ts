import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CfnAlert,
  CfnAlertConditionType,
  CfnAlertPropsCalculationInterval,
  CfnAlertThresholdConfigurationType,
} from './alert.generated';
import type { IInsight } from './insight';
import type { InsightQuery } from './insight-query';
import type { IProject } from '../organizations/project';
import { isConcreteNumber, jsonProp, uniqueOrUndefined, validateLength, validatePattern, validateRange } from '../private/helpers';

/**
 * How often an alert is checked.
 */
export enum AlertCalculationInterval {
  /** Continuously (PostHog Scale plan and up). */
  REAL_TIME = 'real_time',
  /** Every 15 minutes (PostHog Boost plan and up). */
  EVERY_15_MINUTES = 'every_15_minutes',
  /** Hourly. */
  HOURLY = 'hourly',
  /** Daily. */
  DAILY = 'daily',
  /** Weekly. */
  WEEKLY = 'weekly',
  /** Monthly. */
  MONTHLY = 'monthly',
}

/**
 * What an alert compares with its bounds.
 */
export enum AlertCondition {
  /** The insight value itself. */
  ABSOLUTE_VALUE = 'absolute_value',
  /** The increase from the previous interval. */
  RELATIVE_INCREASE = 'relative_increase',
  /** The decrease from the previous interval. */
  RELATIVE_DECREASE = 'relative_decrease',
}

/**
 * How an alert's bounds are read.
 */
export enum AlertThresholdType {
  /** Bounds are absolute numbers. */
  ABSOLUTE = 'absolute',
  /** Bounds are a percentage change (e.g. 20 for 20%); requires a relative condition. */
  PERCENTAGE = 'percentage',
}

/**
 * The bounds that make an alert fire.
 */
export interface AlertThreshold {
  /**
   * The alert fires when the value drops below this number.
   * @default - no lower bound
   */
  readonly lower?: number;

  /**
   * The alert fires when the value exceeds this number.
   * @default - no upper bound
   */
  readonly upper?: number;

  /**
   * Whether the bounds are absolute numbers or a percentage change.
   * @default AlertThresholdType.ABSOLUTE
   */
  readonly type?: AlertThresholdType;
}

/**
 * A local time window (project timezone) when an alert is not checked.
 */
export interface AlertQuietHours {
  /** Start time, `HH:MM` (24-hour), inclusive. */
  readonly start: string;
  /** End time, `HH:MM` (24-hour), exclusive. */
  readonly end: string;
}

/**
 * A PostHog insight alert.
 */
export interface IAlert extends IResource {
  /**
   * The PostHog alert ID (UUID).
   * @attribute
   */
  readonly alertId: string;
}

/**
 * Options for creating an alert on an insight (`insight.addAlert()`).
 */
export interface AlertOptions {
  /** Name of the alert. */
  readonly name: string;

  /** The bounds that make the alert fire. */
  readonly threshold: AlertThreshold;

  /**
   * What is compared with the bounds.
   * @default AlertCondition.ABSOLUTE_VALUE
   */
  readonly condition?: AlertCondition;

  /**
   * How often the alert is checked.
   * @default - PostHog default (daily)
   */
  readonly calculationInterval?: AlertCalculationInterval;

  /**
   * IDs of the PostHog users notified when the alert fires.
   * @default - none
   */
  readonly subscribedUsers?: string[];

  /**
   * Whether the alert is evaluated.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Zero-based index of the trends series the alert monitors.
   * @default 0
   */
  readonly seriesIndex?: number;

  /**
   * Also check the current, still incomplete interval.
   * @default false
   */
  readonly checkOngoingInterval?: boolean;

  /**
   * Skip checks on Saturdays and Sundays (project timezone).
   * @default false
   */
  readonly skipWeekend?: boolean;

  /**
   * Local time windows when the alert is not checked (at most five).
   * @default - none
   */
  readonly quietHours?: AlertQuietHours[];

  /**
   * Escape hatch: raw alert config JSON (e.g. `{ type: 'TrendsAlertConfig', ... }`),
   * replacing `seriesIndex` and `checkOngoingInterval`.
   * @default - a TrendsAlertConfig built from seriesIndex and checkOngoingInterval
   */
  readonly rawConfig?: { [key: string]: any };

  /**
   * What happens to the PostHog alert when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an Alert.
 */
export interface AlertProps extends AlertOptions {
  /** The insight the alert monitors (a trends insight). */
  readonly insight: IInsight;
}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * A PostHog alert: notifies users when an insight's value crosses a threshold.
 *
 * @resource PostHog::ProductAnalytics::Alert
 */
export class Alert extends Resource implements IAlert {
  /**
   * Import an existing alert by its PostHog ID.
   */
  public static fromAlertId(scope: Construct, id: string, alertId: string): IAlert {
    class Import extends Resource implements IAlert {
      public readonly alertId = alertId;
    }
    return new Import(scope, id);
  }

  public readonly alertId: string;

  /** The insight the alert monitors. */
  public readonly insight: IInsight;

  /** The project the alert belongs to. */
  public readonly project: IProject;

  /**
   * Short ID of the monitored insight.
   * @attribute
   */
  public readonly alertInsightShortId: string;

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
    const { lower, upper } = props.threshold;
    if (lower === undefined && upper === undefined) {
      throw new Error('Alert threshold: set lower, upper or both');
    }
    if (isConcreteNumber(lower) && isConcreteNumber(upper) && lower > upper) {
      throw new Error(`Alert threshold: lower (${lower}) must not be greater than upper (${upper})`);
    }
    const condition = props.condition ?? AlertCondition.ABSOLUTE_VALUE;
    const thresholdType = props.threshold.type ?? AlertThresholdType.ABSOLUTE;
    if (thresholdType === AlertThresholdType.PERCENTAGE && condition === AlertCondition.ABSOLUTE_VALUE) {
      throw new Error('Alert threshold: a percentage threshold requires a RELATIVE_INCREASE or RELATIVE_DECREASE condition');
    }
    validateRange('Alert seriesIndex', props.seriesIndex, 0, Number.MAX_SAFE_INTEGER);
    if ((props.quietHours?.length ?? 0) > 5) throw new Error('Alert quietHours: at most five windows');
    for (const w of props.quietHours ?? []) {
      validatePattern('Alert quiet hours start', w.start, TIME, 'expected HH:MM (24-hour)');
      validatePattern('Alert quiet hours end', w.end, TIME, 'expected HH:MM (24-hour)');
    }

    if (!props.rawConfig) validateTrendsInsight(props.insight, props.seriesIndex);

    this.insight = props.insight;
    this.project = props.insight.project;

    const config = props.rawConfig ?? {
      type: 'TrendsAlertConfig',
      series_index: props.seriesIndex ?? 0,
      ...(props.checkOngoingInterval !== undefined ? { check_ongoing_interval: props.checkOngoingInterval } : {}),
    };

    this.resource = new CfnAlert(this, 'Resource', {
      projectId: this.project.projectId,
      insightId: props.insight.insightId,
      name: props.name,
      subscribedUsers: uniqueOrUndefined(props.subscribedUsers),
      threshold: {
        configuration: {
          type: thresholdType as string as CfnAlertThresholdConfigurationType,
          bounds: { lower, upper },
        },
      },
      condition: { type: condition as string as CfnAlertConditionType },
      enabled: props.enabled,
      calculationInterval: props.calculationInterval as string as CfnAlertPropsCalculationInterval | undefined,
      config: jsonProp(this, config),
      skipWeekend: props.skipWeekend,
      scheduleRestriction: props.quietHours?.length ? { blockedWindows: props.quietHours } : undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.alertId = this.resource.attrId;
    this.alertInsightShortId = this.resource.attrInsightShortId;
    this.alertCreatedAt = this.resource.attrCreatedAt;
  }
}

/**
 * When the insight is a construct with a known query, checks that it is a
 * trends query (PostHog alerts only support trends) and that `seriesIndex`
 * points at one of its series. Imported insights are not checked.
 */
function validateTrendsInsight(insight: IInsight, seriesIndex: number | undefined): void {
  const query = (insight as { query?: InsightQuery }).query;
  if (!query || typeof query.toSourceJson !== 'function') return;
  const source = query.toSourceJson();
  if (source.kind !== 'TrendsQuery') {
    throw new Error(`Alert: alerts only work on trends insights, got a ${source.kind}`);
  }
  const series = source.series;
  if (Array.isArray(series) && isConcreteNumber(seriesIndex) && seriesIndex >= series.length) {
    throw new Error(`Alert seriesIndex: ${seriesIndex} is out of range; the query has ${series.length} series`);
  }
}
