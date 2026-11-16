// Internal helpers for the llm-analytics L2s (ProviderKey, Evaluation).
import { isConcrete } from './helpers';

/** Throws when a concrete URL is not an absolute https:// URL. Tokens are skipped. */
export function validateHttpsUrl(what: string, value: string | undefined): void {
  if (!isConcrete(value)) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${what} '${value}' is invalid: must be an absolute https:// URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${what} '${value}' is invalid: must use https://`);
  }
}

/** Throws when an option is set for a provider (or type) that does not use it. */
export function rejectUnless(allowed: boolean, what: string, value: unknown, context: string): void {
  if (!allowed && value !== undefined) {
    throw new Error(`${what} is not supported ${context}`);
  }
}

/** Throws when a required option is missing. */
export function requireValue(what: string, value: unknown, context: string): void {
  if (value === undefined) {
    throw new Error(`${what} is required ${context}`);
  }
}

/** Drops undefined values, returning undefined when nothing is left. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
