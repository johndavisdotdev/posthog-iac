import { IResource, RemovalPolicy, Resource, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnProviderKey, CfnProviderKeyPropsProvider } from './provider-key.generated';
import type { IProject } from '../organizations/project';
import { secretProp, validateLength, validatePattern } from '../private/helpers';
import { rejectUnless, requireValue, validateHttpsUrl } from '../private/llm-analytics';

/**
 * An LLM provider supported by PostHog LLM analytics.
 */
export enum Provider {
  /** OpenAI. */
  OPENAI = 'openai',
  /** Anthropic, from the Anthropic API or served by Microsoft Foundry. */
  ANTHROPIC = 'anthropic',
  /** Google Gemini. */
  GEMINI = 'gemini',
  /** OpenRouter. */
  OPENROUTER = 'openrouter',
  /** Fireworks AI. */
  FIREWORKS = 'fireworks',
  /** Azure OpenAI. */
  AZURE_OPENAI = 'azure_openai',
  /** Together AI. */
  TOGETHER_AI = 'together_ai',
  /** MiniMax. */
  MINIMAX = 'minimax',
  /** A System One endpoint. */
  SYSTEM_ONE = 'system_one',
  /** Any OpenAI-compatible API. */
  OPENAI_COMPATIBLE = 'openai_compatible',
}

/**
 * A PostHog LLM analytics provider key.
 */
export interface IProviderKey extends IResource {
  /**
   * The PostHog provider key ID (UUID).
   * @attribute
   */
  readonly providerKeyId: string;

  /** The project the provider key belongs to. */
  readonly project: IProject;

  /**
   * The provider the key is for, when known. Evaluations use it to check
   * that their judge model uses the same provider.
   * @default - unknown (imported keys without a provider)
   */
  readonly provider?: Provider;
}

/**
 * Options for creating a provider key in a project (`project.addProviderKey()`).
 */
export interface ProviderKeyOptions {
  /**
   * LLM provider the key is for. Changing it replaces the key.
   */
  readonly provider: Provider;

  /** Display name of the key, up to 255 characters. */
  readonly name: string;

  /**
   * The provider API key. Pass a Secrets Manager reference
   * (`SecretValue.secretsManager()`), so it is rendered as a dynamic
   * reference and never appears in the template. (CloudFormation only
   * resolves `ssm-secure` references for a fixed list of AWS resource
   * types, so `SecretValue.ssmSecure()` does not work here.)
   * Changing it rotates the key.
   */
  readonly apiKey: SecretValue;

  /**
   * Public HTTPS base URL of the API. Required for
   * `Provider.OPENAI_COMPATIBLE` and `Provider.SYSTEM_ONE` (for System One,
   * end it before `/systemone`); not allowed for other providers.
   * @default - none
   */
  readonly baseUrl?: string;

  /**
   * Model ID served by the System One endpoint, up to 100 characters.
   * Required for `Provider.SYSTEM_ONE`; not allowed for other providers.
   * @default - none
   */
  readonly systemOneModel?: string;

  /**
   * Azure endpoint URL. Required for `Provider.AZURE_OPENAI`. For
   * `Provider.ANTHROPIC`, set it to the endpoint of a Microsoft Foundry
   * resource (e.g. `https://my-resource.services.ai.azure.com/`) for a key
   * served by Foundry. Not allowed for other providers.
   * @default - none (for Anthropic: a key from the Anthropic API)
   */
  readonly azureEndpoint?: string;

  /**
   * Azure API version, up to 20 characters. Only for `Provider.AZURE_OPENAI`
   * and Foundry-served `Provider.ANTHROPIC` keys.
   * @default - PostHog default
   */
  readonly apiVersion?: string;

  /**
   * Make this the project's active key for its provider when it is created
   * or updated.
   * @default false
   */
  readonly setAsActive?: boolean;

  /**
   * What happens to the PostHog provider key when it is removed from the
   * stack. PostHog hard-deletes provider keys; evaluations pinned to the key
   * lose it.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a ProviderKey.
 */
export interface ProviderKeyProps extends ProviderKeyOptions {
  /** The project to create the provider key in. */
  readonly project: IProject;
}

/**
 * A PostHog LLM analytics provider key: an LLM provider API key that PostHog
 * uses to run LLM-judge evaluations in a project. The key is write-only;
 * PostHog only returns a masked form (`apiKeyMasked`).
 *
 * @resource PostHog::LLMAnalytics::ProviderKey
 */
export class ProviderKey extends Resource implements IProviderKey {
  /**
   * Import an existing provider key by its PostHog ID. Pass `provider` so
   * evaluations can check that their judge model uses the same provider.
   */
  public static fromProviderKeyId(scope: Construct, id: string, project: IProject, providerKeyId: string, provider?: Provider): IProviderKey {
    class Import extends Resource implements IProviderKey {
      public readonly providerKeyId = providerKeyId;
      public readonly project = project;
      public readonly provider = provider;
    }
    return new Import(scope, id);
  }

  public readonly providerKeyId: string;
  public readonly project: IProject;
  public readonly provider?: Provider;

  /**
   * Masked form of the API key, as shown in PostHog.
   * @attribute
   */
  public readonly apiKeyMasked: string;

  /**
   * Validation state of the key: `unknown`, `ok`, `invalid` or `error`.
   * @attribute
   */
  public readonly state: string;

  /**
   * Error reported by the provider when the key last failed validation.
   * @attribute
   */
  public readonly errorMessage: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly providerKeyCreatedAt: string;

  /**
   * ISO 8601 timestamp of when PostHog last used the key.
   * @attribute
   */
  public readonly lastUsedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnProviderKey;

  constructor(scope: Construct, id: string, props: ProviderKeyProps) {
    super(scope, id);
    validateLength('ProviderKey name', props.name, 1, 255);
    validateLength('ProviderKey systemOneModel', props.systemOneModel, 1, 100);
    validateLength('ProviderKey apiVersion', props.apiVersion, 1, 20);
    validateHttpsUrl('ProviderKey baseUrl', props.baseUrl);
    validateHttpsUrl('ProviderKey azureEndpoint', props.azureEndpoint);
    validateProviderOptions(props);

    this.project = props.project;
    this.provider = props.provider;

    this.resource = new CfnProviderKey(this, 'Resource', {
      projectId: props.project.projectId,
      provider: props.provider as string as CfnProviderKeyPropsProvider,
      name: props.name,
      apiKey: secretProp(props.apiKey),
      baseUrl: props.baseUrl,
      systemOneModel: props.systemOneModel,
      azureEndpoint: props.azureEndpoint,
      apiVersion: props.apiVersion,
      setAsActive: props.setAsActive,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.providerKeyId = this.resource.attrId;
    this.apiKeyMasked = this.resource.attrApiKeyMasked;
    this.state = this.resource.attrState;
    this.errorMessage = this.resource.attrErrorMessage;
    this.providerKeyCreatedAt = this.resource.attrCreatedAt;
    this.lastUsedAt = this.resource.attrLastUsedAt;
  }
}

function validateProviderOptions(props: ProviderKeyOptions): void {
  const p = props.provider;
  const context = `for provider '${p}'`;
  const usesBaseUrl = p === Provider.OPENAI_COMPATIBLE || p === Provider.SYSTEM_ONE;
  const usesAzure = p === Provider.AZURE_OPENAI || p === Provider.ANTHROPIC;

  rejectUnless(usesBaseUrl, 'ProviderKey baseUrl', props.baseUrl, context);
  rejectUnless(p === Provider.SYSTEM_ONE, 'ProviderKey systemOneModel', props.systemOneModel, context);
  rejectUnless(usesAzure, 'ProviderKey azureEndpoint', props.azureEndpoint, context);
  rejectUnless(usesAzure, 'ProviderKey apiVersion', props.apiVersion, context);

  if (usesBaseUrl) requireValue('ProviderKey baseUrl', props.baseUrl, context);
  if (p === Provider.SYSTEM_ONE) {
    requireValue('ProviderKey systemOneModel', props.systemOneModel, context);
    validatePattern('ProviderKey baseUrl', props.baseUrl, /^(?!.*\/systemone\/?$)/, 'for System One, end the URL before /systemone');
  }
  if (p === Provider.AZURE_OPENAI) requireValue('ProviderKey azureEndpoint', props.azureEndpoint, context);
  if (p === Provider.ANTHROPIC && props.apiVersion !== undefined) {
    requireValue('ProviderKey azureEndpoint', props.azureEndpoint, 'when apiVersion is set for an Anthropic key (Microsoft Foundry)');
  }
}
