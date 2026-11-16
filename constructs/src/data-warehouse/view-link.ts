import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import type { ISavedQuery } from './saved-query';
import type { ITable } from './table';
import { CfnViewLink } from './view-link.generated';
import type { IProject } from '../organizations/project';
import { compact } from '../private/data-warehouse';
import { jsonProp, validateLength } from '../private/helpers';

/**
 * A table or view taking part in a join. Create one with the static methods.
 */
export class JoinTable {
  /**
   * A table by its HogQL name, e.g. `events`, `persons` or a source table
   * such as `stripe_customer`.
   */
  public static named(name: string): JoinTable {
    return new JoinTable(name);
  }

  /** A self-managed table. The join is created after it. */
  public static table(table: ITable): JoinTable {
    return new JoinTable(table.tableName, table);
  }

  /** A saved query (view). The join is created after it. */
  public static savedQuery(savedQuery: ISavedQuery): JoinTable {
    return new JoinTable(savedQuery.savedQueryName, savedQuery);
  }

  /** The table's HogQL name. */
  public readonly name: string;

  /** @internal */
  public readonly _dependency?: IConstruct;

  private constructor(name: string, dependency?: IConstruct) {
    this.name = name;
    this._dependency = dependency;
  }
}

/**
 * One side of a join: a table and the column or HogQL expression used as
 * the join key.
 */
export interface JoinSide {
  /** The table. */
  readonly table: JoinTable;
  /** Column or HogQL expression used as the join key, e.g. `distinct_id`. */
  readonly key: string;
}

/**
 * Optional join settings.
 */
export interface ViewLinkConfiguration {
  /**
   * Optimize the join for experiment analysis.
   * @default false
   */
  readonly experimentsOptimized?: boolean;

  /**
   * Timestamp column of the joining table used by experiment analysis.
   * @default - none
   */
  readonly experimentsTimestampKey?: string;

  /**
   * Additional configuration keys as PostHog stores them. Merged over the
   * typed settings.
   * @default - none
   */
  readonly rawConfiguration?: { [key: string]: any };
}

/**
 * A PostHog data warehouse join (view link).
 */
export interface IViewLink extends IResource {
  /**
   * The PostHog join ID.
   * @attribute
   */
  readonly viewLinkId: string;

  /** The project the join belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a join in a project (`project.addViewLink()`).
 */
export interface ViewLinkOptions {
  /** The table the join starts from, and its key. */
  readonly source: JoinSide;

  /** The table or view joined onto the source table, and its key. */
  readonly joining: JoinSide;

  /**
   * Accessor added to the source table to reach the joined rows, e.g.
   * `stripe_customer` in `persons.stripe_customer`.
   */
  readonly fieldName: string;

  /**
   * Join settings.
   * @default - none
   */
  readonly configuration?: ViewLinkConfiguration;

  /**
   * What happens to the join when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a ViewLink.
 */
export interface ViewLinkProps extends ViewLinkOptions {
  /** The project to create the join in. */
  readonly project: IProject;
}

/**
 * A PostHog data warehouse join (view link): joins a table or view onto a
 * source table so its rows are reachable through a field, e.g.
 * `persons.stripe_customer`.
 *
 * @resource PostHog::DataWarehouse::ViewLink
 */
export class ViewLink extends Resource implements IViewLink {
  /**
   * Import an existing join by its PostHog ID.
   */
  public static fromViewLinkId(scope: Construct, id: string, project: IProject, viewLinkId: string): IViewLink {
    class Import extends Resource implements IViewLink {
      public readonly viewLinkId = viewLinkId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly viewLinkId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly viewLinkCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnViewLink;

  constructor(scope: Construct, id: string, props: ViewLinkProps) {
    super(scope, id);
    validateLength('ViewLink source table name', props.source.table.name, 1, 400);
    validateLength('ViewLink source key', props.source.key, 1, 400);
    validateLength('ViewLink joining table name', props.joining.table.name, 1, 400);
    validateLength('ViewLink joining key', props.joining.key, 1, 400);
    validateLength('ViewLink fieldName', props.fieldName, 1, 400);

    this.project = props.project;

    this.resource = new CfnViewLink(this, 'Resource', {
      projectId: props.project.projectId,
      sourceTableName: props.source.table.name,
      sourceTableKey: props.source.key,
      joiningTableName: props.joining.table.name,
      joiningTableKey: props.joining.key,
      fieldName: props.fieldName,
      configuration: jsonProp(this, renderConfiguration(props.configuration)),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
    for (const side of [props.source, props.joining]) {
      if (side.table._dependency) this.node.addDependency(side.table._dependency);
    }

    this.viewLinkId = this.resource.attrId;
    this.viewLinkCreatedAt = this.resource.attrCreatedAt;
  }
}

function renderConfiguration(config: ViewLinkConfiguration | undefined): Record<string, unknown> | undefined {
  if (!config) return undefined;
  const rendered = {
    ...compact({
      experiments_optimized: config.experimentsOptimized,
      experiments_timestamp_key: config.experimentsTimestampKey,
    }),
    ...config.rawConfiguration,
  };
  return Object.keys(rendered).length ? rendered : undefined;
}
