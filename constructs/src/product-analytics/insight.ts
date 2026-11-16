import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Alert, AlertOptions } from './alert';
import type { IDashboard } from './dashboard';
import { InsightQuery } from './insight-query';
import { CfnInsight } from './insight.generated';
import { Subscription, SubscriptionOptions } from './subscription';
import type { IProject } from '../organizations/project';
import { isConcrete, jsonProp, uniqueOrUndefined, validateLength } from '../private/helpers';
import { registerDashboardInsight } from '../private/insights';

/**
 * A PostHog insight (a saved query, shown as a chart or table).
 */
export interface IInsight extends IResource {
  /**
   * The PostHog insight ID.
   * @attribute
   */
  readonly insightId: string;

  /** The project the insight belongs to. */
  readonly project: IProject;

  /**
   * Add an alert that monitors this insight.
   */
  addAlert(id: string, options: AlertOptions): Alert;

  /**
   * Add a scheduled delivery of this insight.
   */
  addSubscription(id: string, options: SubscriptionOptions): Subscription;
}

/**
 * Behaviour shared by created and imported insights.
 */
export abstract class InsightBase extends Resource implements IInsight {
  public abstract readonly insightId: string;
  public abstract readonly project: IProject;

  public addAlert(id: string, options: AlertOptions): Alert {
    return new Alert(this, id, { ...options, insight: this });
  }

  public addSubscription(id: string, options: SubscriptionOptions): Subscription {
    return new Subscription(this, id, { ...options, insight: this });
  }
}

/**
 * Options for creating an insight (`dashboard.addInsight()`).
 */
export interface InsightOptions {
  /** The insight's query. */
  readonly query: InsightQuery;

  /**
   * Name of the insight.
   * @default - PostHog shows a name derived from the query
   */
  readonly name?: string;

  /**
   * Description of the insight.
   * @default - none
   */
  readonly description?: string;

  /**
   * Dashboards the insight is shown on.
   * @default - none
   */
  readonly dashboards?: IDashboard[];

  /**
   * Tags on the insight.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Whether the insight is favorited.
   * @default false
   */
  readonly favorited?: boolean;

  /**
   * What happens to the PostHog insight when it is removed from the stack.
   * PostHog soft-deletes insights.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an Insight.
 */
export interface InsightProps extends InsightOptions {
  /** The project to create the insight in. */
  readonly project: IProject;
}

/**
 * A PostHog insight: a saved trends, funnel, retention or SQL query, shown
 * as a chart or table and optionally placed on dashboards.
 *
 * @resource PostHog::ProductAnalytics::Insight
 */
export class Insight extends InsightBase {
  /**
   * Import an existing insight by its (numeric) PostHog ID.
   */
  public static fromInsightId(scope: Construct, id: string, project: IProject, insightId: string): IInsight {
    class Import extends InsightBase {
      public readonly insightId = insightId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly insightId: string;
  public readonly project: IProject;

  /**
   * The insight's short ID, as used in PostHog URLs (`/insights/<shortId>`).
   * @attribute
   */
  public readonly insightShortId: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly insightCreatedAt: string;

  /** The insight's query. */
  public readonly query: InsightQuery;

  /** The underlying L1 resource. */
  public readonly resource: CfnInsight;

  constructor(scope: Construct, id: string, props: InsightProps) {
    super(scope, id);
    validateLength('Insight name', props.name, 0, 400);
    validateLength('Insight description', props.description, 0, 400);
    for (const dashboard of props.dashboards ?? []) {
      const [a, b] = [dashboard.project.projectId, props.project.projectId];
      if (isConcrete(a) && isConcrete(b) && a !== b) {
        throw new Error(`Insight ${this.node.path}: dashboard ${dashboard.node.path} belongs to a different project`);
      }
    }

    this.project = props.project;
    this.query = props.query;
    const dashboards = props.dashboards ? [...new Set(props.dashboards)] : undefined;

    this.resource = new CfnInsight(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      query: jsonProp(this, props.query.toJson())!,
      tags: uniqueOrUndefined(props.tags),
      favorited: props.favorited,
      dashboards: dashboards?.length ? dashboards.map(d => d.dashboardId) : undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.insightId = this.resource.attrId;
    this.insightShortId = this.resource.attrShortId;
    this.insightCreatedAt = this.resource.attrCreatedAt;

    for (const dashboard of dashboards ?? []) registerDashboardInsight(dashboard, this);
  }
}
