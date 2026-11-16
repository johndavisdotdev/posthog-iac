import { FilterLogic, PropertyOperator } from '../core/filters';

/**
 * Where a log filter condition looks for its key.
 */
export enum LogPropertyType {
  /** A top-level log field, such as `message` (the log body). */
  LOG = 'log',
  /** A log record attribute. */
  LOG_ATTRIBUTE = 'log_attribute',
  /** A resource attribute, such as `service.name`. */
  LOG_RESOURCE_ATTRIBUTE = 'log_resource_attribute',
  /** A span attribute (sampling rules with `SamplingSource.SPANS`). */
  SPAN_ATTRIBUTE = 'span_attribute',
  /** A span resource attribute (sampling rules with `SamplingSource.SPANS`). */
  SPAN_RESOURCE_ATTRIBUTE = 'span_resource_attribute',
}

const NO_VALUE = new Set<string>([PropertyOperator.IS_SET, PropertyOperator.IS_NOT_SET]);

/**
 * Which log records an alert or rule matches: message, attribute and
 * resource attribute conditions, combined with AND/OR.
 *
 * ```ts
 * const filter = LogFilter.all(
 *   LogFilter.serviceName(PropertyOperator.EXACT, 'api'),
 *   LogFilter.any(
 *     LogFilter.message(PropertyOperator.ICONTAINS, 'timeout'),
 *     LogFilter.attribute('http.route', PropertyOperator.EXACT, '/health'),
 *   ),
 * );
 * ```
 */
export class LogFilter {
  /** Matches on the log message (body). */
  public static message(operator: PropertyOperator, value?: any): LogFilter {
    return LogFilter.condition('message', LogPropertyType.LOG, operator, value);
  }

  /** Matches on the `service.name` resource attribute. */
  public static serviceName(operator: PropertyOperator, value?: any): LogFilter {
    return LogFilter.condition('service.name', LogPropertyType.LOG_RESOURCE_ATTRIBUTE, operator, value);
  }

  /** Matches on a log record attribute, e.g. `http.route`. */
  public static attribute(key: string, operator: PropertyOperator, value?: any): LogFilter {
    return LogFilter.condition(key, LogPropertyType.LOG_ATTRIBUTE, operator, value);
  }

  /** Matches on a resource attribute, e.g. `k8s.namespace.name`. */
  public static resourceAttribute(key: string, operator: PropertyOperator, value?: any): LogFilter {
    return LogFilter.condition(key, LogPropertyType.LOG_RESOURCE_ATTRIBUTE, operator, value);
  }

  /** Matches on a key of any type. */
  public static condition(key: string, type: LogPropertyType, operator: PropertyOperator, value?: any): LogFilter {
    if (!NO_VALUE.has(operator) && value === undefined) {
      throw new Error(`Log filter '${key}': a value is required for operator '${operator}'`);
    }
    const leaf: Record<string, unknown> = { key, operator, type };
    if (!NO_VALUE.has(operator)) leaf.value = value;
    return new LogFilter(leaf, undefined, []);
  }

  /** Matches when every condition matches. */
  public static all(...filters: LogFilter[]): LogFilter {
    return LogFilter.group(FilterLogic.AND, filters);
  }

  /** Matches when any condition matches. */
  public static any(...filters: LogFilter[]): LogFilter {
    return LogFilter.group(FilterLogic.OR, filters);
  }

  private static group(logic: FilterLogic, filters: LogFilter[]): LogFilter {
    // PostHog treats empty groups as never matching, so reject them here.
    if (filters.length === 0) {
      throw new Error('LogFilter.all() and LogFilter.any() need at least one condition');
    }
    return new LogFilter(undefined, logic, filters);
  }

  private constructor(
    private readonly leaf: Record<string, unknown> | undefined,
    private readonly logic: FilterLogic | undefined,
    private readonly children: LogFilter[],
  ) {}

  /**
   * Renders the filter as PostHog's property group JSON, in the two-level
   * shape the PostHog UI writes: an outer AND group whose values are groups,
   * e.g. `{"type": "AND", "values": [{"type": "OR", "values": [...]}]}`.
   */
  public render(): any {
    if (this.leaf) {
      return { type: FilterLogic.AND, values: [{ type: FilterLogic.AND, values: [this.leaf] }] };
    }
    if (this.children.every(c => !c.leaf)) {
      return this.renderGroup();
    }
    return { type: FilterLogic.AND, values: [this.renderGroup()] };
  }

  private renderGroup(): Record<string, unknown> {
    return {
      type: this.logic ?? FilterLogic.AND,
      values: this.children.map(c => (c.leaf ? c.leaf : c.renderGroup())),
    };
  }
}
