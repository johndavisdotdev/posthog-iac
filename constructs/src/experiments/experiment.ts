import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CfnExperiment,
  CfnExperimentPropsConclusion,
  CfnExperimentPropsType,
  CfnExperimentSavedMetricLink,
  CfnExperimentSavedMetricLinkType,
} from './experiment.generated';
import type { IHoldout } from './holdout';
import { ExperimentMetric } from './metric';
import type { ISavedMetric } from './saved-metric';
import { PropertyFilter } from '../core/filters';
import type { IFeatureFlag } from '../feature-flags/feature-flag';
import type { IProject } from '../organizations/project';
import { compact, KEY_PATTERN, numericId, validateTimestamp, validateVariants } from '../private/experiments';
import { renderPropertyFilters } from '../private/filters';
import { exactlyOne, isConcrete, jsonProp, uniqueOrUndefined, validateLength, validatePattern } from '../private/helpers';
import type { IAction } from '../product-analytics/action';

/**
 * Experiment type.
 */
export enum ExperimentType {
  /** Backend or API changes, served through the feature flag. */
  PRODUCT = 'product',
  /** Frontend UI changes. */
  WEB = 'web',
}

/**
 * Statistical method used to analyse the experiment.
 */
export enum StatsMethod {
  /** Bayesian analysis (win probabilities and credible intervals). */
  BAYESIAN = 'bayesian',
  /** Frequentist analysis (p-values and confidence intervals). */
  FREQUENTIST = 'frequentist',
}

/**
 * Experiment conclusion.
 */
export enum ExperimentConclusion {
  /** A test variant won. */
  WON = 'won',
  /** The test variants lost. */
  LOST = 'lost',
  /** No significant difference. */
  INCONCLUSIVE = 'inconclusive',
  /** The experiment was stopped early. */
  STOPPED_EARLY = 'stopped_early',
  /** The results are invalid. */
  INVALID = 'invalid',
}

/**
 * How users exposed to more than one variant are counted.
 */
export enum MultipleVariantHandling {
  /** Drop them from the analysis (PostHog's default). */
  EXCLUDE = 'exclude',
  /** Count them in the variant of their first exposure. */
  FIRST_SEEN = 'first_seen',
}

/**
 * One variant of an experiment's feature flag.
 */
export interface ExperimentVariant {
  /**
   * Variant key used by SDKs. Exactly one variant must be `control`.
   * Letters, numbers, hyphens and underscores only.
   */
  readonly key: string;

  /** Percentage (0-100) of users served this variant. All variants add up to 100. */
  readonly rolloutPercentage: number;

  /**
   * Display name of the variant.
   * @default - none
   */
  readonly name?: string;

  /**
   * Free-text note on what the variant does (PostHog `variant_notes`).
   * @default - none
   */
  readonly note?: string;
}

/**
 * Which events count as an exposure to the experiment.
 */
export interface ExposureCriteria {
  /**
   * Leave out internal and test users.
   * @default - PostHog default (false)
   */
  readonly filterTestAccounts?: boolean;

  /**
   * Custom exposure event. Set at most one of `event` and `action`.
   * @default - PostHog's default exposure event (`$feature_flag_called` / `$experiment_exposure`)
   */
  readonly event?: string;

  /**
   * Custom exposure action. Set at most one of `event` and `action`.
   * @default - PostHog's default exposure event
   */
  readonly action?: IAction;

  /**
   * Property filters on the custom exposure event or action.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * How users exposed to more than one variant are counted.
   * @default MultipleVariantHandling.EXCLUDE
   */
  readonly multipleVariantHandling?: MultipleVariantHandling;
}

/**
 * A PostHog experiment.
 */
export interface IExperiment extends IResource {
  /**
   * The PostHog experiment ID.
   * @attribute
   */
  readonly experimentId: string;

  /** The project the experiment belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an experiment in a project.
 */
export interface ExperimentOptions {
  /** Name of the experiment. */
  readonly name: string;

  /**
   * Key of the experiment's feature flag. PostHog creates the flag when no
   * flag with this key exists, otherwise it links the experiment to that
   * flag. Cannot be changed after creation (changing it replaces the
   * experiment). Set exactly one of `featureFlagKey` and `featureFlag`.
   * @default - use `featureFlag`
   */
  readonly featureFlagKey?: string;

  /**
   * An existing feature flag to run the experiment on. Cannot be changed
   * after creation. Set exactly one of `featureFlagKey` and `featureFlag`.
   * @default - use `featureFlagKey`
   */
  readonly featureFlag?: IFeatureFlag;

  /**
   * Description of the hypothesis and expected outcome.
   * @default - none
   */
  readonly description?: string;

  /**
   * The flag's variants. At least two, exactly one with the key `control`,
   * with rollouts adding up to 100. PostHog copies them onto the linked flag.
   * @default - PostHog default: `control` and `test`, 50% each
   */
  readonly variants?: ExperimentVariant[];

  /**
   * Minimum detectable effect, as a percentage, for the running-time
   * calculator.
   * @default - none
   */
  readonly minimumDetectableEffect?: number;

  /**
   * Primary metrics.
   * @default - none
   */
  readonly metrics?: ExperimentMetric[];

  /**
   * Secondary metrics.
   * @default - none
   */
  readonly secondaryMetrics?: ExperimentMetric[];

  /**
   * Shared metrics attached as primary metrics.
   * @default - none
   */
  readonly savedMetrics?: ISavedMetric[];

  /**
   * Shared metrics attached as secondary metrics.
   * @default - none
   */
  readonly secondarySavedMetrics?: ISavedMetric[];

  /**
   * Holdout group excluded from the experiment.
   * @default - no holdout
   */
  readonly holdout?: IHoldout;

  /**
   * Which events count as an exposure.
   * @default - PostHog defaults
   */
  readonly exposureCriteria?: ExposureCriteria;

  /**
   * Statistical method.
   * @default - PostHog default (Bayesian)
   */
  readonly statsMethod?: StatsMethod;

  /**
   * Experiment type.
   * @default - PostHog default (`product`)
   */
  readonly type?: ExperimentType;

  /**
   * ISO 8601 launch time. Setting it launches the experiment.
   * @default - draft (not launched)
   */
  readonly startDate?: string;

  /**
   * ISO 8601 end time. Setting it stops the experiment.
   * @default - not stopped
   */
  readonly endDate?: string;

  /**
   * Variant keys left out of the analysis (still served). `control` cannot
   * be excluded.
   * @default - none
   */
  readonly excludedVariants?: string[];

  /**
   * Whether the experiment is archived.
   * @default false
   */
  readonly archived?: boolean;

  /**
   * Experiment conclusion.
   * @default - none
   */
  readonly conclusion?: ExperimentConclusion;

  /**
   * Comment about the conclusion.
   * @default - none
   */
  readonly conclusionComment?: string;

  /**
   * GitHub repository holding the flag code, as `organization/repository`.
   * @default - none
   */
  readonly repository?: string;

  /**
   * Only count users whose exposure window has fully matured.
   * @default - PostHog default (false)
   */
  readonly onlyCountMaturedUsers?: boolean;

  /**
   * Skip PostHog's check that metric events have already been ingested.
   * @default false
   */
  readonly allowUnknownEvents?: boolean;

  /**
   * Tags on the experiment (up to 100, 255 characters each).
   * @default - none
   */
  readonly tags?: string[];

  /**
   * What happens to the PostHog experiment when it is removed from the
   * stack. PostHog only soft-deletes experiments (they disappear from the UI
   * and API but stay in the database), and leaves the linked feature flag in
   * place.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an Experiment.
 */
export interface ExperimentProps extends ExperimentOptions {
  /** The project to create the experiment in. */
  readonly project: IProject;
}

/**
 * A PostHog experiment (A/B test): a feature flag with variants plus the
 * metrics used to compare them.
 *
 * Deleting it soft-deletes the experiment; the feature flag stays.
 *
 * @resource PostHog::Experiments::Experiment
 */
export class Experiment extends Resource implements IExperiment {
  /**
   * Import an existing experiment by its PostHog ID.
   */
  public static fromExperimentId(scope: Construct, id: string, project: IProject, experimentId: string): IExperiment {
    class Import extends Resource implements IExperiment {
      public readonly experimentId = experimentId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly experimentId: string;
  public readonly project: IProject;

  /** Key of the experiment's feature flag. */
  public readonly featureFlagKey: string;

  /**
   * ID of the linked feature flag.
   * @attribute
   */
  public readonly experimentFeatureFlagId: string;

  /**
   * Lifecycle state: `draft`, `running`, `paused`, `exposure_frozen` or `stopped`.
   * @attribute
   */
  public readonly experimentStatus: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly experimentCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnExperiment;

  constructor(scope: Construct, id: string, props: ExperimentProps) {
    super(scope, id);
    exactlyOne('Experiment feature flag', { featureFlagKey: props.featureFlagKey, featureFlag: props.featureFlag });
    const flagKey = props.featureFlagKey ?? props.featureFlag!.flagKey;
    validateLength('Experiment name', props.name, 1, 400);
    validateLength('Experiment description', props.description, 0, 3000);
    validateLength('Experiment featureFlagKey', flagKey, 1, 400);
    validatePattern('Experiment featureFlagKey', flagKey, KEY_PATTERN, 'use letters, numbers, hyphens and underscores only');
    validateLength('Experiment conclusionComment', props.conclusionComment, 0, 4000);
    validateLength('Experiment repository', props.repository, 0, 255);
    validatePattern('Experiment repository', props.repository, /^[^/\s]+\/[^/\s]+$/, 'use the organization/repository format');
    validateTimestamp('Experiment startDate', props.startDate);
    validateTimestamp('Experiment endDate', props.endDate);
    if (isConcrete(props.startDate) && isConcrete(props.endDate) && Date.parse(props.endDate) < Date.parse(props.startDate)) {
      throw new Error('Experiment endDate must not be before startDate');
    }
    if (props.variants) validateVariants('Experiment', props.variants);
    this.validateExcluded(props);
    const tags = uniqueOrUndefined(props.tags);
    if (tags && tags.length > 100) throw new Error(`Experiment tags: at most 100 tags, got ${tags.length}`);
    tags?.forEach(t => validateLength('Experiment tag', t, 0, 255));
    const flagProjectId = props.featureFlag?.project.projectId;
    if (isConcrete(flagProjectId) && isConcrete(props.project.projectId) && flagProjectId !== props.project.projectId) {
      throw new Error('Experiment featureFlag must belong to the experiment project');
    }

    this.project = props.project;
    this.featureFlagKey = flagKey;

    const savedMetrics: CfnExperimentSavedMetricLink[] = [
      ...(props.savedMetrics ?? []).map(m => ({ id: m.savedMetricId, type: CfnExperimentSavedMetricLinkType.PRIMARY })),
      ...(props.secondarySavedMetrics ?? []).map(m => ({ id: m.savedMetricId, type: CfnExperimentSavedMetricLinkType.SECONDARY })),
    ];

    this.resource = new CfnExperiment(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      featureFlagKey: flagKey,
      holdoutId: props.holdout?.holdoutId,
      type: props.type as string as CfnExperimentPropsType | undefined,
      startDate: props.startDate,
      endDate: props.endDate,
      parameters: jsonProp(this, this.renderParameters(props)),
      exposureCriteria: jsonProp(this, this.renderExposure(props.exposureCriteria)),
      metrics: jsonProp(this, props.metrics?.length ? props.metrics.map(m => m.render()) : undefined),
      metricsSecondary: jsonProp(this, props.secondaryMetrics?.length ? props.secondaryMetrics.map(m => m.render()) : undefined),
      statsConfig: jsonProp(this, props.statsMethod ? { method: props.statsMethod } : undefined),
      savedMetrics: savedMetrics.length ? savedMetrics : undefined,
      excludedVariants: uniqueOrUndefined(props.excludedVariants),
      archived: props.archived,
      conclusion: props.conclusion as string as CfnExperimentPropsConclusion | undefined,
      conclusionComment: props.conclusionComment,
      repository: props.repository,
      onlyCountMaturedUsers: props.onlyCountMaturedUsers,
      allowUnknownEvents: props.allowUnknownEvents,
      tags,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
    // The flag is referenced by its plain key, so CloudFormation sees no dependency.
    // Create the flag first, or PostHog creates its own and ours fails as a duplicate.
    if (props.featureFlag) this.node.addDependency(props.featureFlag);

    this.experimentId = this.resource.attrId;
    this.experimentFeatureFlagId = this.resource.attrFeatureFlagId;
    this.experimentStatus = this.resource.attrStatus;
    this.experimentCreatedAt = this.resource.attrCreatedAt;
  }

  private validateExcluded(props: ExperimentProps): void {
    for (const key of props.excludedVariants ?? []) {
      if (key === 'control') throw new Error('Experiment excludedVariants: the control variant cannot be excluded');
      if (props.variants && isConcrete(key) && props.variants.every(v => isConcrete(v.key)) && !props.variants.some(v => v.key === key)) {
        throw new Error(`Experiment excludedVariants: '${key}' is not one of the variants`);
      }
    }
  }

  private renderParameters(props: ExperimentProps): Record<string, unknown> | undefined {
    const notes: Record<string, string> = {};
    for (const v of props.variants ?? []) {
      if (v.note !== undefined) notes[v.key] = v.note;
    }
    const params = compact({
      feature_flag_variants: props.variants?.map(v => compact({ key: v.key, name: v.name, rollout_percentage: v.rolloutPercentage })),
      variant_notes: Object.keys(notes).length ? notes : undefined,
      minimum_detectable_effect: props.minimumDetectableEffect,
    });
    return Object.keys(params).length ? params : undefined;
  }

  private renderExposure(criteria: ExposureCriteria | undefined): Record<string, unknown> | undefined {
    if (!criteria) return undefined;
    if (criteria.event !== undefined && criteria.action !== undefined) {
      throw new Error('Experiment exposureCriteria: set at most one of event and action');
    }
    if (criteria.properties?.length && criteria.event === undefined && criteria.action === undefined) {
      throw new Error('Experiment exposureCriteria: properties need a custom exposure event or action');
    }
    const properties = renderPropertyFilters(criteria.properties) ?? [];
    let config: Record<string, unknown> | undefined;
    if (criteria.action) {
      config = { kind: 'ActionsNode', id: numericId('Experiment exposure action ID', criteria.action.actionId), properties };
    } else if (criteria.event !== undefined) {
      config = { kind: 'ExperimentEventExposureConfig', event: criteria.event, properties };
    }
    const out = compact({
      filterTestAccounts: criteria.filterTestAccounts,
      exposure_config: config,
      multiple_variant_handling: criteria.multipleVariantHandling,
    });
    return Object.keys(out).length ? out : undefined;
  }
}
