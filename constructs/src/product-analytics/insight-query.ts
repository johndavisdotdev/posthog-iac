import { Duration } from 'aws-cdk-lib';
import type { IAction } from './action';
import type { IInsightVariable } from './insight-variable';
import { PropertyFilter } from '../core/filters';
import { renderPropertyFilters } from '../private/filters';
import { funnelWindow, numericId, renderBreakdown } from '../private/insights';

/**
 * How a series aggregates its events.
 */
export enum SeriesMath {
  /** Total number of events. */
  TOTAL = 'total',
  /** Unique users (daily active users per interval). */
  DAU = 'dau',
  /** Users active in the trailing 7 days. */
  WEEKLY_ACTIVE = 'weekly_active',
  /** Users active in the trailing 30 days. */
  MONTHLY_ACTIVE = 'monthly_active',
  /** Unique sessions. */
  UNIQUE_SESSION = 'unique_session',
  /** Only the first time each user performed the event. */
  FIRST_TIME_FOR_USER = 'first_time_for_user',
  /** Average of `mathProperty`. */
  AVG = 'avg',
  /** Sum of `mathProperty`. */
  SUM = 'sum',
  /** Minimum of `mathProperty`. */
  MIN = 'min',
  /** Maximum of `mathProperty`. */
  MAX = 'max',
  /** Median of `mathProperty`. */
  MEDIAN = 'median',
  /** 75th percentile of `mathProperty`. */
  P75 = 'p75',
  /** 90th percentile of `mathProperty`. */
  P90 = 'p90',
  /** 95th percentile of `mathProperty`. */
  P95 = 'p95',
  /** 99th percentile of `mathProperty`. */
  P99 = 'p99',
  /** Average number of events per user. */
  AVG_COUNT_PER_ACTOR = 'avg_count_per_actor',
  /** Minimum number of events per user. */
  MIN_COUNT_PER_ACTOR = 'min_count_per_actor',
  /** Maximum number of events per user. */
  MAX_COUNT_PER_ACTOR = 'max_count_per_actor',
  /** Median number of events per user. */
  MEDIAN_COUNT_PER_ACTOR = 'median_count_per_actor',
}

const PROPERTY_MATH = new Set<string>([
  SeriesMath.AVG, SeriesMath.SUM, SeriesMath.MIN, SeriesMath.MAX, SeriesMath.MEDIAN,
  SeriesMath.P75, SeriesMath.P90, SeriesMath.P95, SeriesMath.P99,
]);

/**
 * Time bucket of a trends insight.
 */
export enum InsightInterval {
  /** Per minute. */
  MINUTE = 'minute',
  /** Per hour. */
  HOUR = 'hour',
  /** Per day. */
  DAY = 'day',
  /** Per week. */
  WEEK = 'week',
  /** Per month. */
  MONTH = 'month',
}

/**
 * How an insight is drawn.
 */
export enum ChartDisplay {
  /** Line chart over time. */
  LINE = 'ActionsLineGraph',
  /** Cumulative line chart over time. */
  LINE_CUMULATIVE = 'ActionsLineGraphCumulative',
  /** Area chart over time. */
  AREA = 'ActionsAreaGraph',
  /** Bar chart over time. */
  BAR = 'ActionsBar',
  /** Stacked bar chart over time. */
  STACKED_BAR = 'ActionsStackedBar',
  /** Unstacked bar chart over time. */
  UNSTACKED_BAR = 'ActionsUnstackedBar',
  /** One bar per series (total value). */
  BAR_VALUE = 'ActionsBarValue',
  /** A single big number. */
  NUMBER = 'BoldNumber',
  /** Pie chart. */
  PIE = 'ActionsPie',
  /** Table. */
  TABLE = 'ActionsTable',
  /** World map (breakdown by country). */
  WORLD_MAP = 'WorldMap',
}

/**
 * What a breakdown property belongs to.
 */
export enum BreakdownType {
  /** An event property. */
  EVENT = 'event',
  /** A person property. */
  PERSON = 'person',
  /** A session property. */
  SESSION = 'session',
  /** A group property (set `groupTypeIndex`). */
  GROUP = 'group',
  /** A HogQL expression. */
  HOGQL = 'hogql',
}

/**
 * Step order of a funnel.
 */
export enum FunnelOrder {
  /** Steps in order, other events allowed in between. */
  ORDERED = 'ordered',
  /** Steps in order, with no other events in between. */
  STRICT = 'strict',
  /** Steps in any order. */
  UNORDERED = 'unordered',
}

/**
 * Cohort period of a retention insight.
 */
export enum RetentionPeriod {
  /** Hourly cohorts. */
  HOUR = 'Hour',
  /** Daily cohorts. */
  DAY = 'Day',
  /** Weekly cohorts. */
  WEEK = 'Week',
  /** Monthly cohorts. */
  MONTH = 'Month',
}

/**
 * Which occurrences of the target event start a retention cohort.
 */
export enum RetentionType {
  /** Every occurrence (recurring retention). */
  RECURRING = 'retention_recurring',
  /** Only the first time each user performed the event. */
  FIRST_TIME = 'retention_first_time',
}

/**
 * Date range of an insight. Dates are relative (`-7d`, `-1m`, `-1y`, `mStart`)
 * or absolute (`2026-01-01`).
 */
export interface InsightDateRange {
  /**
   * Start of the range.
   * @default - PostHog default (last 7 days)
   */
  readonly from?: string;

  /**
   * End of the range.
   * @default - now
   */
  readonly to?: string;
}

/**
 * Breaks an insight down by a property.
 */
export interface InsightBreakdown {
  /** The property (or HogQL expression) to break down by. */
  readonly property: string;

  /**
   * What the property belongs to.
   * @default BreakdownType.EVENT
   */
  readonly type?: BreakdownType;

  /**
   * Maximum number of breakdown values shown.
   * @default - PostHog default (25)
   */
  readonly limit?: number;

  /**
   * Group type index, for `BreakdownType.GROUP`.
   * @default - none
   */
  readonly groupTypeIndex?: number;
}

/**
 * Options shared by the insight query kinds.
 */
export interface InsightQueryCommonOptions {
  /**
   * Date range.
   * @default - PostHog default (last 7 days)
   */
  readonly dateRange?: InsightDateRange;

  /**
   * Break the results down by a property.
   * @default - no breakdown
   */
  readonly breakdown?: InsightBreakdown;

  /**
   * Property filters applied to every series.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * Exclude internal and test users (per the project's test account filters).
   * @default false
   */
  readonly filterTestAccounts?: boolean;
}

/**
 * Options for a trends insight.
 */
export interface TrendsQueryOptions extends InsightQueryCommonOptions {
  /** The series to plot (at least one). */
  readonly series: InsightSeries[];

  /**
   * Time bucket.
   * @default InsightInterval.DAY
   */
  readonly interval?: InsightInterval;

  /**
   * How the chart is drawn.
   * @default ChartDisplay.LINE
   */
  readonly display?: ChartDisplay;

  /**
   * Formula combining the series, which are named A, B, C, ... in order, e.g. `A / B`.
   * @default - no formula
   */
  readonly formula?: string;

  /**
   * Compare with the previous period.
   * @default false
   */
  readonly compare?: boolean;
}

/**
 * Options for a funnel insight.
 */
export interface FunnelQueryOptions extends InsightQueryCommonOptions {
  /** The funnel steps, in order (at least two). */
  readonly steps: InsightSeries[];

  /**
   * Time a user has to complete the funnel, in whole weeks, days, hours, minutes or seconds.
   * @default - PostHog default (14 days)
   */
  readonly conversionWindow?: Duration;

  /**
   * Step order.
   * @default FunnelOrder.ORDERED
   */
  readonly order?: FunnelOrder;
}

/**
 * Options for a retention insight.
 */
export interface RetentionQueryOptions extends InsightQueryCommonOptions {
  /** The event or action that puts a user into a cohort. */
  readonly targetEntity: InsightSeries;

  /**
   * The event or action that counts as the user coming back.
   * @default - the target entity
   */
  readonly returningEntity?: InsightSeries;

  /**
   * Cohort period.
   * @default RetentionPeriod.DAY
   */
  readonly period?: RetentionPeriod;

  /**
   * Number of periods shown.
   * @default - PostHog default (8)
   */
  readonly totalIntervals?: number;

  /**
   * Which occurrences of the target entity start a cohort.
   * @default RetentionType.FIRST_TIME
   */
  readonly retentionType?: RetentionType;
}

/**
 * Options for a HogQL (SQL) insight.
 */
export interface HogQLQueryOptions {
  /**
   * How the results are drawn.
   * @default ChartDisplay.TABLE
   */
  readonly display?: ChartDisplay;

  /**
   * Render a `DataTableNode` (plain results table) instead of a
   * `DataVisualizationNode` (the SQL editor's chart/table view).
   * @default false
   */
  readonly dataTable?: boolean;

  /**
   * SQL variables the query uses as `{variables.<codeName>}`.
   * @default - none
   */
  readonly variables?: IInsightVariable[];
}

/**
 * Options for an insight series or funnel step.
 */
export interface InsightSeriesOptions {
  /**
   * How events are aggregated. Ignored in funnels and retention.
   * @default SeriesMath.TOTAL
   */
  readonly math?: SeriesMath;

  /**
   * The property aggregated by the property math types (`AVG`, `SUM`, `P90`, ...).
   * @default - none
   */
  readonly mathProperty?: string;

  /**
   * Property filters on this series only.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * Display name of the series.
   * @default - the event or action name
   */
  readonly customName?: string;
}

/**
 * An insight series, funnel step or retention entity: an event or an action.
 */
export class InsightSeries {
  /**
   * An event, e.g. `$pageview` or `signed_up`.
   */
  public static event(event: string, options: InsightSeriesOptions = {}): InsightSeries {
    if (event === '') throw new Error('InsightSeries.event: event name must not be empty');
    return new InsightSeries('EventsNode', event, undefined, options);
  }

  /**
   * Every event.
   */
  public static allEvents(options: InsightSeriesOptions = {}): InsightSeries {
    return new InsightSeries('EventsNode', undefined, undefined, options);
  }

  /**
   * An action.
   */
  public static action(action: IAction, options: InsightSeriesOptions = {}): InsightSeries {
    return new InsightSeries('ActionsNode', undefined, action, options);
  }

  private constructor(
    private readonly kind: 'EventsNode' | 'ActionsNode',
    private readonly event: string | undefined,
    private readonly action: IAction | undefined,
    private readonly options: InsightSeriesOptions,
  ) {
    if (options.math && PROPERTY_MATH.has(options.math) && !options.mathProperty) {
      throw new Error(`InsightSeries: math '${options.math}' requires mathProperty`);
    }
  }

  /**
   * The series as an `EventsNode` / `ActionsNode`.
   * @internal
   */
  public _renderNode(withMath: boolean): Record<string, unknown> {
    const node: Record<string, unknown> = { kind: this.kind };
    if (this.kind === 'EventsNode') {
      node.event = this.event ?? null;
      node.name = this.event ?? 'All events';
    } else {
      node.id = numericId('Action ID', this.action!.actionId);
    }
    if (withMath) {
      node.math = this.options.math ?? SeriesMath.TOTAL;
      if (this.options.mathProperty) node.math_property = this.options.mathProperty;
    }
    if (this.options.customName) node.custom_name = this.options.customName;
    const properties = renderPropertyFilters(this.options.properties);
    if (properties) node.properties = properties;
    return node;
  }

  /**
   * The series as a retention entity.
   * @internal
   */
  public _renderRetentionEntity(): Record<string, unknown> {
    const entity: Record<string, unknown> = this.kind === 'EventsNode'
      ? { kind: 'EventsNode', type: 'events', id: this.event ?? null, name: this.event ?? 'All events' }
      : { kind: 'ActionsNode', type: 'actions', id: numericId('Action ID', this.action!.actionId) };
    if (this.options.customName) entity.custom_name = this.options.customName;
    const properties = renderPropertyFilters(this.options.properties);
    if (properties) entity.properties = properties;
    return entity;
  }
}

/**
 * The query of an insight, rendered as PostHog's query JSON: an
 * `InsightVizNode` wrapping a `TrendsQuery`, `FunnelsQuery` or
 * `RetentionQuery`, or a `DataVisualizationNode` / `DataTableNode` wrapping a
 * `HogQLQuery`.
 */
export class InsightQuery {
  /**
   * A trends insight: one or more series over time.
   */
  public static trends(options: TrendsQueryOptions): InsightQuery {
    if (options.series.length === 0) throw new Error('InsightQuery.trends: at least one series is required');
    const trendsFilter: Record<string, unknown> = {};
    if (options.display) trendsFilter.display = options.display;
    if (options.formula) trendsFilter.formula = options.formula;
    const source: Record<string, unknown> = {
      kind: 'TrendsQuery',
      series: options.series.map(s => s._renderNode(true)),
      interval: options.interval ?? InsightInterval.DAY,
      ...renderCommon(options),
    };
    if (Object.keys(trendsFilter).length) source.trendsFilter = trendsFilter;
    if (options.compare) source.compareFilter = { compare: true };
    return new InsightQuery(vizNode(source));
  }

  /**
   * A funnel insight: conversion through two or more steps.
   */
  public static funnel(options: FunnelQueryOptions): InsightQuery {
    if (options.steps.length < 2) throw new Error('InsightQuery.funnel: at least two steps are required');
    const funnelsFilter: Record<string, unknown> = {};
    if (options.order) funnelsFilter.funnelOrderType = options.order;
    if (options.conversionWindow) {
      const window = funnelWindow(options.conversionWindow);
      funnelsFilter.funnelWindowInterval = window.interval;
      funnelsFilter.funnelWindowIntervalUnit = window.unit;
    }
    const source: Record<string, unknown> = {
      kind: 'FunnelsQuery',
      series: options.steps.map(s => s._renderNode(false)),
      ...renderCommon(options),
    };
    if (Object.keys(funnelsFilter).length) source.funnelsFilter = funnelsFilter;
    return new InsightQuery(vizNode(source));
  }

  /**
   * A retention insight: how many users come back after a target event.
   */
  public static retention(options: RetentionQueryOptions): InsightQuery {
    if (options.totalIntervals !== undefined && (!Number.isInteger(options.totalIntervals) || options.totalIntervals < 1)) {
      throw new Error(`InsightQuery.retention: totalIntervals must be a positive integer, got ${options.totalIntervals}`);
    }
    const target = options.targetEntity._renderRetentionEntity();
    const retentionFilter: Record<string, unknown> = {
      targetEntity: target,
      returningEntity: options.returningEntity?._renderRetentionEntity() ?? target,
      period: options.period ?? RetentionPeriod.DAY,
      retentionType: options.retentionType ?? RetentionType.FIRST_TIME,
    };
    if (options.totalIntervals !== undefined) retentionFilter.totalIntervals = options.totalIntervals;
    return new InsightQuery(vizNode({ kind: 'RetentionQuery', retentionFilter, ...renderCommon(options) }));
  }

  /**
   * A SQL insight. Rendered as a `DataVisualizationNode` (or a
   * `DataTableNode` with `dataTable: true`) wrapping a `HogQLQuery`.
   */
  public static hogql(sql: string, options: HogQLQueryOptions = {}): InsightQuery {
    if (sql.trim() === '') throw new Error('InsightQuery.hogql: the query must not be empty');
    const source: Record<string, unknown> = { kind: 'HogQLQuery', query: sql };
    if (options.variables?.length) {
      const variables: Record<string, unknown> = {};
      for (const v of options.variables) {
        variables[v.variableId] = { variableId: v.variableId, code_name: v.codeName };
      }
      source.variables = variables;
    }
    if (options.dataTable) {
      if (options.display) throw new Error('InsightQuery.hogql: display is not supported with dataTable');
      return new InsightQuery({ kind: 'DataTableNode', source });
    }
    const node: Record<string, unknown> = { kind: 'DataVisualizationNode', source };
    if (options.display) node.display = options.display;
    return new InsightQuery(node);
  }

  /**
   * Escape hatch: any PostHog query JSON, e.g.
   * `{ kind: 'InsightVizNode', source: { kind: 'LifecycleQuery', ... } }`.
   * It is used as is.
   */
  public static fromJson(raw: { [key: string]: any }): InsightQuery {
    if (typeof raw?.kind !== 'string') {
      throw new Error('InsightQuery.fromJson: the query must have a string "kind", e.g. "InsightVizNode"');
    }
    return new InsightQuery(raw);
  }

  private constructor(private readonly node: { [key: string]: any }) {}

  /**
   * The `kind` of the inner query (`TrendsQuery`, `FunnelsQuery`,
   * `RetentionQuery`, `HogQLQuery`, ...), or of the node itself when it has
   * no `source`.
   */
  public get kind(): string {
    return this.toSourceJson().kind;
  }

  /**
   * The full query node, as stored on the insight.
   */
  public toJson(): { [key: string]: any } {
    return this.node;
  }

  /**
   * The inner query (the node's `source`), e.g. the `TrendsQuery` of an
   * `InsightVizNode`, as used by experiment metrics.
   */
  public toSourceJson(): { [key: string]: any } {
    const source = this.node.source;
    return source && typeof source === 'object' ? source : this.node;
  }
}

function vizNode(source: Record<string, unknown>): Record<string, unknown> {
  return { kind: 'InsightVizNode', source };
}

function renderCommon(options: InsightQueryCommonOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (options.dateRange) {
    const dateRange: Record<string, unknown> = {};
    if (options.dateRange.from) dateRange.date_from = options.dateRange.from;
    if (options.dateRange.to) dateRange.date_to = options.dateRange.to;
    out.dateRange = dateRange;
  }
  const breakdown = renderBreakdown(options.breakdown);
  if (breakdown) out.breakdownFilter = breakdown;
  const properties = renderPropertyFilters(options.properties);
  if (properties) out.properties = properties;
  if (options.filterTestAccounts !== undefined) out.filterTestAccounts = options.filterTestAccounts;
  return out;
}
