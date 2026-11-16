import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LogFilter } from './log-filter';
import { CfnSamplingRule, CfnSamplingRulePropsRuleType, CfnSamplingRulePropsSource } from './sampling-rule.generated';
import type { IProject } from '../organizations/project';
import { exactlyOne, isConcreteNumber, jsonProp, validateLength, validateRange } from '../private/helpers';

const MAX_RATE = 1_000_000;
const MAX_BURST = 10_000_000;

/**
 * What a sampling rule does with matching records.
 */
export enum RuleType {
  /** Keep, drop or sample records by severity level (logs only). */
  SEVERITY_SAMPLING = 'severity_sampling',
  /** Drop matching records. */
  PATH_DROP = 'path_drop',
  /** Cap the volume of matching records at ingestion. */
  RATE_LIMIT = 'rate_limit',
}

/**
 * Which records a sampling rule filters.
 */
export enum SamplingSource {
  /** Log records, in the logs pipeline. */
  LOGS = 'logs',
  /** Spans, in the traces pipeline. */
  SPANS = 'spans',
}

/**
 * Comparison of a sampling rule attribute filter.
 */
export enum AttributeOperator {
  /** The attribute equals the value. */
  EQUALS = 'eq',
  /** The attribute is set and does not equal the value. */
  NOT_EQUALS = 'ne',
  /** The attribute is set (no value). */
  EXISTS = 'exists',
}

/**
 * A predicate over a string attribute of a record.
 */
export interface AttributeFilter {
  /** Attribute name, e.g. `http.route`. */
  readonly key: string;

  /** How the attribute is compared. */
  readonly operator: AttributeOperator;

  /**
   * The value to compare with. Required unless the operator is `EXISTS`.
   * @default - no value
   */
  readonly value?: string;
}

/**
 * Kind of severity action.
 */
export enum SeverityActionType {
  /** Keep every record. */
  KEEP = 'keep',
  /** Drop every record. */
  DROP = 'drop',
  /** Keep a fraction of the records. */
  SAMPLE = 'sample',
}

/**
 * What a severity sampling rule does with the records of one severity level.
 */
export class SeverityAction {
  /** Keep every record. */
  public static keep(): SeverityAction {
    return new SeverityAction(SeverityActionType.KEEP);
  }

  /** Drop every record. */
  public static drop(): SeverityAction {
    return new SeverityAction(SeverityActionType.DROP);
  }

  /** Keep a fraction of the records, from 0 (none) to 1 (all). */
  public static sample(rate: number): SeverityAction {
    validateRange('SeverityAction sample rate', rate, 0, 1);
    return new SeverityAction(SeverityActionType.SAMPLE, rate);
  }

  private constructor(
    /** Keep, drop or sample. */
    public readonly type: SeverityActionType,
    /** Fraction of records kept, for `sample`. */
    public readonly rate?: number,
  ) {}
}

/**
 * Per-severity actions of a severity sampling rule. Unset levels keep every
 * record.
 */
export interface SeverityActions {
  /**
   * Action for DEBUG records.
   * @default SeverityAction.keep()
   */
  readonly debug?: SeverityAction;

  /**
   * Action for INFO records.
   * @default SeverityAction.keep()
   */
  readonly info?: SeverityAction;

  /**
   * Action for WARN records.
   * @default SeverityAction.keep()
   */
  readonly warn?: SeverityAction;

  /**
   * Action for ERROR records.
   * @default SeverityAction.keep()
   */
  readonly error?: SeverityAction;
}

/**
 * Records a sampling rule always keeps, whatever its other settings. A
 * record is kept when any condition matches.
 */
export interface AlwaysKeep {
  /**
   * Keep records whose `http.status_code` is at least this value, e.g. 500.
   * @default - not used
   */
  readonly statusCodeAtLeast?: number;

  /**
   * Keep records whose `http.server.duration_ms` (or `duration_ms`) is above
   * this duration.
   * @default - not used
   */
  readonly latencyAbove?: Duration;

  /**
   * Keep records matching any of these attribute predicates.
   * @default - none
   */
  readonly attributes?: AttributeFilter[];
}

/**
 * A PostHog Logs sampling rule.
 */
export interface ISamplingRule extends IResource {
  /**
   * The PostHog sampling rule ID (a UUID).
   * @attribute
   */
  readonly samplingRuleId: string;

  /** The project the rule belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a sampling rule in a project.
 */
export interface SamplingRuleOptions {
  /** User-visible label for the rule. */
  readonly name: string;

  /** What the rule does with matching records. */
  readonly ruleType: RuleType;

  /**
   * Which records the rule filters. Span rules support `PATH_DROP` and
   * `RATE_LIMIT` only.
   *
   * PostHog cannot change it after creation, so changing it replaces the rule.
   * @default SamplingSource.LOGS
   */
  readonly source?: SamplingSource;

  /**
   * Which records the rule applies to (`PATH_DROP` and `RATE_LIMIT`).
   * @default - every record (`RATE_LIMIT`); `PATH_DROP` needs `filters` or `dropPatterns`
   */
  readonly filters?: LogFilter;

  /**
   * Legacy regular expressions matched against a path-like attribute
   * (`PATH_DROP`). A record is dropped when it matches `filters` or any
   * pattern.
   * @default - none
   */
  readonly dropPatterns?: string[];

  /**
   * The attribute `dropPatterns` are matched against (`PATH_DROP`).
   * @default - the first of `url.path`, `http.path`, `http.route` and `path`
   */
  readonly matchAttributeKey?: string;

  /**
   * Per-severity actions (`SEVERITY_SAMPLING`).
   * @default - keep every level
   */
  readonly severityActions?: SeverityActions;

  /**
   * Records the rule always keeps.
   * @default - none
   */
  readonly alwaysKeep?: AlwaysKeep;

  /**
   * Cap in log records per second, 1 to 1,000,000 (`RATE_LIMIT`). Set this or
   * `kbPerSecond`.
   * @default - not used
   */
  readonly logsPerSecond?: number;

  /**
   * Burst size in records, at least `logsPerSecond` and at most 10,000,000.
   * @default - three times `logsPerSecond`
   */
  readonly burstLogs?: number;

  /**
   * Cap in kilobytes (1,000 bytes) per second, 1 to 1,000,000 (`RATE_LIMIT`).
   * Set this or `logsPerSecond`.
   * @default - not used
   */
  readonly kbPerSecond?: number;

  /**
   * Burst size in kilobytes, at least `kbPerSecond` and at most 10,000,000.
   * @default - three times `kbPerSecond`
   */
  readonly burstKb?: number;

  /**
   * Legacy scope: only records from this service. Prefer `filters`.
   * @default - any service
   */
  readonly scopeService?: string;

  /**
   * Scope: a regular expression a path-like attribute must match.
   * @default - any path
   */
  readonly pathPattern?: string;

  /**
   * Scope: predicates over string attributes.
   * @default - none
   */
  readonly attributeFilters?: AttributeFilter[];

  /**
   * Evaluation order. Lower numbers are evaluated first and the first
   * matching rule wins. Logs and span rules have separate orders.
   * @default - appended after the existing rules
   */
  readonly priority?: number;

  /**
   * Whether the rule is active.
   * @default false
   */
  readonly enabled?: boolean;

  /**
   * What happens to the PostHog rule when it is removed from the stack.
   * PostHog hard-deletes rules.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a SamplingRule.
 */
export interface SamplingRuleProps extends SamplingRuleOptions {
  /** The project to create the rule in. */
  readonly project: IProject;
}

/**
 * A PostHog Logs sampling rule: reduces ingested log or span volume by
 * sampling by severity, dropping matching records or rate-limiting them.
 *
 * @resource PostHog::Logs::SamplingRule
 */
export class SamplingRule extends Resource implements ISamplingRule {
  /**
   * Import an existing sampling rule by its PostHog ID.
   */
  public static fromSamplingRuleId(scope: Construct, id: string, project: IProject, samplingRuleId: string): ISamplingRule {
    class Import extends Resource implements ISamplingRule {
      public readonly samplingRuleId = samplingRuleId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly samplingRuleId: string;
  public readonly project: IProject;

  /**
   * Version number PostHog increments on each update.
   * @attribute
   */
  public readonly samplingRuleVersion: number;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly samplingRuleCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSamplingRule;

  constructor(scope: Construct, id: string, props: SamplingRuleProps) {
    super(scope, id);
    validateLength('SamplingRule name', props.name, 1, 255);
    validateLength('SamplingRule scopeService', props.scopeService, 0, 512);
    validateLength('SamplingRule pathPattern', props.pathPattern, 0, 1024);
    validateRange('SamplingRule priority', props.priority, 0, Number.MAX_SAFE_INTEGER);
    this.validateForType(props);

    this.project = props.project;

    this.resource = new CfnSamplingRule(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      enabled: props.enabled,
      priority: props.priority,
      ruleType: props.ruleType as string as CfnSamplingRulePropsRuleType,
      source: props.source as string as CfnSamplingRulePropsSource | undefined,
      scopeService: props.scopeService,
      scopePathPattern: props.pathPattern,
      scopeAttributeFilters: props.attributeFilters?.length
        ? jsonProp(this, props.attributeFilters.map(renderAttributeFilter))
        : undefined,
      config: jsonProp(this, this.renderConfig(props))!,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.samplingRuleId = this.resource.attrId;
    this.samplingRuleVersion = this.resource.attrVersion;
    this.samplingRuleCreatedAt = this.resource.attrCreatedAt;
  }

  private validateForType(props: SamplingRuleProps): void {
    const type = props.ruleType;
    const notFor = (what: string, value: unknown, allowed: RuleType[]) => {
      if (value !== undefined && !allowed.includes(type)) {
        throw new Error(`SamplingRule ${what} is not supported for rule type '${type}'`);
      }
    };
    notFor('filters', props.filters, [RuleType.PATH_DROP, RuleType.RATE_LIMIT]);
    notFor('dropPatterns', props.dropPatterns, [RuleType.PATH_DROP]);
    notFor('matchAttributeKey', props.matchAttributeKey, [RuleType.PATH_DROP]);
    notFor('severityActions', props.severityActions, [RuleType.SEVERITY_SAMPLING]);
    for (const key of ['logsPerSecond', 'burstLogs', 'kbPerSecond', 'burstKb'] as const) {
      notFor(key, props[key], [RuleType.RATE_LIMIT]);
    }

    if (props.source === SamplingSource.SPANS && type === RuleType.SEVERITY_SAMPLING) {
      throw new Error('SamplingRule: span rules support PATH_DROP and RATE_LIMIT only');
    }
    if (type === RuleType.PATH_DROP && !props.filters && !props.dropPatterns?.length) {
      throw new Error('SamplingRule: a PATH_DROP rule needs filters or dropPatterns');
    }
    if (type === RuleType.RATE_LIMIT) {
      exactlyOne('SamplingRule rate limit', { logsPerSecond: props.logsPerSecond, kbPerSecond: props.kbPerSecond });
      validateBurst('logsPerSecond', props.logsPerSecond, 'burstLogs', props.burstLogs);
      validateBurst('kbPerSecond', props.kbPerSecond, 'burstKb', props.burstKb);
    }
    props.attributeFilters?.forEach(f => validateAttributeFilter('attributeFilters', f));
    props.alwaysKeep?.attributes?.forEach(f => validateAttributeFilter('alwaysKeep.attributes', f));
  }

  private renderConfig(props: SamplingRuleProps): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    const filterGroup = props.filters?.render();
    switch (props.ruleType) {
      case RuleType.PATH_DROP:
        if (filterGroup) config.filter_group = filterGroup;
        if (props.dropPatterns?.length) config.patterns = props.dropPatterns;
        if (props.matchAttributeKey !== undefined) config.match_attribute_key = props.matchAttributeKey;
        break;
      case RuleType.RATE_LIMIT:
        if (props.logsPerSecond !== undefined) config.logs_per_second = props.logsPerSecond;
        if (props.burstLogs !== undefined) config.burst_logs = props.burstLogs;
        if (props.kbPerSecond !== undefined) config.kb_per_second = props.kbPerSecond;
        if (props.burstKb !== undefined) config.burst_kb = props.burstKb;
        if (filterGroup) config.filter_group = filterGroup;
        break;
      case RuleType.SEVERITY_SAMPLING: {
        const actions = renderSeverityActions(props.severityActions);
        if (actions) config.actions = actions;
        break;
      }
    }
    const alwaysKeep = renderAlwaysKeep(props.alwaysKeep);
    if (alwaysKeep) config.always_keep = alwaysKeep;
    return config;
  }
}

function validateBurst(rateName: string, rate: number | undefined, burstName: string, burst: number | undefined): void {
  validateRange(`SamplingRule ${rateName}`, rate, 1, MAX_RATE);
  validateRange(`SamplingRule ${burstName}`, burst, 1, MAX_BURST);
  if (burst !== undefined && rate === undefined) {
    throw new Error(`SamplingRule ${burstName} needs ${rateName}`);
  }
  if (isConcreteNumber(burst) && isConcreteNumber(rate) && burst < rate) {
    throw new Error(`SamplingRule ${burstName} (${burst}) must be at least ${rateName} (${rate})`);
  }
}

function validateAttributeFilter(what: string, filter: AttributeFilter): void {
  if (filter.operator !== AttributeOperator.EXISTS && filter.value === undefined) {
    throw new Error(`SamplingRule ${what} '${filter.key}': a value is required for operator '${filter.operator}'`);
  }
}

function renderAttributeFilter(filter: AttributeFilter): Record<string, unknown> {
  const out: Record<string, unknown> = { key: filter.key, op: filter.operator };
  if (filter.operator !== AttributeOperator.EXISTS) out.value = filter.value;
  return out;
}

function renderSeverityActions(actions: SeverityActions | undefined): Record<string, unknown> | undefined {
  if (!actions) return undefined;
  const out: Record<string, unknown> = {};
  const levels: Array<[string, SeverityAction | undefined]> = [
    ['DEBUG', actions.debug], ['INFO', actions.info], ['WARN', actions.warn], ['ERROR', actions.error],
  ];
  for (const [level, action] of levels) {
    if (!action) continue;
    out[level] = action.rate === undefined ? { type: action.type } : { type: action.type, rate: action.rate };
  }
  return Object.keys(out).length ? out : undefined;
}

function renderAlwaysKeep(alwaysKeep: AlwaysKeep | undefined): Record<string, unknown> | undefined {
  if (!alwaysKeep) return undefined;
  const out: Record<string, unknown> = {};
  if (alwaysKeep.statusCodeAtLeast !== undefined) out.status_gte = alwaysKeep.statusCodeAtLeast;
  if (alwaysKeep.latencyAbove !== undefined) out.latency_ms_gt = alwaysKeep.latencyAbove.toMilliseconds();
  if (alwaysKeep.attributes?.length) out.attribute_predicates = alwaysKeep.attributes.map(renderAttributeFilter);
  return Object.keys(out).length ? out : undefined;
}
