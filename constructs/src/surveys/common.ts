import { PropertyFilter } from '../core/filters';

/**
 * How a survey or product tour compares the current page URL (or device
 * type) with the configured value.
 */
export enum UrlMatchType {
  /** Equals the value. */
  EXACT = 'exact',
  /** Does not equal the value. */
  IS_NOT = 'is_not',
  /** Contains the value, case-insensitive. */
  CONTAINS = 'icontains',
  /** Does not contain the value, case-insensitive. */
  NOT_CONTAINS = 'not_icontains',
  /** Matches the regular expression. */
  REGEX = 'regex',
  /** Does not match the regular expression. */
  NOT_REGEX = 'not_regex',
}

/**
 * Who sees a survey or product tour: users matching every property filter,
 * limited to a rollout percentage. A user matching any one condition is
 * targeted.
 */
export interface TargetingCondition {
  /**
   * Person, cohort or group property filters. All must match.
   * @default - every user
   */
  readonly properties?: PropertyFilter[];

  /**
   * Percentage (0-100) of matching users to target.
   * @default 100
   */
  readonly rolloutPercentage?: number;
}
