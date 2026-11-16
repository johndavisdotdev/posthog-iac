// Internal helpers for the error tracking L2s.
import { Construct } from 'constructs';
import { jsonProp } from './helpers';
import { FilterLogic } from '../core/filters';
import type { ErrorFilter } from '../error-tracking/error-filter';

/** Renders an ErrorFilter for the rules' `Filters` property (property group JSON). */
export function renderRuleFilters(scope: Construct, filter: ErrorFilter): string {
  return jsonProp(scope, filter.render())!;
}

/**
 * Renders an ErrorFilter as the flat `properties` list of a hog function
 * filter, which alerts use. Hog function filters AND their properties and
 * cannot nest groups, so only AND-combined conditions are accepted.
 */
export function renderAlertProperties(filter: ErrorFilter): Record<string, unknown>[] {
  const leaves: Record<string, unknown>[] = [];
  const walk = (node: Record<string, unknown>) => {
    if (node.type === FilterLogic.OR && (node.values as unknown[]).length > 1) {
      throw new Error('Error tracking alert filters only support AND-combined conditions (ErrorFilter.any() with more than one condition is not allowed)');
    }
    for (const value of node.values as Record<string, unknown>[]) {
      if (Array.isArray(value.values) && (value.type === FilterLogic.AND || value.type === FilterLogic.OR)) {
        walk(value);
      } else {
        leaves.push(value);
      }
    }
  };
  walk(filter.render());
  return leaves;
}
