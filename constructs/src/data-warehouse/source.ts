import { Duration, IResource, RemovalPolicy, Resource, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnSource, CfnSourcePropsAccessMethod } from './source.generated';
import type { IProject } from '../organizations/project';
import { compact, durationToChoice, renderSecrets, SOURCE_SYNC_FREQUENCIES } from '../private/data-warehouse';
import { jsonProp, uniqueOrUndefined, validateLength, validateRange } from '../private/helpers';

/**
 * How a source is connected.
 */
export enum SourceAccessMethod {
  /** Sync tables into the PostHog data warehouse. */
  WAREHOUSE = 'warehouse',
  /** Query the external system live. */
  DIRECT = 'direct',
}

/**
 * How PostHog syncs a source table.
 */
export enum SourceSyncType {
  /** Re-import the whole table on every sync. */
  FULL_REFRESH = 'full_refresh',
  /** Import rows whose incremental field advanced, updating existing rows. */
  INCREMENTAL = 'incremental',
  /** Append rows whose incremental field advanced. */
  APPEND = 'append',
}

/**
 * Type of the column used for incremental syncs.
 */
export enum IncrementalFieldType {
  /** Integer. */
  INTEGER = 'integer',
  /** Numeric. */
  NUMERIC = 'numeric',
  /** Date and time. */
  DATETIME = 'datetime',
  /** Date. */
  DATE = 'date',
  /** Timestamp. */
  TIMESTAMP = 'timestamp',
}

/**
 * A table (schema) of a source to sync. Only applied when the source is
 * created; PostHog does not manage table selection on updates.
 */
export interface SourceSchema {
  /** Name of the table in the external system, e.g. `Customer` or `orders`. */
  readonly name: string;

  /**
   * Whether to sync the table.
   * @default true
   */
  readonly shouldSync?: boolean;

  /**
   * How to sync the table.
   * @default SourceSyncType.FULL_REFRESH
   */
  readonly syncType?: SourceSyncType;

  /**
   * Column whose advancing value marks new rows. Required for incremental
   * and append syncs.
   * @default - none
   */
  readonly incrementalField?: string;

  /**
   * Type of `incrementalField`.
   * @default - none
   */
  readonly incrementalFieldType?: IncrementalFieldType;

  /**
   * How often to sync this table. One of 5 minutes, 30 minutes, 1, 6, 12 or
   * 24 hours, 7 or 30 days.
   * @default - the source's `syncFrequency`
   */
  readonly syncFrequency?: Duration;
}

/**
 * Settings for a Stripe source.
 */
export interface StripeSourceOptions {
  /** Restricted or secret Stripe API key with read access. */
  readonly secretKey: SecretValue;

  /**
   * Connected account to read from.
   * @default - the key's own account
   */
  readonly accountId?: string;
}

/**
 * Settings for a Postgres source.
 */
export interface PostgresSourceOptions {
  /** Host name. */
  readonly host: string;
  /**
   * Port.
   * @default 5432
   */
  readonly port?: number;
  /** Database name. */
  readonly database: string;
  /**
   * Schema to read tables from.
   * @default 'public'
   */
  readonly schema?: string;
  /** User to connect as. */
  readonly user: string;
  /** Password. */
  readonly password: SecretValue;
}

/**
 * Settings for a Hubspot source.
 */
export interface HubspotSourceOptions {
  /** ID of the PostHog Hubspot (OAuth) integration to read with. */
  readonly integrationId: string;
}

/**
 * The type and connection settings of a data warehouse source. Create one
 * with the static methods.
 *
 * Everything is sent in the write-only `Payload`, so secrets (`SecretValue`)
 * are rendered as dynamic references and never appear in plain text.
 * PostHog never returns the payload, so connection changes made outside
 * CloudFormation are not detected as drift.
 */
export class SourceConfig {
  /** A Stripe account. */
  public static stripe(options: StripeSourceOptions): SourceConfig {
    return new SourceConfig('Stripe', { stripe_account_id: options.accountId }, { stripe_secret_key: options.secretKey });
  }

  /** A Postgres database. */
  public static postgres(options: PostgresSourceOptions): SourceConfig {
    validateRange('Postgres source port', options.port, 1, 65535);
    return new SourceConfig('Postgres', {
      host: options.host,
      port: options.port ?? 5432,
      database: options.database,
      schema: options.schema ?? 'public',
      user: options.user,
    }, { password: options.password });
  }

  /** A Hubspot account, through a PostHog Hubspot integration. */
  public static hubspot(options: HubspotSourceOptions): SourceConfig {
    return new SourceConfig('Hubspot', { hubspot_integration_id: options.integrationId }, {});
  }

  /**
   * Any source type, with the payload as PostHog expects it.
   *
   * @param sourceType the PostHog source type, e.g. `MySQL`, `Snowflake`, `Zendesk`
   * @param payload non-secret payload fields
   * @param secrets secret payload fields, rendered as dynamic references
   */
  public static raw(sourceType: string, payload: { [key: string]: any }, secrets?: { [key: string]: SecretValue }): SourceConfig {
    return new SourceConfig(sourceType, payload, secrets ?? {});
  }

  /** The PostHog source type. Changing it replaces the source. */
  public readonly sourceType: string;

  /** @internal */
  public readonly _payload: { [key: string]: any };

  private constructor(sourceType: string, payload: Record<string, unknown>, secrets: Record<string, SecretValue | undefined>) {
    validateLength('Source type', sourceType, 1, Number.MAX_SAFE_INTEGER);
    this.sourceType = sourceType;
    this._payload = { ...compact(payload), ...renderSecrets(secrets) };
  }
}

/**
 * A PostHog data warehouse source.
 */
export interface ISource extends IResource {
  /**
   * The PostHog source ID.
   * @attribute
   */
  readonly sourceId: string;

  /** The project the source belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a source in a project (`project.addSource()`).
 */
export interface SourceOptions {
  /** The source type and connection settings. The type cannot be changed without replacement. */
  readonly config: SourceConfig;

  /**
   * Tables to sync. Applied on create only.
   * @default - every discovered table syncs with PostHog's default settings
   */
  readonly schemas?: SourceSchema[];

  /**
   * How often the tables in `schemas` sync, unless a schema sets its own.
   * One of 5 minutes, 30 minutes, 1, 6, 12 or 24 hours, 7 or 30 days.
   * Requires `schemas`.
   * @default - PostHog default (6 hours)
   */
  readonly syncFrequency?: Duration;

  /**
   * Prefix added to the table names PostHog creates in HogQL, e.g. `stripe_`.
   * @default - no prefix
   */
  readonly prefix?: string;

  /**
   * Description.
   * @default - none
   */
  readonly description?: string;

  /**
   * Import into the warehouse or query live. Changing it replaces the source.
   * @default SourceAccessMethod.WAREHOUSE
   */
  readonly accessMethod?: SourceAccessMethod;

  /**
   * Also allow live queries against a synced source.
   * @default false
   */
  readonly directQueryEnabled?: boolean;

  /**
   * Start syncing tables discovered after creation automatically.
   * @default false
   */
  readonly autoSyncNewSchemas?: boolean;

  /**
   * fnmatch-style globs restricting which new tables auto-sync, e.g. `raw_*`.
   * @default - every new table
   */
  readonly autoSyncSchemaPatterns?: string[];

  /**
   * What happens to the source when it is removed from the stack. PostHog
   * hard-deletes the source and the tables it synced (they can be synced
   * again from the external system).
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Source.
 */
export interface SourceProps extends SourceOptions {
  /** The project to create the source in. */
  readonly project: IProject;
}

/**
 * A PostHog data warehouse source: a connection to an external system
 * (Stripe, Postgres, Hubspot, ...) whose tables PostHog syncs into the data
 * warehouse or queries live.
 *
 * @resource PostHog::DataWarehouse::Source
 */
export class Source extends Resource implements ISource {
  /**
   * Import an existing source by its PostHog ID.
   */
  public static fromSourceId(scope: Construct, id: string, project: IProject, sourceId: string): ISource {
    class Import extends Resource implements ISource {
      public readonly sourceId = sourceId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly sourceId: string;
  public readonly project: IProject;

  /** The source type. */
  public readonly sourceType: string;

  /**
   * Sync status, e.g. `Running`, `Completed`, `Error`.
   * @attribute
   */
  public readonly sourceStatus: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly sourceCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSource;

  constructor(scope: Construct, id: string, props: SourceProps) {
    super(scope, id);
    validateLength('Source prefix', props.prefix, 0, 100);
    validateLength('Source description', props.description, 0, 400);
    props.autoSyncSchemaPatterns?.forEach(p => validateLength('Source autoSyncSchemaPatterns entry', p, 0, 250));
    if (props.syncFrequency && !props.schemas?.length) {
      throw new Error('Source syncFrequency requires schemas: PostHog sets sync frequency per table');
    }

    this.project = props.project;
    this.sourceType = props.config.sourceType;

    const payload: Record<string, unknown> = { ...props.config._payload };
    if (props.schemas?.length) {
      payload.schemas = props.schemas.map(s => renderSchema(s, props.syncFrequency));
    }

    this.resource = new CfnSource(this, 'Resource', {
      projectId: props.project.projectId,
      sourceType: props.config.sourceType,
      payload: jsonProp(this, payload)!,
      prefix: props.prefix,
      description: props.description,
      accessMethod: props.accessMethod as string as CfnSourcePropsAccessMethod | undefined,
      directQueryEnabled: props.directQueryEnabled,
      autoSyncNewSchemas: props.autoSyncNewSchemas,
      autoSyncSchemaPatterns: uniqueOrUndefined(props.autoSyncSchemaPatterns),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.sourceId = this.resource.attrId;
    this.sourceStatus = this.resource.attrStatus;
    this.sourceCreatedAt = this.resource.attrCreatedAt;
  }
}

function renderSchema(schema: SourceSchema, defaultFrequency: Duration | undefined): Record<string, unknown> {
  const syncType = schema.syncType ?? SourceSyncType.FULL_REFRESH;
  if (syncType !== SourceSyncType.FULL_REFRESH && schema.incrementalField === undefined) {
    throw new Error(`Source schema '${schema.name}': incrementalField is required for ${syncType} syncs`);
  }
  const frequency = schema.syncFrequency ?? defaultFrequency;
  return compact({
    name: schema.name,
    should_sync: schema.shouldSync ?? true,
    sync_type: syncType,
    incremental_field: schema.incrementalField,
    incremental_field_type: schema.incrementalFieldType,
    sync_frequency: frequency && durationToChoice(`Source schema '${schema.name}' syncFrequency`, frequency, SOURCE_SYNC_FREQUENCIES),
  });
}
