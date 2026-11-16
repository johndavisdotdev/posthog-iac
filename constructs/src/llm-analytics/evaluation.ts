import { Duration, IResource, RemovalPolicy, Resource, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CfnEvaluation,
  CfnEvaluationModelConfiguration,
  CfnEvaluationModelConfigurationProvider,
  CfnEvaluationPropsEvaluationType,
  CfnEvaluationPropsOutputType,
  CfnEvaluationPropsTarget,
} from './evaluation.generated';
import { IProviderKey, Provider } from './provider-key';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { renderPropertyFilters } from '../private/filters';
import { isConcrete, jsonProp, validateLength, validateRange } from '../private/helpers';
import { compact, rejectUnless, requireValue } from '../private/llm-analytics';

/**
 * How an evaluation scores its input.
 */
export enum EvaluationType {
  /** An LLM judge scores outputs against a prompt. */
  LLM_JUDGE = 'llm_judge',
  /** Deterministic Hog code. */
  HOG = 'hog',
  /** Classifies user-message sentiment (English only). */
  SENTIMENT = 'sentiment',
}

/**
 * The output format of an evaluation.
 */
export enum EvaluationOutputType {
  /** Pass/fail. */
  BOOLEAN = 'boolean',
  /** A finite numeric score. */
  NUMERIC = 'numeric',
  /** One or more category keys. */
  CATEGORICAL = 'categorical',
  /** A sentiment classification. */
  SENTIMENT = 'sentiment',
}

/**
 * What an evaluation runs on.
 */
export enum EvaluationTarget {
  /** Each matching `$ai_generation` event. */
  GENERATION = 'generation',
  /** The whole trace, once. */
  TRACE = 'trace',
  /** The whole `$ai_session_id` session, once. */
  SESSION = 'session',
}

/**
 * How an LLM judge reaches its result.
 */
export enum JudgeMethod {
  /** The judge returns the result directly. */
  LLM = 'llm',
  /** The judge returns a decision that is compared with a threshold. */
  DECISION = 'decision',
}

/**
 * Comparison of a numeric passing rule.
 */
export enum NumericPassingOperator {
  /** The score passes when it is greater than or equal to the threshold. */
  GREATER_THAN_OR_EQUAL = 'gte',
  /** The score passes when it is less than or equal to the threshold. */
  LESS_THAN_OR_EQUAL = 'lte',
}

/**
 * Whether a categorical evaluation picks one category or several.
 */
export enum CategorySelectionMode {
  /** Exactly one category. */
  SINGLE = 'single',
  /** Any number of categories. */
  MULTIPLE = 'multiple',
}

/**
 * Options for a boolean (pass/fail) output.
 */
export interface BooleanOutputOptions {
  /**
   * Allow the evaluation to return N/A when it does not apply.
   * @default - PostHog default (false)
   */
  readonly allowsNa?: boolean;

  /**
   * Treat `true` as a failure (e.g. "contains PII").
   * @default - PostHog default (false)
   */
  readonly trueIsFailure?: boolean;

  /**
   * Threshold between 0 and 1 for `JudgeMethod.DECISION` judges.
   * @default - PostHog default
   */
  readonly decisionThreshold?: number;
}

/**
 * Options for a numeric output.
 */
export interface NumericOutputOptions {
  /**
   * Lowest score.
   * @default - PostHog default
   */
  readonly min?: number;

  /**
   * Highest score.
   * @default - PostHog default
   */
  readonly max?: number;

  /**
   * Score increment.
   * @default - PostHog default
   */
  readonly step?: number;

  /**
   * When a score counts as passing. Set together with `passingOperator`.
   * @default - no passing rule
   */
  readonly passingThreshold?: number;

  /**
   * How the score is compared with `passingThreshold`.
   * @default NumericPassingOperator.GREATER_THAN_OR_EQUAL
   */
  readonly passingOperator?: NumericPassingOperator;
}

/**
 * One category of a categorical output.
 */
export interface CategoryOption {
  /** Stable key of the category, returned by the evaluation. */
  readonly key: string;

  /** Display label. */
  readonly label: string;
}

/**
 * Options for a categorical output.
 */
export interface CategoricalOutputOptions {
  /** The categories. At least one; keys must be unique. */
  readonly options: CategoryOption[];

  /**
   * Whether one or several categories are selected.
   * @default - PostHog default (single)
   */
  readonly selectionMode?: CategorySelectionMode;

  /**
   * Category keys that count as passing.
   * @default - no passing rule
   */
  readonly passingCategories?: string[];
}

/**
 * The output format and settings of an evaluation.
 */
export class EvaluationOutput {
  /** Pass/fail output. */
  public static boolean(options: BooleanOutputOptions = {}): EvaluationOutput {
    validateRange('Evaluation output decisionThreshold', options.decisionThreshold, 0, 1);
    return new EvaluationOutput(EvaluationOutputType.BOOLEAN, compact({
      allows_na: options.allowsNa,
      true_is_failure: options.trueIsFailure,
      decision_threshold: options.decisionThreshold,
    }));
  }

  /** Numeric score output. */
  public static numeric(options: NumericOutputOptions = {}): EvaluationOutput {
    const { min, max } = options;
    if (min !== undefined && max !== undefined && !Token.isUnresolved(min) && !Token.isUnresolved(max) && min >= max) {
      throw new Error(`Evaluation output min (${min}) must be less than max (${max})`);
    }
    if (options.step !== undefined && !Token.isUnresolved(options.step) && options.step <= 0) {
      throw new Error(`Evaluation output step must be positive, got ${options.step}`);
    }
    if (options.passingOperator !== undefined && options.passingThreshold === undefined) {
      throw new Error('Evaluation output passingOperator requires passingThreshold');
    }
    const passingRule = options.passingThreshold === undefined ? undefined : {
      operator: options.passingOperator ?? NumericPassingOperator.GREATER_THAN_OR_EQUAL,
      threshold: options.passingThreshold,
    };
    return new EvaluationOutput(EvaluationOutputType.NUMERIC, compact({
      min, max, step: options.step, passing_rule: passingRule,
    }));
  }

  /** Categorical output. */
  public static categorical(options: CategoricalOutputOptions): EvaluationOutput {
    if (options.options.length === 0) {
      throw new Error('Evaluation categorical output needs at least one option');
    }
    const keys = options.options.map(o => o.key);
    const duplicate = keys.find((k, i) => isConcrete(k) && keys.indexOf(k) !== i);
    if (duplicate !== undefined) {
      throw new Error(`Evaluation categorical output has duplicate option key '${duplicate}'`);
    }
    for (const c of options.passingCategories ?? []) {
      if (isConcrete(c) && keys.every(isConcrete) && !keys.includes(c)) {
        throw new Error(`Evaluation passing category '${c}' is not one of the option keys (${keys.join(', ')})`);
      }
    }
    return new EvaluationOutput(EvaluationOutputType.CATEGORICAL, compact({
      options: options.options.map(o => ({ key: o.key, label: o.label })),
      selection_mode: options.selectionMode,
      passing_rule: options.passingCategories ? { categories: options.passingCategories } : undefined,
    }));
  }

  /** Sentiment output, for `EvaluationType.SENTIMENT` evaluations. */
  public static sentiment(): EvaluationOutput {
    return new EvaluationOutput(EvaluationOutputType.SENTIMENT);
  }

  /**
   * Escape hatch: any output type with raw `output_config` JSON, in
   * PostHog's shape.
   */
  public static custom(outputType: EvaluationOutputType, rawConfig?: { [key: string]: any }): EvaluationOutput {
    return new EvaluationOutput(outputType, rawConfig);
  }

  private constructor(
    /** The output type. */
    public readonly outputType: EvaluationOutputType,
    /** The `output_config` JSON, in PostHog's shape. */
    public readonly config?: { [key: string]: any },
  ) {}
}

/**
 * Inactivity settle options for `SettleStrategy.inactivity()`.
 */
export interface InactivitySettleOptions {
  /** How long the trace or session must be quiet before it is evaluated. */
  readonly quietPeriod: Duration;

  /**
   * Evaluate after this long even if the trace or session is still active.
   * @default - PostHog default
   */
  readonly maxAge?: Duration;
}

/**
 * When a trace or session counts as complete and is evaluated
 * (`TargetConfig`). Only for `EvaluationTarget.TRACE` and `SESSION`.
 */
export class SettleStrategy {
  /** Evaluate a fixed time after the trace or session starts. */
  public static fixedWindow(window: Duration): SettleStrategy {
    return new SettleStrategy({ strategy: 'fixed_window', window_seconds: window.toSeconds() });
  }

  /** Evaluate once the trace or session has been quiet for a while. */
  public static inactivity(options: InactivitySettleOptions): SettleStrategy {
    return new SettleStrategy(compact({
      strategy: 'inactivity',
      quiet_period_seconds: options.quietPeriod.toSeconds(),
      max_age_seconds: options.maxAge?.toSeconds(),
    })!);
  }

  private constructor(
    /** The `target_config` JSON, in PostHog's shape. */
    public readonly config: { [key: string]: any },
  ) {}
}

/**
 * A trigger condition set. An evaluation runs on input that matches any
 * condition set; within a set, every property filter must match.
 */
export interface EvaluationCondition {
  /**
   * Stable ID of the condition set.
   * @default - `condition-<index>`
   */
  readonly id?: string;

  /**
   * Percentage (0-100) of matching input that is evaluated.
   * @default 100
   */
  readonly samplingPercentage?: number;

  /**
   * Event or person property filters.
   * @default - all input
   */
  readonly properties?: PropertyFilter[];
}

/**
 * The model an LLM judge runs on.
 */
export interface JudgeModel {
  /** LLM provider of the judge model. */
  readonly provider: Provider;

  /** Model ID, e.g. `gpt-4.1-mini`. Up to 100 characters. */
  readonly model: string;

  /**
   * Project provider key to run the evaluation with. It must use the same
   * provider.
   * @default - PostHog's default key for the provider
   */
  readonly providerKey?: IProviderKey;
}

/**
 * Options shared by every evaluation type.
 */
export interface EvaluationBaseOptions {
  /** Name of the evaluation, up to 400 characters. */
  readonly name: string;

  /**
   * Description of what the evaluation checks.
   * @default - none
   */
  readonly description?: string;

  /**
   * Run the evaluation automatically on new matching input.
   * @default false
   */
  readonly enabled?: boolean;

  /**
   * Output format and settings.
   * @default - `EvaluationOutput.sentiment()` for sentiment evaluations,
   * `EvaluationOutput.boolean()` otherwise
   */
  readonly output?: EvaluationOutput;

  /**
   * Trigger conditions. OR between condition sets, AND within each.
   * @default - all input
   */
  readonly conditions?: EvaluationCondition[];

  /**
   * What the evaluation runs on.
   * @default EvaluationTarget.GENERATION
   */
  readonly target?: EvaluationTarget;

  /**
   * When a trace or session is evaluated. Only for `EvaluationTarget.TRACE`
   * and `EvaluationTarget.SESSION`.
   * @default - PostHog per-target defaults
   */
  readonly settle?: SettleStrategy;

  /**
   * ID of the PostHog directory (folder) containing the evaluation.
   * @default - top level
   */
  readonly directoryId?: string;

  /**
   * What happens to the PostHog evaluation when it is removed from the
   * stack. PostHog soft-deletes evaluations (it does not allow a hard
   * delete).
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Options for an LLM-judge evaluation.
 */
export interface LlmJudgeEvaluationOptions extends EvaluationBaseOptions {
  /** Prompt the judge scores the input against. */
  readonly prompt: string;

  /** The judge model. */
  readonly model: JudgeModel;

  /**
   * How the judge reaches its result.
   * @default - PostHog default (JudgeMethod.LLM)
   */
  readonly judgeMethod?: JudgeMethod;

  /**
   * Include images and other media in what the judge sees.
   * @default - PostHog default
   */
  readonly includeMedia?: boolean;

  /**
   * Reasoning level of the judge model, for models that support it
   * (passed to PostHog as `reasoning_level`).
   * @default - PostHog default
   */
  readonly reasoningLevel?: string;
}

/**
 * Properties for `Evaluation.llmJudge()`.
 */
export interface LlmJudgeEvaluationProps extends LlmJudgeEvaluationOptions {
  /** The project to create the evaluation in. */
  readonly project: IProject;
}

/**
 * Options for a Hog code evaluation.
 */
export interface HogEvaluationOptions extends EvaluationBaseOptions {
  /** The Hog source code. */
  readonly source: string;
}

/**
 * Properties for `Evaluation.hog()`.
 */
export interface HogEvaluationProps extends HogEvaluationOptions {
  /** The project to create the evaluation in. */
  readonly project: IProject;
}

/**
 * Properties for `Evaluation.sentiment()`.
 */
export interface SentimentEvaluationProps extends EvaluationBaseOptions {
  /** The project to create the evaluation in. */
  readonly project: IProject;
}

/**
 * Options for creating an evaluation of any type in a project
 * (`project.addEvaluation()`).
 */
export interface EvaluationOptions extends EvaluationBaseOptions {
  /** How the evaluation scores its input. */
  readonly evaluationType: EvaluationType;

  /**
   * Prompt of an LLM judge. Required for `EvaluationType.LLM_JUDGE` (unless
   * given in `rawEvaluationConfig`).
   * @default - none
   */
  readonly prompt?: string;

  /**
   * The judge model. Required for `EvaluationType.LLM_JUDGE`; not allowed
   * for other types.
   * @default - none
   */
  readonly model?: JudgeModel;

  /**
   * How an LLM judge reaches its result. Only for `EvaluationType.LLM_JUDGE`.
   * @default - PostHog default
   */
  readonly judgeMethod?: JudgeMethod;

  /**
   * Include media in what an LLM judge sees. Only for
   * `EvaluationType.LLM_JUDGE`.
   * @default - PostHog default
   */
  readonly includeMedia?: boolean;

  /**
   * Reasoning level of an LLM judge. Only for `EvaluationType.LLM_JUDGE`.
   * @default - PostHog default
   */
  readonly reasoningLevel?: string;

  /**
   * Hog source code. Required for `EvaluationType.HOG` (unless given in
   * `rawEvaluationConfig`).
   * @default - none
   */
  readonly source?: string;

  /**
   * Escape hatch: extra `evaluation_config` keys in PostHog's shape, merged
   * over the typed options.
   * @default - none
   */
  readonly rawEvaluationConfig?: { [key: string]: any };
}

/**
 * Properties for an Evaluation.
 */
export interface EvaluationProps extends EvaluationOptions {
  /** The project to create the evaluation in. */
  readonly project: IProject;
}

/**
 * A PostHog LLM analytics evaluation.
 */
export interface IEvaluation extends IResource {
  /**
   * The PostHog evaluation ID (UUID).
   * @attribute
   */
  readonly evaluationId: string;

  /** The project the evaluation belongs to. */
  readonly project: IProject;
}

/**
 * A PostHog LLM analytics evaluation: scores LLM generations, traces or
 * sessions with an LLM judge, Hog code or sentiment classification.
 *
 * Use `Evaluation.llmJudge()`, `Evaluation.hog()` or `Evaluation.sentiment()`
 * for the typed form of each evaluation type.
 *
 * @resource PostHog::LLMAnalytics::Evaluation
 */
export class Evaluation extends Resource implements IEvaluation {
  /**
   * Import an existing evaluation by its PostHog ID.
   */
  public static fromEvaluationId(scope: Construct, id: string, project: IProject, evaluationId: string): IEvaluation {
    class Import extends Resource implements IEvaluation {
      public readonly evaluationId = evaluationId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  /** Create an evaluation scored by an LLM judge. */
  public static llmJudge(scope: Construct, id: string, props: LlmJudgeEvaluationProps): Evaluation {
    return new Evaluation(scope, id, { ...props, evaluationType: EvaluationType.LLM_JUDGE });
  }

  /** Create an evaluation scored by deterministic Hog code. */
  public static hog(scope: Construct, id: string, props: HogEvaluationProps): Evaluation {
    return new Evaluation(scope, id, { ...props, evaluationType: EvaluationType.HOG });
  }

  /** Create an evaluation that classifies user-message sentiment (English only). */
  public static sentiment(scope: Construct, id: string, props: SentimentEvaluationProps): Evaluation {
    return new Evaluation(scope, id, { ...props, evaluationType: EvaluationType.SENTIMENT });
  }

  public readonly evaluationId: string;
  public readonly project: IProject;

  /** How the evaluation scores its input. */
  public readonly evaluationType: EvaluationType;

  /**
   * Current status: `active`, `paused` or `error`.
   * @attribute
   */
  public readonly status: string;

  /**
   * Why PostHog disabled the evaluation, when `status` is `error`
   * (e.g. `provider_key_invalid`).
   * @attribute
   */
  public readonly statusReason: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly evaluationCreatedAt: string;

  /**
   * ISO 8601 timestamp of the last update.
   * @attribute
   */
  public readonly evaluationUpdatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnEvaluation;

  constructor(scope: Construct, id: string, props: EvaluationProps) {
    super(scope, id);
    validateLength('Evaluation name', props.name, 1, 400);
    validateType(props);

    const output = props.output
      ?? (props.evaluationType === EvaluationType.SENTIMENT ? EvaluationOutput.sentiment() : EvaluationOutput.boolean());
    const sentimentType = props.evaluationType === EvaluationType.SENTIMENT;
    if (sentimentType !== (output.outputType === EvaluationOutputType.SENTIMENT)) {
      throw new Error(`Evaluation output type '${output.outputType}' cannot be used with evaluation type '${props.evaluationType}': `
        + 'sentiment output goes with sentiment evaluations only');
    }

    const target = props.target ?? EvaluationTarget.GENERATION;
    if (props.settle && target === EvaluationTarget.GENERATION) {
      throw new Error('Evaluation settle is only supported for the trace and session targets');
    }

    this.project = props.project;
    this.evaluationType = props.evaluationType;

    this.resource = new CfnEvaluation(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      directoryId: props.directoryId,
      enabled: props.enabled,
      evaluationType: props.evaluationType as string as CfnEvaluationPropsEvaluationType,
      evaluationConfig: jsonProp(this, this.renderEvaluationConfig(props)),
      outputType: output.outputType as string as CfnEvaluationPropsOutputType,
      outputConfig: jsonProp(this, output.config),
      conditions: jsonProp(this, this.renderConditions(props.conditions)),
      target: props.target as string as CfnEvaluationPropsTarget | undefined,
      targetConfig: jsonProp(this, props.settle?.config),
      modelConfiguration: this.renderModel(props.model),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.evaluationId = this.resource.attrId;
    this.status = this.resource.attrStatus;
    this.statusReason = this.resource.attrStatusReason;
    this.evaluationCreatedAt = this.resource.attrCreatedAt;
    this.evaluationUpdatedAt = this.resource.attrUpdatedAt;
  }

  private renderEvaluationConfig(props: EvaluationProps): Record<string, unknown> | undefined {
    const typed = compact({
      prompt: props.prompt,
      judge_method: props.judgeMethod,
      include_media: props.includeMedia,
      reasoning_level: props.reasoningLevel,
      source: props.source,
    });
    if (!typed && !props.rawEvaluationConfig) return undefined;
    return { ...typed, ...props.rawEvaluationConfig };
  }

  private renderConditions(conditions: EvaluationCondition[] | undefined): Record<string, unknown>[] | undefined {
    if (!conditions || conditions.length === 0) return undefined;
    return conditions.map((c, i) => {
      validateRange('Evaluation condition samplingPercentage', c.samplingPercentage, 0, 100);
      return {
        id: c.id ?? `condition-${i}`,
        rollout_percentage: c.samplingPercentage ?? 100,
        properties: renderPropertyFilters(c.properties) ?? [],
      };
    });
  }

  private renderModel(model: JudgeModel | undefined): CfnEvaluationModelConfiguration | undefined {
    if (!model) return undefined;
    validateLength('Evaluation model', model.model, 1, 100);
    const keyProvider = model.providerKey?.provider;
    if (keyProvider !== undefined && keyProvider !== model.provider) {
      throw new Error(`Evaluation model provider '${model.provider}' does not match the provider key's provider '${keyProvider}'`);
    }
    return {
      provider: model.provider as string as CfnEvaluationModelConfigurationProvider,
      model: model.model,
      providerKeyId: model.providerKey?.providerKeyId,
    };
  }
}

function validateType(props: EvaluationProps): void {
  const type = props.evaluationType;
  const judge = type === EvaluationType.LLM_JUDGE;
  const context = `for evaluation type '${type}'`;
  const raw = props.rawEvaluationConfig ?? {};

  rejectUnless(judge, 'Evaluation model', props.model, context);
  rejectUnless(judge, 'Evaluation prompt', props.prompt, context);
  rejectUnless(judge, 'Evaluation judgeMethod', props.judgeMethod, context);
  rejectUnless(judge, 'Evaluation includeMedia', props.includeMedia, context);
  rejectUnless(judge, 'Evaluation reasoningLevel', props.reasoningLevel, context);
  rejectUnless(type === EvaluationType.HOG, 'Evaluation source', props.source, context);

  if (judge) {
    requireValue('Evaluation model (the judge model configuration)', props.model, context);
    requireValue('Evaluation prompt', props.prompt ?? raw.prompt, context);
    validateLength('Evaluation prompt', props.prompt, 1, Number.MAX_SAFE_INTEGER);
  }
  if (type === EvaluationType.HOG) {
    requireValue('Evaluation source', props.source ?? raw.source, context);
    validateLength('Evaluation source', props.source, 1, Number.MAX_SAFE_INTEGER);
  }
}
