// Serialization of the shared filter models in src/core/filters.ts to
// PostHog's JSON shape. Internal: L2s call these when rendering L1 JSON props.
import { FilterLogic, PropertyFilter, PropertyFilterType, PropertyGroup, PropertyOperator } from '../core/filters';

const NO_VALUE = new Set<string>([PropertyOperator.IS_SET, PropertyOperator.IS_NOT_SET]);

/** One property filter as PostHog stores it: `{key, value, operator, type}`. */
export function renderPropertyFilter(filter: PropertyFilter): Record<string, unknown> {
  const operator = filter.operator ?? PropertyOperator.EXACT;
  const type = filter.type ?? PropertyFilterType.EVENT;
  if (type === PropertyFilterType.GROUP && filter.groupTypeIndex === undefined) {
    throw new Error(`Property filter '${filter.key}': groupTypeIndex is required for group filters`);
  }
  if (!NO_VALUE.has(operator) && filter.value === undefined) {
    throw new Error(`Property filter '${filter.key}': a value is required for operator '${operator}'`);
  }
  const out: Record<string, unknown> = { key: filter.key, operator, type };
  if (!NO_VALUE.has(operator)) out.value = filter.value;
  if (filter.groupTypeIndex !== undefined) out.group_type_index = filter.groupTypeIndex;
  return out;
}

/** A list of property filters. Undefined or empty renders as undefined. */
export function renderPropertyFilters(filters: PropertyFilter[] | undefined): Record<string, unknown>[] | undefined {
  if (!filters || filters.length === 0) return undefined;
  return filters.map(renderPropertyFilter);
}

/**
 * A property group as PostHog stores it:
 * `{type: 'AND' | 'OR', values: [filter | group, ...]}`.
 */
export function renderPropertyGroup(group: PropertyGroup): Record<string, unknown> {
  return {
    type: group.logic ?? FilterLogic.AND,
    values: [
      ...(group.filters ?? []).map(renderPropertyFilter),
      ...(group.groups ?? []).map(renderPropertyGroup),
    ],
  };
}
