import { FilterLogic, PropertyFilter, PropertyFilterType, PropertyOperator } from '../core/filters';
import { renderPropertyFilter } from '../private/filters';

/**
 * Exception properties PostHog sets on `$exception` events, which error
 * tracking rules and alerts match on.
 */
export enum ExceptionProperty {
  /** Exception types (class names), e.g. `TypeError`. A list property. */
  TYPES = '$exception_types',
  /** Exception messages. A list property. */
  MESSAGES = '$exception_values',
  /** Source files of the stack frames. A list property. */
  STACK_FRAME_SOURCES = '$exception_sources',
  /** Function names of the stack frames. A list property. */
  STACK_FRAME_FUNCTIONS = '$exception_functions',
}

/**
 * Which exceptions an error tracking rule or alert matches: exception type,
 * message, stack frame and event property conditions, combined with AND/OR.
 *
 * ```ts
 * const filter = ErrorFilter.all(
 *   ErrorFilter.exceptionType(PropertyOperator.EXACT, ['TypeError']),
 *   ErrorFilter.any(
 *     ErrorFilter.exceptionMessage(PropertyOperator.ICONTAINS, 'timeout'),
 *     ErrorFilter.stackFrameSource(PropertyOperator.REGEX, '^src/payments/'),
 *   ),
 * );
 * ```
 */
export class ErrorFilter {
  /** Matches exceptions whose type (class name) satisfies the condition. */
  public static exceptionType(operator: PropertyOperator, value?: any): ErrorFilter {
    return ErrorFilter.exceptionProperty(ExceptionProperty.TYPES, operator, value);
  }

  /** Matches exceptions whose message satisfies the condition. */
  public static exceptionMessage(operator: PropertyOperator, value?: any): ErrorFilter {
    return ErrorFilter.exceptionProperty(ExceptionProperty.MESSAGES, operator, value);
  }

  /** Matches exceptions with a stack frame whose source file satisfies the condition. */
  public static stackFrameSource(operator: PropertyOperator, value?: any): ErrorFilter {
    return ErrorFilter.exceptionProperty(ExceptionProperty.STACK_FRAME_SOURCES, operator, value);
  }

  /** Matches exceptions with a stack frame whose function name satisfies the condition. */
  public static stackFrameFunction(operator: PropertyOperator, value?: any): ErrorFilter {
    return ErrorFilter.exceptionProperty(ExceptionProperty.STACK_FRAME_FUNCTIONS, operator, value);
  }

  /** Matches on one of the exception properties PostHog sets. */
  public static exceptionProperty(property: ExceptionProperty, operator: PropertyOperator, value?: any): ErrorFilter {
    return ErrorFilter.property({ key: property, operator, value, type: PropertyFilterType.EVENT });
  }

  /**
   * Matches on any event, person or other property, e.g. `$lib` or a custom
   * event property.
   */
  public static property(filter: PropertyFilter): ErrorFilter {
    // Render now so incomplete conditions fail at the call site.
    return new ErrorFilter(renderPropertyFilter(filter), undefined, []);
  }

  /** Matches when every condition matches. */
  public static all(...filters: ErrorFilter[]): ErrorFilter {
    return new ErrorFilter(undefined, FilterLogic.AND, filters);
  }

  /** Matches when any condition matches. */
  public static any(...filters: ErrorFilter[]): ErrorFilter {
    if (filters.length === 0) {
      throw new Error('ErrorFilter.any() needs at least one condition');
    }
    return new ErrorFilter(undefined, FilterLogic.OR, filters);
  }

  private constructor(
    private readonly leaf: Record<string, unknown> | undefined,
    private readonly logic: FilterLogic | undefined,
    private readonly children: ErrorFilter[],
  ) {}

  /**
   * Whether this filter has no conditions (an empty `all()`), which matches
   * every exception.
   */
  public get isEmpty(): boolean {
    return this.leaf === undefined && this.children.every(c => c.isEmpty);
  }

  /**
   * Renders the filter as PostHog's property group JSON:
   * `{"type": "AND" | "OR", "values": [...]}`. A single condition is wrapped
   * in an AND group.
   */
  public render(): any {
    if (this.leaf) {
      return { type: FilterLogic.AND, values: [this.leaf] };
    }
    return this.renderGroup();
  }

  private renderGroup(): Record<string, unknown> {
    return {
      type: this.logic ?? FilterLogic.AND,
      values: this.children.map(c => (c.leaf ? c.leaf : c.renderGroup())),
    };
  }
}
