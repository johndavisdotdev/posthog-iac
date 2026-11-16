import { IResource, RemovalPolicy, Resource, SecretValue } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { CfnTable, CfnTablePropsFormat } from './table.generated';
import type { IProject } from '../organizations/project';
import { secretRef } from '../private/data-warehouse';
import { validateLength, validatePattern } from '../private/helpers';

/**
 * File format of a self-managed table's files.
 */
export enum TableFormat {
  /** CSV without a header row. */
  CSV = 'CSV',
  /** CSV with a header row. */
  CSV_WITH_NAMES = 'CSVWithNames',
  /** Apache Parquet. */
  PARQUET = 'Parquet',
  /** Newline-delimited JSON. */
  JSON_EACH_ROW = 'JSONEachRow',
  /** Delta Lake. */
  DELTA = 'Delta',
  /** Delta Lake through PostHog's S3 wrapper. */
  DELTA_S3_WRAPPER = 'DeltaS3Wrapper',
}

/**
 * Access key for the bucket a table's files live in.
 */
export interface TableCredential {
  /** Access key ID (an AWS access key ID, a Google Cloud HMAC key, ...). */
  readonly accessKeyId: SecretValue;
  /** Secret for the access key. */
  readonly secretAccessKey: SecretValue;
}

/**
 * A PostHog self-managed data warehouse table.
 */
export interface ITable extends IResource {
  /**
   * The PostHog table ID.
   * @attribute
   */
  readonly tableId: string;

  /**
   * The name the table is queried by in HogQL.
   * @attribute
   */
  readonly tableName: string;

  /** The project the table belongs to. */
  readonly project: IProject;
}

/**
 * Attributes of an existing table.
 */
export interface TableAttributes {
  /** The project the table belongs to. */
  readonly project: IProject;
  /** The PostHog table ID. */
  readonly tableId: string;
  /** The name the table is queried by in HogQL. */
  readonly tableName: string;
}

/**
 * Options for creating a table in a project (`project.addTable()`).
 */
export interface TableOptions {
  /**
   * Name the table is queried by in HogQL. Starts with a letter or underscore;
   * letters, numbers and underscores only.
   */
  readonly name: string;

  /** File format of the files. Every matched file must share it. */
  readonly format: TableFormat;

  /**
   * HTTPS URL of the files, with `*` matching any part of a path segment,
   * e.g. `https://my-bucket.s3.eu-west-1.amazonaws.com/orders/*.parquet`.
   * @default - built from `bucket` and `prefix`
   */
  readonly url?: string;

  /**
   * Bucket the files live in. The URL becomes
   * `https://<bucket regional domain>/<prefix>`.
   * @default - use `url`
   */
  readonly bucket?: s3.IBucket;

  /**
   * Key pattern within `bucket`, e.g. `orders/*.parquet`. Only with `bucket`.
   * @default '*'
   */
  readonly prefix?: string;

  /**
   * Access key for the bucket. Sent write-only, as dynamic references.
   */
  readonly credential: TableCredential;

  /**
   * For CSV files that quote fields with doubled quotes.
   * @default false
   */
  readonly csvAllowDoubleQuotes?: boolean;

  /**
   * What happens to the table when it is removed from the stack. Only the
   * PostHog table definition is deleted; the files are not touched.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Table.
 */
export interface TableProps extends TableOptions {
  /** The project to create the table in. */
  readonly project: IProject;
}

/**
 * A PostHog self-managed data warehouse table: files in an S3-compatible
 * bucket that PostHog reads as one table queryable with HogQL.
 *
 * @resource PostHog::DataWarehouse::Table
 */
export class Table extends Resource implements ITable {
  /**
   * Import an existing table.
   */
  public static fromTableAttributes(scope: Construct, id: string, attrs: TableAttributes): ITable {
    class Import extends Resource implements ITable {
      public readonly tableId = attrs.tableId;
      public readonly tableName = attrs.tableName;
      public readonly project = attrs.project;
    }
    return new Import(scope, id);
  }

  public readonly tableId: string;
  public readonly tableName: string;
  public readonly project: IProject;

  /** The URL pattern PostHog reads. */
  public readonly urlPattern: string;

  /**
   * The table's name as PostHog resolves it in HogQL.
   * @attribute
   */
  public readonly tableHogqlName: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly tableCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnTable;

  constructor(scope: Construct, id: string, props: TableProps) {
    super(scope, id);
    validateLength('Table name', props.name, 1, 128);
    validatePattern('Table name', props.name, /^[A-Za-z_][A-Za-z0-9_]*$/, 'start with a letter or underscore and use only letters, numbers and underscores');
    if ((props.url === undefined) === (props.bucket === undefined)) {
      throw new Error('Table: specify exactly one of url, bucket');
    }
    if (props.prefix !== undefined && props.bucket === undefined) {
      throw new Error('Table: prefix requires bucket');
    }
    const urlPattern = props.url ?? `https://${props.bucket!.bucketRegionalDomainName}/${(props.prefix ?? '*').replace(/^\/+/, '')}`;
    validateLength('Table url', props.url, 1, 500);

    this.project = props.project;
    this.urlPattern = urlPattern;

    this.resource = new CfnTable(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      format: props.format as string as CfnTablePropsFormat,
      urlPattern,
      credential: {
        accessKey: secretRef('Table credential accessKeyId', props.credential.accessKeyId)!,
        accessSecret: secretRef('Table credential secretAccessKey', props.credential.secretAccessKey)!,
      },
      options: props.csvAllowDoubleQuotes === undefined ? undefined : { csvAllowDoubleQuotes: props.csvAllowDoubleQuotes },
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.tableId = this.resource.attrId;
    this.tableName = props.name;
    this.tableHogqlName = this.resource.attrHogqlName;
    this.tableCreatedAt = this.resource.attrCreatedAt;
  }
}
