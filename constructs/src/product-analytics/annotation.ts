import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnAnnotation, CfnAnnotationPropsCreationType, CfnAnnotationPropsScope } from './annotation.generated';
import type { IDashboard } from './dashboard';
import type { IInsight } from './insight';
import type { IProject } from '../organizations/project';
import { validateIsoTimestamp } from '../private/definitions';
import { validateLength } from '../private/helpers';
import { renderDate } from '../private/insights';

/**
 * Where an annotation is shown.
 */
export enum AnnotationScope {
  /** On every insight in the project. */
  PROJECT = 'project',
  /** On every insight in every project of the organization. */
  ORGANIZATION = 'organization',
  /** On the insights of one dashboard (set `dashboard`). */
  DASHBOARD = 'dashboard',
  /** On a single insight (set `insight`). */
  INSIGHT = 'dashboard_item',
}

/**
 * Who created an annotation.
 */
export enum AnnotationCreationType {
  /** A note written by a person. */
  USER = 'USR',
  /** A note created by a bot or a deployment pipeline. */
  GIT = 'GIT',
}

/**
 * A PostHog annotation.
 */
export interface IAnnotation extends IResource {
  /**
   * The PostHog annotation ID.
   * @attribute
   */
  readonly annotationId: string;

  /** The project the annotation belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an annotation in a project (`project.addAnnotation()`).
 */
export interface AnnotationOptions {
  /** Text shown on charts, e.g. `Released v2.3`. At most 8192 characters. */
  readonly content: string;

  /**
   * When the annotated change happened: a `Date`, or an ISO 8601 timestamp
   * such as `2026-05-01T12:00:00Z`.
   */
  readonly date: Date | string;

  /**
   * Where the annotation is shown.
   * @default - `AnnotationScope.INSIGHT` when `insight` is set,
   * `AnnotationScope.DASHBOARD` when `dashboard` is set, otherwise
   * `AnnotationScope.PROJECT`
   */
  readonly scope?: AnnotationScope;

  /**
   * The dashboard to show the annotation on. Required for (and only allowed
   * with) `AnnotationScope.DASHBOARD`. Must belong to the same project.
   * @default - none
   */
  readonly dashboard?: IDashboard;

  /**
   * The insight to show the annotation on. Required for (and only allowed
   * with) `AnnotationScope.INSIGHT`. Must belong to the same project.
   * @default - none
   */
  readonly insight?: IInsight;

  /**
   * Emoji shown in place of the default badge on charts. At most 16
   * characters.
   * @default - the default badge
   */
  readonly emoji?: string;

  /**
   * Who created the annotation.
   * @default AnnotationCreationType.USER
   */
  readonly creationType?: AnnotationCreationType;

  /**
   * Hide the annotation from the PostHog UI (charts and the annotations
   * list). It stays readable over the API. Useful for high-frequency markers
   * such as deployments.
   * @default false
   */
  readonly hidden?: boolean;

  /**
   * What happens to the PostHog annotation when it is removed from the
   * stack. PostHog soft-deletes annotations.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an Annotation.
 */
export interface AnnotationProps extends AnnotationOptions {
  /** The project to create the annotation in. */
  readonly project: IProject;
}

/**
 * A PostHog annotation: a note pinned to a point in time (a release,
 * incident or campaign) and shown on insight charts.
 *
 * @resource PostHog::ProductAnalytics::Annotation
 */
export class Annotation extends Resource implements IAnnotation {
  /**
   * Import an existing annotation by its PostHog ID.
   */
  public static fromAnnotationId(scope: Construct, id: string, project: IProject, annotationId: string): IAnnotation {
    class Import extends Resource implements IAnnotation {
      public readonly annotationId = annotationId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  /**
   * Formats a `Date` as an ISO 8601 UTC timestamp for the `date` prop.
   */
  public static isoDate(date: Date): string {
    return date.toISOString();
  }

  public readonly annotationId: string;
  public readonly project: IProject;

  /** Where the annotation is shown. */
  public readonly scope: AnnotationScope;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly annotationCreatedAt: string;

  /**
   * ISO 8601 timestamp of the last update.
   * @attribute
   */
  public readonly annotationUpdatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnAnnotation;

  constructor(scope: Construct, id: string, props: AnnotationProps) {
    super(scope, id);
    validateLength('Annotation content', props.content, 1, 8192);
    validateLength('Annotation emoji', props.emoji, 0, 16);
    const date = renderDate(props.date)!;
    validateIsoTimestamp('Annotation date', date);

    this.project = props.project;
    this.scope = props.scope
      ?? (props.insight ? AnnotationScope.INSIGHT : props.dashboard ? AnnotationScope.DASHBOARD : AnnotationScope.PROJECT);
    this.validateTarget(props);

    this.resource = new CfnAnnotation(this, 'Resource', {
      projectId: props.project.projectId,
      content: props.content,
      dateMarker: date,
      scope: this.scope as string as CfnAnnotationPropsScope,
      dashboardId: props.dashboard?.dashboardId,
      dashboardItem: props.insight?.insightId,
      emoji: props.emoji,
      creationType: props.creationType as string as CfnAnnotationPropsCreationType | undefined,
      hiddenInUserInterface: props.hidden,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.annotationId = this.resource.attrId;
    this.annotationCreatedAt = this.resource.attrCreatedAt;
    this.annotationUpdatedAt = this.resource.attrUpdatedAt;
  }

  private validateTarget(props: AnnotationProps): void {
    const wantsDashboard = this.scope === AnnotationScope.DASHBOARD;
    const wantsInsight = this.scope === AnnotationScope.INSIGHT;
    if (wantsDashboard && !props.dashboard) {
      throw new Error('Annotation: scope DASHBOARD requires a dashboard');
    }
    if (wantsInsight && !props.insight) {
      throw new Error('Annotation: scope INSIGHT requires an insight');
    }
    if (!wantsDashboard && props.dashboard) {
      throw new Error(`Annotation: a dashboard can only be set with scope DASHBOARD (got '${this.scope}')`);
    }
    if (!wantsInsight && props.insight) {
      throw new Error(`Annotation: an insight can only be set with scope INSIGHT (got '${this.scope}')`);
    }
  }
}
