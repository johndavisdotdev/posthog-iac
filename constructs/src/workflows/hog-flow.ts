import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CfnHogFlow,
  CfnHogFlowEmailSendingRateLimitPeriod,
  CfnHogFlowPropsExitCondition,
  CfnHogFlowPropsOriginProduct,
  CfnHogFlowPropsStatus,
} from './hog-flow.generated';
import type { IMessageCategory } from './message-category';
import type { EmailContent, IMessageTemplate } from './message-template';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { formatWorkflowDuration, renderEventFilters, WEBHOOK_TEMPLATE_ID, wrapInputs } from '../private/cdp';
import { renderPropertyFilters } from '../private/filters';
import { exactlyOne, isConcrete, jsonProp, uniqueOrUndefined, validateLength, validateRange } from '../private/helpers';
import { renderEmailContent } from '../private/workflows';
import type { IAction } from '../product-analytics/action';

/** PostHog's template ID for workflow email steps. */
const EMAIL_TEMPLATE_ID = 'template-email';

/**
 * Status of a workflow.
 */
export enum HogFlowStatus {
  /** Not running (the PostHog default). */
  DRAFT = 'draft',
  /** Live: people enter it when the trigger matches. */
  ACTIVE = 'active',
  /** Disabled. */
  ARCHIVED = 'archived',
}

/**
 * When people leave a workflow early.
 */
export enum HogFlowExitCondition {
  /** Only at an exit step (the PostHog default). */
  EXIT_ONLY_AT_END = 'exit_only_at_end',
  /** When they meet the conversion goal (needs `conversion`). */
  EXIT_ON_CONVERSION = 'exit_on_conversion',
  /** When they no longer match the trigger (event and cohort triggers only). */
  EXIT_ON_TRIGGER_NOT_MATCHED = 'exit_on_trigger_not_matched',
  /** When they no longer match the trigger or meet the conversion goal (needs `conversion`). */
  EXIT_ON_TRIGGER_NOT_MATCHED_OR_CONVERSION = 'exit_on_trigger_not_matched_or_conversion',
}

/**
 * Product surface that owns a workflow.
 */
export enum HogFlowOriginProduct {
  /** Loops. */
  LOOPS = 'loops',
  /** Broadcasts. */
  BROADCASTS = 'broadcasts',
  /** Transactional emails. */
  TRANSACTIONAL_EMAILS = 'transactional_emails',
}

/**
 * Window of an email sending rate limit.
 */
export enum EmailRateLimitPeriod {
  /** Per minute. */
  MINUTE = 'minute',
  /** Per hour. */
  HOUR = 'hour',
}

/**
 * Type of a workflow variable.
 */
export enum HogFlowVariableType {
  /** A string. */
  STRING = 'string',
  /** A number. */
  NUMBER = 'number',
  /** A boolean. */
  BOOLEAN = 'boolean',
}

/**
 * Type of a workflow edge.
 */
export enum HogFlowEdgeType {
  /** The next step. */
  CONTINUE = 'continue',
  /** One branch of a `conditional_branch` or `wait_until_condition` step (needs `index`). */
  BRANCH = 'branch',
}

/**
 * Display options shared by workflow steps.
 */
export interface HogFlowNodeOptions {
  /**
   * Step name shown in the PostHog editor.
   * @default - the step ID
   */
  readonly name?: string;

  /**
   * Step description.
   * @default - none
   */
  readonly description?: string;
}

/**
 * Options for an event trigger. A person enters the workflow when an event
 * matches any of `events` or `actions` and all `properties`.
 */
export interface HogFlowEventTriggerOptions extends HogFlowNodeOptions {
  /**
   * Event names, e.g. `signed_up`.
   * @default - none
   */
  readonly events?: string[];

  /**
   * Actions whose events trigger the workflow.
   * @default - none
   */
  readonly actions?: IAction[];

  /**
   * Property conditions the event must meet.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * Ignore events from internal and test users.
   * @default - PostHog default (false)
   */
  readonly filterTestAccounts?: boolean;

  /**
   * ID of the trigger step, used in `edges`.
   * @default HogFlowTrigger.DEFAULT_ID
   */
  readonly id?: string;
}

/**
 * Options for a custom trigger.
 */
export interface HogFlowCustomTriggerOptions extends HogFlowNodeOptions {
  /**
   * The trigger config, as PostHog stores it, e.g. `{type: 'webhook'}`.
   */
  readonly config: { [key: string]: any };

  /**
   * ID of the trigger step, used in `edges`.
   * @default HogFlowTrigger.DEFAULT_ID
   */
  readonly id?: string;
}

/**
 * The trigger of a workflow: the step people enter it through.
 */
export class HogFlowTrigger {
  /** Default ID of the trigger step. */
  public static readonly DEFAULT_ID = 'trigger_node';

  /**
   * People enter the workflow when they send a matching event.
   */
  public static event(options: HogFlowEventTriggerOptions): HogFlowTrigger {
    const filters = renderEventFilters(options);
    if (!filters?.events && !filters?.actions) {
      throw new Error('HogFlowTrigger.event: specify at least one event or action');
    }
    return new HogFlowTrigger(options.id ?? HogFlowTrigger.DEFAULT_ID, options, { type: 'event', filters });
  }

  /**
   * A trigger PostHog supports but this library does not model (webhook,
   * manual, schedule, ...).
   */
  public static custom(options: HogFlowCustomTriggerOptions): HogFlowTrigger {
    return new HogFlowTrigger(options.id ?? HogFlowTrigger.DEFAULT_ID, options, options.config);
  }

  /** ID of the trigger step. */
  public readonly id: string;

  private constructor(id: string, private readonly options: HogFlowNodeOptions, private readonly config: Record<string, unknown>) {
    this.id = id;
  }

  /** @internal */
  public _render(): Record<string, unknown> {
    return renderNode(this.id, 'trigger', this.config, this.options);
  }
}

/**
 * Options for a delay step.
 */
export interface HogFlowDelayOptions extends HogFlowNodeOptions {
  /** How long to wait (whole minutes). */
  readonly duration: Duration;
}

/**
 * Options for a webhook step (PostHog's `template-webhook`).
 */
export interface HogFlowWebhookOptions extends HogFlowNodeOptions {
  /** URL to call. May contain templates. */
  readonly url: string;

  /**
   * HTTP method, e.g. `POST`.
   * @default - the template default (POST)
   */
  readonly method?: string;

  /**
   * Request headers. Not secret.
   * @default - the template default
   */
  readonly headers?: { [key: string]: string };

  /**
   * Request body.
   * @default - the template default
   */
  readonly body?: { [key: string]: any };
}

/**
 * Options for an email step. Set exactly one of `email` and `template`.
 */
export interface HogFlowSendEmailOptions extends HogFlowNodeOptions {
  /**
   * Recipient address.
   * @default '{{ person.properties.email }}'
   */
  readonly to?: string;

  /**
   * Inline email content.
   * @default - none; `template` is required
   */
  readonly email?: EmailContent;

  /**
   * Messaging template to send.
   * @default - none; `email` is required
   */
  readonly template?: IMessageTemplate;

  /**
   * Messaging category the email belongs to (recipients who opted out of a
   * marketing category are skipped).
   * @default - none
   */
  readonly category?: IMessageCategory;
}

/**
 * Options for a step that runs a hog function template.
 */
export interface HogFlowFunctionOptions extends HogFlowNodeOptions {
  /** PostHog template ID, e.g. `template-slack`. */
  readonly templateId: string;

  /**
   * Input values, keyed by input key. Each is wrapped as `{value: ...}`.
   * @default - none
   */
  readonly inputs?: { [key: string]: any };
}

/**
 * Options for an exit step.
 */
export interface HogFlowExitOptions extends HogFlowNodeOptions {
  /**
   * Exit reason.
   * @default 'Default exit'
   */
  readonly reason?: string;
}

/**
 * Options for a step type this library does not model.
 */
export interface HogFlowCustomActionOptions extends HogFlowNodeOptions {
  /** Step type, e.g. `conditional_branch` or `wait_until_condition`. */
  readonly type: string;

  /** Step config, as PostHog stores it. */
  readonly config: { [key: string]: any };
}

/**
 * A step of a workflow, after the trigger.
 */
export class HogFlowAction {
  /**
   * Wait before continuing.
   */
  public static delay(id: string, options: HogFlowDelayOptions): HogFlowAction {
    const delay = formatWorkflowDuration(`HogFlowAction '${id}' duration`, options.duration);
    return new HogFlowAction(id, 'delay', { delay_duration: delay }, options);
  }

  /**
   * Call a URL (PostHog's `template-webhook`).
   */
  public static webhook(id: string, options: HogFlowWebhookOptions): HogFlowAction {
    return HogFlowAction.fromTemplate(id, {
      name: options.name,
      description: options.description,
      templateId: WEBHOOK_TEMPLATE_ID,
      inputs: { url: options.url, method: options.method, headers: options.headers, body: options.body },
    });
  }

  /**
   * Send an email, with inline content or a messaging template.
   */
  public static sendEmail(id: string, options: HogFlowSendEmailOptions): HogFlowAction {
    exactlyOne(`HogFlowAction '${id}'`, { email: options.email, template: options.template });
    const value: Record<string, unknown> = {
      to: { email: options.to ?? '{{ person.properties.email }}' },
      ...(options.email ? renderEmailContent(options.email) : {}),
    };
    if (options.template) value.templateId = options.template.messageTemplateId;
    const config: Record<string, unknown> = { template_id: EMAIL_TEMPLATE_ID, inputs: { email: { value } } };
    if (options.category) config.message_category_id = options.category.messageCategoryId;
    return new HogFlowAction(id, 'function_email', config, options);
  }

  /**
   * Run a hog function template (Slack, HubSpot, ...).
   */
  public static fromTemplate(id: string, options: HogFlowFunctionOptions): HogFlowAction {
    validateLength(`HogFlowAction '${id}' templateId`, options.templateId, 1, 400);
    const config: Record<string, unknown> = { template_id: options.templateId };
    const inputs = wrapInputs(options.inputs);
    if (inputs) config.inputs = inputs;
    return new HogFlowAction(id, 'function', config, options);
  }

  /**
   * Leave the workflow.
   */
  public static exit(id: string, options: HogFlowExitOptions = {}): HogFlowAction {
    return new HogFlowAction(id, 'exit', { reason: options.reason ?? 'Default exit' }, options);
  }

  /**
   * A step type this library does not model.
   */
  public static custom(id: string, options: HogFlowCustomActionOptions): HogFlowAction {
    validateLength(`HogFlowAction '${id}' type`, options.type, 1, 100);
    if (options.type === 'trigger') throw new Error(`HogFlowAction '${id}': use HogFlowTrigger for the trigger step`);
    return new HogFlowAction(id, options.type, options.config, options);
  }

  /** ID of the step, used in `edges`. */
  public readonly id: string;

  /** PostHog step type. */
  public readonly type: string;

  private constructor(id: string, type: string, private readonly config: Record<string, unknown>, private readonly options: HogFlowNodeOptions) {
    validateLength('HogFlowAction id', id, 1, 400);
    this.id = id;
    this.type = type;
  }

  /** @internal */
  public _render(): Record<string, unknown> {
    return renderNode(this.id, this.type, this.config, this.options);
  }
}

/**
 * An edge of the workflow graph.
 */
export interface HogFlowEdge {
  /** ID of the step the edge leaves. */
  readonly from: string;

  /** ID of the step the edge enters. */
  readonly to: string;

  /**
   * Edge type.
   * @default HogFlowEdgeType.CONTINUE
   */
  readonly type?: HogFlowEdgeType;

  /**
   * Index of the branch condition, for `BRANCH` edges.
   * @default - none
   */
  readonly index?: number;
}

/**
 * Dedup or throttle an already-matched trigger.
 */
export interface HogFlowTriggerMasking {
  /** Template computing the dedup key, e.g. `{person.id}`. */
  readonly hash: string;

  /**
   * How long repeats of the same hash are suppressed (1 minute to 3 years).
   * @default - PostHog default
   */
  readonly ttl?: Duration;

  /**
   * Fire once per N matches of the same hash within the TTL.
   * @default - fire on the first match only
   */
  readonly threshold?: number;
}

/**
 * Email pacing for a workflow.
 */
export interface EmailSendingRateLimit {
  /** Maximum emails per period. */
  readonly count: number;

  /** Window the count applies to. */
  readonly period: EmailRateLimitPeriod;
}

/**
 * A workflow variable.
 */
export interface HogFlowVariable {
  /** Variable key. */
  readonly key: string;

  /** Variable type. */
  readonly type: HogFlowVariableType;

  /**
   * Default value.
   * @default - none
   */
  readonly default?: any;
}

/**
 * Conversion goal of a workflow.
 */
export interface HogFlowConversion {
  /**
   * Events that count as a conversion.
   * @default - none
   */
  readonly events?: string[];

  /**
   * Person property conditions that count as a conversion.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * How long after entering the workflow a conversion counts (whole minutes).
   * @default - PostHog default
   */
  readonly window?: Duration;

  /**
   * Raw conversion JSON for fields not modelled above. The typed fields
   * override the same keys.
   * @default - none
   */
  readonly rawConversion?: { [key: string]: any };
}

/**
 * A PostHog workflow.
 */
export interface IHogFlow extends IResource {
  /**
   * The workflow ID (UUID).
   * @attribute
   */
  readonly hogFlowId: string;

  /** The project the workflow belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a workflow in a project.
 */
export interface HogFlowOptions {
  /** Workflow name (1 to 400 characters). */
  readonly name: string;

  /**
   * The trigger. Required unless `rawActions` contains a `trigger` step.
   * @default - none
   */
  readonly trigger?: HogFlowTrigger;

  /**
   * Steps after the trigger. When neither `edges` nor `rawEdges` is set, the
   * steps run in order: trigger, then each step, then an `exit` step (added
   * as `exit_node` when the last step is not an exit).
   * @default - none
   */
  readonly actions?: HogFlowAction[];

  /**
   * Edges between steps, for branching graphs. Turns off the automatic
   * chaining of `actions`.
   * @default - steps run in order
   */
  readonly edges?: HogFlowEdge[];

  /**
   * Raw step JSON appended to the typed steps, for step types and fields this
   * library does not model.
   * @default - none
   */
  readonly rawActions?: { [key: string]: any }[];

  /**
   * Raw edge JSON appended to `edges`. Turns off the automatic chaining of
   * `actions`.
   * @default - none
   */
  readonly rawEdges?: { [key: string]: any }[];

  /**
   * Description.
   * @default - none
   */
  readonly description?: string;

  /**
   * Tags.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Status. `ACTIVE` makes the workflow live: every stack update changes the
   * running workflow directly (there is no draft/publish step).
   * @default - PostHog default (HogFlowStatus.DRAFT)
   */
  readonly status?: HogFlowStatus;

  /**
   * Product surface that owns the workflow. Create-only.
   * @default - none
   */
  readonly originProduct?: HogFlowOriginProduct;

  /**
   * When people leave early.
   * @default - PostHog default (HogFlowExitCondition.EXIT_ONLY_AT_END)
   */
  readonly exitCondition?: HogFlowExitCondition;

  /**
   * Conversion goal. Required for the `*_CONVERSION` exit conditions.
   * @default - none
   */
  readonly conversion?: HogFlowConversion;

  /**
   * Dedup or throttle the trigger.
   * @default - no masking
   */
  readonly triggerMasking?: HogFlowTriggerMasking;

  /**
   * Email pacing.
   * @default - no pacing
   */
  readonly emailSendingRateLimit?: EmailSendingRateLimit;

  /**
   * Workflow variables (under 5 KB in total).
   * @default - none
   */
  readonly variables?: HogFlowVariable[];

  /**
   * What happens to the workflow when it is removed from the stack. PostHog
   * hard-deletes workflows.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a HogFlow.
 */
export interface HogFlowProps extends HogFlowOptions {
  /** The project to create the workflow in. */
  readonly project: IProject;
}

/**
 * A PostHog workflow (hog flow): a trigger followed by a graph of steps that
 * PostHog runs for each person who enters it.
 *
 * @resource PostHog::Workflows::HogFlow
 */
export class HogFlow extends Resource implements IHogFlow {
  /**
   * Import an existing workflow by its PostHog ID.
   */
  public static fromHogFlowId(scope: Construct, id: string, project: IProject, hogFlowId: string): IHogFlow {
    class Import extends Resource implements IHogFlow {
      public readonly hogFlowId = hogFlowId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly hogFlowId: string;
  public readonly project: IProject;

  /**
   * The trigger as JSON, derived by PostHog from the trigger step.
   * @attribute
   */
  public readonly hogFlowTrigger: string;

  /**
   * Version, incremented on every change.
   * @attribute
   */
  public readonly hogFlowVersion: number;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly hogFlowCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnHogFlow;

  constructor(scope: Construct, id: string, props: HogFlowProps) {
    super(scope, id);
    validateLength('HogFlow name', props.name, 1, 400);
    props.tags?.forEach(tag => validateLength('HogFlow tag', tag, 1, 255));
    if (props.exitCondition && props.exitCondition.endsWith('conversion') && !props.conversion) {
      throw new Error(`HogFlow: exitCondition ${props.exitCondition} requires conversion`);
    }
    if (props.emailSendingRateLimit) validateRange('HogFlow emailSendingRateLimit count', props.emailSendingRateLimit.count, 1, Number.MAX_SAFE_INTEGER);

    this.project = props.project;

    const { actions, edges } = renderGraph(props);

    this.resource = new CfnHogFlow(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      tags: uniqueOrUndefined(props.tags),
      status: props.status as string as CfnHogFlowPropsStatus | undefined,
      originProduct: props.originProduct as string as CfnHogFlowPropsOriginProduct | undefined,
      actions: jsonProp(this, actions)!,
      edges: jsonProp(this, edges),
      conversion: jsonProp(this, props.conversion && renderConversion(props.conversion)),
      exitCondition: props.exitCondition as string as CfnHogFlowPropsExitCondition | undefined,
      triggerMasking: props.triggerMasking && renderTriggerMasking(props.triggerMasking),
      emailSendingRateLimit: props.emailSendingRateLimit && {
        count: props.emailSendingRateLimit.count,
        period: props.emailSendingRateLimit.period as string as CfnHogFlowEmailSendingRateLimitPeriod,
      },
      variables: jsonProp(this, props.variables?.map(renderVariable)),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.hogFlowId = this.resource.attrId;
    this.hogFlowTrigger = this.resource.attrTrigger;
    this.hogFlowVersion = this.resource.attrVersion;
    this.hogFlowCreatedAt = this.resource.attrCreatedAt;
  }
}

function renderNode(id: string, type: string, config: Record<string, unknown>, options: HogFlowNodeOptions): Record<string, unknown> {
  const out: Record<string, unknown> = { id, name: options.name ?? id, type, config };
  if (options.description !== undefined) out.description = options.description;
  return out;
}

function renderGraph(props: HogFlowProps): { actions: Record<string, unknown>[]; edges: Record<string, unknown>[] | undefined } {
  const typed = props.actions ?? [];
  const actions: Record<string, unknown>[] = [];
  if (props.trigger) actions.push(props.trigger._render());
  actions.push(...typed.map(a => a._render()));

  let edges: Record<string, unknown>[] | undefined;
  if (props.edges === undefined && props.rawEdges === undefined) {
    if (props.trigger) {
      const chain = [props.trigger.id, ...typed.map(a => a.id)];
      if (typed.length === 0 || typed[typed.length - 1].type !== 'exit') {
        const exit = HogFlowAction.exit('exit_node');
        actions.push(exit._render());
        chain.push(exit.id);
      }
      edges = chain.slice(1).map((to, i) => ({ from: chain[i], to, type: HogFlowEdgeType.CONTINUE }));
    }
  } else {
    edges = [...(props.edges ?? []).map(renderEdge), ...(props.rawEdges ?? [])];
  }
  actions.push(...(props.rawActions ?? []));

  // Validation on concrete values.
  const triggers = actions.filter(a => a.type === 'trigger').length;
  if (triggers !== 1) {
    throw new Error(`HogFlow: exactly one trigger step is required, got ${triggers} (set trigger, or a rawActions step with type 'trigger')`);
  }
  const ids = actions.map(a => a.id).filter((v): v is string => typeof v === 'string' && isConcrete(v));
  const duplicates = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (duplicates.length > 0) {
    throw new Error(`HogFlow: duplicate step IDs: ${[...new Set(duplicates)].join(', ')}`);
  }
  const known = new Set(ids);
  for (const edge of props.edges ?? []) {
    for (const end of [edge.from, edge.to]) {
      if (isConcrete(end) && !known.has(end)) throw new Error(`HogFlow: edge ${edge.from} -> ${edge.to} refers to unknown step '${end}'`);
    }
  }
  return { actions, edges: edges && edges.length > 0 ? edges : undefined };
}

function renderEdge(edge: HogFlowEdge): Record<string, unknown> {
  const type = edge.type ?? HogFlowEdgeType.CONTINUE;
  if (type === HogFlowEdgeType.BRANCH && edge.index === undefined) {
    throw new Error(`HogFlow: branch edge ${edge.from} -> ${edge.to} requires index`);
  }
  const out: Record<string, unknown> = { from: edge.from, to: edge.to, type };
  if (edge.index !== undefined) out.index = edge.index;
  return out;
}

function renderConversion(conversion: HogFlowConversion): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(conversion.rawConversion ?? {}) };
  const filters = renderPropertyFilters(conversion.properties);
  if (filters) out.filters = filters;
  if (conversion.events && conversion.events.length > 0) {
    out.events = conversion.events.map(name => ({ filters: renderEventFilters({ events: [name] }) }));
  }
  if (conversion.window) out.window = formatWorkflowDuration('HogFlow conversion window', conversion.window);
  return out;
}

function renderTriggerMasking(masking: HogFlowTriggerMasking) {
  validateLength('HogFlow triggerMasking hash', masking.hash, 1, Number.MAX_SAFE_INTEGER);
  const ttl = masking.ttl?.toSeconds();
  validateRange('HogFlow triggerMasking ttl (seconds)', ttl, 60, 94608000);
  validateRange('HogFlow triggerMasking threshold', masking.threshold, 1, Number.MAX_SAFE_INTEGER);
  return { hash: masking.hash, ttl, threshold: masking.threshold };
}

function renderVariable(variable: HogFlowVariable): Record<string, unknown> {
  const out: Record<string, unknown> = { key: variable.key, type: variable.type };
  if (variable.default !== undefined) out.default = variable.default;
  return out;
}
