import * as fs from 'fs';
import * as path from 'path';
import { ArnFormat, CfnResource, Duration, IResolvable, IResolveContext, Stack } from 'aws-cdk-lib';
import { CfnResourceDefaultVersion, CfnResourceVersion } from 'aws-cdk-lib/aws-cloudformation';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { AwsCustomResource, AwsCustomResourcePolicy, Logging, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct, DependencyGroup, IConstruct, IDependable } from 'constructs';
import { HANDLER_WRITABLE_SECRET_TAG } from '../private/helpers';

const CFN_RESOURCES_PRINCIPAL = 'resources.cloudformation.amazonaws.com';

/**
 * The repository root (`posthog-iac/`), where `make package` leaves each
 * handler package at `<dir>/<dir>.zip`. Resolves the same from `src/patterns`
 * (tests) and `lib/patterns` (compiled).
 */
const DEFAULT_PACKAGE_DIRECTORY = path.resolve(__dirname, '..', '..', '..');

/** Every PostHogResourceType instance, filled by its constructor. Must precede the class. */
const TYPE_REGISTRY: PostHogResourceType[] = [];

/**
 * A PostHog CloudFormation resource type (`PostHog::Service::Resource`) that
 * `PostHogResourceTypes` can register.
 *
 * The catalog mirrors `docs/resources.json` and the schemas in the
 * `posthog-*` resource type projects: the type name, the project directory
 * (which is also the name of the handler package `<packageName>.zip` that
 * `cfn submit --dry-run` produces) and the IAM actions the type's handlers
 * need.
 */
export class PostHogResourceType {
  /** `PostHog::Organizations::Project` */
  public static readonly ORGANIZATIONS_PROJECT = new PostHogResourceType('PostHog::Organizations::Project', 'posthog-organizations-project');
  /** `PostHog::Organizations::Domain` */
  public static readonly ORGANIZATIONS_DOMAIN = new PostHogResourceType('PostHog::Organizations::Domain', 'posthog-organizations-domain');
  /** `PostHog::Organizations::Role` */
  public static readonly ORGANIZATIONS_ROLE = new PostHogResourceType('PostHog::Organizations::Role', 'posthog-organizations-role');
  /** `PostHog::Organizations::RoleMembership` */
  public static readonly ORGANIZATIONS_ROLE_MEMBERSHIP = new PostHogResourceType('PostHog::Organizations::RoleMembership', 'posthog-organizations-rolemembership');
  /** `PostHog::Organizations::ProxyRecord` */
  public static readonly ORGANIZATIONS_PROXY_RECORD = new PostHogResourceType('PostHog::Organizations::ProxyRecord', 'posthog-organizations-proxyrecord');
  /** `PostHog::Organizations::IdentityProviderConfig` (writes the value to Secrets Manager) */
  public static readonly ORGANIZATIONS_IDENTITY_PROVIDER_CONFIG = new PostHogResourceType('PostHog::Organizations::IdentityProviderConfig', 'posthog-organizations-identityproviderconfig', ['secretsmanager:PutSecretValue']);
  /** `PostHog::Projects::SecretApiKey` (writes the value to Secrets Manager) */
  public static readonly PROJECTS_SECRET_API_KEY = new PostHogResourceType('PostHog::Projects::SecretApiKey', 'posthog-projects-secretapikey', ['secretsmanager:PutSecretValue']);
  /** `PostHog::Projects::ApprovalPolicy` */
  public static readonly PROJECTS_APPROVAL_POLICY = new PostHogResourceType('PostHog::Projects::ApprovalPolicy', 'posthog-projects-approvalpolicy');
  /** `PostHog::ProductAnalytics::Action` */
  public static readonly PRODUCT_ANALYTICS_ACTION = new PostHogResourceType('PostHog::ProductAnalytics::Action', 'posthog-productanalytics-action');
  /** `PostHog::ProductAnalytics::Annotation` */
  public static readonly PRODUCT_ANALYTICS_ANNOTATION = new PostHogResourceType('PostHog::ProductAnalytics::Annotation', 'posthog-productanalytics-annotation');
  /** `PostHog::ProductAnalytics::Cohort` */
  public static readonly PRODUCT_ANALYTICS_COHORT = new PostHogResourceType('PostHog::ProductAnalytics::Cohort', 'posthog-productanalytics-cohort');
  /** `PostHog::ProductAnalytics::Dashboard` */
  public static readonly PRODUCT_ANALYTICS_DASHBOARD = new PostHogResourceType('PostHog::ProductAnalytics::Dashboard', 'posthog-productanalytics-dashboard');
  /** `PostHog::ProductAnalytics::DashboardTemplate` */
  public static readonly PRODUCT_ANALYTICS_DASHBOARD_TEMPLATE = new PostHogResourceType('PostHog::ProductAnalytics::DashboardTemplate', 'posthog-productanalytics-dashboardtemplate');
  /** `PostHog::ProductAnalytics::Insight` */
  public static readonly PRODUCT_ANALYTICS_INSIGHT = new PostHogResourceType('PostHog::ProductAnalytics::Insight', 'posthog-productanalytics-insight');
  /** `PostHog::ProductAnalytics::InsightVariable` */
  public static readonly PRODUCT_ANALYTICS_INSIGHT_VARIABLE = new PostHogResourceType('PostHog::ProductAnalytics::InsightVariable', 'posthog-productanalytics-insightvariable');
  /** `PostHog::ProductAnalytics::Alert` */
  public static readonly PRODUCT_ANALYTICS_ALERT = new PostHogResourceType('PostHog::ProductAnalytics::Alert', 'posthog-productanalytics-alert');
  /** `PostHog::ProductAnalytics::Subscription` */
  public static readonly PRODUCT_ANALYTICS_SUBSCRIPTION = new PostHogResourceType('PostHog::ProductAnalytics::Subscription', 'posthog-productanalytics-subscription');
  /** `PostHog::ProductAnalytics::EventDefinition` */
  public static readonly PRODUCT_ANALYTICS_EVENT_DEFINITION = new PostHogResourceType('PostHog::ProductAnalytics::EventDefinition', 'posthog-productanalytics-eventdefinition');
  /** `PostHog::ProductAnalytics::SchemaPropertyGroup` */
  public static readonly PRODUCT_ANALYTICS_SCHEMA_PROPERTY_GROUP = new PostHogResourceType('PostHog::ProductAnalytics::SchemaPropertyGroup', 'posthog-productanalytics-schemapropertygroup');
  /** `PostHog::ProductAnalytics::DataColorTheme` */
  public static readonly PRODUCT_ANALYTICS_DATA_COLOR_THEME = new PostHogResourceType('PostHog::ProductAnalytics::DataColorTheme', 'posthog-productanalytics-datacolortheme');
  /** `PostHog::SessionReplay::Playlist` */
  public static readonly SESSION_REPLAY_PLAYLIST = new PostHogResourceType('PostHog::SessionReplay::Playlist', 'posthog-sessionreplay-playlist');
  /** `PostHog::FeatureFlags::FeatureFlag` */
  public static readonly FEATURE_FLAGS_FEATURE_FLAG = new PostHogResourceType('PostHog::FeatureFlags::FeatureFlag', 'posthog-featureflags-featureflag');
  /** `PostHog::FeatureFlags::EarlyAccessFeature` */
  public static readonly FEATURE_FLAGS_EARLY_ACCESS_FEATURE = new PostHogResourceType('PostHog::FeatureFlags::EarlyAccessFeature', 'posthog-featureflags-earlyaccessfeature');
  /** `PostHog::FeatureFlags::ScheduledChange` */
  public static readonly FEATURE_FLAGS_SCHEDULED_CHANGE = new PostHogResourceType('PostHog::FeatureFlags::ScheduledChange', 'posthog-featureflags-scheduledchange');
  /** `PostHog::Experiments::Experiment` */
  public static readonly EXPERIMENTS_EXPERIMENT = new PostHogResourceType('PostHog::Experiments::Experiment', 'posthog-experiments-experiment');
  /** `PostHog::Experiments::Holdout` */
  public static readonly EXPERIMENTS_HOLDOUT = new PostHogResourceType('PostHog::Experiments::Holdout', 'posthog-experiments-holdout');
  /** `PostHog::Experiments::SavedMetric` */
  public static readonly EXPERIMENTS_SAVED_METRIC = new PostHogResourceType('PostHog::Experiments::SavedMetric', 'posthog-experiments-savedmetric');
  /** `PostHog::Experiments::WebExperiment` */
  public static readonly EXPERIMENTS_WEB_EXPERIMENT = new PostHogResourceType('PostHog::Experiments::WebExperiment', 'posthog-experiments-webexperiment');
  /** `PostHog::Surveys::Survey` */
  public static readonly SURVEYS_SURVEY = new PostHogResourceType('PostHog::Surveys::Survey', 'posthog-surveys-survey');
  /** `PostHog::Surveys::ProductTour` */
  public static readonly SURVEYS_PRODUCT_TOUR = new PostHogResourceType('PostHog::Surveys::ProductTour', 'posthog-surveys-producttour');
  /** `PostHog::CDP::HogFunction` */
  public static readonly CDP_HOG_FUNCTION = new PostHogResourceType('PostHog::CDP::HogFunction', 'posthog-cdp-hogfunction');
  /** `PostHog::Workflows::HogFlow` */
  public static readonly WORKFLOWS_HOG_FLOW = new PostHogResourceType('PostHog::Workflows::HogFlow', 'posthog-workflows-hogflow');
  /** `PostHog::Workflows::MessageTemplate` */
  public static readonly WORKFLOWS_MESSAGE_TEMPLATE = new PostHogResourceType('PostHog::Workflows::MessageTemplate', 'posthog-workflows-messagetemplate');
  /** `PostHog::Workflows::MessageCategory` */
  public static readonly WORKFLOWS_MESSAGE_CATEGORY = new PostHogResourceType('PostHog::Workflows::MessageCategory', 'posthog-workflows-messagecategory');
  /** `PostHog::BatchExports::BatchExport` */
  public static readonly BATCH_EXPORTS_BATCH_EXPORT = new PostHogResourceType('PostHog::BatchExports::BatchExport', 'posthog-batchexports-batchexport');
  /** `PostHog::DataWarehouse::Source` */
  public static readonly DATA_WAREHOUSE_SOURCE = new PostHogResourceType('PostHog::DataWarehouse::Source', 'posthog-datawarehouse-source');
  /** `PostHog::DataWarehouse::SavedQuery` */
  public static readonly DATA_WAREHOUSE_SAVED_QUERY = new PostHogResourceType('PostHog::DataWarehouse::SavedQuery', 'posthog-datawarehouse-savedquery');
  /** `PostHog::DataWarehouse::Table` */
  public static readonly DATA_WAREHOUSE_TABLE = new PostHogResourceType('PostHog::DataWarehouse::Table', 'posthog-datawarehouse-table');
  /** `PostHog::DataWarehouse::ViewLink` */
  public static readonly DATA_WAREHOUSE_VIEW_LINK = new PostHogResourceType('PostHog::DataWarehouse::ViewLink', 'posthog-datawarehouse-viewlink');
  /** `PostHog::DataWarehouse::Endpoint` */
  public static readonly DATA_WAREHOUSE_ENDPOINT = new PostHogResourceType('PostHog::DataWarehouse::Endpoint', 'posthog-datawarehouse-endpoint');
  /** `PostHog::ErrorTracking::AssignmentRule` */
  public static readonly ERROR_TRACKING_ASSIGNMENT_RULE = new PostHogResourceType('PostHog::ErrorTracking::AssignmentRule', 'posthog-errortracking-assignmentrule');
  /** `PostHog::ErrorTracking::GroupingRule` */
  public static readonly ERROR_TRACKING_GROUPING_RULE = new PostHogResourceType('PostHog::ErrorTracking::GroupingRule', 'posthog-errortracking-groupingrule');
  /** `PostHog::ErrorTracking::SuppressionRule` */
  public static readonly ERROR_TRACKING_SUPPRESSION_RULE = new PostHogResourceType('PostHog::ErrorTracking::SuppressionRule', 'posthog-errortracking-suppressionrule');
  /** `PostHog::ErrorTracking::Alert` */
  public static readonly ERROR_TRACKING_ALERT = new PostHogResourceType('PostHog::ErrorTracking::Alert', 'posthog-errortracking-alert');
  /** `PostHog::Logs::Alert` */
  public static readonly LOGS_ALERT = new PostHogResourceType('PostHog::Logs::Alert', 'posthog-logs-alert');
  /** `PostHog::Logs::RetentionRule` */
  public static readonly LOGS_RETENTION_RULE = new PostHogResourceType('PostHog::Logs::RetentionRule', 'posthog-logs-retentionrule');
  /** `PostHog::Logs::SamplingRule` */
  public static readonly LOGS_SAMPLING_RULE = new PostHogResourceType('PostHog::Logs::SamplingRule', 'posthog-logs-samplingrule');
  /** `PostHog::LLMAnalytics::Evaluation` */
  public static readonly LLM_ANALYTICS_EVALUATION = new PostHogResourceType('PostHog::LLMAnalytics::Evaluation', 'posthog-llmanalytics-evaluation');
  /** `PostHog::LLMAnalytics::ProviderKey` */
  public static readonly LLM_ANALYTICS_PROVIDER_KEY = new PostHogResourceType('PostHog::LLMAnalytics::ProviderKey', 'posthog-llmanalytics-providerkey');

  /**
   * Every PostHog resource type, in catalog order.
   */
  public static all(): PostHogResourceType[] {
    return [...TYPE_REGISTRY];
  }

  /**
   * Look up a type by its CloudFormation type name, e.g. `PostHog::FeatureFlags::FeatureFlag`.
   */
  public static fromTypeName(typeName: string): PostHogResourceType {
    const found = TYPE_REGISTRY.find(t => t.typeName === typeName);
    if (!found) {
      throw new Error(`Unknown PostHog resource type '${typeName}'`);
    }
    return found;
  }

  /** The CloudFormation type name, e.g. `PostHog::FeatureFlags::FeatureFlag`. */
  public readonly typeName: string;

  /**
   * The resource type project directory, e.g. `posthog-featureflags-featureflag`
   * (the `dir` field of `docs/resources.json`). The handler package is
   * `<packageName>.zip`.
   */
  public readonly packageName: string;

  /**
   * The IAM actions the type's handlers need (the union of the schema's
   * `handlers.*.permissions`), granted to its execution role.
   */
  public readonly handlerPermissions: string[];

  private constructor(typeName: string, packageName: string, handlerPermissions: string[] = []) {
    this.typeName = typeName;
    this.packageName = packageName;
    this.handlerPermissions = handlerPermissions;
    TYPE_REGISTRY.push(this);
  }
}

/**
 * The handler package for one resource type.
 */
export interface PostHogHandlerPackage {
  /** The resource type. */
  readonly type: PostHogResourceType;
  /** Path to the type's handler package zip (`cfn submit --dry-run` output). */
  readonly path: string;
}

/**
 * Options shared by `PostHogResourceTypes` and `PostHogResourceTypeRegistration`.
 */
export interface PostHogResourceTypeConfigOptions {
  /**
   * The Secrets Manager secret holding the PostHog personal API key
   * (`phx_...`). It is passed to the type configuration as a dynamic
   * reference (`{{resolve:secretsmanager:...}}`) that CloudFormation resolves
   * each time it runs a handler, so the key never appears in a template.
   */
  readonly apiKeySecret: secretsmanager.ISecret;

  /**
   * The JSON key holding the API key, when the secret is a JSON object.
   * @default - the whole secret string is the API key
   */
  readonly apiKeySecretJsonField?: string;

  /**
   * The PostHog API host: `https://eu.posthog.com` for PostHog Cloud EU, or
   * your instance URL when self-hosting.
   * @default - PostHog Cloud US (https://us.posthog.com)
   */
  readonly baseUrl?: string;

  /**
   * Log group for handler logs.
   * @default - a new log group per type
   */
  readonly logGroup?: logs.ILogGroup;

  /**
   * Retention for the log groups this construct creates. Ignored when
   * `logGroup` is set.
   * @default logs.RetentionDays.ONE_MONTH
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * ARNs (wildcards allowed) of the Secrets Manager secrets the handlers may
   * write one-time values into (project secret API keys, SCIM tokens).
   *
   * @default - only secrets tagged `posthog-cdk:handler-writable=true` in this
   * account and region. Secrets auto-created by this library's L2s carry the
   * tag; tag your own secrets, or list them here.
   */
  readonly handlerSecretArns?: string[];
}

/**
 * Properties for a `PostHogResourceTypeRegistration`.
 */
export interface PostHogResourceTypeRegistrationProps extends PostHogResourceTypeConfigOptions {
  /** The resource type to register. */
  readonly type: PostHogResourceType;

  /** Path to the type's handler package zip. Must exist at synth time. */
  readonly handlerPackagePath: string;

  /**
   * Role CloudFormation assumes to deliver handler logs and metrics.
   * @default - a new role for this type
   */
  readonly loggingRole?: iam.IRole;
}

/**
 * Registers one PostHog resource type privately in this account and region:
 * uploads its handler package, creates its execution role, registers a
 * version (`AWS::CloudFormation::ResourceVersion`), makes it the default
 * version and sets its type configuration (API key and base URL).
 *
 * Usually created by `PostHogResourceTypes`.
 */
export class PostHogResourceTypeRegistration extends Construct {
  /** The registered type. */
  public readonly type: PostHogResourceType;
  /** The type ARN (without version). */
  public readonly typeArn: string;
  /** The ARN of the registered type version. */
  public readonly versionArn: string;
  /** The handler package asset. */
  public readonly handlerPackage: s3assets.Asset;
  /** The role CloudFormation assumes to run the type's handlers. */
  public readonly executionRole: iam.Role;
  /** The role CloudFormation assumes to deliver handler logs and metrics. */
  public readonly loggingRole: iam.IRole;
  /** The log group receiving handler logs. */
  public readonly logGroup: logs.ILogGroup;
  /** The registered version. */
  public readonly resourceVersion: CfnResourceVersion;
  /** The default version setting. */
  public readonly defaultVersion: CfnResourceDefaultVersion;
  /** The custom resource that calls `SetTypeConfiguration`. */
  public readonly typeConfiguration: AwsCustomResource;
  /** Completes once the type is registered, made default and configured. */
  public readonly ready: IDependable;

  constructor(scope: Construct, id: string, props: PostHogResourceTypeRegistrationProps) {
    super(scope, id);
    const type = props.type;
    this.type = type;
    const stack = Stack.of(this);

    if (!fs.existsSync(props.handlerPackagePath) || !fs.statSync(props.handlerPackagePath).isFile()) {
      throw new Error(`Handler package for ${type.typeName} not found at ${props.handlerPackagePath}. Run \`make package\` (cfn submit --dry-run) first.`);
    }
    this.handlerPackage = new s3assets.Asset(this, 'HandlerPackage', { path: props.handlerPackagePath });

    // Same trust as the resource-role.yaml that `cfn` generates.
    this.executionRole = new iam.Role(this, 'ExecutionRole', {
      description: `Execution role for the ${type.typeName} resource type handlers`,
      maxSessionDuration: Duration.seconds(8400),
      assumedBy: new iam.ServicePrincipal(CFN_RESOURCES_PRINCIPAL).withConditions({
        StringEquals: { 'aws:SourceAccount': stack.account },
        StringLike: { 'aws:SourceArn': `arn:${stack.partition}:cloudformation:${stack.region}:${stack.account}:type/resource/${arnName(type)}/*` },
      }),
      inlinePolicies: {
        ResourceTypePolicy: new iam.PolicyDocument({
          statements: type.handlerPermissions.length > 0
            ? handlerStatements(stack, type.handlerPermissions, props.handlerSecretArns)
            : [new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: ['*'], resources: ['*'] })],
        }),
      },
    });

    this.logGroup = props.logGroup ?? new logs.LogGroup(this, 'LogGroup', {
      retention: props.logRetention ?? logs.RetentionDays.ONE_MONTH,
    });
    this.loggingRole = props.loggingRole ?? newLoggingRole(this, 'LoggingRole', arnName(type));
    grantLogDelivery(this.loggingRole, this.logGroup);

    this.resourceVersion = new CfnResourceVersion(this, 'Version', {
      typeName: type.typeName,
      schemaHandlerPackage: this.handlerPackage.s3ObjectUrl,
      executionRoleArn: this.executionRole.roleArn,
      loggingConfig: {
        logGroupName: this.logGroup.logGroupName,
        logRoleArn: this.loggingRole.roleArn,
      },
    });
    // Log delivery permissions must exist before CloudFormation starts using the role.
    this.resourceVersion.node.addDependency(this.loggingRole);
    this.versionArn = this.resourceVersion.attrArn;

    this.defaultVersion = new CfnResourceDefaultVersion(this, 'DefaultVersion', {
      typeVersionArn: this.resourceVersion.attrArn,
    });
    this.typeArn = this.defaultVersion.attrArn;

    this.typeConfiguration = setTypeConfiguration(this, 'Configuration', this.typeArn, props);
    this.typeConfiguration.node.addDependency(this.defaultVersion);

    const ready = new DependencyGroup();
    ready.add(this.defaultVersion, this.typeConfiguration);
    this.ready = ready;
  }
}

/**
 * Properties for `PostHogResourceTypes`.
 */
export interface PostHogResourceTypesProps extends PostHogResourceTypeConfigOptions {
  /**
   * Directory containing the handler packages. For each type the construct
   * looks for `<dir>/<packageName>.zip`, then `<dir>/<packageName>/<packageName>.zip`,
   * so both a flat directory of zips and the repository root (after
   * `make package`) work.
   *
   * @default - the `posthog-iac` repository root this library is built in
   * (`<root>/<packageName>/<packageName>.zip`, as left by `make package`)
   */
  readonly handlerPackageDirectory?: string;

  /**
   * Explicit handler package paths, overriding `handlerPackageDirectory` for
   * the listed types.
   * @default - none
   */
  readonly handlerPackages?: PostHogHandlerPackage[];

  /**
   * The types to register.
   * @default PostHogResourceType.all()
   */
  readonly types?: PostHogResourceType[];
}

/**
 * Registers the PostHog CloudFormation resource types (`PostHog::*`)
 * privately in the deploying account and region, replacing `cfn submit` and
 * `aws cloudformation set-type-configuration`.
 *
 * For each type it uploads the handler package, creates the execution role,
 * a log group and logging role, registers a version, makes it the default and
 * sets the type configuration through a custom resource. The API key is
 * passed as a Secrets Manager dynamic reference
 * (`{{resolve:secretsmanager:...}}`) that CloudFormation resolves each time
 * it runs a handler, so the key never appears in the template or the type
 * configuration.
 *
 * **Consumers must deploy after this construct.** CloudFormation only knows a
 * `PostHog::*` type once it is registered, so any construct (or whole stack)
 * that uses PostHog resources must depend on it: call
 * `registration.addDependent(constructOrStack)`, or add a dependency on
 * `registration.ready`. Ideally keep this construct in its own stack.
 *
 * Handler packages must exist at synth time (`make package` at the
 * repository root). First-time registration takes several minutes per type.
 */
export class PostHogResourceTypes extends Construct {
  /** The registered types. */
  public readonly types: PostHogResourceType[];

  /** Completes once every selected type is registered, made default and configured. */
  public readonly ready: IDependable;

  /** The role CloudFormation assumes to deliver handler logs and metrics, shared by all types. */
  public readonly loggingRole: iam.Role;

  private readonly registrations = new Map<string, PostHogResourceTypeRegistration>();

  constructor(scope: Construct, id: string, props: PostHogResourceTypesProps) {
    super(scope, id);

    const selected = props.types ?? PostHogResourceType.all();
    if (selected.length === 0) {
      throw new Error('PostHogResourceTypes: types must not be empty');
    }
    this.types = [...new Set(selected)];

    const overrides = new Map<string, string>();
    for (const p of props.handlerPackages ?? []) {
      overrides.set(p.type.typeName, p.path);
    }
    const directory = props.handlerPackageDirectory ?? DEFAULT_PACKAGE_DIRECTORY;

    this.loggingRole = newLoggingRole(this, 'LoggingRole', 'PostHog-*');

    const ready = new DependencyGroup();
    for (const type of this.types) {
      const registration = new PostHogResourceTypeRegistration(this, constructId(type), {
        type,
        handlerPackagePath: overrides.get(type.typeName) ?? resolvePackagePath(type, directory),
        apiKeySecret: props.apiKeySecret,
        apiKeySecretJsonField: props.apiKeySecretJsonField,
        baseUrl: props.baseUrl,
        logGroup: props.logGroup,
        logRetention: props.logRetention,
        handlerSecretArns: props.handlerSecretArns,
        loggingRole: this.loggingRole,
      });
      this.registrations.set(type.typeName, registration);
      ready.add(registration.ready);
    }
    this.ready = ready;
  }

  /**
   * Make `dependent` (a construct or a stack) deploy after every type is
   * registered and configured.
   */
  public addDependent(dependent: IConstruct): void {
    dependent.node.addDependency(this.ready);
  }

  /** The registration of a selected type. Throws if the type was not selected. */
  public registration(type: PostHogResourceType): PostHogResourceTypeRegistration {
    const r = this.registrations.get(type.typeName);
    if (!r) {
      throw new Error(`${type.typeName} is not registered by this construct; add it to 'types'`);
    }
    return r;
  }

  /** The type ARN of a selected type. */
  public typeArn(type: PostHogResourceType): string {
    return this.registration(type).typeArn;
  }

  /** The ARN of the registered version of a selected type. */
  public versionArn(type: PostHogResourceType): string {
    return this.registration(type).versionArn;
  }
}

/** The type name with `::` replaced by `-`, as used in type ARNs. */
function arnName(type: PostHogResourceType): string {
  return type.typeName.replace(/::/g, '-');
}

/** A construct ID derived from the type name, e.g. `FeatureFlagsFeatureFlag`. */
function constructId(type: PostHogResourceType): string {
  return type.typeName.split('::').slice(1).join('');
}

function resolvePackagePath(type: PostHogResourceType, directory: string): string {
  const candidates = [
    path.join(directory, `${type.packageName}.zip`),
    path.join(directory, type.packageName, `${type.packageName}.zip`),
  ];
  const found = candidates.find(c => fs.existsSync(c));
  if (!found) {
    throw new Error(`Handler package for ${type.typeName} not found; looked for ${candidates.join(' and ')}. Run \`make package\` (cfn submit --dry-run) first, or set handlerPackageDirectory.`);
  }
  return found;
}

function newLoggingRole(scope: Construct, id: string, arnNamePattern: string): iam.Role {
  const stack = Stack.of(scope);
  const role = new iam.Role(scope, id, {
    description: 'Delivers PostHog resource type handler logs and metrics',
    assumedBy: new iam.ServicePrincipal(CFN_RESOURCES_PRINCIPAL).withConditions({
      StringEquals: { 'aws:SourceAccount': stack.account },
      StringLike: { 'aws:SourceArn': `arn:${stack.partition}:cloudformation:${stack.region}:${stack.account}:type/resource/${arnNamePattern}/*` },
    }),
  });
  role.addToPrincipalPolicy(new iam.PolicyStatement({
    actions: ['cloudwatch:PutMetricData'],
    resources: ['*'],
    conditions: { StringLike: { 'cloudwatch:namespace': 'AWS/CloudFormation/PostHog/*' } },
  }));
  role.addToPrincipalPolicy(new iam.PolicyStatement({
    actions: ['logs:DescribeLogGroups'],
    resources: [stack.formatArn({ service: 'logs', resource: 'log-group', resourceName: '*', arnFormat: ArnFormat.COLON_RESOURCE_NAME })],
  }));
  return role;
}

/**
 * Least-privilege statements for a type's handler permissions. Secrets Manager
 * actions are limited to the configured secret ARNs, or to secrets carrying
 * the handler-writable tag in this account and region.
 */
function handlerStatements(stack: Stack, actions: string[], secretArns: string[] | undefined): iam.PolicyStatement[] {
  const secretActions = actions.filter(a => a.startsWith('secretsmanager:'));
  const otherActions = actions.filter(a => !a.startsWith('secretsmanager:'));
  const statements: iam.PolicyStatement[] = [];
  if (secretActions.length > 0) {
    if (secretArns && secretArns.length > 0) {
      statements.push(new iam.PolicyStatement({ actions: secretActions, resources: [...secretArns] }));
    } else {
      statements.push(new iam.PolicyStatement({
        actions: secretActions,
        resources: [stack.formatArn({ service: 'secretsmanager', resource: 'secret', resourceName: '*', arnFormat: ArnFormat.COLON_RESOURCE_NAME })],
        conditions: { StringEquals: { [`secretsmanager:ResourceTag/${HANDLER_WRITABLE_SECRET_TAG}`]: 'true' } },
      }));
    }
  }
  if (otherActions.length > 0) {
    // No PostHog type needs non-Secrets Manager actions today; scope them when one does.
    statements.push(new iam.PolicyStatement({ actions: otherActions, resources: ['*'] }));
  }
  return statements;
}

function grantLogDelivery(role: iam.IRole, logGroup: logs.ILogGroup): void {
  role.addToPrincipalPolicy(new iam.PolicyStatement({
    actions: ['logs:CreateLogStream', 'logs:DescribeLogStreams', 'logs:PutLogEvents'],
    resources: [logGroup.logGroupArn],
  }));
}

/** CloudFormation would resolve a dynamic reference anywhere in the template. */
const DYNAMIC_REFERENCE_START = /\{\{resolve:/g;
/** `{{` as JSON escapes: decoded by the custom resource handler's JSON.parse. */
const ESCAPED_DYNAMIC_REFERENCE_START = '\\u007b\\u007bresolve:';

function escapeDynamicReferences(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(DYNAMIC_REFERENCE_START, ESCAPED_DYNAMIC_REFERENCE_START);
  if (Array.isArray(value)) return value.map(escapeDynamicReferences);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, escapeDynamicReferences(v)]));
  }
  return value;
}

/** The `{{resolve:secretsmanager:...}}` dynamic reference for the API key. */
function apiKeyReference(options: PostHogResourceTypeConfigOptions): string {
  const value = options.apiKeySecretJsonField !== undefined
    ? options.apiKeySecret.secretValueFromJson(options.apiKeySecretJsonField)
    : options.apiKeySecret.secretValue;
  return value.unsafeUnwrap();
}

function setTypeConfiguration(scope: Construct, id: string, typeArn: string, options: PostHogResourceTypeConfigOptions): AwsCustomResource {
  const stack = Stack.of(scope);
  const configuration = stack.toJsonString({
    ApiKey: apiKeyReference(options),
    BaseUrl: options.baseUrl,
  });
  const call = {
    service: 'CloudFormation',
    action: 'SetTypeConfiguration',
    parameters: { TypeArn: typeArn, Type: 'RESOURCE', Configuration: configuration },
    physicalResourceId: PhysicalResourceId.fromResponse('ConfigurationArn'),
  };

  const cr = new AwsCustomResource(scope, id, {
    resourceType: 'Custom::PostHogTypeConfiguration',
    onUpdate: { ...call, logging: Logging.withDataHidden() },
    // SetTypeConfiguration has no resource-level permissions.
    policy: AwsCustomResourcePolicy.fromStatements([new iam.PolicyStatement({
      actions: ['cloudformation:SetTypeConfiguration'],
      resources: ['*'],
    })]),
    installLatestAwsSdk: false,
  });

  // The configuration must reach SetTypeConfiguration with the dynamic
  // reference intact, as with `aws cloudformation set-type-configuration`, so
  // CloudFormation resolves it at handler run time. Left as is,
  // CloudFormation would resolve it in the custom resource properties,
  // putting the key in the stored configuration and the handler logs. So the
  // serialized call is rendered with `{{` as JSON escapes, which the
  // handler's JSON.parse turns back into `{{`. This mirrors how
  // AwsCustomResource serializes calls.
  const serialized = stack.toJsonString({ ...call, logApiResponseData: false });
  const escaped: IResolvable = {
    creationStack: [],
    resolve: (ctx: IResolveContext) => escapeDynamicReferences(ctx.resolve(serialized)),
  };
  const cfn = cr.node.findChild('Resource').node.defaultChild as CfnResource;
  cfn.addPropertyOverride('Create', escaped);
  cfn.addPropertyOverride('Update', escaped);
  return cr;
}
