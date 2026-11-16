// Internal helpers shared by the L2/L3 constructs. Nothing in src/private is
// exported from the package, so plain functions are fine here (jsii only
// checks the exported API).
import { SecretValue, Stack, Tags, Token } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Tag (value `true`) marking Secrets Manager secrets that the PostHog resource
 * type handlers may write one-time values into. The execution roles created by
 * `patterns.PostHogResourceTypes` only allow `secretsmanager:PutSecretValue`
 * on secrets carrying it, unless explicit secret ARNs are configured.
 */
export const HANDLER_WRITABLE_SECRET_TAG = 'posthog-cdk:handler-writable';

/**
 * Returns the given secret, or creates an empty Secrets Manager secret for a
 * PostHog value that is only returned once (project secret API keys, SCIM
 * tokens). The PostHog resource type writes the value into it.
 */
export function secretOrNew(scope: Construct, id: string, secret: secretsmanager.ISecret | undefined, description: string): secretsmanager.ISecret {
  if (secret) return secret;
  const created = new secretsmanager.Secret(scope, id, { description });
  Tags.of(created).add(HANDLER_WRITABLE_SECRET_TAG, 'true');
  return created;
}

/**
 * Renders a value for one of the L1's JSON-string properties (filters,
 * queries, steps, payloads, ...). Uses `Stack.toJsonString`, so CDK tokens
 * inside the value (attributes of other resources, dynamic references) are
 * resolved correctly at deploy time. Returns undefined for undefined.
 */
export function jsonProp(scope: Construct, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return Stack.of(scope).toJsonString(value);
}

/**
 * Renders a secret for a write-only L1 string property. A `SecretValue` from
 * Secrets Manager or SSM becomes a CloudFormation dynamic reference, so the
 * plain value never appears in the template.
 */
export function secretProp(secret: SecretValue | undefined): string | undefined {
  return secret === undefined ? undefined : secret.unsafeUnwrap();
}

/** True when value is a concrete string (not a token) that we can validate. */
export function isConcrete(value: string | undefined): value is string {
  return value !== undefined && !Token.isUnresolved(value);
}

/** True when value is a concrete number (not a token) that we can validate. */
export function isConcreteNumber(value: number | undefined): value is number {
  return value !== undefined && !Token.isUnresolved(value);
}

/** Throws when a concrete string does not match the pattern. Tokens are skipped. */
export function validatePattern(what: string, value: string | undefined, pattern: RegExp, hint: string): void {
  if (isConcrete(value) && !pattern.test(value)) {
    throw new Error(`${what} '${value}' is invalid: ${hint}`);
  }
}

/** Throws when a concrete string is shorter than min or longer than max. Tokens are skipped. */
export function validateLength(what: string, value: string | undefined, min: number, max: number): void {
  if (isConcrete(value) && (value.length < min || value.length > max)) {
    throw new Error(`${what} must be between ${min} and ${max} characters, got ${value.length}`);
  }
}

/** Throws when a concrete number is outside [min, max]. Tokens are skipped. */
export function validateRange(what: string, value: number | undefined, min: number, max: number): void {
  if (isConcreteNumber(value) && (value < min || value > max)) {
    throw new Error(`${what} must be between ${min} and ${max}, got ${value}`);
  }
}

/** Throws unless exactly one of the named options is set. */
export function exactlyOne(what: string, options: Record<string, unknown>): void {
  const set = Object.entries(options).filter(([, v]) => v !== undefined).map(([k]) => k);
  if (set.length !== 1) {
    throw new Error(`${what}: specify exactly one of ${Object.keys(options).join(', ')} (got ${set.length ? set.join(', ') : 'none'})`);
  }
}

/** Removes duplicates while keeping order; returns undefined for empty input. */
export function uniqueOrUndefined(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  return [...new Set(values)];
}

/** Returns undefined for an empty object, so empty maps are left out of templates. */
export function mapOrUndefined(map: { [key: string]: string } | undefined): { [key: string]: string } | undefined {
  if (!map || Object.keys(map).length === 0) return undefined;
  return map;
}
