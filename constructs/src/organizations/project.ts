import { Annotations, Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IOrganization } from './organization';
import {
  CfnProject,
  CfnProjectPropsBusinessModel,
  CfnProjectPropsSessionRecordingRetentionPeriod,
  CfnProjectPropsWeekStartDay,
} from './project.generated';
import { BatchExport, BatchExportOptions } from '../batch-exports/batch-export';
import { HogFunction, HogFunctionOptions, WebhookHogFunctionOptions } from '../cdp/hog-function';
import { PropertyFilter } from '../core/filters';
import { Endpoint, EndpointOptions } from '../data-warehouse/endpoint';
import { SavedQuery, SavedQueryOptions } from '../data-warehouse/saved-query';
import { Source, SourceOptions } from '../data-warehouse/source';
import { Table, TableOptions } from '../data-warehouse/table';
import { ViewLink, ViewLinkOptions } from '../data-warehouse/view-link';
import { Alert as ErrorTrackingAlert, AlertOptions as ErrorTrackingAlertOptions } from '../error-tracking/alert';
import { AssignmentRule, AssignmentRuleOptions } from '../error-tracking/assignment-rule';
import { GroupingRule, GroupingRuleOptions } from '../error-tracking/grouping-rule';
import { SuppressionRule, SuppressionRuleOptions } from '../error-tracking/suppression-rule';
import { Experiment, ExperimentOptions } from '../experiments/experiment';
import { Holdout, HoldoutOptions } from '../experiments/holdout';
import { SavedMetric, SavedMetricOptions } from '../experiments/saved-metric';
import { WebExperiment, WebExperimentOptions } from '../experiments/web-experiment';
import { EarlyAccessFeature, EarlyAccessFeatureOptions } from '../feature-flags/early-access-feature';
import { FeatureFlag, FeatureFlagOptions } from '../feature-flags/feature-flag';
import { Evaluation, EvaluationOptions, LlmJudgeEvaluationOptions } from '../llm-analytics/evaluation';
import { ProviderKey, ProviderKeyOptions } from '../llm-analytics/provider-key';
import { Alert as LogsAlert, AlertOptions as LogsAlertOptions } from '../logs/alert';
import { RetentionRule, RetentionRuleOptions } from '../logs/retention-rule';
import { SamplingRule, SamplingRuleOptions } from '../logs/sampling-rule';
import { renderPropertyFilters } from '../private/filters';
import { isConcreteNumber, jsonProp, uniqueOrUndefined, validateLength, validatePattern, validateRange } from '../private/helpers';
import { renderFraction } from '../private/organizations';
import { Action, ActionOptions } from '../product-analytics/action';
import { Annotation, AnnotationOptions } from '../product-analytics/annotation';
import { Cohort, CohortOptions } from '../product-analytics/cohort';
import { Dashboard, DashboardOptions } from '../product-analytics/dashboard';
import { DashboardTemplate, DashboardTemplateOptions } from '../product-analytics/dashboard-template';
import { DataColorTheme, DataColorThemeOptions } from '../product-analytics/data-color-theme';
import { EventDefinition, EventDefinitionOptions } from '../product-analytics/event-definition';
import { Insight, InsightOptions } from '../product-analytics/insight';
import { InsightVariable, InsightVariableOptions } from '../product-analytics/insight-variable';
import { SchemaPropertyGroup, SchemaPropertyGroupOptions } from '../product-analytics/schema-property-group';
import { ApprovalPolicy, ApprovalPolicyOptions } from '../projects/approval-policy';
import { SecretApiKey, SecretApiKeyOptions } from '../projects/secret-api-key';
import { Playlist, PlaylistOptions } from '../session-replay/playlist';
import { ProductTour, ProductTourOptions } from '../surveys/product-tour';
import { Survey, SurveyOptions } from '../surveys/survey';
import { HogFlow, HogFlowOptions } from '../workflows/hog-flow';
import { MessageCategory, MessageCategoryOptions } from '../workflows/message-category';
import { MessageTemplate, MessageTemplateOptions } from '../workflows/message-template';

/**
 * A PostHog project. Project-scoped constructs (actions, feature flags,
 * dashboards, ...) take an `IProject`.
 */
export interface IProject extends IResource {
  /**
   * The PostHog project ID.
   * @attribute
   */
  readonly projectId: string;

  /**
   * Create an action in this project.
   */
  addAction(id: string, options: ActionOptions): Action;

  /**
   * Create a project secret API key (its value is stored in Secrets Manager) in this project.
   */
  addSecretApiKey(id: string, options: SecretApiKeyOptions): SecretApiKey;

  /**
   * Create an approval policy in this project.
   */
  addApprovalPolicy(id: string, options: ApprovalPolicyOptions): ApprovalPolicy;

  /**
   * Create an annotation in this project.
   */
  addAnnotation(id: string, options: AnnotationOptions): Annotation;

  /**
   * Create a cohort in this project.
   */
  addCohort(id: string, options: CohortOptions): Cohort;

  /**
   * Create an event definition in this project.
   */
  addEventDefinition(id: string, options: EventDefinitionOptions): EventDefinition;

  /**
   * Create a schema property group in this project.
   */
  addSchemaPropertyGroup(id: string, options: SchemaPropertyGroupOptions): SchemaPropertyGroup;

  /**
   * Create a data color theme in this project.
   */
  addDataColorTheme(id: string, options: DataColorThemeOptions): DataColorTheme;

  /**
   * Create an insight in this project.
   */
  addInsight(id: string, options: InsightOptions): Insight;

  /**
   * Create a dashboard in this project.
   */
  addDashboard(id: string, options: DashboardOptions): Dashboard;

  /**
   * Create a dashboard template in this project.
   */
  addDashboardTemplate(id: string, options: DashboardTemplateOptions): DashboardTemplate;

  /**
   * Create an insight (SQL) variable in this project.
   */
  addInsightVariable(id: string, options: InsightVariableOptions): InsightVariable;

  /**
   * Create a feature flag in this project.
   */
  addFeatureFlag(id: string, options: FeatureFlagOptions): FeatureFlag;

  /**
   * Create an early access feature in this project.
   */
  addEarlyAccessFeature(id: string, options: EarlyAccessFeatureOptions): EarlyAccessFeature;

  /**
   * Create an experiment in this project.
   */
  addExperiment(id: string, options: ExperimentOptions): Experiment;

  /**
   * Create an experiment holdout in this project.
   */
  addHoldout(id: string, options: HoldoutOptions): Holdout;

  /**
   * Create a saved experiment metric in this project.
   */
  addSavedMetric(id: string, options: SavedMetricOptions): SavedMetric;

  /**
   * Create a no-code web experiment in this project.
   */
  addWebExperiment(id: string, options: WebExperimentOptions): WebExperiment;

  /**
   * Create a survey in this project.
   */
  addSurvey(id: string, options: SurveyOptions): Survey;

  /**
   * Create a product tour in this project.
   */
  addProductTour(id: string, options: ProductTourOptions): ProductTour;

  /**
   * Create a session recording playlist in this project.
   */
  addPlaylist(id: string, options: PlaylistOptions): Playlist;

  /**
   * Create a Hog function (destination, transformation or site app) in this project.
   */
  addHogFunction(id: string, options: HogFunctionOptions): HogFunction;

  /**
   * Create a webhook destination in this project.
   */
  addWebhook(id: string, options: WebhookHogFunctionOptions): HogFunction;

  /**
   * Create a workflow in this project.
   */
  addHogFlow(id: string, options: HogFlowOptions): HogFlow;

  /**
   * Create a message template in this project.
   */
  addMessageTemplate(id: string, options: MessageTemplateOptions): MessageTemplate;

  /**
   * Create a message category in this project.
   */
  addMessageCategory(id: string, options: MessageCategoryOptions): MessageCategory;

  /**
   * Create a batch export in this project.
   */
  addBatchExport(id: string, options: BatchExportOptions): BatchExport;

  /**
   * Create a data warehouse source in this project.
   */
  addWarehouseSource(id: string, options: SourceOptions): Source;

  /**
   * Create a data warehouse saved query (view) in this project.
   */
  addSavedQuery(id: string, options: SavedQueryOptions): SavedQuery;

  /**
   * Create a data warehouse table in this project.
   */
  addWarehouseTable(id: string, options: TableOptions): Table;

  /**
   * Create a data warehouse join (view link) in this project.
   */
  addViewLink(id: string, options: ViewLinkOptions): ViewLink;

  /**
   * Create a query endpoint in this project.
   */
  addEndpoint(id: string, options: EndpointOptions): Endpoint;

  /**
   * Create an error tracking assignment rule in this project.
   */
  addErrorTrackingAssignmentRule(id: string, options: AssignmentRuleOptions): AssignmentRule;

  /**
   * Create an error tracking grouping rule in this project.
   */
  addErrorTrackingGroupingRule(id: string, options: GroupingRuleOptions): GroupingRule;

  /**
   * Create an error tracking suppression rule in this project.
   */
  addErrorTrackingSuppressionRule(id: string, options?: SuppressionRuleOptions): SuppressionRule;

  /**
   * Create an error tracking alert in this project.
   */
  addErrorTrackingAlert(id: string, options: ErrorTrackingAlertOptions): ErrorTrackingAlert;

  /**
   * Create a logs alert in this project.
   */
  addLogsAlert(id: string, options: LogsAlertOptions): LogsAlert;

  /**
   * Create a logs retention rule in this project.
   */
  addLogsRetentionRule(id: string, options: RetentionRuleOptions): RetentionRule;

  /**
   * Create a logs sampling rule in this project.
   */
  addLogsSamplingRule(id: string, options: SamplingRuleOptions): SamplingRule;

  /**
   * Create an LLM provider key in this project.
   */
  addProviderKey(id: string, options: ProviderKeyOptions): ProviderKey;

  /**
   * Create an LLM evaluation in this project.
   */
  addEvaluation(id: string, options: EvaluationOptions): Evaluation;

  /**
   * Create an LLM-as-a-judge evaluation in this project.
   */
  addLlmJudgeEvaluation(id: string, options: LlmJudgeEvaluationOptions): Evaluation;
}

/**
 * Behaviour shared by created and imported projects: the `add*()` helpers
 * that create project-scoped resources.
 */
export abstract class ProjectBase extends Resource implements IProject {
  public abstract readonly projectId: string;

  public addAction(id: string, options: ActionOptions): Action {
    return new Action(this, id, { ...options, project: this });
  }

  public addSecretApiKey(id: string, options: SecretApiKeyOptions): SecretApiKey {
    return new SecretApiKey(this, id, { ...options, project: this });
  }

  public addApprovalPolicy(id: string, options: ApprovalPolicyOptions): ApprovalPolicy {
    return new ApprovalPolicy(this, id, { ...options, project: this });
  }

  public addAnnotation(id: string, options: AnnotationOptions): Annotation {
    return new Annotation(this, id, { ...options, project: this });
  }

  public addCohort(id: string, options: CohortOptions): Cohort {
    return new Cohort(this, id, { ...options, project: this });
  }

  public addEventDefinition(id: string, options: EventDefinitionOptions): EventDefinition {
    return new EventDefinition(this, id, { ...options, project: this });
  }

  public addSchemaPropertyGroup(id: string, options: SchemaPropertyGroupOptions): SchemaPropertyGroup {
    return new SchemaPropertyGroup(this, id, { ...options, project: this });
  }

  public addDataColorTheme(id: string, options: DataColorThemeOptions): DataColorTheme {
    return new DataColorTheme(this, id, { ...options, project: this });
  }

  public addInsight(id: string, options: InsightOptions): Insight {
    return new Insight(this, id, { ...options, project: this });
  }

  public addDashboard(id: string, options: DashboardOptions): Dashboard {
    return new Dashboard(this, id, { ...options, project: this });
  }

  public addDashboardTemplate(id: string, options: DashboardTemplateOptions): DashboardTemplate {
    return new DashboardTemplate(this, id, { ...options, project: this });
  }

  public addInsightVariable(id: string, options: InsightVariableOptions): InsightVariable {
    return new InsightVariable(this, id, { ...options, project: this });
  }

  public addFeatureFlag(id: string, options: FeatureFlagOptions): FeatureFlag {
    return new FeatureFlag(this, id, { ...options, project: this });
  }

  public addEarlyAccessFeature(id: string, options: EarlyAccessFeatureOptions): EarlyAccessFeature {
    return new EarlyAccessFeature(this, id, { ...options, project: this });
  }

  public addExperiment(id: string, options: ExperimentOptions): Experiment {
    return new Experiment(this, id, { ...options, project: this });
  }

  public addHoldout(id: string, options: HoldoutOptions): Holdout {
    return new Holdout(this, id, { ...options, project: this });
  }

  public addSavedMetric(id: string, options: SavedMetricOptions): SavedMetric {
    return new SavedMetric(this, id, { ...options, project: this });
  }

  public addWebExperiment(id: string, options: WebExperimentOptions): WebExperiment {
    return new WebExperiment(this, id, { ...options, project: this });
  }

  public addSurvey(id: string, options: SurveyOptions): Survey {
    return new Survey(this, id, { ...options, project: this });
  }

  public addProductTour(id: string, options: ProductTourOptions): ProductTour {
    return new ProductTour(this, id, { ...options, project: this });
  }

  public addPlaylist(id: string, options: PlaylistOptions): Playlist {
    return new Playlist(this, id, { ...options, project: this });
  }

  public addHogFunction(id: string, options: HogFunctionOptions): HogFunction {
    return new HogFunction(this, id, { ...options, project: this });
  }

  public addWebhook(id: string, options: WebhookHogFunctionOptions): HogFunction {
    return HogFunction.webhook(this, id, { ...options, project: this });
  }

  public addHogFlow(id: string, options: HogFlowOptions): HogFlow {
    return new HogFlow(this, id, { ...options, project: this });
  }

  public addMessageTemplate(id: string, options: MessageTemplateOptions): MessageTemplate {
    return new MessageTemplate(this, id, { ...options, project: this });
  }

  public addMessageCategory(id: string, options: MessageCategoryOptions): MessageCategory {
    return new MessageCategory(this, id, { ...options, project: this });
  }

  public addBatchExport(id: string, options: BatchExportOptions): BatchExport {
    return new BatchExport(this, id, { ...options, project: this });
  }

  public addWarehouseSource(id: string, options: SourceOptions): Source {
    return new Source(this, id, { ...options, project: this });
  }

  public addSavedQuery(id: string, options: SavedQueryOptions): SavedQuery {
    return new SavedQuery(this, id, { ...options, project: this });
  }

  public addWarehouseTable(id: string, options: TableOptions): Table {
    return new Table(this, id, { ...options, project: this });
  }

  public addViewLink(id: string, options: ViewLinkOptions): ViewLink {
    return new ViewLink(this, id, { ...options, project: this });
  }

  public addEndpoint(id: string, options: EndpointOptions): Endpoint {
    return new Endpoint(this, id, { ...options, project: this });
  }

  public addErrorTrackingAssignmentRule(id: string, options: AssignmentRuleOptions): AssignmentRule {
    return new AssignmentRule(this, id, { ...options, project: this });
  }

  public addErrorTrackingGroupingRule(id: string, options: GroupingRuleOptions): GroupingRule {
    return new GroupingRule(this, id, { ...options, project: this });
  }

  public addErrorTrackingSuppressionRule(id: string, options?: SuppressionRuleOptions): SuppressionRule {
    return new SuppressionRule(this, id, { ...options, project: this });
  }

  public addErrorTrackingAlert(id: string, options: ErrorTrackingAlertOptions): ErrorTrackingAlert {
    return new ErrorTrackingAlert(this, id, { ...options, project: this });
  }

  public addLogsAlert(id: string, options: LogsAlertOptions): LogsAlert {
    return new LogsAlert(this, id, { ...options, project: this });
  }

  public addLogsRetentionRule(id: string, options: RetentionRuleOptions): RetentionRule {
    return new RetentionRule(this, id, { ...options, project: this });
  }

  public addLogsSamplingRule(id: string, options: SamplingRuleOptions): SamplingRule {
    return new SamplingRule(this, id, { ...options, project: this });
  }

  public addProviderKey(id: string, options: ProviderKeyOptions): ProviderKey {
    return new ProviderKey(this, id, { ...options, project: this });
  }

  public addEvaluation(id: string, options: EvaluationOptions): Evaluation {
    return new Evaluation(this, id, { ...options, project: this });
  }

  public addLlmJudgeEvaluation(id: string, options: LlmJudgeEvaluationOptions): Evaluation {
    return Evaluation.llmJudge(this, id, { ...options, project: this });
  }
}

/**
 * First day of the week for date range filters.
 */
export enum WeekStartDay {
  /** Weeks start on Sunday. */
  SUNDAY = 0,
  /** Weeks start on Monday. */
  MONDAY = 1,
}

/**
 * The kind of customers a project serves. PostHog uses it to choose default
 * UI layouts.
 */
export enum BusinessModel {
  /** Business-to-business. */
  B2B = 'b2b',
  /** Business-to-consumer. */
  B2C = 'b2c',
  /** Neither. */
  OTHER = 'other',
}

/**
 * How long PostHog keeps new session recordings. Availability depends on the
 * organization's plan.
 */
export enum RecordingRetentionPeriod {
  /** 30 days. */
  THIRTY_DAYS = '30d',
  /** 90 days. */
  NINETY_DAYS = '90d',
  /** One year. */
  ONE_YEAR = '1y',
  /** Five years. */
  FIVE_YEARS = '5y',
}

/**
 * A path cleaning rule: a regular expression whose matches in URLs are
 * replaced by an alias before paths are shown, e.g. `/user/\d+` to
 * `/user/<id>`.
 */
export interface PathCleaningRule {
  /** Regular expression to match in the path. */
  readonly regex: string;

  /** Replacement text for the matched part. */
  readonly alias: string;
}

/**
 * Options for creating a project in an organization.
 */
export interface ProjectOptions {
  /** Project name. Must be unique within the organization (case-insensitive). */
  readonly name: string;

  /**
   * Short description of the product, used as context by PostHog AI features.
   * @default - none
   */
  readonly productDescription?: string;

  /**
   * Labels on the project. PostHog trims and lowercases them.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * URLs of the sites and apps that send data to this project (used by the
   * toolbar and heatmaps).
   * @default - none
   */
  readonly appUrls?: string[];

  /**
   * Drop the IP address from every ingested event.
   * @default - PostHog default (false)
   */
  readonly anonymizeIps?: boolean;

  /**
   * IANA timezone used for date filters and reporting, e.g. `Europe/Berlin`.
   * @default - PostHog default (UTC)
   */
  readonly timezone?: string;

  /**
   * First day of the week for date range filters.
   * @default - PostHog default
   */
  readonly weekStartDay?: WeekStartDay;

  /**
   * ISO 4217 currency code used for revenue analytics, e.g. `EUR`.
   * @default - PostHog default (USD)
   */
  readonly baseCurrency?: string;

  /**
   * Whether the project serves business or consumer customers.
   * @default - not set
   */
  readonly businessModel?: BusinessModel;

  /**
   * Turn off posthog-js autocapture (clicks, page views).
   * @default - PostHog default (autocapture on)
   */
  readonly autocaptureOptOut?: boolean;

  /**
   * Capture JavaScript exceptions automatically.
   * @default - PostHog default
   */
  readonly autocaptureExceptions?: boolean;

  /**
   * Capture Core Web Vitals automatically.
   * @default - PostHog default
   */
  readonly autocaptureWebVitals?: boolean;

  /**
   * Capture browser console logs with session replays.
   * @default - PostHog default
   */
  readonly captureConsoleLogs?: boolean;

  /**
   * Capture performance timing and network requests.
   * @default - PostHog default
   */
  readonly capturePerformance?: boolean;

  /**
   * Capture clicks that had no effect (dead clicks).
   * @default - PostHog default
   */
  readonly captureDeadClicks?: boolean;

  /**
   * Record heatmaps on pages that use posthog-js.
   * @default - PostHog default
   */
  readonly heatmaps?: boolean;

  /**
   * Show surveys via posthog-js.
   * @default - PostHog default
   */
  readonly surveys?: boolean;

  /**
   * Record session replays.
   * @default - PostHog default (false)
   */
  readonly sessionRecording?: boolean;

  /**
   * Fraction of sessions to record, between 0 and 1 with at most two decimals
   * (0.1 records 10% of sessions).
   * @default - PostHog default (all sessions)
   */
  readonly sessionRecordingSampleRate?: number;

  /**
   * Don't save sessions shorter than this. At most 30 seconds.
   * @default - PostHog default (no minimum)
   */
  readonly sessionRecordingMinimumDuration?: Duration;

  /**
   * How long new session recordings are kept.
   * @default - PostHog default (30 days)
   */
  readonly sessionRecordingRetentionPeriod?: RecordingRetentionPeriod;

  /**
   * Origins allowed to record session replays and heatmaps.
   * @default - all origins
   */
  readonly recordingDomains?: string[];

  /**
   * Element attributes that posthog-js uses as action identifiers, e.g.
   * `data-attr`.
   * @default - PostHog default (`data-attr`)
   */
  readonly dataAttributes?: string[];

  /**
   * Person properties, in order, used to show a person's display name.
   * @default - PostHog default
   */
  readonly personDisplayNameProperties?: string[];

  /**
   * Property filters that identify internal and test traffic, excluded from
   * insights when "filter out internal and test users" is on.
   * @default - none
   */
  readonly testAccountFilters?: PropertyFilter[];

  /**
   * Make new insights exclude internal and test users by default.
   * @default - PostHog default (false)
   */
  readonly testAccountFiltersDefaultChecked?: boolean;

  /**
   * Rules that collapse dynamic path segments before URLs are shown in paths.
   * @default - none
   */
  readonly pathCleaningFilters?: PathCleaningRule[];

  /**
   * What happens to the PostHog project when it is removed from the stack or
   * replaced. **Deleting a project deletes all its data** (events, persons,
   * recordings, insights, flags, ...) and cannot be undone, so the default
   * keeps it. Setting `RemovalPolicy.DESTROY` adds a synth warning.
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Project.
 */
export interface ProjectProps extends ProjectOptions {
  /** The organization to create the project in. */
  readonly organization: IOrganization;
}

/**
 * A PostHog project and its main settings.
 *
 * Settings left out are not managed: PostHog keeps whatever is set in the UI.
 * Removing a setting that was managed resets it to PostHog's default.
 *
 * Use `Project.fromProjectId()` to reference an existing project.
 *
 * @resource PostHog::Organizations::Project
 */
export class Project extends ProjectBase {
  /**
   * Import an existing project by its PostHog ID.
   */
  public static fromProjectId(scope: Construct, id: string, projectId: string): IProject {
    class Import extends ProjectBase {
      public readonly projectId = projectId;
    }
    return new Import(scope, id);
  }

  public readonly projectId: string;

  /** The organization the project belongs to. */
  public readonly organization: IOrganization;

  /**
   * The project UUID.
   * @attribute
   */
  public readonly projectUuid: string;

  /**
   * The public project API key (`phc_...`) that SDKs send events with. It is
   * not a secret.
   * @attribute
   */
  public readonly apiToken: string;

  /**
   * The PostHog API host SDKs send events to, e.g. `https://us.i.posthog.com`.
   * @attribute
   */
  public readonly apiHost: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly projectCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnProject;

  constructor(scope: Construct, id: string, props: ProjectProps) {
    super(scope, id);
    validateLength('Project name', props.name, 1, 200);
    validateLength('Project productDescription', props.productDescription, 0, 1000);
    validateLength('Project timezone', props.timezone, 1, 255);
    validatePattern('Project baseCurrency', props.baseCurrency, /^[A-Z]{3}$/, 'expected an ISO 4217 code such as USD');
    props.tags?.forEach(tag => validateLength('Project tag', tag, 1, 255));
    props.appUrls?.forEach(url => validateLength('Project appUrl', url, 1, 200));
    props.recordingDomains?.forEach(d => validateLength('Project recordingDomain', d, 1, 200));
    props.personDisplayNameProperties?.forEach(p => validateLength('Project personDisplayNameProperty', p, 1, 400));

    const minDuration = props.sessionRecordingMinimumDuration?.toMilliseconds();
    if (isConcreteNumber(minDuration)) {
      validateRange('Project sessionRecordingMinimumDuration (ms)', minDuration, 0, 30000);
    }

    this.organization = props.organization;

    this.resource = new CfnProject(this, 'Resource', {
      organizationId: props.organization.organizationId,
      name: props.name,
      productDescription: props.productDescription,
      tags: uniqueOrUndefined(props.tags),
      appUrls: props.appUrls,
      anonymizeIps: props.anonymizeIps,
      timezone: props.timezone,
      weekStartDay: props.weekStartDay as number | undefined as CfnProjectPropsWeekStartDay | undefined,
      baseCurrency: props.baseCurrency,
      businessModel: props.businessModel as string | undefined as CfnProjectPropsBusinessModel | undefined,
      autocaptureOptOut: props.autocaptureOptOut,
      autocaptureExceptionsOptIn: props.autocaptureExceptions,
      autocaptureWebVitalsOptIn: props.autocaptureWebVitals,
      captureConsoleLogOptIn: props.captureConsoleLogs,
      capturePerformanceOptIn: props.capturePerformance,
      captureDeadClicks: props.captureDeadClicks,
      heatmapsOptIn: props.heatmaps,
      surveysOptIn: props.surveys,
      sessionRecordingOptIn: props.sessionRecording,
      sessionRecordingSampleRate: renderFraction('Project sessionRecordingSampleRate', props.sessionRecordingSampleRate),
      sessionRecordingMinimumDurationMilliseconds: minDuration,
      sessionRecordingRetentionPeriod: props.sessionRecordingRetentionPeriod as string | undefined as
        CfnProjectPropsSessionRecordingRetentionPeriod | undefined,
      recordingDomains: props.recordingDomains,
      dataAttributes: props.dataAttributes,
      personDisplayNameProperties: props.personDisplayNameProperties,
      testAccountFilters: jsonProp(this, renderPropertyFilters(props.testAccountFilters)),
      testAccountFiltersDefaultChecked: props.testAccountFiltersDefaultChecked,
      pathCleaningFilters: jsonProp(this, props.pathCleaningFilters?.length
        ? props.pathCleaningFilters.map(r => ({ regex: r.regex, alias: r.alias }))
        : undefined),
    });

    const removalPolicy = props.removalPolicy ?? RemovalPolicy.RETAIN;
    this.resource.applyRemovalPolicy(removalPolicy);
    if (removalPolicy === RemovalPolicy.DESTROY) {
      Annotations.of(this).addWarningV2('@posthog/cdk-constructs:projectRemovalPolicyDestroy',
        'Project removalPolicy is DESTROY: removing this project from the stack, deleting the stack or replacing the project ' +
        'deletes the PostHog project and all of its data. This cannot be undone.');
    }

    this.projectId = this.resource.attrId;
    this.projectUuid = this.resource.attrUuid;
    this.apiToken = this.resource.attrApiToken;
    this.apiHost = this.resource.attrApiHost;
    this.projectCreatedAt = this.resource.attrCreatedAt;
  }
}
