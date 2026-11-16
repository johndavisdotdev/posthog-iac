// Internal helpers for the product-analytics definitions L2s (Annotation,
// Cohort, EventDefinition, SchemaPropertyGroup, DataColorTheme).
import { isConcrete } from './helpers';
import type { CfnSchemaPropertyGroupProperty } from '../product-analytics/schema-property-group.generated';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Throws when a concrete string is not an ISO 8601 date or timestamp. Tokens are skipped. */
export function validateIsoTimestamp(what: string, value: string | undefined): void {
  if (isConcrete(value) && (!ISO_8601.test(value) || isNaN(Date.parse(value)))) {
    throw new Error(`${what} '${value}' is invalid: use an ISO 8601 timestamp such as 2026-05-01T12:00:00Z`);
  }
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Throws when a concrete string is not a CSS hex color (`#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`). Tokens are skipped. */
export function validateHexColor(what: string, value: string | undefined): void {
  if (isConcrete(value) && !HEX_COLOR.test(value)) {
    throw new Error(`${what} '${value}' is invalid: use a CSS hex color such as #1d4aff`);
  }
}

/** Throws when a list of concrete strings contains a duplicate. Tokens are skipped. */
export function validateUnique(what: string, values: (string | undefined)[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!isConcrete(value)) continue;
    if (seen.has(value)) throw new Error(`${what} '${value}' is defined more than once`);
    seen.add(value);
  }
}

/**
 * One schema property group property in the CloudFormation (PascalCase)
 * shape. Mirrors the generated L1's `toJson_CfnSchemaPropertyGroupProperty`,
 * which is not exported; used for properties added after construction.
 */
export function schemaPropertyToCfn(p: CfnSchemaPropertyGroupProperty): Record<string, unknown> {
  const out: Record<string, unknown> = { Name: p.name, PropertyType: p.propertyType };
  if (p.isRequired !== undefined) out.IsRequired = p.isRequired;
  if (p.isOptionalInTypes !== undefined) out.IsOptionalInTypes = p.isOptionalInTypes;
  if (p.description !== undefined) out.Description = p.description;
  return out;
}
