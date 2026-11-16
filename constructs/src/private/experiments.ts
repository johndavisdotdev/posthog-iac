// Internal helpers for the experiments L2s: rendering metric sources,
// conversion windows and variant validation. Not exported from the package.
import { Duration, Token } from 'aws-cdk-lib';
import { renderPropertyFilters } from './filters';
import { exactlyOne, isConcrete, isConcreteNumber, validatePattern, validateRange } from './helpers';
import type { PropertyFilter } from '../core/filters';
import type { IAction } from '../product-analytics/action';

/** Letters, numbers, hyphens and underscores: PostHog's flag and variant key format. */
export const KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** The source fields shared by metric sources and funnel steps. */
export interface SourceLike {
  readonly event?: string;
  readonly action?: IAction;
  readonly properties?: PropertyFilter[];
  readonly math?: string;
  readonly mathProperty?: string;
  readonly mathHogql?: string;
  readonly mathGroupTypeIndex?: number;
}

/** Drops keys whose value is undefined, so rendered JSON is stable. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Renders a PostHog numeric ID (action, cohort, ...) as a JSON number.
 * Tokens become number tokens, which `Stack.toJsonString` renders unquoted.
 */
export function numericId(what: string, id: string): number {
  if (Token.isUnresolved(id)) return Token.asNumber(id);
  const n = Number(id);
  if (!Number.isInteger(n)) {
    throw new Error(`${what} '${id}' is not a numeric PostHog ID`);
  }
  return n;
}

const PROPERTY_MATH = new Set(['sum', 'avg', 'min', 'max']);

/** Renders an EventsNode / ActionsNode for a metric source or funnel step. */
export function renderSource(what: string, source: SourceLike): Record<string, unknown> {
  exactlyOne(what, { event: source.event, action: source.action });
  if (source.math !== undefined && PROPERTY_MATH.has(source.math) && source.mathProperty === undefined) {
    throw new Error(`${what}: mathProperty is required for math '${source.math}'`);
  }
  if (source.math === 'hogql' && source.mathHogql === undefined) {
    throw new Error(`${what}: mathHogql is required for math 'hogql'`);
  }
  if (source.math === 'unique_group' && source.mathGroupTypeIndex === undefined) {
    throw new Error(`${what}: mathGroupTypeIndex is required for math 'unique_group'`);
  }
  validateRange(`${what} mathGroupTypeIndex`, source.mathGroupTypeIndex, 0, 4);
  const node = source.action
    ? { kind: 'ActionsNode', id: numericId(`${what} action ID`, source.action.actionId) }
    : { kind: 'EventsNode', event: source.event };
  return compact({
    ...node,
    math: source.math,
    math_property: source.mathProperty,
    math_hogql: source.mathHogql,
    math_group_type_index: source.mathGroupTypeIndex,
    properties: renderPropertyFilters(source.properties),
  });
}

/**
 * Renders a Duration as PostHog's `conversion_window` + `conversion_window_unit`,
 * using the largest whole unit (day, hour, minute or second).
 */
export function renderWindow(what: string, window: Duration | undefined): Record<string, unknown> {
  if (window === undefined) return {};
  const seconds = window.toSeconds({ integral: false });
  if (!isConcreteNumber(seconds)) {
    return { conversion_window: seconds, conversion_window_unit: 'second' };
  }
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new Error(`${what} must be a whole number of seconds and at least 1 second, got ${seconds}s`);
  }
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (seconds % size === 0) return { conversion_window: seconds / size, conversion_window_unit: unit };
  }
  return { conversion_window: seconds, conversion_window_unit: 'second' };
}

/** A variant key and rollout share, for validation. */
export interface VariantLike {
  readonly key: string;
  readonly rolloutPercentage?: number;
}

/**
 * Validates experiment variants: at least two, unique keys in PostHog's key
 * format, exactly one `control`, rollouts in [0, 100] that sum to 100 when
 * every rollout is concrete. Tokens are skipped.
 */
export function validateVariants(what: string, variants: VariantLike[]): void {
  if (variants.length < 2) {
    throw new Error(`${what}: at least two variants are required (a 'control' and one or more test variants), got ${variants.length}`);
  }
  const keys = new Set<string>();
  let controls = 0;
  for (const v of variants) {
    validatePattern(`${what} variant key`, v.key, KEY_PATTERN, 'use letters, numbers, hyphens and underscores only');
    if (isConcrete(v.key)) {
      if (keys.has(v.key)) throw new Error(`${what}: duplicate variant key '${v.key}'`);
      keys.add(v.key);
      if (v.key === 'control') controls++;
    }
    validateRange(`${what} variant '${v.key}' rolloutPercentage`, v.rolloutPercentage, 0, 100);
  }
  const allKeysConcrete = variants.every(v => isConcrete(v.key));
  if (allKeysConcrete && controls !== 1) {
    throw new Error(`${what}: exactly one variant must have the key 'control', got ${controls}`);
  }
  const rollouts = variants.map(v => v.rolloutPercentage);
  if (rollouts.every(isConcreteNumber)) {
    const total = rollouts.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 1e-9) {
      throw new Error(`${what}: variant rollout percentages must add up to 100, got ${total}`);
    }
  }
}

/** Throws when a concrete string is not a parseable ISO 8601 timestamp. */
export function validateTimestamp(what: string, value: string | undefined): void {
  if (isConcrete(value) && Number.isNaN(Date.parse(value))) {
    throw new Error(`${what} '${value}' is not an ISO 8601 timestamp`);
  }
}
