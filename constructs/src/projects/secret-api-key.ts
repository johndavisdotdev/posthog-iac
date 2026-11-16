import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { CfnSecretApiKey } from './secret-api-key.generated';
import type { IProject } from '../organizations/project';
import { secretOrNew, validateLength, validatePattern } from '../private/helpers';

/**
 * A PostHog API scope that can be granted to a project secret API key.
 *
 * The values are the API scopes in PostHog's OpenAPI spec. PostHog decides
 * which of them a project secret API key may hold and rejects the others when
 * the key is created. A key is project-wide: it does not honour per-object
 * access controls.
 */
export enum SecretApiKeyScope {
  /** `access_control:read`: read access to access control. */
  ACCESS_CONTROL_READ = 'access_control:read',
  /** `access_control:write`: write access to access control. */
  ACCESS_CONTROL_WRITE = 'access_control:write',
  /** `account:read`: read access to account. */
  ACCOUNT_READ = 'account:read',
  /** `account:write`: write access to account. */
  ACCOUNT_WRITE = 'account:write',
  /** `account_note:read`: read access to account note. */
  ACCOUNT_NOTE_READ = 'account_note:read',
  /** `account_note:write`: write access to account note. */
  ACCOUNT_NOTE_WRITE = 'account_note:write',
  /** `action:read`: read access to action. */
  ACTION_READ = 'action:read',
  /** `action:write`: write access to action. */
  ACTION_WRITE = 'action:write',
  /** `activity_log:read`: read access to activity log. */
  ACTIVITY_LOG_READ = 'activity_log:read',
  /** `ai_observability_clusters:read`: read access to ai observability clusters. */
  AI_OBSERVABILITY_CLUSTERS_READ = 'ai_observability_clusters:read',
  /** `ai_observability_clusters:write`: write access to ai observability clusters. */
  AI_OBSERVABILITY_CLUSTERS_WRITE = 'ai_observability_clusters:write',
  /** `alert:read`: read access to alert. */
  ALERT_READ = 'alert:read',
  /** `alert:write`: write access to alert. */
  ALERT_WRITE = 'alert:write',
  /** `annotation:read`: read access to annotation. */
  ANNOTATION_READ = 'annotation:read',
  /** `annotation:write`: write access to annotation. */
  ANNOTATION_WRITE = 'annotation:write',
  /** `approvals:read`: read access to approvals. */
  APPROVALS_READ = 'approvals:read',
  /** `approvals:write`: write access to approvals. */
  APPROVALS_WRITE = 'approvals:write',
  /** `autoresearch:read`: read access to autoresearch. */
  AUTORESEARCH_READ = 'autoresearch:read',
  /** `autoresearch:write`: write access to autoresearch. */
  AUTORESEARCH_WRITE = 'autoresearch:write',
  /** `batch_export:read`: read access to batch export. */
  BATCH_EXPORT_READ = 'batch_export:read',
  /** `batch_export:write`: write access to batch export. */
  BATCH_EXPORT_WRITE = 'batch_export:write',
  /** `billing:read`: read access to billing. */
  BILLING_READ = 'billing:read',
  /** `business_knowledge:read`: read access to business knowledge. */
  BUSINESS_KNOWLEDGE_READ = 'business_knowledge:read',
  /** `business_knowledge:write`: write access to business knowledge. */
  BUSINESS_KNOWLEDGE_WRITE = 'business_knowledge:write',
  /** `canvas:read`: read access to canvas. */
  CANVAS_READ = 'canvas:read',
  /** `canvas:write`: write access to canvas. */
  CANVAS_WRITE = 'canvas:write',
  /** `cohort:read`: read access to cohort. */
  COHORT_READ = 'cohort:read',
  /** `cohort:write`: write access to cohort. */
  COHORT_WRITE = 'cohort:write',
  /** `comment:read`: read access to comment. */
  COMMENT_READ = 'comment:read',
  /** `comment:write`: write access to comment. */
  COMMENT_WRITE = 'comment:write',
  /** `conversation:read`: read access to conversation. */
  CONVERSATION_READ = 'conversation:read',
  /** `conversation:write`: write access to conversation. */
  CONVERSATION_WRITE = 'conversation:write',
  /** `cross_project_dashboard:read`: read access to cross project dashboard. */
  CROSS_PROJECT_DASHBOARD_READ = 'cross_project_dashboard:read',
  /** `cross_project_dashboard:write`: write access to cross project dashboard. */
  CROSS_PROJECT_DASHBOARD_WRITE = 'cross_project_dashboard:write',
  /** `customer_analytics:read`: read access to customer analytics. */
  CUSTOMER_ANALYTICS_READ = 'customer_analytics:read',
  /** `customer_analytics:write`: write access to customer analytics. */
  CUSTOMER_ANALYTICS_WRITE = 'customer_analytics:write',
  /** `customer_journey:read`: read access to customer journey. */
  CUSTOMER_JOURNEY_READ = 'customer_journey:read',
  /** `customer_journey:write`: write access to customer journey. */
  CUSTOMER_JOURNEY_WRITE = 'customer_journey:write',
  /** `customer_profile_config:read`: read access to customer profile config. */
  CUSTOMER_PROFILE_CONFIG_READ = 'customer_profile_config:read',
  /** `customer_profile_config:write`: write access to customer profile config. */
  CUSTOMER_PROFILE_CONFIG_WRITE = 'customer_profile_config:write',
  /** `customer_task:read`: read access to customer task. */
  CUSTOMER_TASK_READ = 'customer_task:read',
  /** `customer_task:write`: write access to customer task. */
  CUSTOMER_TASK_WRITE = 'customer_task:write',
  /** `dashboard:read`: read access to dashboard. */
  DASHBOARD_READ = 'dashboard:read',
  /** `dashboard:write`: write access to dashboard. */
  DASHBOARD_WRITE = 'dashboard:write',
  /** `dashboard_template:read`: read access to dashboard template. */
  DASHBOARD_TEMPLATE_READ = 'dashboard_template:read',
  /** `dashboard_template:write`: write access to dashboard template. */
  DASHBOARD_TEMPLATE_WRITE = 'dashboard_template:write',
  /** `data_catalog:read`: read access to data catalog. */
  DATA_CATALOG_READ = 'data_catalog:read',
  /** `data_catalog:write`: write access to data catalog. */
  DATA_CATALOG_WRITE = 'data_catalog:write',
  /** `data_catalog_approval:write`: write access to data catalog approval. */
  DATA_CATALOG_APPROVAL_WRITE = 'data_catalog_approval:write',
  /** `data_deletion:read`: read access to data deletion. */
  DATA_DELETION_READ = 'data_deletion:read',
  /** `data_deletion:write`: write access to data deletion. */
  DATA_DELETION_WRITE = 'data_deletion:write',
  /** `dataset:read`: read access to dataset. */
  DATASET_READ = 'dataset:read',
  /** `dataset:write`: write access to dataset. */
  DATASET_WRITE = 'dataset:write',
  /** `early_access_feature:read`: read access to early access feature. */
  EARLY_ACCESS_FEATURE_READ = 'early_access_feature:read',
  /** `early_access_feature:write`: write access to early access feature. */
  EARLY_ACCESS_FEATURE_WRITE = 'early_access_feature:write',
  /** `element:read`: read access to element. */
  ELEMENT_READ = 'element:read',
  /** `element:write`: write access to element. */
  ELEMENT_WRITE = 'element:write',
  /** `endpoint:read`: read access to endpoint. */
  ENDPOINT_READ = 'endpoint:read',
  /** `endpoint:write`: write access to endpoint. */
  ENDPOINT_WRITE = 'endpoint:write',
  /** `engineering_analytics:read`: read access to engineering analytics. */
  ENGINEERING_ANALYTICS_READ = 'engineering_analytics:read',
  /** `engineering_analytics:write`: write access to engineering analytics. */
  ENGINEERING_ANALYTICS_WRITE = 'engineering_analytics:write',
  /** `error_tracking:read`: read access to error tracking. */
  ERROR_TRACKING_READ = 'error_tracking:read',
  /** `error_tracking:write`: write access to error tracking. */
  ERROR_TRACKING_WRITE = 'error_tracking:write',
  /** `evaluation:read`: read access to evaluation. */
  EVALUATION_READ = 'evaluation:read',
  /** `evaluation:write`: write access to evaluation. */
  EVALUATION_WRITE = 'evaluation:write',
  /** `event:read`: read access to event. */
  EVENT_READ = 'event:read',
  /** `event_definition:read`: read access to event definition. */
  EVENT_DEFINITION_READ = 'event_definition:read',
  /** `event_definition:write`: write access to event definition. */
  EVENT_DEFINITION_WRITE = 'event_definition:write',
  /** `event_filter:read`: read access to event filter. */
  EVENT_FILTER_READ = 'event_filter:read',
  /** `event_filter:write`: write access to event filter. */
  EVENT_FILTER_WRITE = 'event_filter:write',
  /** `experiment:read`: read access to experiment. */
  EXPERIMENT_READ = 'experiment:read',
  /** `experiment:write`: write access to experiment. */
  EXPERIMENT_WRITE = 'experiment:write',
  /** `experiment_holdout:read`: read access to experiment holdout. */
  EXPERIMENT_HOLDOUT_READ = 'experiment_holdout:read',
  /** `experiment_holdout:write`: write access to experiment holdout. */
  EXPERIMENT_HOLDOUT_WRITE = 'experiment_holdout:write',
  /** `experiment_saved_metric:read`: read access to experiment saved metric. */
  EXPERIMENT_SAVED_METRIC_READ = 'experiment_saved_metric:read',
  /** `experiment_saved_metric:write`: write access to experiment saved metric. */
  EXPERIMENT_SAVED_METRIC_WRITE = 'experiment_saved_metric:write',
  /** `export:read`: read access to export. */
  EXPORT_READ = 'export:read',
  /** `export:write`: write access to export. */
  EXPORT_WRITE = 'export:write',
  /** `external_data_source:read`: read access to external data source. */
  EXTERNAL_DATA_SOURCE_READ = 'external_data_source:read',
  /** `external_data_source:write`: write access to external data source. */
  EXTERNAL_DATA_SOURCE_WRITE = 'external_data_source:write',
  /** `feature_flag:read`: read access to feature flag. */
  FEATURE_FLAG_READ = 'feature_flag:read',
  /** `feature_flag:write`: write access to feature flag. */
  FEATURE_FLAG_WRITE = 'feature_flag:write',
  /** `field_note:read`: read access to field note. */
  FIELD_NOTE_READ = 'field_note:read',
  /** `field_note:write`: write access to field note. */
  FIELD_NOTE_WRITE = 'field_note:write',
  /** `file_system:read`: read access to file system. */
  FILE_SYSTEM_READ = 'file_system:read',
  /** `file_system:write`: write access to file system. */
  FILE_SYSTEM_WRITE = 'file_system:write',
  /** `file_system_shortcut:read`: read access to file system shortcut. */
  FILE_SYSTEM_SHORTCUT_READ = 'file_system_shortcut:read',
  /** `file_system_shortcut:write`: write access to file system shortcut. */
  FILE_SYSTEM_SHORTCUT_WRITE = 'file_system_shortcut:write',
  /** `group:read`: read access to group. */
  GROUP_READ = 'group:read',
  /** `group:write`: write access to group. */
  GROUP_WRITE = 'group:write',
  /** `health_issue:read`: read access to health issue. */
  HEALTH_ISSUE_READ = 'health_issue:read',
  /** `health_issue:write`: write access to health issue. */
  HEALTH_ISSUE_WRITE = 'health_issue:write',
  /** `heatmap:read`: read access to heatmap. */
  HEATMAP_READ = 'heatmap:read',
  /** `heatmap:write`: write access to heatmap. */
  HEATMAP_WRITE = 'heatmap:write',
  /** `hog_flow:read`: read access to hog flow. */
  HOG_FLOW_READ = 'hog_flow:read',
  /** `hog_flow:write`: write access to hog flow. */
  HOG_FLOW_WRITE = 'hog_flow:write',
  /** `hog_flow_proposal:write`: write access to hog flow proposal. */
  HOG_FLOW_PROPOSAL_WRITE = 'hog_flow_proposal:write',
  /** `hog_function:read`: read access to hog function. */
  HOG_FUNCTION_READ = 'hog_function:read',
  /** `hog_function:write`: write access to hog function. */
  HOG_FUNCTION_WRITE = 'hog_function:write',
  /** `inbox:read`: read access to inbox. */
  INBOX_READ = 'inbox:read',
  /** `inbox:write`: write access to inbox. */
  INBOX_WRITE = 'inbox:write',
  /** `ingestion_warning:read`: read access to ingestion warning. */
  INGESTION_WARNING_READ = 'ingestion_warning:read',
  /** `insight:read`: read access to insight. */
  INSIGHT_READ = 'insight:read',
  /** `insight:write`: write access to insight. */
  INSIGHT_WRITE = 'insight:write',
  /** `insight_variable:read`: read access to insight variable. */
  INSIGHT_VARIABLE_READ = 'insight_variable:read',
  /** `insight_variable:write`: write access to insight variable. */
  INSIGHT_VARIABLE_WRITE = 'insight_variable:write',
  /** `integration:read`: read access to integration. */
  INTEGRATION_READ = 'integration:read',
  /** `integration:write`: write access to integration. */
  INTEGRATION_WRITE = 'integration:write',
  /** `legal_document:read`: read access to legal document. */
  LEGAL_DOCUMENT_READ = 'legal_document:read',
  /** `legal_document:write`: write access to legal document. */
  LEGAL_DOCUMENT_WRITE = 'legal_document:write',
  /** `llm_analytics:read`: read access to llm analytics. */
  LLM_ANALYTICS_READ = 'llm_analytics:read',
  /** `llm_analytics:write`: write access to llm analytics. */
  LLM_ANALYTICS_WRITE = 'llm_analytics:write',
  /** `llm_gateway:read`: read access to llm gateway. */
  LLM_GATEWAY_READ = 'llm_gateway:read',
  /** `llm_prompt:read`: read access to llm prompt. */
  LLM_PROMPT_READ = 'llm_prompt:read',
  /** `llm_prompt:write`: write access to llm prompt. */
  LLM_PROMPT_WRITE = 'llm_prompt:write',
  /** `llm_provider_key:read`: read access to llm provider key. */
  LLM_PROVIDER_KEY_READ = 'llm_provider_key:read',
  /** `llm_provider_key:write`: write access to llm provider key. */
  LLM_PROVIDER_KEY_WRITE = 'llm_provider_key:write',
  /** `llm_skill:read`: read access to llm skill. */
  LLM_SKILL_READ = 'llm_skill:read',
  /** `llm_skill:write`: write access to llm skill. */
  LLM_SKILL_WRITE = 'llm_skill:write',
  /** `logs:read`: read access to logs. */
  LOGS_READ = 'logs:read',
  /** `logs:write`: write access to logs. */
  LOGS_WRITE = 'logs:write',
  /** `marketing_analytics:read`: read access to marketing analytics. */
  MARKETING_ANALYTICS_READ = 'marketing_analytics:read',
  /** `marketing_analytics:write`: write access to marketing analytics. */
  MARKETING_ANALYTICS_WRITE = 'marketing_analytics:write',
  /** `mcp_analytics:read`: read access to mcp analytics. */
  MCP_ANALYTICS_READ = 'mcp_analytics:read',
  /** `mcp_analytics:write`: write access to mcp analytics. */
  MCP_ANALYTICS_WRITE = 'mcp_analytics:write',
  /** `messaging_preference:write`: write access to messaging preference. */
  MESSAGING_PREFERENCE_WRITE = 'messaging_preference:write',
  /** `metrics:read`: read access to metrics. */
  METRICS_READ = 'metrics:read',
  /** `metrics:write`: write access to metrics. */
  METRICS_WRITE = 'metrics:write',
  /** `notebook:read`: read access to notebook. */
  NOTEBOOK_READ = 'notebook:read',
  /** `notebook:write`: write access to notebook. */
  NOTEBOOK_WRITE = 'notebook:write',
  /** `offline_evaluation_ingestion:write`: write access to offline evaluation ingestion. */
  OFFLINE_EVALUATION_INGESTION_WRITE = 'offline_evaluation_ingestion:write',
  /** `organization:read`: read access to organization. */
  ORGANIZATION_READ = 'organization:read',
  /** `organization:write`: write access to organization. */
  ORGANIZATION_WRITE = 'organization:write',
  /** `organization_integration:read`: read access to organization integration. */
  ORGANIZATION_INTEGRATION_READ = 'organization_integration:read',
  /** `organization_integration:write`: write access to organization integration. */
  ORGANIZATION_INTEGRATION_WRITE = 'organization_integration:write',
  /** `organization_member:read`: read access to organization member. */
  ORGANIZATION_MEMBER_READ = 'organization_member:read',
  /** `organization_member:write`: write access to organization member. */
  ORGANIZATION_MEMBER_WRITE = 'organization_member:write',
  /** `person:read`: read access to person. */
  PERSON_READ = 'person:read',
  /** `person:write`: write access to person. */
  PERSON_WRITE = 'person:write',
  /** `plugin:read`: read access to plugin. */
  PLUGIN_READ = 'plugin:read',
  /** `product_enablement:write`: write access to product enablement. */
  PRODUCT_ENABLEMENT_WRITE = 'product_enablement:write',
  /** `product_tour:read`: read access to product tour. */
  PRODUCT_TOUR_READ = 'product_tour:read',
  /** `product_tour:write`: write access to product tour. */
  PRODUCT_TOUR_WRITE = 'product_tour:write',
  /** `project:read`: read access to project. */
  PROJECT_READ = 'project:read',
  /** `project:write`: write access to project. */
  PROJECT_WRITE = 'project:write',
  /** `property_definition:read`: read access to property definition. */
  PROPERTY_DEFINITION_READ = 'property_definition:read',
  /** `property_definition:write`: write access to property definition. */
  PROPERTY_DEFINITION_WRITE = 'property_definition:write',
  /** `query:read`: read access to query. */
  QUERY_READ = 'query:read',
  /** `replay_scanner:read`: read access to replay scanner. */
  REPLAY_SCANNER_READ = 'replay_scanner:read',
  /** `replay_scanner:write`: write access to replay scanner. */
  REPLAY_SCANNER_WRITE = 'replay_scanner:write',
  /** `review_hog:read`: read access to review hog. */
  REVIEW_HOG_READ = 'review_hog:read',
  /** `review_hog:write`: write access to review hog. */
  REVIEW_HOG_WRITE = 'review_hog:write',
  /** `session_recording:read`: read access to session recording. */
  SESSION_RECORDING_READ = 'session_recording:read',
  /** `session_recording:write`: write access to session recording. */
  SESSION_RECORDING_WRITE = 'session_recording:write',
  /** `session_recording_playlist:read`: read access to session recording playlist. */
  SESSION_RECORDING_PLAYLIST_READ = 'session_recording_playlist:read',
  /** `session_recording_playlist:write`: write access to session recording playlist. */
  SESSION_RECORDING_PLAYLIST_WRITE = 'session_recording_playlist:write',
  /** `sharing_configuration:read`: read access to sharing configuration. */
  SHARING_CONFIGURATION_READ = 'sharing_configuration:read',
  /** `sharing_configuration:write`: write access to sharing configuration. */
  SHARING_CONFIGURATION_WRITE = 'sharing_configuration:write',
  /** `signal_scout:read`: read access to signal scout. */
  SIGNAL_SCOUT_READ = 'signal_scout:read',
  /** `signal_scout:write`: write access to signal scout. */
  SIGNAL_SCOUT_WRITE = 'signal_scout:write',
  /** `signal_scout_internal:read`: read access to signal scout internal. */
  SIGNAL_SCOUT_INTERNAL_READ = 'signal_scout_internal:read',
  /** `signal_scout_internal:write`: write access to signal scout internal. */
  SIGNAL_SCOUT_INTERNAL_WRITE = 'signal_scout_internal:write',
  /** `signal_scout_monitoring:write`: write access to signal scout monitoring. */
  SIGNAL_SCOUT_MONITORING_WRITE = 'signal_scout_monitoring:write',
  /** `signal_scout_report:write`: write access to signal scout report. */
  SIGNAL_SCOUT_REPORT_WRITE = 'signal_scout_report:write',
  /** `signal_scratchpad_internal:write`: write access to signal scratchpad internal. */
  SIGNAL_SCRATCHPAD_INTERNAL_WRITE = 'signal_scratchpad_internal:write',
  /** `signal_usage:read`: read access to signal usage. */
  SIGNAL_USAGE_READ = 'signal_usage:read',
  /** `stamphog:read`: read access to stamphog. */
  STAMPHOG_READ = 'stamphog:read',
  /** `stamphog:write`: write access to stamphog. */
  STAMPHOG_WRITE = 'stamphog:write',
  /** `streamlit_app:read`: read access to streamlit app. */
  STREAMLIT_APP_READ = 'streamlit_app:read',
  /** `streamlit_app:write`: write access to streamlit app. */
  STREAMLIT_APP_WRITE = 'streamlit_app:write',
  /** `subscription:read`: read access to subscription. */
  SUBSCRIPTION_READ = 'subscription:read',
  /** `subscription:write`: write access to subscription. */
  SUBSCRIPTION_WRITE = 'subscription:write',
  /** `survey:read`: read access to survey. */
  SURVEY_READ = 'survey:read',
  /** `survey:write`: write access to survey. */
  SURVEY_WRITE = 'survey:write',
  /** `tagger:read`: read access to tagger. */
  TAGGER_READ = 'tagger:read',
  /** `tagger:write`: write access to tagger. */
  TAGGER_WRITE = 'tagger:write',
  /** `task:read`: read access to task. */
  TASK_READ = 'task:read',
  /** `task:write`: write access to task. */
  TASK_WRITE = 'task:write',
  /** `ticket:read`: read access to ticket. */
  TICKET_READ = 'ticket:read',
  /** `ticket:write`: write access to ticket. */
  TICKET_WRITE = 'ticket:write',
  /** `today:read`: read access to today. */
  TODAY_READ = 'today:read',
  /** `today:write`: write access to today. */
  TODAY_WRITE = 'today:write',
  /** `tracing:read`: read access to tracing. */
  TRACING_READ = 'tracing:read',
  /** `tracing:write`: write access to tracing. */
  TRACING_WRITE = 'tracing:write',
  /** `transactional_email:read`: read access to transactional email. */
  TRANSACTIONAL_EMAIL_READ = 'transactional_email:read',
  /** `transactional_email:write`: write access to transactional email. */
  TRANSACTIONAL_EMAIL_WRITE = 'transactional_email:write',
  /** `uploaded_media:read`: read access to uploaded media. */
  UPLOADED_MEDIA_READ = 'uploaded_media:read',
  /** `uploaded_media:write`: write access to uploaded media. */
  UPLOADED_MEDIA_WRITE = 'uploaded_media:write',
  /** `usage_metric:read`: read access to usage metric. */
  USAGE_METRIC_READ = 'usage_metric:read',
  /** `usage_metric:write`: write access to usage metric. */
  USAGE_METRIC_WRITE = 'usage_metric:write',
  /** `user:read`: read access to user. */
  USER_READ = 'user:read',
  /** `user:write`: write access to user. */
  USER_WRITE = 'user:write',
  /** `vision_alert:read`: read access to vision alert. */
  VISION_ALERT_READ = 'vision_alert:read',
  /** `vision_alert:write`: write access to vision alert. */
  VISION_ALERT_WRITE = 'vision_alert:write',
  /** `visual_review:read`: read access to visual review. */
  VISUAL_REVIEW_READ = 'visual_review:read',
  /** `visual_review:write`: write access to visual review. */
  VISUAL_REVIEW_WRITE = 'visual_review:write',
  /** `warehouse_table:read`: read access to warehouse table. */
  WAREHOUSE_TABLE_READ = 'warehouse_table:read',
  /** `warehouse_table:write`: write access to warehouse table. */
  WAREHOUSE_TABLE_WRITE = 'warehouse_table:write',
  /** `warehouse_view:read`: read access to warehouse view. */
  WAREHOUSE_VIEW_READ = 'warehouse_view:read',
  /** `warehouse_view:write`: write access to warehouse view. */
  WAREHOUSE_VIEW_WRITE = 'warehouse_view:write',
  /** `web_analytics:read`: read access to web analytics. */
  WEB_ANALYTICS_READ = 'web_analytics:read',
  /** `web_analytics:write`: write access to web analytics. */
  WEB_ANALYTICS_WRITE = 'web_analytics:write',
  /** `wizard_run:read`: read access to wizard run. */
  WIZARD_RUN_READ = 'wizard_run:read',
  /** `wizard_run:write`: write access to wizard run. */
  WIZARD_RUN_WRITE = 'wizard_run:write',
  /** `wizard_session:read`: read access to wizard session. */
  WIZARD_SESSION_READ = 'wizard_session:read',
  /** `wizard_session:write`: write access to wizard session. */
  WIZARD_SESSION_WRITE = 'wizard_session:write',
  /** `workload_trust_policy:read`: read access to workload trust policy. */
  WORKLOAD_TRUST_POLICY_READ = 'workload_trust_policy:read',
  /** `workload_trust_policy:write`: write access to workload trust policy. */
  WORKLOAD_TRUST_POLICY_WRITE = 'workload_trust_policy:write',
  /** `workload_trust_policy_request:read`: read access to workload trust policy request. */
  WORKLOAD_TRUST_POLICY_REQUEST_READ = 'workload_trust_policy_request:read',
  /** `workload_trust_policy_request:write`: write access to workload trust policy request. */
  WORKLOAD_TRUST_POLICY_REQUEST_WRITE = 'workload_trust_policy_request:write',
}

/**
 * A PostHog project secret API key.
 */
export interface ISecretApiKey extends IResource {
  /**
   * The PostHog ID of the secret API key.
   * @attribute
   */
  readonly secretApiKeyId: string;

  /** The project the key belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a project secret API key (`project.addSecretApiKey()`).
 */
export interface SecretApiKeyOptions {
  /** Label that identifies the key in PostHog. 1 to 40 characters. */
  readonly label: string;

  /**
   * API scopes granted to the key. At least one. The key can access every
   * object of a granted type in the project.
   */
  readonly scopes: SecretApiKeyScope[];

  /**
   * Secrets Manager secret that receives the key value (`phs_...`). PostHog
   * returns the value only once, when the key is created, and the resource
   * type writes it to this secret. The resource type's execution role needs
   * `secretsmanager:PutSecretValue` on it (and `kms:GenerateDataKey` /
   * `kms:Encrypt` on its key when it uses a customer managed KMS key).
   *
   * Changing the secret replaces the key in PostHog.
   *
   * @default - a new secret is created, tagged `posthog-cdk:handler-writable`
   * so the execution roles of `patterns.PostHogResourceTypes` may write it
   */
  readonly secret?: secretsmanager.ISecret;

  /**
   * What happens to the PostHog key when it is removed from the stack. A
   * secret created by this construct gets the same policy, so a retained key
   * keeps its value.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a SecretApiKey.
 */
export interface SecretApiKeyProps extends SecretApiKeyOptions {
  /** The project to create the key in. */
  readonly project: IProject;
}

/**
 * A PostHog project secret API key (`phs_...`): a project-scoped key with a
 * fixed set of API scopes, for server-side use such as local feature flag
 * evaluation.
 *
 * The key value never appears in the template: PostHog returns it once and
 * the resource type writes it to a Secrets Manager secret. Read it from
 * `secret`, e.g. with `grantRead()` and `ecs.Secret.fromSecretsManager()`.
 *
 * @resource PostHog::Projects::SecretApiKey
 */
export class SecretApiKey extends Resource implements ISecretApiKey {
  /**
   * Import an existing project secret API key by its PostHog ID.
   */
  public static fromSecretApiKeyId(scope: Construct, id: string, project: IProject, secretApiKeyId: string): ISecretApiKey {
    class Import extends Resource implements ISecretApiKey {
      public readonly secretApiKeyId = secretApiKeyId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly secretApiKeyId: string;
  public readonly project: IProject;

  /** The Secrets Manager secret holding the key value. */
  public readonly secret: secretsmanager.ISecret;

  /**
   * Masked form of the key as shown in PostHog, e.g. `phs_...abcd`.
   * @attribute
   */
  public readonly maskValue: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly secretApiKeyCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSecretApiKey;

  constructor(scope: Construct, id: string, props: SecretApiKeyProps) {
    super(scope, id);
    validateLength('SecretApiKey label', props.label, 1, 40);
    if (props.scopes.length === 0) {
      throw new Error('SecretApiKey scopes must contain at least one scope');
    }

    this.project = props.project;
    const removalPolicy = props.removalPolicy ?? RemovalPolicy.DESTROY;

    this.secret = secretOrNew(this, 'Secret', props.secret, 'PostHog project secret API key (written by PostHog::Projects::SecretApiKey)');
    if (!props.secret) {
      this.secret.applyRemovalPolicy(removalPolicy);
    }
    validatePattern('SecretApiKey secret ARN', this.secret.secretArn, /^arn:aws[a-z-]*:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:.+$/,
      'must be a Secrets Manager secret ARN');

    this.resource = new CfnSecretApiKey(this, 'Resource', {
      projectId: props.project.projectId,
      label: props.label,
      scopes: [...new Set(props.scopes)],
      secretsManagerSecretArn: this.secret.secretArn,
    });
    this.resource.applyRemovalPolicy(removalPolicy);

    this.secretApiKeyId = this.resource.attrId;
    this.maskValue = this.resource.attrMaskValue;
    this.secretApiKeyCreatedAt = this.resource.attrCreatedAt;
  }

  /**
   * Grant read access to the key value in `secret`.
   */
  public grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.secret.grantRead(grantee);
  }
}
