import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnEarlyAccessFeature, CfnEarlyAccessFeaturePropsStage } from './early-access-feature.generated';
import { FeatureFlag, IFeatureFlag } from './feature-flag';
import type { IProject } from '../organizations/project';
import { isConcrete, jsonProp, validateLength } from '../private/helpers';

/**
 * Lifecycle stage of an early access feature.
 */
export enum EarlyAccessStage {
  /** Not visible to users. */
  DRAFT = 'draft',
  /** Users can register interest; the flag is not enabled. */
  CONCEPT = 'concept',
  /** Opted-in users get the feature (alpha). */
  ALPHA = 'alpha',
  /** Opted-in users get the feature (beta). */
  BETA = 'beta',
  /** Generally available. */
  GENERAL_AVAILABILITY = 'general-availability',
  /** Archived. */
  ARCHIVED = 'archived',
}

/**
 * A PostHog early access feature.
 */
export interface IEarlyAccessFeature extends IResource {
  /**
   * The PostHog early access feature ID (a UUID).
   * @attribute
   */
  readonly earlyAccessFeatureId: string;

  /** The project the feature belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an early access feature in a project
 * (`project.addEarlyAccessFeature()`).
 */
export interface EarlyAccessFeatureOptions {
  /** Name of the feature, shown to users in the opt-in UI. */
  readonly name: string;

  /** Lifecycle stage. Active stages (alpha, beta, GA) enable the flag for opted-in users. */
  readonly stage: EarlyAccessStage;

  /**
   * Description shown to users in the opt-in UI.
   * @default - none
   */
  readonly description?: string;

  /**
   * An existing boolean, user-based flag to back the feature. It must not
   * be linked to another feature, survey or experiment. Only applied on
   * create: changing it replaces nothing and is ignored by PostHog.
   * @default - PostHog creates a flag from the feature name
   */
  readonly featureFlag?: IFeatureFlag;

  /**
   * URL of external documentation, shown in the opt-in UI.
   * @default - none
   */
  readonly documentationUrl?: string;

  /**
   * URL of an image (e.g. a screenshot) shown in the opt-in UI.
   * @default - none
   */
  readonly imageUrl?: string;

  /**
   * Payload (any JSON object) for the feature's flag. Only applied on
   * create, and not read back.
   * @default - none
   */
  readonly payload?: { [key: string]: any };

  /**
   * What happens to the PostHog feature when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an EarlyAccessFeature.
 */
export interface EarlyAccessFeatureProps extends EarlyAccessFeatureOptions {
  /** The project to create the feature in. */
  readonly project: IProject;
}

/**
 * A PostHog early access feature: a feature users opt in to from your app,
 * backed by a feature flag that is enabled for opted-in users once the
 * feature reaches an active stage.
 *
 * @resource PostHog::FeatureFlags::EarlyAccessFeature
 */
export class EarlyAccessFeature extends Resource implements IEarlyAccessFeature {
  /**
   * Import an existing early access feature by its PostHog ID.
   */
  public static fromEarlyAccessFeatureId(scope: Construct, id: string, project: IProject, earlyAccessFeatureId: string): IEarlyAccessFeature {
    class Import extends Resource implements IEarlyAccessFeature {
      public readonly earlyAccessFeatureId = earlyAccessFeatureId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly earlyAccessFeatureId: string;
  public readonly project: IProject;

  /**
   * ID of the flag backing the feature (the given one, or the one PostHog created).
   * @attribute
   */
  public readonly featureFlagId: string;

  /**
   * Key of the flag backing the feature.
   * @attribute
   */
  public readonly featureFlagKey: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly earlyAccessFeatureCreatedAt: string;

  /**
   * The flag backing the feature, e.g. to schedule changes to it.
   */
  public readonly featureFlag: IFeatureFlag;

  /** The underlying L1 resource. */
  public readonly resource: CfnEarlyAccessFeature;

  constructor(scope: Construct, id: string, props: EarlyAccessFeatureProps) {
    super(scope, id);
    validateLength('EarlyAccessFeature name', props.name, 1, 200);
    validateLength('EarlyAccessFeature documentationUrl', props.documentationUrl, 0, 800);
    validateLength('EarlyAccessFeature imageUrl', props.imageUrl, 0, 800);
    const flagProject = props.featureFlag?.project.projectId;
    if (isConcrete(flagProject) && isConcrete(props.project.projectId) && flagProject !== props.project.projectId) {
      throw new Error(`EarlyAccessFeature '${props.name}': featureFlag belongs to project ${flagProject}, not ${props.project.projectId}`);
    }
    if (props.featureFlag instanceof FeatureFlag && props.featureFlag.isMultivariate) {
      throw new Error(`EarlyAccessFeature '${props.name}': featureFlag must be a boolean flag, not multivariate`);
    }

    this.project = props.project;

    this.resource = new CfnEarlyAccessFeature(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      stage: props.stage as string as CfnEarlyAccessFeaturePropsStage,
      documentationUrl: props.documentationUrl,
      imageUrl: props.imageUrl,
      featureFlagId: props.featureFlag?.flagId,
      payload: jsonProp(this, props.payload),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.earlyAccessFeatureId = this.resource.attrId;
    this.featureFlagId = this.resource.attrLinkedFeatureFlagId;
    this.featureFlagKey = this.resource.attrFeatureFlagKey;
    this.earlyAccessFeatureCreatedAt = this.resource.attrCreatedAt;
    this.featureFlag = props.featureFlag ?? FeatureFlag.fromFlagAttributes(this, 'LinkedFlag', {
      project: props.project,
      flagId: this.featureFlagId,
      flagKey: this.featureFlagKey,
    });
  }
}
