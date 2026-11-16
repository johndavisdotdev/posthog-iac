import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnSavedQuery, CfnSavedQueryIncremental, CfnSavedQueryPropsSyncFrequency } from './saved-query.generated';
import type { IProject } from '../organizations/project';
import { durationToChoice, SAVED_QUERY_SYNC_FREQUENCIES } from '../private/data-warehouse';
import { jsonProp, validateLength } from '../private/helpers';

/**
 * Incremental materialization: update the materialized table in place
 * instead of rebuilding it.
 */
export interface SavedQueryIncremental {
  /**
   * Output column whose advancing value marks rows as new. Each run reads
   * only rows at or after the last run's highest value.
   */
  readonly incrementalKey: string;

  /**
   * Output columns identifying a row. Must include every GROUP BY column.
   */
  readonly uniqueKey: string[];

  /**
   * How far before the last run's high point to re-read, to pick up
   * late-arriving data. Only applies to date/time incremental keys.
   * @default - no lookback
   */
  readonly lookback?: Duration;

  /**
   * Whether incremental runs are enabled.
   * @default true
   */
  readonly enabled?: boolean;
}

/**
 * A PostHog data warehouse saved query (view).
 */
export interface ISavedQuery extends IResource {
  /**
   * The PostHog saved query ID.
   * @attribute
   */
  readonly savedQueryId: string;

  /**
   * The view name, used as the table name in HogQL.
   * @attribute
   */
  readonly savedQueryName: string;

  /** The project the saved query belongs to. */
  readonly project: IProject;
}

/**
 * Attributes of an existing saved query.
 */
export interface SavedQueryAttributes {
  /** The project the saved query belongs to. */
  readonly project: IProject;
  /** The PostHog saved query ID. */
  readonly savedQueryId: string;
  /** The view name. */
  readonly savedQueryName: string;
}

/**
 * Options for creating a saved query in a project (`project.addSavedQuery()`).
 */
export interface SavedQueryOptions {
  /** Unique view name, used as the table name in HogQL. */
  readonly name: string;

  /**
   * The HogQL SELECT statement, e.g.
   * `SELECT event, count() AS cnt FROM events GROUP BY event`.
   */
  readonly hogql: string;

  /**
   * What one row is, what the view includes or leaves out, and when to use it.
   * @default - none
   */
  readonly description?: string;

  /**
   * How often to materialize the view: 15 or 30 minutes, 1, 6, 12 or 24
   * hours, 7 or 30 days.
   * @default - not materialized on a schedule
   */
  readonly syncFrequency?: Duration;

  /**
   * Pause scheduled materialization (PostHog's `never` frequency). Cannot be
   * combined with `syncFrequency`.
   * @default false
   */
  readonly materializationPaused?: boolean;

  /**
   * Update the materialized table incrementally.
   * @default - rebuild the whole table on every run
   */
  readonly incremental?: SavedQueryIncremental;

  /**
   * Folder ID used to organize the view in the SQL editor.
   * @default - none
   */
  readonly folderId?: string;

  /**
   * Allow updates that remove columns used by downstream views. Without it,
   * PostHog refuses such updates.
   * @default false
   */
  readonly acknowledgeBreakingChanges?: boolean;

  /**
   * What happens to the view when it is removed from the stack. Its
   * materialized data can be recomputed.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a SavedQuery.
 */
export interface SavedQueryProps extends SavedQueryOptions {
  /** The project to create the saved query in. */
  readonly project: IProject;
}

/**
 * A PostHog data warehouse saved query (view): a named HogQL query that can
 * be queried like a table and optionally materialized on a schedule.
 *
 * @resource PostHog::DataWarehouse::SavedQuery
 */
export class SavedQuery extends Resource implements ISavedQuery {
  /**
   * Import an existing saved query.
   */
  public static fromSavedQueryAttributes(scope: Construct, id: string, attrs: SavedQueryAttributes): ISavedQuery {
    class Import extends Resource implements ISavedQuery {
      public readonly savedQueryId = attrs.savedQueryId;
      public readonly savedQueryName = attrs.savedQueryName;
      public readonly project = attrs.project;
    }
    return new Import(scope, id);
  }

  public readonly savedQueryId: string;
  public readonly savedQueryName: string;
  public readonly project: IProject;

  /**
   * Materialization status.
   * @attribute
   */
  public readonly savedQueryStatus: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly savedQueryCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSavedQuery;

  constructor(scope: Construct, id: string, props: SavedQueryProps) {
    super(scope, id);
    validateLength('SavedQuery name', props.name, 1, 128);
    validateLength('SavedQuery hogql', props.hogql, 1, Number.MAX_SAFE_INTEGER);
    if (props.syncFrequency && props.materializationPaused) {
      throw new Error('SavedQuery: specify at most one of syncFrequency, materializationPaused');
    }
    let syncFrequency: string | undefined;
    if (props.syncFrequency) syncFrequency = durationToChoice('SavedQuery syncFrequency', props.syncFrequency, SAVED_QUERY_SYNC_FREQUENCIES);
    if (props.materializationPaused) syncFrequency = 'never';

    this.project = props.project;

    this.resource = new CfnSavedQuery(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      query: jsonProp(this, { kind: 'HogQLQuery', query: props.hogql })!,
      description: props.description,
      syncFrequency: syncFrequency as CfnSavedQueryPropsSyncFrequency | undefined,
      incremental: renderIncremental(props.incremental),
      folderId: props.folderId,
      acknowledgeBreakingChanges: props.acknowledgeBreakingChanges,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.savedQueryId = this.resource.attrId;
    this.savedQueryName = props.name;
    this.savedQueryStatus = this.resource.attrStatus;
    this.savedQueryCreatedAt = this.resource.attrCreatedAt;
  }
}

function renderIncremental(incremental: SavedQueryIncremental | undefined): CfnSavedQueryIncremental | undefined {
  if (!incremental) return undefined;
  if (incremental.uniqueKey.length === 0) {
    throw new Error('SavedQuery incremental.uniqueKey must name at least one column');
  }
  return {
    enabled: incremental.enabled ?? true,
    incrementalKey: incremental.incrementalKey,
    uniqueKey: incremental.uniqueKey,
    lookbackSeconds: incremental.lookback?.toSeconds(),
  };
}
