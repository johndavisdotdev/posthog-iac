import { Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IProject } from '../organizations/project';
import {
  Alert,
  AlertCalculationInterval,
  AlertCondition,
  AlertThresholdType,
  Annotation,
  AnnotationCreationType,
  Dashboard,
  DashboardFilters,
  Insight,
  InsightQuery,
  Subscription,
  SubscriptionOptions,
} from '../product-analytics';

/** PostHog subscriptions deliver at most this many dashboard insights. */

/**
 * A threshold alert on a monitored insight. Alerts only work on trends
 * insights (`InsightQuery.trends()`).
 */
export interface MonitoredInsightAlert {
  /**
   * Name of the alert.
   * @default - `<insight name> alert`
   */
  readonly name?: string;

  /**
   * The alert fires when the value drops below this number. Set `lower`,
   * `upper` or both.
   * @default - no lower bound
   */
  readonly lower?: number;

  /**
   * The alert fires when the value exceeds this number. Set `lower`,
   * `upper` or both.
   * @default - no upper bound
   */
  readonly upper?: number;

  /**
   * What is compared with the bounds: the value itself, or its increase or
   * decrease from the previous interval.
   * @default AlertCondition.ABSOLUTE_VALUE
   */
  readonly condition?: AlertCondition;

  /**
   * Whether the bounds are absolute numbers or a percentage change. A
   * percentage requires a relative condition.
   * @default AlertThresholdType.ABSOLUTE
   */
  readonly thresholdType?: AlertThresholdType;

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
   * Whether the alert is evaluated.
   * @default true
   */
  readonly enabled?: boolean;
}

/**
 * An insight on a monitored dashboard.
 */
export interface MonitoredInsight {
  /**
   * Name of the insight. Must be unique within the dashboard; it also forms
   * the insight's construct ID, so renaming an insight replaces it.
   */
  readonly name: string;

  /** The insight's query. */
  readonly query: InsightQuery;

  /**
   * Description of the insight.
   * @default - none
   */
  readonly description?: string;

  /**
   * Alert on this insight. Only valid for trends insights.
   * @default - no alert
   */
  readonly alert?: MonitoredInsightAlert;
}

/**
 * Properties for a MonitoredDashboard.
 */
export interface MonitoredDashboardProps {
  /** The project to create the dashboard in. */
  readonly project: IProject;

  /** Name of the dashboard. */
  readonly name: string;

  /**
   * Description of the dashboard.
   * @default - none
   */
  readonly description?: string;

  /**
   * Pin the dashboard to the top of the dashboard list.
   * @default false
   */
  readonly pinned?: boolean;

  /**
   * Tags on the dashboard.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Filters applied to every tile.
   * @default - none
   */
  readonly filters?: DashboardFilters;

  /**
   * The insights, in the order they are added to the dashboard. At least one.
   */
  readonly insights: MonitoredInsight[];

  /**
   * Scheduled delivery of the whole dashboard (every insight, at most 20).
   * @default - no subscription
   */
  readonly subscription?: SubscriptionOptions;
}

/**
 * Options for `MonitoredDashboard.annotateRelease()`.
 */
export interface ReleaseAnnotationOptions {
  /**
   * Emoji shown in place of the default badge on charts.
   * @default - the default badge
   */
  readonly emoji?: string;

  /**
   * Who created the annotation.
   * @default AnnotationCreationType.USER
   */
  readonly creationType?: AnnotationCreationType;
}

/**
 * A KPI dashboard defined as code: a dashboard, its insights (added in
 * order), optional threshold alerts on trends insights, an optional
 * scheduled delivery of the whole dashboard, and release annotations scoped
 * to the dashboard.
 */
export class MonitoredDashboard extends Construct {
  /** The dashboard. */
  public readonly dashboard: Dashboard;

  /** The insights, in the order they were added. */
  public readonly insights: Insight[];

  /** The alerts, in insight order. */
  public readonly alerts: Alert[];

  /**
   * The scheduled delivery of the dashboard.
   * @default - none
   */
  public readonly subscription?: Subscription;

  private readonly project: IProject;
  private readonly insightsByName = new Map<string, Insight>();
  private readonly alertsByName = new Map<string, Alert>();

  constructor(scope: Construct, id: string, props: MonitoredDashboardProps) {
    super(scope, id);
    validateInsights(props.insights);

    this.project = props.project;
    this.dashboard = new Dashboard(this, 'Dashboard', {
      project: props.project,
      name: props.name,
      description: props.description,
      pinned: props.pinned,
      tags: props.tags,
      filters: props.filters,
    });

    this.insights = [];
    this.alerts = [];
    for (const spec of props.insights) {
      const insight = this.dashboard.addInsight(constructId(spec.name), {
        name: spec.name,
        description: spec.description,
        query: spec.query,
      });
      this.insights.push(insight);
      this.insightsByName.set(spec.name, insight);

      if (spec.alert) {
        const a = spec.alert;
        const alert = insight.addAlert('Alert', {
          name: a.name ?? `${spec.name} alert`,
          threshold: { lower: a.lower, upper: a.upper, type: a.thresholdType },
          condition: a.condition,
          calculationInterval: a.calculationInterval,
          subscribedUsers: a.subscribedUsers,
          seriesIndex: a.seriesIndex,
          checkOngoingInterval: a.checkOngoingInterval,
          skipWeekend: a.skipWeekend,
          enabled: a.enabled,
        });
        this.alerts.push(alert);
        this.alertsByName.set(spec.name, alert);
      }
    }

    if (props.subscription) {
      this.subscription = this.dashboard.addSubscription('Subscription', {
        ...props.subscription,
        dashboardInsights: this.insights,
      });
    }
  }

  /**
   * The insight with the given name.
   */
  public insight(name: string): Insight {
    const insight = this.insightsByName.get(name);
    if (!insight) throw new Error(`MonitoredDashboard ${this.node.path}: no insight named '${name}'`);
    return insight;
  }

  /**
   * The alert on the insight with the given name, if it has one.
   */
  public alertFor(name: string): Alert | undefined {
    this.insight(name);
    return this.alertsByName.get(name);
  }

  /**
   * Mark a release on this dashboard's charts with an annotation scoped to
   * the dashboard.
   * @param id construct ID of the annotation
   * @param date when the release happened, a `Date` or an ISO 8601 timestamp
   * @param content text shown on charts, e.g. `Released v2.3`
   * @param options emoji and creation type
   */
  public annotateRelease(id: string, date: Date | string, content: string, options: ReleaseAnnotationOptions = {}): Annotation {
    return new Annotation(this, id, {
      project: this.project,
      dashboard: this.dashboard,
      content,
      date,
      emoji: options.emoji,
      creationType: options.creationType,
    });
  }
}

function validateInsights(insights: MonitoredInsight[]): void {
  if (insights.length === 0) throw new Error('MonitoredDashboard: at least one insight is required');
  const names = new Set<string>();
  const ids = new Map<string, string>();
  for (const spec of insights) {
    if (Token.isUnresolved(spec.name)) {
      throw new Error('MonitoredDashboard: insight names must be concrete strings (they form construct IDs)');
    }
    if (spec.name.trim() === '') throw new Error('MonitoredDashboard: insight names must not be empty');
    if (names.has(spec.name)) throw new Error(`MonitoredDashboard: duplicate insight name '${spec.name}'`);
    names.add(spec.name);
    const id = constructId(spec.name);
    const clash = ids.get(id);
    if (clash !== undefined) {
      throw new Error(`MonitoredDashboard: insight names '${clash}' and '${spec.name}' map to the same construct ID '${id}'`);
    }
    ids.set(id, spec.name);
  }
}

/** A construct ID derived from an insight name: alphanumerics only, PascalCase. */
function constructId(name: string): string {
  const id = name
    .split(/[^A-Za-z0-9]+/)
    .filter(p => p !== '')
    .map(p => p[0].toUpperCase() + p.slice(1))
    .join('');
  return id === '' ? 'Insight' : `Insight${id}`;
}
