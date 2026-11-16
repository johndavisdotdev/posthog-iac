// Internal rendering helpers shared by the CDP (hog function) and workflows
// (hog flow) L2s. Not exported from the package.
import { Duration, Token } from 'aws-cdk-lib';
import { renderPropertyFilters } from './filters';
import { PropertyFilter } from '../core/filters';
import type { IAction } from '../product-analytics/action';

/** PostHog's template ID for the generic HTTP webhook destination. */
export const WEBHOOK_TEMPLATE_ID = 'template-webhook';

/** The event filter fields shared by hog functions, mappings and workflow triggers. */
export interface EventFilterInput {
  readonly events?: string[];
  readonly actions?: IAction[];
  readonly properties?: PropertyFilter[];
  readonly filterTestAccounts?: boolean;
  readonly rawFilters?: { [key: string]: any };
}

/**
 * Renders event filters to PostHog's shape:
 * `{events: [{id, name, type: 'events'}], actions: [{id, type: 'actions'}], properties: [...], filter_test_accounts}`.
 * Keys from `rawFilters` are kept unless a typed field sets the same key.
 * Returns undefined when nothing is set.
 */
export function renderEventFilters(input: EventFilterInput): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = { ...(input.rawFilters ?? {}) };
  if (input.events && input.events.length > 0) {
    out.events = input.events.map(name => ({ id: name, name, type: 'events' }));
  }
  if (input.actions && input.actions.length > 0) {
    out.actions = input.actions.map(action => ({ id: action.actionId, type: 'actions' }));
  }
  const properties = renderPropertyFilters(input.properties);
  if (properties) out.properties = properties;
  if (input.filterTestAccounts !== undefined) out.filter_test_accounts = input.filterTestAccounts;
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Wraps each input value in `{value: ...}`, the shape PostHog stores hog
 * function inputs in. Undefined values are dropped; an empty result renders as
 * undefined.
 */
export function wrapInputs(inputs: { [key: string]: unknown } | undefined): Record<string, { value: unknown }> | undefined {
  if (!inputs) return undefined;
  const out: Record<string, { value: unknown }> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (value !== undefined) out[key] = { value };
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Formats a duration as PostHog's workflow duration string (`1d`, `6h`,
 * `30m`), using the largest unit that divides it exactly.
 */
export function formatWorkflowDuration(what: string, duration: Duration): string {
  const seconds = duration.toSeconds();
  if (Token.isUnresolved(seconds)) {
    throw new Error(`${what}: the duration must be a concrete value`);
  }
  if (seconds <= 0 || seconds % 60 !== 0) {
    throw new Error(`${what} must be a positive whole number of minutes, got ${seconds} seconds`);
  }
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${seconds / 60}m`;
}
