import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnHoldout } from './holdout.generated';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { renderPropertyFilters } from '../private/filters';
import { jsonProp, validateLength, validateRange } from '../private/helpers';

/**
 * A PostHog experiment holdout.
 */
export interface IHoldout extends IResource {
  /**
   * The PostHog holdout ID.
   * @attribute
   */
  readonly holdoutId: string;

  /** The project the holdout belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a holdout in a project.
 */
export interface HoldoutOptions {
  /** Name of the holdout group. */
  readonly name: string;

  /**
   * Percentage (0-100) of matching users held back from every experiment
   * that references the holdout.
   */
  readonly rolloutPercentage: number;

  /**
   * Property conditions narrowing which users can be held back.
   * @default - all users
   */
  readonly properties?: PropertyFilter[];

  /**
   * What the holdout reserves and why.
   * @default - none
   */
  readonly description?: string;

  /**
   * What happens to the PostHog holdout when it is removed from the stack.
   * PostHog hard-deletes holdouts.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Holdout.
 */
export interface HoldoutProps extends HoldoutOptions {
  /** The project to create the holdout in. */
  readonly project: IProject;
}

/**
 * A PostHog experiment holdout: a stable slice of users excluded from every
 * experiment that references it, to measure the combined effect of
 * experiments.
 *
 * @resource PostHog::Experiments::Holdout
 */
export class Holdout extends Resource implements IHoldout {
  /**
   * Import an existing holdout by its PostHog ID.
   */
  public static fromHoldoutId(scope: Construct, id: string, project: IProject, holdoutId: string): IHoldout {
    class Import extends Resource implements IHoldout {
      public readonly holdoutId = holdoutId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly holdoutId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly holdoutCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnHoldout;

  constructor(scope: Construct, id: string, props: HoldoutProps) {
    super(scope, id);
    validateLength('Holdout name', props.name, 1, 400);
    validateLength('Holdout description', props.description, 0, 400);
    validateRange('Holdout rolloutPercentage', props.rolloutPercentage, 0, 100);

    this.project = props.project;

    this.resource = new CfnHoldout(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      filters: jsonProp(this, [{
        properties: renderPropertyFilters(props.properties) ?? [],
        rollout_percentage: props.rolloutPercentage,
      }])!,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.holdoutId = this.resource.attrId;
    this.holdoutCreatedAt = this.resource.attrCreatedAt;
  }
}
