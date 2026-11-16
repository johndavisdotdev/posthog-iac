// Internal helpers for the organizations L2s (DNS record names, number
// rendering). Not exported from the package.
import { Token, Tokenization } from 'aws-cdk-lib';
import { isConcrete } from './helpers';

/**
 * Returns a fully qualified DNS name (with a trailing dot) for a Route 53
 * record. A trailing dot stops the record construct from appending the hosted
 * zone name, which matters when the name is a token. Works for tokens.
 */
export function fqdn(name: string): string {
  if (isConcrete(name)) return `${name.replace(/\.$/, '')}.`;
  return `${name}.`;
}

/**
 * Renders a 0..1 fraction as the decimal string PostHog expects (at most two
 * decimals, e.g. `0.25`). Validates concrete values; tokens pass through.
 */
export function renderFraction(what: string, value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Token.isUnresolved(value)) return Tokenization.stringifyNumber(value);
  if (value < 0 || value > 1) {
    throw new Error(`${what} must be between 0 and 1, got ${value}`);
  }
  if (Math.abs(Math.round(value * 100) - value * 100) > 1e-9) {
    throw new Error(`${what} supports at most two decimal places, got ${value}`);
  }
  return value.toFixed(2);
}

/** Throws when a concrete value is not a UUID. Tokens are skipped. */
export function validateUuid(what: string, value: string | undefined): void {
  if (isConcrete(value) && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) {
    throw new Error(`${what} '${value}' is invalid: expected a UUID`);
  }
}

/** Throws when a concrete URL does not use HTTPS. Tokens are skipped. */
export function validateHttpsUrl(what: string, value: string | undefined): void {
  if (isConcrete(value) && !/^https:\/\/\S+$/.test(value)) {
    throw new Error(`${what} '${value}' is invalid: expected an https:// URL`);
  }
}
