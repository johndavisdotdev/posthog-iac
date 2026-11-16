// Internal helpers for the batch-exports and data-warehouse L2s: mapping
// Durations onto the fixed interval strings PostHog accepts, and rendering
// SecretValues and timestamps.
import { CfnDynamicReference, Duration, IResolveContext, SecretValue, Token, Tokenization } from 'aws-cdk-lib';
import { secretProp } from './helpers';

/**
 * Maps a Duration onto one of the given PostHog values, keyed by whole
 * minutes. Throws with the supported durations when it does not match.
 */
export function durationToChoice<T>(what: string, duration: Duration, choices: Record<number, T>): T {
  const seconds = duration.toSeconds({ integral: false });
  if (Token.isUnresolved(seconds)) {
    throw new Error(`${what} must be a concrete Duration`);
  }
  const minutes = seconds / 60;
  const match = choices[minutes];
  if (match === undefined || !Number.isInteger(minutes)) {
    const supported = Object.keys(choices).map(m => describeMinutes(Number(m))).join(', ');
    throw new Error(`${what} must be one of ${supported}, got ${duration.toHumanString()}`);
  }
  return match;
}

function describeMinutes(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

/** Sync frequencies of data warehouse source schemas, by minutes. */
export const SOURCE_SYNC_FREQUENCIES: Record<number, string> = {
  5: '5min',
  30: '30min',
  60: '1hour',
  360: '6hour',
  720: '12hour',
  1440: '24hour',
  10080: '7day',
  43200: '30day',
};

/** Materialization frequencies of saved queries, by minutes. */
export const SAVED_QUERY_SYNC_FREQUENCIES: Record<number, string> = {
  15: '15min',
  30: '30min',
  60: '1hour',
  360: '6hour',
  720: '12hour',
  1440: '24hour',
  10080: '7day',
  43200: '30day',
};

/** Endpoint data freshness values, by minutes; the value is seconds. */
export const ENDPOINT_FRESHNESS: Record<number, number> = {
  15: 900,
  30: 1800,
  60: 3600,
  360: 21600,
  720: 43200,
  1440: 86400,
  10080: 604800,
};

/**
 * Renders a map of SecretValues to their (dynamic reference) strings, leaving
 * out unset entries. Returns undefined when nothing is set.
 */
export function renderSecrets(secrets: Record<string, SecretValue | undefined>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    const rendered = secretRef(key, value);
    if (rendered !== undefined) out[key] = rendered;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Renders a SecretValue for a write-only property. Rejects plain-text values
 * (`SecretValue.unsafePlainText`), which would end up in the template, and
 * SSM SecureString references, which CloudFormation does not resolve for
 * registry (third-party) resource types. Secrets Manager dynamic references
 * and other tokens (e.g. NoEcho parameters) are accepted.
 */
export function secretRef(what: string, secret: SecretValue | undefined): string | undefined {
  const rendered = secretProp(secret);
  if (rendered === undefined) return undefined;
  if (isSsmSecure(rendered)) {
    throw new Error(`${what}: SSM SecureString references are not resolved for PostHog resource types; use SecretValue.secretsManager()`);
  }
  if (!Token.isUnresolved(rendered) && !rendered.startsWith('{{resolve:')) {
    throw new Error(`${what} must be a Secrets Manager dynamic reference (SecretValue.secretsManager(), secret.secretValue), not a plain-text value`);
  }
  return rendered;
}

function isSsmSecure(rendered: string): boolean {
  if (rendered.includes('{{resolve:ssm-secure:')) return true;
  return Tokenization.reverseString(rendered).tokens.some(token => {
    if (!(token instanceof CfnDynamicReference)) return false;
    // Intrinsic.resolve() returns its fixed value and ignores the context.
    const value = token.resolve({} as IResolveContext);
    return typeof value === 'string' && value.startsWith('{{resolve:ssm-secure:');
  });
}

/** Drops undefined values from a JSON object. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/** Renders a `Date | string` timestamp as an ISO 8601 string. */
export function renderTimestamp(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}
