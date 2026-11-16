import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnFeatureFlag, CfnFeatureFlagPropsBucketingIdentifier, CfnFeatureFlagPropsEvaluationRuntime } from './feature-flag.generated';
import { ScheduledChange, ScheduledChangeOptions } from './scheduled-change';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import {
  renderPayloads,
  renderReleaseCondition,
  renderVariants,
  validateVariantRefs,
  validateVariants,
} from '../private/feature-flags';
import { isConcrete, jsonProp, uniqueOrUndefined, validateLength, validateRange } from '../private/helpers';
import type { ICohort } from '../product-analytics/cohort';

/**
 * A PostHog feature flag.
 */
export interface IFeatureFlag extends IResource {
  /**
   * The PostHog feature flag ID.
   * @attribute
   */
  readonly flagId: string;

  /**
   * The flag key used by SDKs, e.g. `new-checkout`.
   * @attribute
   */
  readonly flagKey: string;

  /** The project the flag belongs to. */
  readonly project: IProject;
}

/**
 * One release condition group of a feature flag. A user matches the group
 * when they match every property condition (and the cohort, if set); the
 * flag is then on for `rolloutPercentage` percent of the matching users.
 * The flag is on when any group matches.
 */
export interface ReleaseCondition {
  /**
   * Person, group or other property conditions. All must match.
   * @default - none (every user matches)
   */
  readonly properties?: PropertyFilter[];

  /**
   * Only match members of this cohort.
   * @default - no cohort condition
   */
  readonly cohort?: ICohort;

  /**
   * Percentage (0-100) of matching users the flag is on for.
   * @default 100
   */
  readonly rolloutPercentage?: number;

  /**
   * Serve this variant to everyone matching the group, instead of the
   * variant split. Must be the key of one of the flag's `variants`.
   * @default - the flag's variant split
   */
  readonly variant?: string;
}

/**
 * A variant of a multivariate feature flag.
 */
export interface FlagVariant {
  /** Variant key returned by SDKs, e.g. `control` or `test`. */
  readonly key: string;

  /**
   * Description of the variant.
   * @default - none
   */
  readonly name?: string;

  /**
   * Percentage (0-100) of users served this variant. The percentages of all
   * variants must sum to 100.
   */
  readonly rolloutPercentage: number;
}

/**
 * Where a flag may be evaluated.
 */
export enum EvaluationRuntime {
  /** Server-side SDKs only. */
  SERVER = 'server',
  /** Client-side SDKs only. */
  CLIENT = 'client',
  /** Both server- and client-side SDKs. */
  ALL = 'all',
}

/**
 * Identifier used to bucket users into rollout percentages and variants.
 */
export enum BucketingIdentifier {
  /** The distinct ID (the PostHog default). */
  DISTINCT_ID = 'distinct_id',
  /** The device ID. Incompatible with `ensureExperienceContinuity`. */
  DEVICE_ID = 'device_id',
}

/**
 * Settings shared by every way of creating a feature flag.
 */
export interface FeatureFlagCommonOptions {
  /** Flag key that SDKs evaluate, e.g. `new-checkout`. Unique within the project. */
  readonly key: string;

  /**
   * Description of the flag (PostHog stores it in its `name` field).
   * @default - none
   */
  readonly name?: string;

  /**
   * Whether the flag is enabled.
   * @default true
   */
  readonly active?: boolean;

  /**
   * Archive the flag. An archived flag must be inactive (`active: false`).
   * @default false
   */
  readonly archived?: boolean;

  /**
   * Tags on the flag.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Evaluation contexts that control where the flag evaluates. PostHog does
   * not return them, so drift is not detected.
   * @default - none
   */
  readonly evaluationContexts?: string[];

  /**
   * Where the flag may be evaluated.
   * @default EvaluationRuntime.ALL
   */
  readonly evaluationRuntime?: EvaluationRuntime;

  /**
   * Identifier used to bucket users.
   * @default BucketingIdentifier.DISTINCT_ID
   */
  readonly bucketingIdentifier?: BucketingIdentifier;

  /**
   * Keep a user's flag value when they go from anonymous to identified.
   * Incompatible with `BucketingIdentifier.DEVICE_ID`.
   * @default false
   */
  readonly ensureExperienceContinuity?: boolean;

  /**
   * Whether the flag is a remote configuration flag that delivers a payload
   * rather than gating a feature.
   * @default false
   */
  readonly isRemoteConfiguration?: boolean;

  /**
   * What happens to the PostHog flag when it is removed from the stack.
   * PostHog soft-deletes flags.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Options for creating a feature flag in a project (`project.addFeatureFlag()`).
 */
export interface FeatureFlagOptions extends FeatureFlagCommonOptions {
  /**
   * Release condition groups. The flag is on for a user when any group
   * matches.
   * @default - no conditions: the flag is off for everyone
   */
  readonly releaseConditions?: ReleaseCondition[];

  /**
   * Variants of a multivariate flag. Their rollout percentages must sum to
   * 100.
   * @default - a boolean flag
   */
  readonly variants?: FlagVariant[];

  /**
   * Payloads (any JSON value) returned with the flag, keyed by variant key,
   * or by `'true'` for a boolean flag. Each value is JSON-encoded.
   * @default - none
   */
  readonly payloads?: { [key: string]: any };

  /**
   * Group type index to aggregate by: the flag is evaluated per group
   * (company, team, ...) instead of per user.
   * @default - per user
   */
  readonly aggregationGroupTypeIndex?: number;

  /**
   * The complete PostHog `filters` object, as an escape hatch for settings
   * the typed props don't cover. Can't be combined with
   * `releaseConditions`, `variants`, `payloads` or `aggregationGroupTypeIndex`.
   * @default - built from the typed props
   */
  readonly rawFilters?: { [key: string]: any };
}

/**
 * Properties for a FeatureFlag.
 */
export interface FeatureFlagProps extends FeatureFlagOptions {
  /** The project to create the flag in. */
  readonly project: IProject;
}

/**
 * Properties for `FeatureFlag.boolean()`.
 */
export interface BooleanFeatureFlagProps extends FeatureFlagCommonOptions {
  /** The project to create the flag in. */
  readonly project: IProject;

  /**
   * Release condition groups. `variant` overrides are not allowed.
   * @default - one condition matching everyone at 100%
   */
  readonly releaseConditions?: ReleaseCondition[];

  /**
   * Payload (any JSON value) returned when the flag is on.
   * @default - none
   */
  readonly payload?: any;
}

/**
 * Properties for `FeatureFlag.percentageRollout()`.
 */
export interface PercentageRolloutFeatureFlagProps extends FeatureFlagCommonOptions {
  /** The project to create the flag in. */
  readonly project: IProject;

  /** Percentage (0-100) of users the flag is on for. */
  readonly percentage: number;

  /**
   * Only roll out to users matching these property conditions.
   * @default - all users
   */
  readonly properties?: PropertyFilter[];
}

/**
 * Attributes of an existing feature flag, for `FeatureFlag.fromFlagAttributes()`.
 */
export interface FeatureFlagAttributes {
  /** The project the flag belongs to. */
  readonly project: IProject;

  /** The PostHog feature flag ID. */
  readonly flagId: string;

  /** The flag key. */
  readonly flagKey: string;
}

/**
 * A PostHog feature flag: a key that SDKs evaluate to roll a feature out to
 * a percentage of users, to specific users, cohorts or groups, or to serve
 * multivariate variants and payloads.
 *
 * @resource PostHog::FeatureFlags::FeatureFlag
 */
export class FeatureFlag extends Resource implements IFeatureFlag {
  /**
   * Import an existing flag by its PostHog ID. `flagKey` throws when read;
   * use `fromFlagAttributes()` if you need both.
   */
  public static fromFlagId(scope: Construct, id: string, project: IProject, flagId: string): IFeatureFlag {
    return FeatureFlag.importFlag(scope, id, project, flagId, undefined);
  }

  /**
   * Import an existing flag by its key.
   *
   * PostHog addresses flags by ID, and the key alone does not give one
   * without a lookup at deploy time. So `flagId` throws when read: the
   * imported flag can be referenced by key (e.g. in SDK config or
   * experiments that take a key), but can't be linked to an early access
   * feature or a scheduled change. Use `fromFlagId()` or
   * `fromFlagAttributes()` for those.
   */
  public static fromFlagKey(scope: Construct, id: string, project: IProject, flagKey: string): IFeatureFlag {
    return FeatureFlag.importFlag(scope, id, project, undefined, flagKey);
  }

  /**
   * Import an existing flag by its PostHog ID and key.
   */
  public static fromFlagAttributes(scope: Construct, id: string, attrs: FeatureFlagAttributes): IFeatureFlag {
    return FeatureFlag.importFlag(scope, id, attrs.project, attrs.flagId, attrs.flagKey);
  }

  /**
   * Create a boolean (on/off) flag. Without `releaseConditions` it is on
   * for everyone (while `active`).
   */
  public static boolean(scope: Construct, id: string, props: BooleanFeatureFlagProps): FeatureFlag {
    const { payload, releaseConditions, ...rest } = props;
    (releaseConditions ?? []).forEach((c, i) => {
      if (c.variant !== undefined) {
        throw new Error(`FeatureFlag '${props.key}': release condition ${i} sets a variant, but boolean flags have no variants`);
      }
    });
    return new FeatureFlag(scope, id, {
      ...rest,
      releaseConditions: releaseConditions ?? [{ rolloutPercentage: 100 }],
      payloads: payload === undefined ? undefined : { true: payload },
    });
  }

  /**
   * Create a boolean flag rolled out to a percentage of users (optionally
   * only those matching `properties`).
   */
  public static percentageRollout(scope: Construct, id: string, props: PercentageRolloutFeatureFlagProps): FeatureFlag {
    const { percentage, properties, ...rest } = props;
    return new FeatureFlag(scope, id, {
      ...rest,
      releaseConditions: [{ properties, rolloutPercentage: percentage }],
    });
  }

  private static importFlag(scope: Construct, id: string, project: IProject, flagId?: string, flagKey?: string): IFeatureFlag {
    class Import extends Resource implements IFeatureFlag {
      public readonly project = project;
      public get flagId(): string {
        if (flagId === undefined) {
          throw new Error(`Feature flag '${this.node.path}' was imported by key, so its ID is unknown; use FeatureFlag.fromFlagId() or fromFlagAttributes()`);
        }
        return flagId;
      }
      public get flagKey(): string {
        if (flagKey === undefined) {
          throw new Error(`Feature flag '${this.node.path}' was imported by ID, so its key is unknown; use FeatureFlag.fromFlagAttributes()`);
        }
        return flagKey;
      }
    }
    return new Import(scope, id);
  }

  public readonly flagId: string;
  public readonly flagKey: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly flagCreatedAt: string;

  /**
   * ISO 8601 timestamp of the last update.
   * @attribute
   */
  public readonly flagUpdatedAt: string;

  /** Whether the flag has variants (set with `variants` or `rawFilters.multivariate`). */
  public readonly isMultivariate: boolean;

  /** The underlying L1 resource. */
  public readonly resource: CfnFeatureFlag;

  constructor(scope: Construct, id: string, props: FeatureFlagProps) {
    super(scope, id);
    validateLength('FeatureFlag key', props.key, 1, 400);
    validateRange('FeatureFlag aggregationGroupTypeIndex', props.aggregationGroupTypeIndex, 0, 4);
    if (props.archived && props.active !== false) {
      throw new Error(`FeatureFlag '${props.key}': an archived flag must be inactive (set active: false)`);
    }
    if (props.ensureExperienceContinuity && props.bucketingIdentifier === BucketingIdentifier.DEVICE_ID) {
      throw new Error(`FeatureFlag '${props.key}': ensureExperienceContinuity is incompatible with BucketingIdentifier.DEVICE_ID`);
    }

    this.project = props.project;

    this.resource = new CfnFeatureFlag(this, 'Resource', {
      projectId: props.project.projectId,
      key: props.key,
      name: props.name,
      filters: jsonProp(this, this.renderFilters(props)),
      active: props.active,
      archived: props.archived,
      tags: uniqueOrUndefined(props.tags),
      evaluationContexts: uniqueOrUndefined(props.evaluationContexts),
      isRemoteConfiguration: props.isRemoteConfiguration,
      ensureExperienceContinuity: props.ensureExperienceContinuity,
      evaluationRuntime: props.evaluationRuntime as string as CfnFeatureFlagPropsEvaluationRuntime | undefined,
      bucketingIdentifier: props.bucketingIdentifier as string as CfnFeatureFlagPropsBucketingIdentifier | undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.flagId = this.resource.attrId;
    this.flagKey = props.key;
    this.flagCreatedAt = this.resource.attrCreatedAt;
    this.flagUpdatedAt = this.resource.attrUpdatedAt;
    this.isMultivariate = props.variants !== undefined || !!props.rawFilters?.multivariate;
  }

  /**
   * Schedule a change to this flag (enable, disable, roll out, add a
   * release condition), once or on a recurring schedule.
   */
  public scheduleChange(id: string, options: ScheduledChangeOptions): ScheduledChange {
    return new ScheduledChange(this, id, { ...options, flag: this });
  }

  private renderFilters(props: FeatureFlagProps): { [key: string]: any } | undefined {
    const what = `FeatureFlag '${props.key}'`;
    const typed = props.releaseConditions ?? props.variants ?? props.payloads ?? props.aggregationGroupTypeIndex;
    if (props.rawFilters !== undefined) {
      if (typed !== undefined) {
        throw new Error(`${what}: rawFilters can't be combined with releaseConditions, variants, payloads or aggregationGroupTypeIndex`);
      }
      return props.rawFilters;
    }
    if (typed === undefined) return undefined;

    if (props.variants) validateVariants(what, props.variants);
    const conditions = props.releaseConditions ?? [];
    validateVariantRefs(`${what} release conditions`, conditions.map(c => c.variant), props.variants);
    if (props.payloads) {
      const keys = Object.keys(props.payloads);
      if (props.variants) {
        validateVariantRefs(`${what} payloads`, keys, props.variants);
      } else {
        const bad = keys.find(k => isConcrete(k) && k !== 'true');
        if (bad !== undefined) {
          throw new Error(`${what}: payloads of a boolean flag must be keyed by 'true', got '${bad}'`);
        }
      }
    }

    const filters: { [key: string]: any } = {
      groups: conditions.map((c, i) => renderReleaseCondition(`${what} release condition ${i}`, c)),
    };
    if (props.variants) filters.multivariate = { variants: renderVariants(props.variants) };
    const payloads = renderPayloads(this, props.payloads);
    if (payloads) filters.payloads = payloads;
    if (props.aggregationGroupTypeIndex !== undefined) {
      filters.aggregation_group_type_index = props.aggregationGroupTypeIndex;
    }
    return filters;
  }
}
