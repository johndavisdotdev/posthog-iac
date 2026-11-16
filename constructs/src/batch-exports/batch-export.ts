import { IResource, RemovalPolicy, Resource, SecretValue, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  CfnBatchExport,
  CfnBatchExportPropsDestinationType,
  CfnBatchExportPropsInterval,
  CfnBatchExportPropsModel,
} from './batch-export.generated';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { compact, renderSecrets, renderTimestamp } from '../private/data-warehouse';
import { renderPropertyFilters } from '../private/filters';
import { jsonProp, validateLength, validateRange } from '../private/helpers';

/**
 * How often a batch export runs.
 */
export enum BatchExportInterval {
  /** Every 5 minutes. */
  EVERY_5_MINUTES = 'every 5 minutes',
  /** Every 15 minutes. */
  EVERY_15_MINUTES = 'every 15 minutes',
  /** Every hour. */
  HOUR = 'hour',
  /** Every day (at `offsetHour` in `timezone`). */
  DAY = 'day',
  /** Every week (on `offsetDay` at `offsetHour` in `timezone`). */
  WEEK = 'week',
}

/**
 * Which PostHog data model a batch export exports.
 */
export enum BatchExportModel {
  /** Events. */
  EVENTS = 'events',
  /** Persons. */
  PERSONS = 'persons',
  /** Sessions. */
  SESSIONS = 'sessions',
}

/**
 * The kind of system a batch export writes to.
 */
export enum BatchExportDestinationType {
  /** Amazon S3. */
  S3 = 'AwsS3',
  /** Snowflake. */
  SNOWFLAKE = 'Snowflake',
  /** Postgres. */
  POSTGRES = 'Postgres',
  /** Amazon Redshift. */
  REDSHIFT = 'Redshift',
  /** Google BigQuery. */
  BIG_QUERY = 'BigQuery',
  /** Databricks. */
  DATABRICKS = 'Databricks',
  /** Azure Blob Storage. */
  AZURE_BLOB = 'AzureBlob',
  /** S3-compatible object storage (MinIO, R2, GCS interoperability, ...). */
  S3_COMPATIBLE = 'S3Compatible',
}

/**
 * File format of exported files in object storage.
 */
export enum ExportFileFormat {
  /** Newline-delimited JSON. */
  JSON_LINES = 'JSONLines',
  /** Apache Parquet. */
  PARQUET = 'Parquet',
}

/**
 * Compression of exported files in object storage.
 */
export enum ExportCompression {
  /** gzip. */
  GZIP = 'gzip',
  /** Brotli. */
  BROTLI = 'brotli',
  /** Zstandard. */
  ZSTD = 'zstd',
  /** LZ4. */
  LZ4 = 'lz4',
  /** Snappy (Parquet only). */
  SNAPPY = 'snappy',
}

/**
 * Server-side encryption PostHog requests for S3 objects.
 */
export enum S3Encryption {
  /** SSE-S3 (AES-256). */
  AES256 = 'AES256',
  /** SSE-KMS. */
  KMS = 'aws:kms',
}

/**
 * Column type Redshift batch exports use for event and person properties.
 */
export enum RedshiftPropertiesDataType {
  /** `VARCHAR(65535)`. */
  VARCHAR = 'varchar',
  /** `SUPER`. */
  SUPER = 'super',
}

/**
 * Options shared by every batch export destination.
 */
export interface BatchExportDestinationCommonOptions {
  /**
   * ID of the team-scoped PostHog integration holding the destination's
   * credentials. The recommended way to authenticate: no credentials go
   * into the template at all. PostHog may require it for some destination
   * types; credentials passed as `SecretValue` are sent as well when both
   * are set.
   * @default - none; pass the destination's `SecretValue` credentials instead
   */
  readonly integrationId?: string;

  /**
   * Only export these events.
   * @default - all events
   */
  readonly includeEvents?: string[];

  /**
   * Do not export these events.
   * @default - none excluded
   */
  readonly excludeEvents?: string[];
}

/**
 * Settings for an S3 destination.
 */
export interface S3DestinationOptions extends BatchExportDestinationCommonOptions {
  /**
   * The bucket to export to.
   * @default - use `bucketName`
   */
  readonly bucket?: s3.IBucket;

  /**
   * Name of the bucket to export to, for buckets not defined in CDK.
   * @default - the name of `bucket`
   */
  readonly bucketName?: string;

  /**
   * Region of the bucket.
   * @default - for a bucket defined in this app, its stack's region; for an
   * imported bucket, the region given to `Bucket.fromBucketAttributes`.
   * Required with `bucketName`, and for buckets imported without a region.
   */
  readonly region?: string;

  /**
   * Key prefix of exported files. May contain PostHog's `{year}`, `{month}`,
   * `{day}`, `{hour}`, `{table}` placeholders.
   * @default - the bucket root
   */
  readonly prefix?: string;

  /**
   * File format.
   * @default ExportFileFormat.JSON_LINES (PostHog default)
   */
  readonly fileFormat?: ExportFileFormat;

  /**
   * Compression.
   * @default - none
   */
  readonly compression?: ExportCompression;

  /**
   * Server-side encryption.
   * @default - the bucket's default encryption
   */
  readonly encryption?: S3Encryption;

  /**
   * KMS key ID for `S3Encryption.KMS`.
   * @default - the AWS managed key
   */
  readonly kmsKeyId?: string;

  /**
   * Maximum size of each exported file, in MB. Larger batches are split.
   * @default - no limit
   */
  readonly maxFileSizeMb?: number;

  /**
   * AWS access key ID, sent in the write-only secret config.
   * @default - none; use `integrationId`
   */
  readonly accessKeyId?: SecretValue;

  /**
   * AWS secret access key, sent in the write-only secret config.
   * @default - none; use `integrationId`
   */
  readonly secretAccessKey?: SecretValue;
}

/**
 * Settings for a Snowflake destination.
 */
export interface SnowflakeDestinationOptions extends BatchExportDestinationCommonOptions {
  /** Snowflake account identifier, e.g. `xy12345.eu-west-1`. */
  readonly account: string;
  /** Database to write to. */
  readonly database: string;
  /** Virtual warehouse used for loading. */
  readonly warehouse: string;
  /** Schema to write to. */
  readonly schema: string;
  /**
   * Table to write to.
   * @default - PostHog's default table name for the model
   */
  readonly tableName?: string;
  /**
   * Role to use.
   * @default - the user's default role
   */
  readonly role?: string;
  /**
   * User to authenticate as.
   * @default - none; use `integrationId`
   */
  readonly user?: string;
  /**
   * Password (password authentication).
   * @default - none
   */
  readonly password?: SecretValue;
  /**
   * PEM private key (key-pair authentication).
   * @default - none
   */
  readonly privateKey?: SecretValue;
  /**
   * Passphrase of `privateKey`.
   * @default - unencrypted key
   */
  readonly privateKeyPassphrase?: SecretValue;
}

/**
 * Settings for a Postgres destination.
 */
export interface PostgresDestinationOptions extends BatchExportDestinationCommonOptions {
  /**
   * Host name.
   * @default - none; use `integrationId`
   */
  readonly host?: string;
  /**
   * Port.
   * @default 5432
   */
  readonly port?: number;
  /** Database to write to. */
  readonly database: string;
  /**
   * Schema to write to.
   * @default 'public'
   */
  readonly schema?: string;
  /** Table to write to. */
  readonly tableName: string;
  /**
   * User to authenticate as.
   * @default - none; use `integrationId`
   */
  readonly user?: string;
  /**
   * Password.
   * @default - none; use `integrationId`
   */
  readonly password?: SecretValue;
  /**
   * Accept a self-signed server certificate.
   * @default false
   */
  readonly hasSelfSignedCert?: boolean;
}

/**
 * Settings for a Redshift destination.
 */
export interface RedshiftDestinationOptions extends PostgresDestinationOptions {
  /**
   * Column type for properties.
   * @default RedshiftPropertiesDataType.VARCHAR
   */
  readonly propertiesDataType?: RedshiftPropertiesDataType;
}

/**
 * Settings for a BigQuery destination.
 */
export interface BigQueryDestinationOptions extends BatchExportDestinationCommonOptions {
  /** Google Cloud project ID. */
  readonly projectId: string;
  /** Dataset to write to. */
  readonly datasetId: string;
  /**
   * Table to write to.
   * @default - PostHog's default table name for the model
   */
  readonly tableId?: string;
  /**
   * Store properties as BigQuery `JSON` rather than `STRING`.
   * @default false
   */
  readonly useJsonType?: boolean;
  /**
   * Service account e-mail.
   * @default - none; use `integrationId`
   */
  readonly clientEmail?: string;
  /**
   * Service account token URI.
   * @default 'https://oauth2.googleapis.com/token'
   */
  readonly tokenUri?: string;
  /**
   * Service account private key ID.
   * @default - none; use `integrationId`
   */
  readonly privateKeyId?: SecretValue;
  /**
   * Service account PEM private key.
   * @default - none; use `integrationId`
   */
  readonly privateKey?: SecretValue;
}

/**
 * Settings for a Databricks destination.
 */
export interface DatabricksDestinationOptions extends BatchExportDestinationCommonOptions {
  /** Workspace host name, e.g. `dbc-1234.cloud.databricks.com`. */
  readonly serverHostname: string;
  /** HTTP path of the SQL warehouse. */
  readonly httpPath: string;
  /** Unity Catalog catalog. */
  readonly catalog: string;
  /** Schema to write to. */
  readonly schema: string;
  /** Table to write to. */
  readonly tableName: string;
  /**
   * Store properties as `VARIANT`.
   * @default - PostHog default
   */
  readonly useVariantType?: boolean;
  /**
   * Add new columns to the table automatically.
   * @default - PostHog default
   */
  readonly useAutomaticSchemaEvolution?: boolean;
  /**
   * OAuth client ID of the service principal.
   * @default - none; use `integrationId`
   */
  readonly clientId?: string;
  /**
   * OAuth client secret of the service principal.
   * @default - none; use `integrationId`
   */
  readonly clientSecret?: SecretValue;
}

/**
 * Settings for an Azure Blob Storage destination.
 */
export interface AzureBlobDestinationOptions extends BatchExportDestinationCommonOptions {
  /** Container to export to. */
  readonly containerName: string;
  /**
   * Blob name prefix.
   * @default - the container root
   */
  readonly prefix?: string;
  /**
   * File format.
   * @default - PostHog default
   */
  readonly fileFormat?: ExportFileFormat;
  /**
   * Compression.
   * @default - none
   */
  readonly compression?: ExportCompression;
  /**
   * Storage account connection string.
   * @default - none; use `integrationId`
   */
  readonly connectionString?: SecretValue;
}

/**
 * Where a batch export writes. Create one with the static methods.
 *
 * Non-secret settings are rendered into `DestinationConfig`; credentials
 * (`SecretValue`) into the write-only `DestinationSecretConfig` as dynamic
 * references, so they never appear in the template. The destination type
 * cannot be changed after the batch export is created: changing it fails
 * the update, so replace the construct (give it a new ID) instead.
 */
export class BatchExportDestination {
  /** Export to Amazon S3. */
  public static s3(options: S3DestinationOptions): BatchExportDestination {
    if ((options.bucket === undefined) === (options.bucketName === undefined)) {
      throw new Error('S3 destination: specify exactly one of bucket, bucketName');
    }
    const region = options.region ?? bucketRegion(options.bucket);
    if (region === undefined) {
      throw new Error(options.bucket
        ? 'S3 destination: the bucket is imported without a region, so its region is unknown; set region'
        : 'S3 destination: region is required with bucketName');
    }
    validateRange('S3 destination maxFileSizeMb', options.maxFileSizeMb, 1, Number.MAX_SAFE_INTEGER);
    return new BatchExportDestination(BatchExportDestinationType.S3, options, {
      bucket_name: options.bucket?.bucketName ?? options.bucketName,
      region,
      prefix: options.prefix,
      file_format: options.fileFormat,
      compression: options.compression,
      encryption: options.encryption,
      kms_key_id: options.kmsKeyId,
      max_file_size_mb: options.maxFileSizeMb,
    }, {
      aws_access_key_id: options.accessKeyId,
      aws_secret_access_key: options.secretAccessKey,
    });
  }

  /** Export to Snowflake. */
  public static snowflake(options: SnowflakeDestinationOptions): BatchExportDestination {
    if (options.password !== undefined && options.privateKey !== undefined) {
      throw new Error('Snowflake destination: specify at most one of password, privateKey');
    }
    let authenticationType: string | undefined;
    if (options.password) authenticationType = 'password';
    if (options.privateKey) authenticationType = 'keypair';
    return new BatchExportDestination(BatchExportDestinationType.SNOWFLAKE, options, {
      account: options.account,
      database: options.database,
      warehouse: options.warehouse,
      schema: options.schema,
      table_name: options.tableName,
      role: options.role,
      user: options.user,
      authentication_type: authenticationType,
    }, {
      password: options.password,
      private_key: options.privateKey,
      private_key_passphrase: options.privateKeyPassphrase,
    });
  }

  /** Export to Postgres. */
  public static postgres(options: PostgresDestinationOptions): BatchExportDestination {
    return new BatchExportDestination(BatchExportDestinationType.POSTGRES, options, postgresConfig(options), { password: options.password });
  }

  /** Export to Amazon Redshift. */
  public static redshift(options: RedshiftDestinationOptions): BatchExportDestination {
    return new BatchExportDestination(BatchExportDestinationType.REDSHIFT, options, {
      ...postgresConfig(options),
      properties_data_type: options.propertiesDataType,
    }, { password: options.password });
  }

  /** Export to Google BigQuery. */
  public static bigQuery(options: BigQueryDestinationOptions): BatchExportDestination {
    return new BatchExportDestination(BatchExportDestinationType.BIG_QUERY, options, {
      project_id: options.projectId,
      dataset_id: options.datasetId,
      table_id: options.tableId,
      use_json_type: options.useJsonType,
      client_email: options.clientEmail,
      token_uri: options.tokenUri,
    }, {
      private_key_id: options.privateKeyId,
      private_key: options.privateKey,
    });
  }

  /** Export to Databricks. */
  public static databricks(options: DatabricksDestinationOptions): BatchExportDestination {
    return new BatchExportDestination(BatchExportDestinationType.DATABRICKS, options, {
      server_hostname: options.serverHostname,
      http_path: options.httpPath,
      catalog: options.catalog,
      schema: options.schema,
      table_name: options.tableName,
      use_variant_type: options.useVariantType,
      use_automatic_schema_evolution: options.useAutomaticSchemaEvolution,
      client_id: options.clientId,
    }, { client_secret: options.clientSecret });
  }

  /** Export to Azure Blob Storage. */
  public static azureBlob(options: AzureBlobDestinationOptions): BatchExportDestination {
    return new BatchExportDestination(BatchExportDestinationType.AZURE_BLOB, options, {
      container_name: options.containerName,
      prefix: options.prefix,
      file_format: options.fileFormat,
      compression: options.compression,
    }, { connection_string: options.connectionString });
  }

  /**
   * Any destination, with the config as PostHog expects it. Escape hatch for
   * settings the typed methods do not cover.
   *
   * @param type the destination type
   * @param config non-secret settings (`DestinationConfig`)
   * @param secrets credential fields, rendered as dynamic references into the write-only `DestinationSecretConfig`
   * @param integrationId ID of the PostHog integration holding the credentials
   */
  public static raw(
    type: BatchExportDestinationType,
    config: { [key: string]: any },
    secrets?: { [key: string]: SecretValue },
    integrationId?: string,
  ): BatchExportDestination {
    return new BatchExportDestination(type, { integrationId }, config, secrets ?? {}, false);
  }

  /** The destination type. Create-only. */
  public readonly destinationType: BatchExportDestinationType;

  /**
   * ID of the PostHog integration holding the credentials.
   * @default - none
   */
  public readonly integrationId?: string;

  /** @internal */
  public readonly _config: { [key: string]: any };

  /** @internal */
  public readonly _secretConfig?: { [key: string]: string };

  private constructor(
    type: BatchExportDestinationType,
    common: BatchExportDestinationCommonOptions,
    config: Record<string, unknown>,
    secrets: Record<string, SecretValue | undefined>,
    requireCredentials = true,
  ) {
    this.destinationType = type;
    this.integrationId = common.integrationId;
    this._config = compact({
      ...config,
      include_events: common.includeEvents?.length ? common.includeEvents : undefined,
      exclude_events: common.excludeEvents?.length ? common.excludeEvents : undefined,
    });
    this._secretConfig = renderSecrets(secrets);
    if (requireCredentials && this.integrationId === undefined && this._secretConfig === undefined) {
      throw new Error(`${type} destination: specify integrationId or the destination's SecretValue credentials`);
    }
  }
}

function postgresConfig(options: PostgresDestinationOptions): Record<string, unknown> {
  validateRange('Postgres destination port', options.port, 1, 65535);
  return {
    host: options.host,
    port: options.port,
    database: options.database,
    schema: options.schema,
    table_name: options.tableName,
    user: options.user,
    has_self_signed_cert: options.hasSelfSignedCert,
  };
}

/**
 * A PostHog batch export.
 */
export interface IBatchExport extends IResource {
  /**
   * The PostHog batch export ID.
   * @attribute
   */
  readonly batchExportId: string;

  /** The project the batch export belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a batch export in a project (`project.addBatchExport()`).
 */
export interface BatchExportOptions {
  /** Human-readable name of the batch export. */
  readonly name: string;

  /**
   * Where to export to. The destination type cannot be changed after
   * creation; switching it fails the update, so replace the construct instead.
   */
  readonly destination: BatchExportDestination;

  /** How often the export runs. */
  readonly interval: BatchExportInterval;

  /**
   * Which data model to export.
   * @default BatchExportModel.EVENTS
   */
  readonly model?: BatchExportModel;

  /**
   * Whether the export is paused.
   * @default false
   */
  readonly paused?: boolean;

  /**
   * Only export events matching these property filters (types `event`,
   * `person` or `hogql`).
   * @default - all events
   */
  readonly filters?: PropertyFilter[];

  /**
   * IANA timezone for daily and weekly interval boundaries, e.g. `Europe/London`.
   * @default 'UTC'
   */
  readonly timezone?: string;

  /**
   * Day of week (0 = Sunday … 6 = Saturday) weekly exports run on.
   * @default 0
   */
  readonly offsetDay?: number;

  /**
   * Hour of day (0-23) daily and weekly exports run at.
   * @default 0
   */
  readonly offsetHour?: number;

  /**
   * No runs before this time.
   * @default - start immediately
   */
  readonly startAt?: Date | string;

  /**
   * No runs after this time.
   * @default - run indefinitely
   */
  readonly endAt?: Date | string;

  /**
   * What happens to the PostHog batch export when it is removed from the
   * stack. PostHog hard-deletes the export configuration; already exported
   * data is not touched.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a BatchExport.
 */
export interface BatchExportProps extends BatchExportOptions {
  /** The project to create the batch export in. */
  readonly project: IProject;
}

/**
 * A PostHog batch export: a scheduled export of events, persons or sessions
 * to S3, Snowflake, BigQuery, Postgres, Redshift, Databricks or Azure Blob
 * Storage.
 *
 * @resource PostHog::BatchExports::BatchExport
 */
export class BatchExport extends Resource implements IBatchExport {
  /**
   * Import an existing batch export by its PostHog ID.
   */
  public static fromBatchExportId(scope: Construct, id: string, project: IProject, batchExportId: string): IBatchExport {
    class Import extends Resource implements IBatchExport {
      public readonly batchExportId = batchExportId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly batchExportId: string;
  public readonly project: IProject;

  /** The destination type. */
  public readonly destinationType: BatchExportDestinationType;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly batchExportCreatedAt: string;

  /**
   * ISO 8601 last update timestamp.
   * @attribute
   */
  public readonly batchExportLastUpdatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnBatchExport;

  constructor(scope: Construct, id: string, props: BatchExportProps) {
    super(scope, id);
    validateLength('BatchExport name', props.name, 1, Number.MAX_SAFE_INTEGER);
    validateRange('BatchExport offsetDay', props.offsetDay, 0, 6);
    validateRange('BatchExport offsetHour', props.offsetHour, 0, 23);

    this.project = props.project;
    const destination = props.destination;
    this.destinationType = destination.destinationType;

    this.resource = new CfnBatchExport(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      model: props.model as string as CfnBatchExportPropsModel | undefined,
      interval: props.interval as string as CfnBatchExportPropsInterval,
      paused: props.paused,
      destinationType: destination.destinationType as string as CfnBatchExportPropsDestinationType,
      destinationIntegrationId: destination.integrationId,
      destinationConfig: jsonProp(this, destination._config)!,
      destinationSecretConfig: jsonProp(this, destination._secretConfig),
      filters: jsonProp(this, renderPropertyFilters(props.filters)),
      timezone: props.timezone,
      offsetDay: props.offsetDay,
      offsetHour: props.offsetHour,
      startAt: renderTimestamp(props.startAt),
      endAt: renderTimestamp(props.endAt),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.batchExportId = this.resource.attrId;
    this.batchExportCreatedAt = this.resource.attrCreatedAt;
    this.batchExportLastUpdatedAt = this.resource.attrLastUpdatedAt;
  }
}

/**
 * The bucket's region when it is known: the stack region for a bucket defined
 * in this app, or the region an imported bucket was given. An imported bucket
 * without one reports its importing stack's region, which may be wrong, so
 * that case returns undefined.
 */
function bucketRegion(bucket: s3.IBucket | undefined): string | undefined {
  if (!bucket) return undefined;
  if (Resource.isOwnedResource(bucket)) return bucket.env.region;
  return bucket.env.region !== Stack.of(bucket).region ? bucket.env.region : undefined;
}
