import { Duration, RemovalPolicy, SecretValue, Token } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import {
  BatchExport,
  BatchExportDestination,
  BatchExportInterval,
  BatchExportModel,
  ExportCompression,
  ExportFileFormat,
  S3Encryption,
} from '../batch-exports/batch-export';
import { Table, TableFormat } from '../data-warehouse/table';
import type { IProject } from '../organizations/project';
import { validateRange } from '../private/helpers';

/**
 * Options for reading the exported files back into PostHog as a data
 * warehouse table.
 */
export interface S3BatchExportReadBackOptions {
  /**
   * Name the table is queried by in HogQL. Starts with a letter or underscore;
   * letters, numbers and underscores only.
   */
  readonly tableName: string;

  /**
   * What happens to the PostHog table definition when it is removed from the
   * stack. The files are not touched.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an S3BatchExport.
 */
export interface S3BatchExportProps {
  /** The project to export from. */
  readonly project: IProject;

  /**
   * Human-readable name of the batch export.
   * @default 'S3 export'
   */
  readonly name?: string;

  /**
   * Which data model to export.
   * @default BatchExportModel.EVENTS
   */
  readonly model?: BatchExportModel;

  /**
   * How often the export runs.
   * @default BatchExportInterval.HOUR
   */
  readonly interval?: BatchExportInterval;

  /**
   * Whether the export is paused.
   * @default false
   */
  readonly paused?: boolean;

  /**
   * An existing bucket to export to. Its settings are left alone; only the
   * IAM user's permissions are scoped to it.
   * @default - a new bucket (S3-managed or KMS encryption, public access
   * blocked, SSL enforced, retained on stack deletion)
   */
  readonly bucket?: s3.IBucket;

  /**
   * Key prefix of the exported files. May contain PostHog's `{year}`,
   * `{month}`, `{day}`, `{hour}`, `{table}` placeholders; IAM permissions
   * are scoped to the literal part before the first placeholder. With
   * `readBack`, it must be empty or end with `/`.
   * @default 'posthog/'
   */
  readonly prefix?: string;

  /**
   * Region of the bucket.
   * @default - see `S3DestinationOptions.region`
   */
  readonly region?: string;

  /**
   * File format of the exported files.
   * @default ExportFileFormat.JSON_LINES (PostHog default)
   */
  readonly fileFormat?: ExportFileFormat;

  /**
   * Compression of the exported files.
   * @default - none
   */
  readonly compression?: ExportCompression;

  /**
   * KMS key for SSE-KMS. A created bucket is encrypted with it by default; for
   * an existing bucket the export requests SSE-KMS with it. The IAM user is
   * allowed to use the key.
   * @default - the existing bucket's `encryptionKey`, otherwise SSE-S3
   */
  readonly encryptionKey?: kms.IKey;

  /**
   * Delete exported files (under the prefix) this long after they are
   * written. Only for a created bucket.
   * @default - files are kept forever
   */
  readonly expiration?: Duration;

  /**
   * What happens to a created bucket when it is removed from the stack.
   * The bucket holds the exported data, so it is retained by default.
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * Serial number of the access keys. Increase it to rotate them: CDK then
   * creates new access keys and new credential secrets (with new ARNs, so the
   * batch export and table are updated with the new credentials), and deletes
   * the old ones once the PostHog resources are updated.
   * @default 0
   */
  readonly keySerial?: number;

  /**
   * Read the exported files back into PostHog as a data warehouse table, with
   * a separate read-only access key.
   * @default - no table
   */
  readonly readBack?: S3BatchExportReadBackOptions;
}

/**
 * A PostHog batch export to S3, with the AWS side wired up: the bucket, a
 * least-privilege IAM user, its access key in a Secrets Manager secret, and
 * optionally a data warehouse table that reads the files back.
 *
 * Nobody copies credentials by hand. The batch export receives the access
 * key only as `{{resolve:secretsmanager:...}}` dynamic references to the
 * secret, which CloudFormation resolves at deploy time, so the secret access
 * key never appears in the PostHog resource's properties. The secret itself
 * is created from the `AWS::IAM::AccessKey`'s `SecretAccessKey` attribute
 * (the standard CDK pattern): the key never appears in plain text in the
 * template, but anyone who can read the stack's resources through
 * CloudFormation or read the secret can obtain it.
 *
 * Permissions of the writer user: `s3:PutObject` (which also authorizes
 * `CreateMultipartUpload`, `UploadPart` and `CompleteMultipartUpload`),
 * `s3:AbortMultipartUpload` and `s3:ListMultipartUploadParts` on
 * `bucket/prefix*`. PostHog's S3 export only writes; it does not list or
 * read the bucket, so `s3:ListBucket` and `s3:GetObject` are not granted.
 * With a KMS key it also gets `kms:GenerateDataKey`, `kms:Encrypt` and
 * `kms:Decrypt` (S3 needs `kms:Decrypt` to complete multipart uploads).
 *
 * With `readBack`, a second user with `s3:GetObject` on `bucket/prefix*`
 * and `s3:ListBucket` restricted to the prefix (plus `kms:Decrypt`) gets its
 * own access key and secret for the table.
 *
 * **Key rotation:** increase `keySerial` and deploy. That creates new
 * access keys, stores them in new secrets and updates the batch export (and
 * table) to reference them; CloudFormation deletes the old keys and secrets
 * when the update completes. Updating the existing secret in place would not
 * work: the dynamic references in the PostHog resources would be unchanged,
 * so CloudFormation would not send the new credentials to PostHog.
 */
export class S3BatchExport extends Construct {
  /** The bucket the files are exported to. */
  public readonly bucket: s3.IBucket;

  /** The IAM user PostHog writes as. */
  public readonly user: iam.User;

  /** The policy granting `user` its permissions. */
  public readonly policy: iam.Policy;

  /** The secret holding `user`'s access key (`accessKeyId`, `secretAccessKey`). */
  public readonly credentialsSecret: secretsmanager.ISecret;

  /** The PostHog batch export. */
  public readonly batchExport: BatchExport;

  /**
   * The PostHog table reading the files back.
   * @default - none, without `readBack`
   */
  public readonly table?: Table;

  /**
   * The read-only IAM user the table reads as.
   * @default - none, without `readBack`
   */
  public readonly readerUser?: iam.User;

  /**
   * The secret holding `readerUser`'s access key.
   * @default - none, without `readBack`
   */
  public readonly readerCredentialsSecret?: secretsmanager.ISecret;

  /** The key prefix of the exported files. */
  public readonly prefix: string;

  constructor(scope: Construct, id: string, props: S3BatchExportProps) {
    super(scope, id);
    const serial = props.keySerial ?? 0;
    validateRange('S3BatchExport keySerial', serial, 0, Number.MAX_SAFE_INTEGER);
    if (!Token.isUnresolved(serial) && !Number.isInteger(serial)) {
      throw new Error(`S3BatchExport keySerial must be an integer, got ${serial}`);
    }
    if (props.bucket && props.expiration !== undefined) {
      throw new Error('S3BatchExport: expiration is only supported for a created bucket');
    }
    if (props.bucket && props.removalPolicy !== undefined) {
      throw new Error('S3BatchExport: removalPolicy is only supported for a created bucket');
    }

    this.prefix = props.prefix ?? 'posthog/';
    if (Token.isUnresolved(this.prefix)) {
      throw new Error('S3BatchExport prefix must be a concrete string');
    }
    const literalPrefix = this.prefix.replace(/^\/+/, '').split('{')[0];
    const fileFormat = props.fileFormat ?? ExportFileFormat.JSON_LINES;
    if (props.readBack && this.prefix !== '' && !this.prefix.endsWith('/')) {
      throw new Error(`S3BatchExport: with readBack, prefix must be empty or end with '/', got '${this.prefix}'`);
    }
    const key = props.encryptionKey ?? props.bucket?.encryptionKey;

    this.bucket = props.bucket ?? new s3.Bucket(this, 'Bucket', {
      encryption: key ? s3.BucketEncryption.KMS : s3.BucketEncryption.S3_MANAGED,
      encryptionKey: key,
      bucketKeyEnabled: key ? true : undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
      lifecycleRules: [{
        prefix: literalPrefix || undefined,
        expiration: props.expiration,
        abortIncompleteMultipartUploadAfter: Duration.days(7),
      }],
    });

    const objects = this.bucket.arnForObjects(`${literalPrefix}*`);

    // Writer: what PostHog's S3 batch export needs, nothing more.
    this.user = new iam.User(this, 'User');
    this.policy = new iam.Policy(this, 'Policy', {
      users: [this.user],
      statements: [
        new iam.PolicyStatement({
          actions: ['s3:PutObject', 's3:AbortMultipartUpload', 's3:ListMultipartUploadParts'],
          resources: [objects],
        }),
        ...(key ? [new iam.PolicyStatement({
          actions: ['kms:GenerateDataKey', 'kms:Encrypt', 'kms:Decrypt'],
          resources: [key.keyArn],
        })] : []),
      ],
    });
    const writer = this.credentials('', serial, this.user, 'PostHog S3 batch export (write)');
    this.credentialsSecret = writer.secret;

    this.batchExport = new BatchExport(this, 'BatchExport', {
      project: props.project,
      name: props.name ?? 'S3 export',
      model: props.model,
      interval: props.interval ?? BatchExportInterval.HOUR,
      paused: props.paused,
      destination: BatchExportDestination.s3({
        bucket: this.bucket,
        region: props.region,
        prefix: this.prefix,
        fileFormat,
        compression: props.compression,
        encryption: key && props.bucket ? S3Encryption.KMS : undefined,
        kmsKeyId: key && props.bucket ? key.keyArn : undefined,
        accessKeyId: writer.accessKeyId,
        secretAccessKey: writer.secretAccessKey,
      }),
    });
    this.batchExport.node.addDependency(this.credentialsSecret, this.policy);

    if (props.readBack) {
      this.readerUser = new iam.User(this, 'ReaderUser');
      const readerPolicy = new iam.Policy(this, 'ReaderPolicy', {
        users: [this.readerUser],
        statements: [
          new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [objects] }),
          new iam.PolicyStatement({
            actions: ['s3:ListBucket'],
            resources: [this.bucket.bucketArn],
            conditions: { StringLike: { 's3:prefix': [`${literalPrefix}*`] } },
          }),
          ...(key ? [new iam.PolicyStatement({ actions: ['kms:Decrypt'], resources: [key.keyArn] })] : []),
        ],
      });
      const reader = this.credentials('Reader', serial, this.readerUser, 'PostHog S3 batch export (read back)');
      this.readerCredentialsSecret = reader.secret;

      this.table = new Table(this, 'Table', {
        project: props.project,
        name: props.readBack.tableName,
        format: fileFormat === ExportFileFormat.PARQUET ? TableFormat.PARQUET : TableFormat.JSON_EACH_ROW,
        bucket: this.bucket,
        prefix: readBackPattern(this.prefix, fileFormat),
        credential: { accessKeyId: reader.accessKeyId, secretAccessKey: reader.secretAccessKey },
        removalPolicy: props.readBack.removalPolicy,
      });
      this.table.node.addDependency(this.readerCredentialsSecret, readerPolicy);
    }
  }

  /**
   * Creates an access key for the user and a secret holding it, and returns
   * Secrets Manager dynamic references to the two fields.
   */
  private credentials(name: string, serial: number, user: iam.User, description: string) {
    const suffix = serial === 0 ? '' : String(serial);
    const accessKey = new iam.AccessKey(this, `${name}AccessKey`, { user, serial: serial === 0 ? undefined : serial });
    // A new logical ID per serial gives the secret a new ARN on rotation, which
    // changes the dynamic references and so updates the PostHog resources.
    const secret = new secretsmanager.Secret(this, `${name}Credentials${suffix}`, {
      description,
      secretObjectValue: {
        accessKeyId: SecretValue.unsafePlainText(accessKey.accessKeyId),
        secretAccessKey: accessKey.secretAccessKey,
      },
    });
    return {
      secret,
      accessKeyId: SecretValue.secretsManager(secret.secretArn, { jsonField: 'accessKeyId' }),
      secretAccessKey: SecretValue.secretsManager(secret.secretArn, { jsonField: 'secretAccessKey' }),
    };
  }
}

/**
 * The key pattern matching the exported files: placeholders become `*`, and
 * PostHog writes `<prefix><start>-<end>.<ext>[.<compression>]`.
 */
function readBackPattern(prefix: string, fileFormat: ExportFileFormat): string {
  const pattern = prefix.replace(/^\/+/, '').replace(/\{[^}]*\}/g, '*');
  const ext = fileFormat === ExportFileFormat.PARQUET ? 'parquet' : 'jsonl';
  return `${pattern}*.${ext}*`;
}
