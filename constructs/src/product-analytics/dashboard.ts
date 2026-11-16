import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CfnDashboard,
  CfnDashboardPropsGridSpacing,
  CfnDashboardPropsGroupDisplay,
  CfnDashboardPropsLayoutCompaction,
} from './dashboard.generated';
import { Insight, InsightOptions } from './insight';
import { InsightBreakdown, InsightInterval } from './insight-query';
import { DashboardSubscriptionOptions, Subscription } from './subscription';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { jsonProp, uniqueOrUndefined, validateLength } from '../private/helpers';
import { renderDashboardFilters } from '../private/insights';

/**
 * Named tile density preset of a dashboard.
 */
export enum TileSpacing {
  /** Tightest spacing. */
  TIGHT = 'tight',
  /** Condensed spacing. */
  CONDENSED = 'condensed',
  /** Standard spacing. */
  STANDARD = 'standard',
  /** Relaxed spacing. */
  RELAXED = 'relaxed',
  /** Widest spacing. */
  WIDE = 'wide',
}

/**
 * How dashboard tiles rearrange after a move or resize.
 */
export enum LayoutCompaction {
  /** Tiles stack upward. */
  VERTICAL = 'vertical',
  /** Tiles stack to the left. */
  HORIZONTAL = 'horizontal',
  /** Tiles keep their positions. */
  STABLE = 'stable',
}

/**
 * How dashboard tile groups show.
 */
export enum GroupDisplay {
  /** Each group is a collapsible band. */
  SECTIONS = 'sections',
  /** One group at a time, as tabs. */
  TABS = 'tabs',
}

/**
 * Dashboard-level filters, applied to every tile.
 */
export interface DashboardFilters {
  /**
   * Start of the date range, relative (`-30d`, `mStart`) or absolute (`2026-01-01`).
   * @default - each insight's own range
   */
  readonly dateFrom?: string;

  /**
   * End of the date range.
   * @default - each insight's own range
   */
  readonly dateTo?: string;

  /**
   * Time bucket forced onto every insight that supports one.
   * @default - each insight's own interval
   */
  readonly interval?: InsightInterval;

  /**
   * Property filters added to every insight.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * Breakdown forced onto every insight that supports one.
   * @default - each insight's own breakdown
   */
  readonly breakdown?: InsightBreakdown;

  /**
   * Force test-account filtering on (true) or off (false).
   * @default - each insight's own setting
   */
  readonly filterTestAccounts?: boolean;

  /**
   * Compare every insight with a previous period, given as a relative date
   * such as `-1w` or `-1y`.
   * @default - no comparison
   */
  readonly compareTo?: string;
}

/**
 * A PostHog dashboard.
 */
export interface IDashboard extends IResource {
  /**
   * The PostHog dashboard ID.
   * @attribute
   */
  readonly dashboardId: string;

  /** The project the dashboard belongs to. */
  readonly project: IProject;

  /**
   * Create an insight shown on this dashboard.
   */
  addInsight(id: string, options: InsightOptions): Insight;

  /**
   * Add a scheduled delivery of this dashboard.
   */
  addSubscription(id: string, options: DashboardSubscriptionOptions): Subscription;
}

/**
 * Behaviour shared by created and imported dashboards.
 */
export abstract class DashboardBase extends Resource implements IDashboard {
  public abstract readonly dashboardId: string;
  public abstract readonly project: IProject;

  public addInsight(id: string, options: InsightOptions): Insight {
    return new Insight(this, id, {
      ...options,
      project: this.project,
      dashboards: [this, ...(options.dashboards ?? [])],
    });
  }

  public addSubscription(id: string, options: DashboardSubscriptionOptions): Subscription {
    return new Subscription(this, id, { ...options, dashboard: this });
  }
}

/**
 * Options for creating a dashboard in a project.
 */
export interface DashboardOptions {
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
   * Escape hatch: raw PostHog dashboard filter JSON, merged over `filters`.
   * @default - none
   */
  readonly rawFilters?: { [key: string]: any };

  /**
   * Tile density.
   * @default - PostHog default
   */
  readonly tileSpacing?: TileSpacing;

  /**
   * How tiles rearrange after a move or resize.
   * @default - PostHog default
   */
  readonly layoutCompaction?: LayoutCompaction;

  /**
   * How tile groups show.
   * @default - PostHog default
   */
  readonly groupDisplay?: GroupDisplay;

  /**
   * What happens to the PostHog dashboard when it is removed from the stack.
   * PostHog soft-deletes dashboards; the insights on it are kept.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Dashboard.
 */
export interface DashboardProps extends DashboardOptions {
  /** The project to create the dashboard in. */
  readonly project: IProject;
}

/**
 * A PostHog dashboard: a collection of insight tiles with shared filters.
 *
 * @resource PostHog::ProductAnalytics::Dashboard
 */
export class Dashboard extends DashboardBase {
  /**
   * Import an existing dashboard by its PostHog ID.
   */
  public static fromDashboardId(scope: Construct, id: string, project: IProject, dashboardId: string): IDashboard {
    class Import extends DashboardBase {
      public readonly dashboardId = dashboardId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly dashboardId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly dashboardCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnDashboard;

  constructor(scope: Construct, id: string, props: DashboardProps) {
    super(scope, id);
    validateLength('Dashboard name', props.name, 1, 400);

    this.project = props.project;
    this.resource = new CfnDashboard(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      pinned: props.pinned,
      tags: uniqueOrUndefined(props.tags),
      filters: jsonProp(this, renderDashboardFilters(props.filters, props.rawFilters)),
      gridSpacing: props.tileSpacing as string as CfnDashboardPropsGridSpacing | undefined,
      layoutCompaction: props.layoutCompaction as string as CfnDashboardPropsLayoutCompaction | undefined,
      groupDisplay: props.groupDisplay as string as CfnDashboardPropsGroupDisplay | undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.dashboardId = this.resource.attrId;
    this.dashboardCreatedAt = this.resource.attrCreatedAt;
  }
}
