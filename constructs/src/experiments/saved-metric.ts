import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ExperimentMetric } from './metric';
import { CfnSavedMetric } from './saved-metric.generated';
import type { IProject } from '../organizations/project';
import { jsonProp, uniqueOrUndefined, validateLength } from '../private/helpers';

/**
 * A PostHog shared (saved) experiment metric.
 */
export interface ISavedMetric extends IResource {
  /**
   * The PostHog shared metric ID.
   * @attribute
   */
  readonly savedMetricId: string;

  /** The project the shared metric belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a shared experiment metric in a project.
 */
export interface SavedMetricOptions {
  /** Name of the shared metric. Must be unique within the project (case-insensitive). */
  readonly name: string;

  /** The metric definition. */
  readonly query: ExperimentMetric;

  /**
   * Short description of what the metric measures.
   * @default - none
   */
  readonly description?: string;

  /**
   * Tags on the shared metric.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * What happens to the PostHog shared metric when it is removed from the
   * stack. PostHog hard-deletes shared metrics.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a SavedMetric.
 */
export interface SavedMetricProps extends SavedMetricOptions {
  /** The project to create the shared metric in. */
  readonly project: IProject;
}

/**
 * A PostHog shared experiment metric: an `ExperimentMetric` that many
 * experiments can attach (`Experiment.savedMetrics`).
 *
 * @resource PostHog::Experiments::SavedMetric
 */
export class SavedMetric extends Resource implements ISavedMetric {
  /**
   * Import an existing shared metric by its PostHog ID.
   */
  public static fromSavedMetricId(scope: Construct, id: string, project: IProject, savedMetricId: string): ISavedMetric {
    class Import extends Resource implements ISavedMetric {
      public readonly savedMetricId = savedMetricId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly savedMetricId: string;
  public readonly project: IProject;

  /** The metric's definition, e.g. for building insights from it. */
  public readonly query: ExperimentMetric;

  /** Display name of the metric. */
  public readonly name: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly savedMetricCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSavedMetric;

  constructor(scope: Construct, id: string, props: SavedMetricProps) {
    super(scope, id);
    validateLength('SavedMetric name', props.name, 1, 400);
    validateLength('SavedMetric description', props.description, 0, 400);

    this.project = props.project;
    this.query = props.query;
    this.name = props.name;

    this.resource = new CfnSavedMetric(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      query: jsonProp(this, props.query.render())!,
      tags: uniqueOrUndefined(props.tags),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.savedMetricId = this.resource.attrId;
    this.savedMetricCreatedAt = this.resource.attrCreatedAt;
  }
}
