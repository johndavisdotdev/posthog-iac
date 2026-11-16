// Internal helpers for the surveys and session-replay L2s: timestamps,
// targeting flag filters and HTML escaping. Not exported from the package.
import { Duration, Token } from 'aws-cdk-lib';
import { renderPropertyFilters } from './filters';
import { validateRange } from './helpers';
import { PropertyFilter } from '../core/filters';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** A release condition: property filters plus a rollout percentage. */
export interface TargetingGroupInput {
  readonly properties?: PropertyFilter[];
  readonly rolloutPercentage?: number;
}

/**
 * Renders a `Date` as an ISO 8601 string; validates a concrete string.
 * Tokens pass through unchanged.
 */
export function renderTimestamp(what: string, value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new Error(`${what} is an invalid Date`);
    return value.toISOString();
  }
  if (!Token.isUnresolved(value) && !ISO_8601.test(value)) {
    throw new Error(`${what} '${value}' is invalid: use an ISO 8601 timestamp such as 2026-12-01T00:00:00Z`);
  }
  return value;
}

/**
 * Renders release conditions as PostHog feature-flag filters:
 * `{groups: [{properties, rollout_percentage}]}`. Undefined or empty renders
 * as undefined.
 */
export function renderTargetingFlagFilters(what: string, groups: TargetingGroupInput[] | undefined): Record<string, unknown> | undefined {
  if (!groups || groups.length === 0) return undefined;
  return {
    groups: groups.map((group, i) => {
      validateRange(`${what} targeting[${i}].rolloutPercentage`, group.rolloutPercentage, 0, 100);
      return {
        properties: renderPropertyFilters(group.properties) ?? [],
        rollout_percentage: group.rolloutPercentage ?? 100,
      };
    }),
  };
}

/** Whole days of a Duration, validated against [min, max]. Undefined stays undefined. */
export function wholeDays(what: string, value: Duration | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const days = value.toDays();
  validateRange(what, days, min, max);
  return days;
}

/** Whole seconds of a Duration, validated against [min, max]. Undefined stays undefined. */
export function wholeSeconds(what: string, value: Duration | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const seconds = value.toSeconds();
  validateRange(what, seconds, min, max);
  return seconds;
}

/** Escapes text for embedding in HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Drops undefined values so rendered JSON objects stay minimal. Returns undefined for an empty result. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}
