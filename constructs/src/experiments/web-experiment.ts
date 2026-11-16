import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnWebExperiment } from './web-experiment.generated';
import type { IProject } from '../organizations/project';
import { compact, validateVariants } from '../private/experiments';
import { jsonProp, validateLength } from '../private/helpers';

/**
 * One DOM change of a web experiment variant: the element to change and at
 * least one of `text`, `html` and `css`.
 */
export interface WebTransform {
  /** CSS selector of the element(s) to change, e.g. `#hero > h1`. */
  readonly selector: string;

  /**
   * Replacement text content.
   * @default - text unchanged
   */
  readonly text?: string;

  /**
   * Replacement inner HTML.
   * @default - HTML unchanged
   */
  readonly html?: string;

  /**
   * Inline CSS applied to the element, e.g. `background: #2f9e44`.
   * @default - style unchanged
   */
  readonly css?: string;
}

/**
 * One variant of a no-code web experiment.
 */
export interface WebExperimentVariant {
  /**
   * Variant key. Exactly one variant must be `control`. Letters, numbers,
   * hyphens and underscores only.
   */
  readonly key: string;

  /** Percentage (0-100) of users served this variant. All variants add up to 100. */
  readonly rolloutPercentage: number;

  /**
   * DOM changes applied for this variant.
   * @default - none (typical for `control`)
   */
  readonly transforms?: WebTransform[];
}

/**
 * A PostHog no-code web experiment.
 */
export interface IWebExperiment extends IResource {
  /**
   * The PostHog web experiment ID (an experiment ID).
   * @attribute
   */
  readonly webExperimentId: string;

  /** The project the web experiment belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a web experiment in a project.
 */
export interface WebExperimentOptions {
  /** Name of the web experiment. */
  readonly name: string;

  /**
   * The variants: at least two, exactly one with the key `control`, with
   * rollouts adding up to 100.
   */
  readonly variants: WebExperimentVariant[];

  /**
   * What happens to the PostHog web experiment when it is removed from the
   * stack. PostHog hard-deletes web experiments.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a WebExperiment.
 */
export interface WebExperimentProps extends WebExperimentOptions {
  /** The project to create the web experiment in. */
  readonly project: IProject;
}

/**
 * A PostHog no-code web experiment: DOM changes per variant that posthog-js
 * applies on your site, served through a feature flag PostHog creates.
 *
 * @resource PostHog::Experiments::WebExperiment
 */
export class WebExperiment extends Resource implements IWebExperiment {
  /**
   * Import an existing web experiment by its PostHog ID.
   */
  public static fromWebExperimentId(scope: Construct, id: string, project: IProject, webExperimentId: string): IWebExperiment {
    class Import extends Resource implements IWebExperiment {
      public readonly webExperimentId = webExperimentId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly webExperimentId: string;
  public readonly project: IProject;

  /**
   * Key of the feature flag PostHog created for the web experiment.
   * @attribute
   */
  public readonly featureFlagKey: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly webExperimentCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnWebExperiment;

  constructor(scope: Construct, id: string, props: WebExperimentProps) {
    super(scope, id);
    validateLength('WebExperiment name', props.name, 1, 400);
    validateVariants('WebExperiment', props.variants);

    this.project = props.project;

    const variants: Record<string, unknown> = {};
    for (const v of props.variants) {
      variants[v.key] = {
        transforms: (v.transforms ?? []).map((t, i) => this.renderTransform(v.key, i, t)),
        rollout_percentage: v.rolloutPercentage,
      };
    }

    this.resource = new CfnWebExperiment(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      variants: jsonProp(this, variants)!,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.webExperimentId = this.resource.attrId;
    this.featureFlagKey = this.resource.attrFeatureFlagKey;
    this.webExperimentCreatedAt = this.resource.attrCreatedAt;
  }

  private renderTransform(key: string, index: number, t: WebTransform): Record<string, unknown> {
    validateLength(`WebExperiment variant '${key}' transform ${index + 1} selector`, t.selector, 1, Number.MAX_SAFE_INTEGER);
    if (t.text === undefined && t.html === undefined && t.css === undefined) {
      throw new Error(`WebExperiment variant '${key}' transform ${index + 1}: set at least one of text, html and css`);
    }
    return compact({ selector: t.selector, text: t.text, html: t.html, css: t.css });
  }
}
