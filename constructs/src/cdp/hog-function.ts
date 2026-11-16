import * as fs from 'fs';
import { Annotations, Duration, IResource, RemovalPolicy, Resource, SecretValue, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnHogFunction, CfnHogFunctionPropsType } from './hog-function.generated';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { renderEventFilters, WEBHOOK_TEMPLATE_ID, wrapInputs } from '../private/cdp';
import { jsonProp, secretProp, validateLength, validateRange } from '../private/helpers';
import type { IAction } from '../product-analytics/action';

/**
 * What kind of hog function it is. Cannot be changed after creation.
 */
export enum HogFunctionType {
  /** Sends events to an external service (server side). */
  DESTINATION = 'destination',
  /** Sends events to an external service from the browser (TypeScript code). */
  SITE_DESTINATION = 'site_destination',
  /** Reacts to internal PostHog events (alerts, error tracking, ...). */
  INTERNAL_DESTINATION = 'internal_destination',
  /** Receives HTTP requests and turns them into events. */
  SOURCE_WEBHOOK = 'source_webhook',
  /** Receives HTTP requests and writes them to the data warehouse. */
  WAREHOUSE_SOURCE_WEBHOOK = 'warehouse_source_webhook',
  /** Runs in the browser on the website (TypeScript code). */
  SITE_APP = 'site_app',
  /** Changes or drops events at ingestion. */
  TRANSFORMATION = 'transformation',
  /** Transformation that only logs (no changes to events). */
  TRANSFORMATION_LOG = 'transformation_log',
}

/**
 * The rendered source of a hog function.
 */
export interface HogCodeConfig {
  /** The source code. */
  readonly source: string;
}

/**
 * The source code of a hog function: Hog for most types, TypeScript for
 * `SITE_DESTINATION` and `SITE_APP`.
 */
export abstract class HogCode {
  /**
   * Source code given inline.
   */
  public static fromInline(source: string): HogCode {
    return new InlineHogCode(source);
  }

  /**
   * Source code read from a local file when the app is synthesized.
   */
  public static fromFile(path: string): HogCode {
    return new FileHogCode(path);
  }

  /**
   * Renders the source for a hog function.
   */
  public abstract bind(scope: Construct): HogCodeConfig;
}

class InlineHogCode extends HogCode {
  constructor(private readonly source: string) {
    super();
    if (source.trim().length === 0) throw new Error('HogCode.fromInline: the source is empty');
  }

  public bind(_scope: Construct): HogCodeConfig {
    return { source: this.source };
  }
}

class FileHogCode extends HogCode {
  constructor(private readonly path: string) {
    super();
  }

  public bind(_scope: Construct): HogCodeConfig {
    if (!fs.existsSync(this.path)) throw new Error(`HogCode.fromFile: file not found: ${this.path}`);
    const source = fs.readFileSync(this.path, 'utf8');
    if (source.trim().length === 0) throw new Error(`HogCode.fromFile: ${this.path} is empty`);
    return { source };
  }
}

/**
 * Input types of a hog function's inputs schema.
 */
export enum HogFunctionInputType {
  /** A string (may contain `{event.properties.x}` templates). */
  STRING = 'string',
  /** A number. */
  NUMBER = 'number',
  /** A boolean. */
  BOOLEAN = 'boolean',
  /** A string-to-string dictionary. */
  DICTIONARY = 'dictionary',
  /** One of the listed choices. */
  CHOICE = 'choice',
  /** Free-form JSON. */
  JSON = 'json',
  /** An email message. */
  EMAIL = 'email',
  /** A PostHog integration (Slack, HubSpot, ...). */
  INTEGRATION = 'integration',
  /** A field of a PostHog integration. */
  INTEGRATION_FIELD = 'integration_field',
}

/**
 * One input definition of a hog function's inputs schema.
 */
export interface HogFunctionInputSchema {
  /** The input key, referenced in code as `inputs.<key>`. */
  readonly key: string;

  /** The input type. */
  readonly type: HogFunctionInputType;

  /**
   * Label shown in the PostHog UI.
   * @default - the key
   */
  readonly label?: string;

  /**
   * Help text shown in the PostHog UI.
   * @default - none
   */
  readonly description?: string;

  /**
   * Whether a value is required.
   * @default false
   */
  readonly required?: boolean;

  /**
   * Whether the value is secret. PostHog encrypts secret inputs and never
   * returns them; pass their values in `secretInputs`.
   * @default false
   */
  readonly secret?: boolean;

  /**
   * Default value.
   * @default - none
   */
  readonly default?: any;

  /**
   * Further schema fields (for example `choices` or `integration`), merged
   * into the rendered definition.
   * @default - none
   */
  readonly additionalFields?: { [key: string]: any };
}

/**
 * Which events trigger a hog function or one of its mappings. An event
 * matches when it matches any of `events` or `actions` (or any event when
 * both are empty) and all `properties`.
 */
export interface HogFunctionFilterOptions {
  /**
   * Event names, e.g. `$pageview` or `order_placed`.
   * @default - none
   */
  readonly events?: string[];

  /**
   * Actions whose events match.
   * @default - none
   */
  readonly actions?: IAction[];

  /**
   * Property conditions every matching event must meet.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * Ignore events from internal and test users.
   * @default - PostHog default (false)
   */
  readonly filterTestAccounts?: boolean;

  /**
   * Raw PostHog filter JSON, for fields not modelled above. The typed fields
   * override the same keys.
   * @default - none
   */
  readonly rawFilters?: { [key: string]: any };
}

/**
 * Suppress repeat events with the same hash for a while.
 */
export interface HogFunctionMasking {
  /** Hog template computing the hash, e.g. `{person.id}`. */
  readonly hash: string;

  /** How long repeat events are suppressed (1 minute to 1 day). */
  readonly ttl: Duration;

  /**
   * Number of matches before masking applies.
   * @default - mask from the first repeat
   */
  readonly threshold?: number;
}

/**
 * One mapping of a destination: a filter with its own inputs.
 */
export interface HogFunctionMapping extends HogFunctionFilterOptions {
  /**
   * Name of the mapping.
   * @default - none
   */
  readonly name?: string;

  /**
   * Input values for this mapping (not secret: keep secrets in the
   * function's top-level `secretInputs`).
   * @default - none
   */
  readonly inputs?: { [key: string]: any };

  /**
   * Inputs schema for this mapping.
   * @default - none
   */
  readonly inputsSchema?: HogFunctionInputSchema[];
}

/**
 * A PostHog hog function.
 */
export interface IHogFunction extends IResource {
  /**
   * The hog function ID (UUID).
   * @attribute
   */
  readonly hogFunctionId: string;

  /** The project the function belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a hog function in a project.
 */
export interface HogFunctionOptions extends HogFunctionFilterOptions {
  /** Function type. Cannot be changed after creation. */
  readonly type: HogFunctionType;

  /** Display name (1 to 400 characters). */
  readonly name: string;

  /**
   * Description.
   * @default - none
   */
  readonly description?: string;

  /**
   * Whether the function processes events.
   * @default - PostHog default
   */
  readonly enabled?: boolean;

  /**
   * PostHog template to create the function from, e.g. `template-slack`.
   * PostHog copies its code, inputs schema and defaults. Create-only.
   * @default - none; `code` is required
   */
  readonly templateId?: string;

  /**
   * Source code. Required unless `templateId` is set.
   * @default - the template's code
   */
  readonly code?: HogCode;

  /**
   * Inputs schema.
   * @default - the template's schema, or none
   */
  readonly inputsSchema?: HogFunctionInputSchema[];

  /**
   * Non-secret input values, keyed by input key. Each value is wrapped as
   * `{value: ...}` for PostHog.
   * @default - none
   */
  readonly inputs?: { [key: string]: any };

  /**
   * Secret input values (API tokens, passwords), keyed by input key. Use
   * `SecretValue.secretsManager()` or `SecretValue.ssmSecure()`: they render
   * as dynamic references, so the values never appear in the template.
   * Write-only: changes made outside CloudFormation are not detected.
   * @default - none
   */
  readonly secretInputs?: { [key: string]: SecretValue };

  /**
   * Destination mappings. Only for `DESTINATION` and `SITE_DESTINATION`.
   * @default - none
   */
  readonly mappings?: HogFunctionMapping[];

  /**
   * Suppress repeat events with the same hash.
   * @default - no masking
   */
  readonly masking?: HogFunctionMasking;

  /**
   * Icon URL shown in the PostHog UI.
   * @default - none
   */
  readonly iconUrl?: string;

  /**
   * Execution order for transformations; lower values run first.
   * @default - PostHog default
   */
  readonly executionOrder?: number;

  /**
   * What happens to the function when it is removed from the stack. PostHog
   * soft-deletes hog functions.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a HogFunction.
 */
export interface HogFunctionProps extends HogFunctionOptions {
  /** The project to create the function in. */
  readonly project: IProject;
}

/**
 * HTTP method of a webhook.
 */
export enum WebhookMethod {
  /** POST */
  POST = 'POST',
  /** PUT */
  PUT = 'PUT',
  /** PATCH */
  PATCH = 'PATCH',
  /** GET */
  GET = 'GET',
  /** DELETE */
  DELETE = 'DELETE',
}

/**
 * Options for a webhook destination built from PostHog's `template-webhook`.
 */
export interface WebhookHogFunctionOptions extends HogFunctionFilterOptions {
  /** URL to call. May contain Hog templates such as `{event.properties.x}`. */
  readonly url: string;

  /**
   * HTTP method.
   * @default - the template default (POST)
   */
  readonly method?: WebhookMethod;

  /**
   * Request headers. Values may contain Hog templates. Not secret.
   * @default - the template default
   */
  readonly headers?: { [key: string]: string };

  /**
   * Request body. Values may contain Hog templates such as `{event}`.
   * @default - the template default (the event and person)
   */
  readonly body?: { [key: string]: any };

  /**
   * Display name.
   * @default 'Webhook'
   */
  readonly name?: string;

  /**
   * Description.
   * @default - none
   */
  readonly description?: string;

  /**
   * Whether the destination processes events.
   * @default - PostHog default
   */
  readonly enabled?: boolean;

  /**
   * Suppress repeat events with the same hash.
   * @default - no masking
   */
  readonly masking?: HogFunctionMasking;

  /**
   * What happens to the function when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for `HogFunction.webhook()`.
 */
export interface WebhookHogFunctionProps extends WebhookHogFunctionOptions {
  /** The project to create the destination in. */
  readonly project: IProject;
}

/**
 * A PostHog hog function: a destination, transformation, site app or webhook
 * source that runs Hog code on events.
 *
 * @resource PostHog::CDP::HogFunction
 */
export class HogFunction extends Resource implements IHogFunction {
  /**
   * Import an existing hog function by its PostHog ID.
   */
  public static fromHogFunctionId(scope: Construct, id: string, project: IProject, hogFunctionId: string): IHogFunction {
    class Import extends Resource implements IHogFunction {
      public readonly hogFunctionId = hogFunctionId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  /**
   * A webhook destination created from PostHog's `template-webhook`.
   */
  public static webhook(scope: Construct, id: string, props: WebhookHogFunctionProps): HogFunction {
    return new HogFunction(scope, id, {
      project: props.project,
      type: HogFunctionType.DESTINATION,
      templateId: WEBHOOK_TEMPLATE_ID,
      name: props.name ?? 'Webhook',
      description: props.description,
      enabled: props.enabled,
      inputs: { url: props.url, method: props.method, headers: props.headers, body: props.body },
      events: props.events,
      actions: props.actions,
      properties: props.properties,
      filterTestAccounts: props.filterTestAccounts,
      rawFilters: props.rawFilters,
      masking: props.masking,
      removalPolicy: props.removalPolicy,
    });
  }

  public readonly hogFunctionId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly hogFunctionCreatedAt: string;

  /**
   * ISO 8601 timestamp of the last change.
   * @attribute
   */
  public readonly hogFunctionUpdatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnHogFunction;

  constructor(scope: Construct, id: string, props: HogFunctionProps) {
    super(scope, id);
    validateLength('HogFunction name', props.name, 1, 400);
    validateLength('HogFunction templateId', props.templateId, 1, 400);
    if (props.code === undefined && props.templateId === undefined) {
      throw new Error('HogFunction: specify code, templateId or both');
    }
    if (props.mappings && ![HogFunctionType.DESTINATION, HogFunctionType.SITE_DESTINATION].includes(props.type)) {
      throw new Error(`HogFunction: mappings are only supported for destination and site_destination functions, not ${props.type}`);
    }
    this.validateInputs(props);
    let maskingTtl: number | undefined;
    if (props.masking) {
      validateLength('HogFunction masking hash', props.masking.hash, 1, Number.MAX_SAFE_INTEGER);
      maskingTtl = props.masking.ttl.toSeconds();
      validateRange('HogFunction masking ttl (seconds)', maskingTtl, 60, 86400);
    }

    this.project = props.project;

    this.resource = new CfnHogFunction(this, 'Resource', {
      projectId: props.project.projectId,
      type: props.type as string as CfnHogFunctionPropsType,
      name: props.name,
      description: props.description,
      enabled: props.enabled,
      templateId: props.templateId,
      hog: props.code?.bind(this).source,
      inputsSchema: jsonProp(this, props.inputsSchema?.map(renderInputSchema)),
      inputs: jsonProp(this, wrapInputs(props.inputs)),
      secretInputs: this.renderSecretInputs(props.secretInputs),
      filters: jsonProp(this, renderEventFilters(props)),
      mappings: jsonProp(this, props.mappings?.map(renderMapping)),
      masking: props.masking && { hash: props.masking.hash, ttl: maskingTtl!, threshold: props.masking.threshold },
      iconUrl: props.iconUrl,
      executionOrder: props.executionOrder,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.hogFunctionId = this.resource.attrId;
    this.hogFunctionCreatedAt = this.resource.attrCreatedAt;
    this.hogFunctionUpdatedAt = this.resource.attrUpdatedAt;
  }

  /** Mirrors the resource type's checks of the Inputs / SecretInputs split. */
  private validateInputs(props: HogFunctionProps): void {
    const plain = Object.keys(props.inputs ?? {});
    const secret = Object.keys(props.secretInputs ?? {});
    const both = plain.filter(k => secret.includes(k));
    if (both.length > 0) {
      throw new Error(`HogFunction: input keys ${both.join(', ')} are in both inputs and secretInputs`);
    }
    if (!props.inputsSchema) return;
    const secretInSchema = new Set(props.inputsSchema.filter(s => s.secret).map(s => s.key));
    const unmarked = secret.filter(k => !secretInSchema.has(k));
    if (unmarked.length > 0) {
      throw new Error(`HogFunction: secretInputs ${unmarked.join(', ')} must be marked secret in inputsSchema`);
    }
    const leaked = plain.filter(k => secretInSchema.has(k));
    if (leaked.length > 0) {
      throw new Error(`HogFunction: inputs ${leaked.join(', ')} are marked secret in inputsSchema; pass them in secretInputs`);
    }
  }

  private renderSecretInputs(secretInputs: { [key: string]: SecretValue } | undefined): string | undefined {
    if (!secretInputs || Object.keys(secretInputs).length === 0) return undefined;
    const stack = Stack.of(this);
    const values: Record<string, { value: string | undefined }> = {};
    for (const [key, secret] of Object.entries(secretInputs)) {
      const resolved = stack.resolve(secret);
      if (typeof resolved === 'string' && !resolved.includes('{{resolve:')) {
        Annotations.of(this).addWarningV2('@posthog-cdk/cdp:plainTextSecretInput',
          `Secret input '${key}' is a plain-text value and will appear in the template. Use SecretValue.secretsManager() or SecretValue.ssmSecure().`);
      }
      values[key] = { value: secretProp(secret) };
    }
    return jsonProp(this, values);
  }
}

function renderInputSchema(schema: HogFunctionInputSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(schema.additionalFields ?? {}), key: schema.key, type: schema.type };
  if (schema.label !== undefined) out.label = schema.label;
  if (schema.description !== undefined) out.description = schema.description;
  if (schema.required !== undefined) out.required = schema.required;
  if (schema.secret !== undefined) out.secret = schema.secret;
  if (schema.default !== undefined) out.default = schema.default;
  return out;
}

function renderMapping(mapping: HogFunctionMapping): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (mapping.name !== undefined) out.name = mapping.name;
  const filters = renderEventFilters(mapping);
  if (filters) out.filters = filters;
  const inputs = wrapInputs(mapping.inputs);
  if (inputs) out.inputs = inputs;
  if (mapping.inputsSchema) out.inputs_schema = mapping.inputsSchema.map(renderInputSchema);
  return out;
}
