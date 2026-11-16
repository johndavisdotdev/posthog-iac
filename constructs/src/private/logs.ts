// Internal helpers for the logs L2s.
import { Duration, Token } from 'aws-cdk-lib';

/**
 * Converts a Duration into a whole number of minutes or days, with a clear
 * error for fractional values. Token amounts pass through unvalidated.
 */
export function wholeUnits(what: string, duration: Duration | undefined, unit: 'minutes' | 'days'): number | undefined {
  if (duration === undefined) return undefined;
  const value = unit === 'minutes' ? duration.toMinutes({ integral: false }) : duration.toDays({ integral: false });
  if (!Token.isUnresolved(value) && !Number.isInteger(value)) {
    throw new Error(`${what} must be a whole number of ${unit}, got ${duration.toHumanString()}`);
  }
  return value;
}
