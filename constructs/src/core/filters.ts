/**
 * Comparison operator of a property filter.
 */
export enum PropertyOperator {
  /** Equals (a list value matches any of its items). */
  EXACT = 'exact',
  /** Does not equal. */
  IS_NOT = 'is_not',
  /** Contains, case-insensitive. */
  ICONTAINS = 'icontains',
  /** Does not contain, case-insensitive. */
  NOT_ICONTAINS = 'not_icontains',
  /** Starts with. */
  STARTS_WITH = 'starts_with',
  /** Does not start with. */
  NOT_STARTS_WITH = 'not_starts_with',
  /** Ends with. */
  ENDS_WITH = 'ends_with',
  /** Does not end with. */
  NOT_ENDS_WITH = 'not_ends_with',
  /** Matches a regular expression. */
  REGEX = 'regex',
  /** Does not match a regular expression. */
  NOT_REGEX = 'not_regex',
  /** Greater than. */
  GT = 'gt',
  /** Greater than or equal. */
  GTE = 'gte',
  /** Less than. */
  LT = 'lt',
  /** Less than or equal. */
  LTE = 'lte',
  /** The property is set (no value). */
  IS_SET = 'is_set',
  /** The property is not set (no value). */
  IS_NOT_SET = 'is_not_set',
  /** Date equals. */
  IS_DATE_EXACT = 'is_date_exact',
  /** Date is before. */
  IS_DATE_BEFORE = 'is_date_before',
  /** Date is after. */
  IS_DATE_AFTER = 'is_date_after',
  /** Value is in the list. */
  IN = 'in',
  /** Value is not in the list. */
  NOT_IN = 'not_in',
  /** Semantic version equals. */
  SEMVER_EQ = 'semver_eq',
  /** Semantic version is greater than. */
  SEMVER_GT = 'semver_gt',
  /** Semantic version is greater than or equal. */
  SEMVER_GTE = 'semver_gte',
  /** Semantic version is less than. */
  SEMVER_LT = 'semver_lt',
  /** Semantic version is less than or equal. */
  SEMVER_LTE = 'semver_lte',
}

/**
 * What a property filter looks at.
 */
export enum PropertyFilterType {
  /** An event property. */
  EVENT = 'event',
  /** A person property. */
  PERSON = 'person',
  /** An autocaptured element property (tag name, text, href, selector). */
  ELEMENT = 'element',
  /** Membership of a cohort (`key: 'id'`, `value: <cohort id>`). */
  COHORT = 'cohort',
  /** A group property (set `groupTypeIndex`). */
  GROUP = 'group',
  /** A session property. */
  SESSION = 'session',
  /** A HogQL expression (`key` is the expression). */
  HOGQL = 'hogql',
  /** A feature flag value. */
  FLAG = 'flag',
}

/**
 * A single property condition, used by actions, cohorts, feature flags,
 * insights, surveys and other PostHog filters.
 */
export interface PropertyFilter {
  /** The property name, or the HogQL expression for `PropertyFilterType.HOGQL`. */
  readonly key: string;

  /**
   * The value to compare with: a string, number, boolean or a list of them.
   * Leave unset for `IS_SET` / `IS_NOT_SET`.
   * @default - no value
   */
  readonly value?: any;

  /**
   * How to compare the property with `value`.
   * @default PropertyOperator.EXACT
   */
  readonly operator?: PropertyOperator;

  /**
   * What the property belongs to.
   * @default PropertyFilterType.EVENT
   */
  readonly type?: PropertyFilterType;

  /**
   * Group type index, for `PropertyFilterType.GROUP` filters.
   * @default - none
   */
  readonly groupTypeIndex?: number;
}

/**
 * How the conditions of a property group combine.
 */
export enum FilterLogic {
  /** Every condition must match. */
  AND = 'AND',
  /** Any condition may match. */
  OR = 'OR',
}

/**
 * A group of property conditions combined with AND or OR. Groups can be
 * nested.
 */
export interface PropertyGroup {
  /**
   * How the filters and nested groups combine.
   * @default FilterLogic.AND
   */
  readonly logic?: FilterLogic;

  /**
   * Property conditions in this group.
   * @default - none
   */
  readonly filters?: PropertyFilter[];

  /**
   * Nested groups.
   * @default - none
   */
  readonly groups?: PropertyGroup[];
}
