// Serialization and validation of the feature flag models in
// src/feature-flags (release conditions, variants, payloads) to PostHog's
// `filters` JSON shape. Internal: used by FeatureFlag and ScheduledOperation.
import { Stack, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { renderPropertyFilter } from './filters';
import { isConcrete, isConcreteNumber, validateRange } from './helpers';
import type { FlagVariant, ReleaseCondition } from '../feature-flags/feature-flag';

/**
 * One release condition group as PostHog stores it:
 * `{properties, rollout_percentage, variant?}`. A cohort becomes a
 * `{key: 'id', type: 'cohort', value: <cohort id>}` property.
 */
export function renderReleaseCondition(what: string, condition: ReleaseCondition): Record<string, unknown> {
  validateRange(`${what} rolloutPercentage`, condition.rolloutPercentage, 0, 100);
  const properties = (condition.properties ?? []).map(renderPropertyFilter);
  if (condition.cohort) {
    properties.push({ key: 'id', type: 'cohort', operator: 'in', value: cohortValue(condition.cohort.cohortId) });
  }
  const out: Record<string, unknown> = {
    properties,
    rollout_percentage: condition.rolloutPercentage ?? 100,
  };
  if (condition.variant !== undefined) out.variant = condition.variant;
  return out;
}

/** PostHog stores cohort IDs as numbers; keep tokens as they are. */
function cohortValue(cohortId: string): unknown {
  if (isConcrete(cohortId) && /^\d+$/.test(cohortId)) return Number(cohortId);
  return cohortId;
}

/**
 * Validates variants: unique keys, each percentage in [0, 100], and a sum of
 * exactly 100 when every percentage is concrete.
 */
export function validateVariants(what: string, variants: FlagVariant[]): void {
  if (variants.length === 0) {
    throw new Error(`${what}: variants must not be empty; leave them unset for a boolean flag`);
  }
  const seen = new Set<string>();
  for (const v of variants) {
    if (isConcrete(v.key)) {
      if (v.key.length === 0) throw new Error(`${what}: variant keys must not be empty`);
      if (seen.has(v.key)) throw new Error(`${what}: duplicate variant key '${v.key}'`);
      seen.add(v.key);
    }
    validateRange(`${what} variant '${v.key}' rolloutPercentage`, v.rolloutPercentage, 0, 100);
  }
  if (variants.every(v => isConcreteNumber(v.rolloutPercentage))) {
    const sum = variants.reduce((total, v) => total + v.rolloutPercentage, 0);
    // Allow for floating-point error with fractional percentages.
    if (Math.abs(sum - 100) > 1e-9) {
      throw new Error(`${what}: variant rollout percentages must sum to 100, got ${sum}`);
    }
  }
}

/** Variants as PostHog stores them: `[{key, name?, rollout_percentage}]`. */
export function renderVariants(variants: FlagVariant[]): Record<string, unknown>[] {
  return variants.map(v => {
    const out: Record<string, unknown> = { key: v.key };
    if (v.name !== undefined) out.name = v.name;
    out.rollout_percentage = v.rolloutPercentage;
    return out;
  });
}

/**
 * Throws when a concrete key in `keys` is not one of the concrete variant
 * keys. Skipped when any variant key is a token.
 */
export function validateVariantRefs(what: string, keys: (string | undefined)[], variants: FlagVariant[] | undefined): void {
  const concrete = keys.filter((k): k is string => isConcrete(k));
  if (concrete.length === 0) return;
  if (!variants) {
    throw new Error(`${what}: '${concrete[0]}' refers to a variant, but the flag has no variants`);
  }
  if (variants.some(v => Token.isUnresolved(v.key))) return;
  const known = new Set(variants.map(v => v.key));
  for (const k of concrete) {
    if (!known.has(k)) {
      throw new Error(`${what}: unknown variant '${k}' (variants: ${[...known].join(', ')})`);
    }
  }
}

/**
 * Payloads as PostHog stores them: each value JSON-encoded into a string,
 * keyed by variant key (or `true` for a boolean flag). Values may contain
 * tokens. Returns undefined for undefined or an empty map.
 */
export function renderPayloads(scope: Construct, payloads: { [key: string]: any } | undefined): Record<string, string> | undefined {
  if (!payloads || Object.keys(payloads).length === 0) return undefined;
  const stack = Stack.of(scope);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payloads)) {
    out[key] = stack.toJsonString(value);
  }
  return out;
}
