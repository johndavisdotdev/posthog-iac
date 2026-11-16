// Internal helpers for the dashboard/insight L2s (Insight, Dashboard,
// DashboardTemplate, Alert, Subscription, InsightVariable).
import { Duration, Token } from 'aws-cdk-lib';
import { renderPropertyFilters } from './filters';
import type { IDashboard, DashboardFilters } from '../product-analytics/dashboard';
import type { IInsight } from '../product-analytics/insight';
import type { InsightBreakdown } from '../product-analytics/insight-query';

/** Renders a timestamp as ISO 8601. Strings (and tokens) are passed through. */
export function renderDate(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new Error('Invalid Date');
    return value.toISOString();
  }
  return value;
}

/**
 * PostHog stores action IDs as integers in queries. Concrete numeric strings
 * become numbers; tokens become number tokens, which `Stack.toJsonString`
 * renders unquoted.
 */
export function numericId(what: string, id: string): number {
  if (Token.isUnresolved(id)) return Token.asNumber(id);
  if (!/^\d+$/.test(id)) throw new Error(`${what} '${id}' must be a numeric PostHog ID`);
  return Number(id);
}

/**
 * Converts a Duration to the largest whole PostHog funnel window unit
 * (`week`, `day`, `hour`, `minute` or `second`).
 */
export function funnelWindow(duration: Duration): { interval: number; unit: string } {
  const seconds = duration.toSeconds();
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(`Funnel conversion window must be a positive whole number of seconds, got ${duration.toHumanString()}`);
  }
  const units: Array<[string, number]> = [['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  for (const [unit, size] of units) {
    if (seconds % size === 0) return { interval: seconds / size, unit };
  }
  /* istanbul ignore next */
  return { interval: seconds, unit: 'second' };
}

// Insights placed on each dashboard in this app, so dashboard subscriptions
// can default to delivering them.
const DASHBOARD_INSIGHTS = new WeakMap<IDashboard, IInsight[]>();

/** Records that an insight is shown on a dashboard. */
export function registerDashboardInsight(dashboard: IDashboard, insight: IInsight): void {
  const list = DASHBOARD_INSIGHTS.get(dashboard) ?? [];
  if (!list.includes(insight)) list.push(insight);
  DASHBOARD_INSIGHTS.set(dashboard, list);
}

/** Insights placed on a dashboard in this app (via `dashboards` or `addInsight`). */
export function dashboardInsights(dashboard: IDashboard): IInsight[] {
  return DASHBOARD_INSIGHTS.get(dashboard) ?? [];
}

/** A breakdown as PostHog's `breakdownFilter` / dashboard `breakdown_filter`. */
export function renderBreakdown(breakdown: InsightBreakdown | undefined): Record<string, unknown> | undefined {
  if (!breakdown) return undefined;
  const type: string = breakdown.type ?? 'event';
  if (type === 'group' && breakdown.groupTypeIndex === undefined) {
    throw new Error(`Breakdown '${breakdown.property}': groupTypeIndex is required for group breakdowns`);
  }
  const out: Record<string, unknown> = { breakdown: breakdown.property, breakdown_type: type };
  if (breakdown.limit !== undefined) out.breakdown_limit = breakdown.limit;
  if (breakdown.groupTypeIndex !== undefined) out.breakdown_group_type_index = breakdown.groupTypeIndex;
  return out;
}

/**
 * Dashboard-level filters as PostHog stores them, with the raw escape hatch
 * merged on top. Returns undefined when nothing is set.
 */
export function renderDashboardFilters(
  filters: DashboardFilters | undefined,
  raw: { [key: string]: any } | undefined,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  if (filters) {
    if (filters.dateFrom !== undefined) out.date_from = filters.dateFrom;
    if (filters.dateTo !== undefined) out.date_to = filters.dateTo;
    if (filters.interval !== undefined) out.interval = filters.interval;
    const properties = renderPropertyFilters(filters.properties);
    if (properties) out.properties = properties;
    const breakdown = renderBreakdown(filters.breakdown);
    if (breakdown) out.breakdown_filter = breakdown;
    if (filters.filterTestAccounts !== undefined) out.filterTestAccounts = filters.filterTestAccounts;
    if (filters.compareTo !== undefined) out.compareFilter = { compare: true, compare_to: filters.compareTo };
  }
  Object.assign(out, raw ?? {});
  return Object.keys(out).length ? out : undefined;
}
