import { IResource, Lazy, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IDashboard } from './dashboard';
import type { IInsight } from './insight';
import {
  CfnSubscription,
  CfnSubscriptionPropsByweekday,
  CfnSubscriptionPropsFrequency,
  CfnSubscriptionPropsTargetType,
} from './subscription.generated';
import type { IProject } from '../organizations/project';
import { exactlyOne, isConcrete, validateLength, validateRange } from '../private/helpers';
import { dashboardInsights, renderDate } from '../private/insights';

/**
 * How often a subscription is delivered.
 */
export enum SubscriptionFrequency {
  /** Every day (or every `interval` days). */
  DAILY = 'daily',
  /** Every week. */
  WEEKLY = 'weekly',
  /** Every month. */
  MONTHLY = 'monthly',
  /** Every year. */
  YEARLY = 'yearly',
}

/**
 * Day of the week.
 */
export enum Weekday {
  /** Monday. */
  MONDAY = 'monday',
  /** Tuesday. */
  TUESDAY = 'tuesday',
  /** Wednesday. */
  WEDNESDAY = 'wednesday',
  /** Thursday. */
  THURSDAY = 'thursday',
  /** Friday. */
  FRIDAY = 'friday',
  /** Saturday. */
  SATURDAY = 'saturday',
  /** Sunday. */
  SUNDAY = 'sunday',
}

/**
 * Where a subscription is delivered.
 */
export class SubscriptionTarget {
  /**
   * Email to one or more addresses.
   */
  public static email(addresses: string[]): SubscriptionTarget {
    if (addresses.length === 0) throw new Error('SubscriptionTarget.email: at least one address is required');
    for (const a of addresses) {
      if (isConcrete(a) && !/^[^@\s,]+@[^@\s,]+$/.test(a)) {
        throw new Error(`SubscriptionTarget.email: '${a}' is not an email address`);
      }
    }
    return new SubscriptionTarget('email', [...new Set(addresses)].join(','));
  }

  /**
   * A Slack channel, through the project's Slack integration.
   * @param integrationId ID of the project's Slack integration
   * @param channel channel name (e.g. `#growth`) or ID
   */
  public static slack(integrationId: string, channel: string): SubscriptionTarget {
    if (channel === '') throw new Error('SubscriptionTarget.slack: channel must not be empty');
    return new SubscriptionTarget('slack', channel, integrationId);
  }

  /**
   * A Microsoft Teams incoming webhook.
   */
  public static teams(webhookUrl: string): SubscriptionTarget {
    if (webhookUrl === '') throw new Error('SubscriptionTarget.teams: webhookUrl must not be empty');
    return new SubscriptionTarget('teams', webhookUrl);
  }

  private constructor(
    /** Delivery channel: `email`, `slack` or `teams`. */
    public readonly targetType: string,
    /** Recipients: comma-separated addresses, a Slack channel or a Teams webhook URL. */
    public readonly targetValue: string,
    /** The Slack integration ID, for Slack targets. */
    public readonly integrationId?: string,
  ) {}
}

/**
 * A PostHog subscription.
 */
export interface ISubscription extends IResource {
  /**
   * The PostHog subscription ID.
   * @attribute
   */
  readonly subscriptionId: string;
}

/**
 * Options for a scheduled delivery (`insight.addSubscription()`).
 */
export interface SubscriptionOptions {
  /** Where to deliver. */
  readonly target: SubscriptionTarget;

  /** How often to deliver. */
  readonly frequency: SubscriptionFrequency;

  /**
   * When to start delivering. Anchors the recurrence (deliveries run at :00
   * and :30) and may be in the past. A `Date` or an ISO 8601 string.
   */
  readonly startDate: Date | string;

  /**
   * Name of the subscription.
   * @default - none
   */
  readonly title?: string;

  /**
   * Frequency multiplier, e.g. 2 with `WEEKLY` for every two weeks.
   * @default 1
   */
  readonly interval?: number;

  /**
   * Days of the week, for daily, weekly or monthly deliveries.
   * @default - any day
   */
  readonly byweekday?: Weekday[];

  /**
   * Position within `byweekday` for monthly deliveries, e.g. 1 for the first
   * or -1 for the last matching weekday of the month.
   * @default - none
   */
  readonly bysetpos?: number;

  /**
   * Total number of deliveries before the subscription stops.
   * @default - unlimited
   */
  readonly count?: number;

  /**
   * When to stop delivering. A `Date` or an ISO 8601 string.
   * @default - never
   */
  readonly untilDate?: Date | string;

  /**
   * Whether the subscription is active.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * What happens to the PostHog subscription when it is removed from the stack.
   * PostHog soft-deletes subscriptions.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Options for a scheduled delivery of a dashboard (`dashboard.addSubscription()`).
 */
export interface DashboardSubscriptionOptions extends SubscriptionOptions {
  /**
   * The dashboard's insights to include (at most 20).
   * @default - the insights placed on the dashboard in this app
   */
  readonly dashboardInsights?: IInsight[];
}

/**
 * Properties for a Subscription. Set exactly one of `insight` and `dashboard`.
 */
export interface SubscriptionProps extends DashboardSubscriptionOptions {
  /**
   * The insight to deliver.
   * @default - none; set `dashboard`
   */
  readonly insight?: IInsight;

  /**
   * The dashboard to deliver.
   * @default - none; set `insight`
   */
  readonly dashboard?: IDashboard;
}

/**
 * A PostHog subscription: a scheduled delivery of an insight or dashboard to
 * email, Slack or Microsoft Teams.
 *
 * @resource PostHog::ProductAnalytics::Subscription
 */
export class Subscription extends Resource implements ISubscription {
  /**
   * Import an existing subscription by its PostHog ID.
   */
  public static fromSubscriptionId(scope: Construct, id: string, subscriptionId: string): ISubscription {
    class Import extends Resource implements ISubscription {
      public readonly subscriptionId = subscriptionId;
    }
    return new Import(scope, id);
  }

  public readonly subscriptionId: string;

  /** The project the subscription belongs to. */
  public readonly project: IProject;

  /**
   * Human-readable schedule, e.g. `sent daily`.
   * @attribute
   */
  public readonly subscriptionSummary: string;

  /**
   * ISO 8601 timestamp of the next scheduled delivery.
   * @attribute
   */
  public readonly subscriptionNextDeliveryDate: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSubscription;

  constructor(scope: Construct, id: string, props: SubscriptionProps) {
    super(scope, id);
    exactlyOne('Subscription', { insight: props.insight, dashboard: props.dashboard });
    validateLength('Subscription title', props.title, 0, 100);
    validateRange('Subscription interval', props.interval, 1, 2147483647);
    if (props.insight && props.dashboardInsights) {
      throw new Error('Subscription: dashboardInsights is only valid for dashboard subscriptions');
    }
    if (props.dashboardInsights && props.dashboardInsights.length > 20) {
      throw new Error(`Subscription: at most 20 dashboardInsights, got ${props.dashboardInsights.length}`);
    }

    this.project = (props.insight ?? props.dashboard)!.project;

    let exportInsights: string[] | undefined;
    if (props.dashboard) {
      const dashboard = props.dashboard;
      const insights = () => props.dashboardInsights ?? dashboardInsights(dashboard);
      exportInsights = Lazy.list({ produce: () => insights().map(i => i.insightId) });
      this.node.addValidation({
        validate: () => {
          const n = insights().length;
          if (n === 0) return ['Subscription: a dashboard subscription needs at least one insight; set dashboardInsights or add insights to the dashboard'];
          if (n > 20) return [`Subscription: a dashboard subscription can include at most 20 insights, got ${n}; set dashboardInsights`];
          return [];
        },
      });
    }

    this.resource = new CfnSubscription(this, 'Resource', {
      projectId: this.project.projectId,
      title: props.title,
      insight: props.insight?.insightId,
      dashboard: props.dashboard?.dashboardId,
      dashboardExportInsights: exportInsights,
      targetType: props.target.targetType as CfnSubscriptionPropsTargetType,
      targetValue: props.target.targetValue,
      integrationId: props.target.integrationId,
      frequency: props.frequency as string as CfnSubscriptionPropsFrequency,
      interval: props.interval,
      byweekday: props.byweekday?.length
        ? [...new Set(props.byweekday)].map(d => d as string as CfnSubscriptionPropsByweekday)
        : undefined,
      bysetpos: props.bysetpos,
      count: props.count,
      startDate: renderDate(props.startDate)!,
      untilDate: renderDate(props.untilDate),
      enabled: props.enabled,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.subscriptionId = this.resource.attrId;
    this.subscriptionSummary = this.resource.attrSummary;
    this.subscriptionNextDeliveryDate = this.resource.attrNextDeliveryDate;
  }
}
