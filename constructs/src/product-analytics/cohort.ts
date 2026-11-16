import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IAction } from './action';
import { CfnCohort, CfnCohortPropsCohortType } from './cohort.generated';
import { FilterLogic, PropertyFilter, PropertyFilterType, PropertyOperator } from '../core/filters';
import type { IProject } from '../organizations/project';
import { renderPropertyFilter, renderPropertyFilters } from '../private/filters';
import { jsonProp, validateLength, validateRange } from '../private/helpers';

/**
 * A PostHog cohort: a saved group of persons.
 */
export interface ICohort extends IResource {
  /**
   * The PostHog cohort ID.
   * @attribute
   */
  readonly cohortId: string;

  /** The project the cohort belongs to. */
  readonly project: IProject;
}

/**
 * How a cohort is computed. PostHog derives it from the criteria when unset.
 */
export enum CohortType {
  /** A fixed list of persons, filled in PostHog. */
  STATIC = 'static',
  /** Person property conditions only. */
  PERSON_PROPERTY = 'person_property',
  /** Includes behavioral (event) conditions. */
  BEHAVIORAL = 'behavioral',
  /** Recomputed in real time. */
  REALTIME = 'realtime',
  /** Defined by a HogQL query. */
  ANALYTICAL = 'analytical',
}

/**
 * How the number of times an event was performed is compared.
 */
export enum CohortCountOperator {
  /** At least `count` times. */
  AT_LEAST = 'gte',
  /** At most `count` times. */
  AT_MOST = 'lte',
  /** Exactly `count` times. */
  EXACTLY = 'exact',
}

/**
 * A person property condition of a cohort.
 */
export interface CohortPersonPropertyOptions {
  /** The person property name, e.g. `email`. */
  readonly key: string;

  /**
   * The value to compare with. Leave unset for `IS_SET` / `IS_NOT_SET`.
   * @default - no value
   */
  readonly value?: any;

  /**
   * How the property is compared with `value`.
   * @default PropertyOperator.EXACT
   */
  readonly operator?: PropertyOperator;

  /**
   * Match persons that do NOT meet the condition. A group can't consist of
   * negated conditions only.
   * @default false
   */
  readonly negate?: boolean;
}

/**
 * Options of a behavioral ("performed event") cohort condition.
 */
export interface CohortEventOptions {
  /**
   * The time window, counted back from now. Must be a whole number of days.
   * @default Duration.days(30)
   */
  readonly within?: Duration;

  /**
   * Conditions on the event's properties.
   * @default - none
   */
  readonly eventProperties?: PropertyFilter[];

  /**
   * Match persons that did NOT perform the event in the window. A group
   * can't consist of negated conditions only.
   * @default false
   */
  readonly negate?: boolean;
}

/**
 * Options of a "performed event N times" cohort condition.
 */
export interface CohortEventCountOptions extends CohortEventOptions {
  /** How many times the event must have been performed. */
  readonly count: number;

  /**
   * How the number of times is compared with `count`.
   * @default CohortCountOperator.AT_LEAST
   */
  readonly operator?: CohortCountOperator;
}

/**
 * Options of a cohort membership condition.
 */
export interface CohortMembershipOptions {
  /**
   * Match persons that are NOT in the cohort. A group can't consist of
   * negated conditions only.
   * @default false
   */
  readonly negate?: boolean;
}

/**
 * Who belongs to a cohort: person property conditions, behavioral
 * conditions and membership of other cohorts, combined with `all()` (AND)
 * and `any()` (OR).
 *
 * @example
 * CohortCriteria.all(
 *   CohortCriteria.personProperty({ key: 'email', value: '@example.com', operator: PropertyOperator.ICONTAINS }),
 *   CohortCriteria.performedEvent('$pageview', { within: Duration.days(30) }),
 * );
 */
export class CohortCriteria {
  /**
   * Every one of the criteria must match (AND).
   */
  public static all(...criteria: CohortCriteria[]): CohortCriteria {
    return CohortCriteria.group(FilterLogic.AND, criteria);
  }

  /**
   * Any one of the criteria may match (OR).
   */
  public static any(...criteria: CohortCriteria[]): CohortCriteria {
    return CohortCriteria.group(FilterLogic.OR, criteria);
  }

  /**
   * A person property condition, e.g. `plan` equals `pro`.
   */
  public static personProperty(options: CohortPersonPropertyOptions): CohortCriteria {
    const filter = renderPropertyFilter({
      key: options.key,
      value: options.value,
      operator: options.operator,
      type: PropertyFilterType.PERSON,
    });
    return CohortCriteria.leaf(filter, options.negate);
  }

  /**
   * The person performed the event at least once in the time window.
   */
  public static performedEvent(event: string, options: CohortEventOptions = {}): CohortCriteria {
    return CohortCriteria.behavioral('performed_event', event, 'events', options);
  }

  /**
   * The person did not perform the event in the time window. Combine it
   * with a positive condition.
   */
  public static didNotPerformEvent(event: string, options: CohortEventOptions = {}): CohortCriteria {
    return CohortCriteria.behavioral('performed_event', event, 'events', { ...options, negate: true });
  }

  /**
   * The person performed the event at least, at most or exactly `count`
   * times in the time window.
   */
  public static performedEventTimes(event: string, options: CohortEventCountOptions): CohortCriteria {
    validateRange('Cohort event count', options.count, 0, Number.MAX_SAFE_INTEGER);
    return CohortCriteria.behavioral('performed_event_multiple', event, 'events', options, {
      operator: options.operator ?? CohortCountOperator.AT_LEAST,
      operator_value: options.count,
    });
  }

  /**
   * The person performed the event for the first time in the time window.
   */
  public static performedEventForFirstTime(event: string, options: CohortEventOptions = {}): CohortCriteria {
    return CohortCriteria.behavioral('performed_event_first_time', event, 'events', options);
  }

  /**
   * The person performed the action at least once in the time window.
   */
  public static performedAction(action: IAction, options: CohortEventOptions = {}): CohortCriteria {
    return CohortCriteria.behavioral('performed_event', action.actionId, 'actions', options);
  }

  /**
   * The person is a member of the cohort.
   */
  public static inCohort(cohort: ICohort, options: CohortMembershipOptions = {}): CohortCriteria {
    return CohortCriteria.leaf({ key: 'id', type: 'cohort', value: cohort.cohortId }, options.negate);
  }

  /**
   * The person is not a member of the cohort. Combine it with a positive
   * condition.
   */
  public static notInCohort(cohort: ICohort): CohortCriteria {
    return CohortCriteria.inCohort(cohort, { negate: true });
  }

  /**
   * A condition in PostHog's raw JSON shape, for conditions this builder
   * doesn't model, e.g. `{ key: '$pageview', type: 'behavioral', value: 'performed_event_regularly', ... }`.
   */
  public static fromJson(condition: { [key: string]: any }): CohortCriteria {
    return new CohortCriteria(undefined, condition, condition.negation === true);
  }

  private static group(logic: FilterLogic, criteria: CohortCriteria[]): CohortCriteria {
    if (criteria.length === 0) {
      throw new Error(`CohortCriteria.${logic === FilterLogic.AND ? 'all' : 'any'}() needs at least one criterion`);
    }
    if (criteria.every(c => c.negated)) {
      throw new Error('Cohort criteria: a group cannot consist of negated conditions only; add a positive condition');
    }
    return new CohortCriteria({ logic, children: criteria }, undefined, false);
  }

  private static leaf(condition: Record<string, unknown>, negate: boolean | undefined): CohortCriteria {
    return new CohortCriteria(undefined, negate ? { ...condition, negation: true } : condition, negate ?? false);
  }

  private static behavioral(
    value: string,
    key: string,
    eventType: string,
    options: CohortEventOptions,
    extra: Record<string, unknown> = {},
  ): CohortCriteria {
    const within = (options.within ?? Duration.days(30)).toDays();
    if (within < 1) throw new Error(`Cohort condition '${key}': the time window must be at least one day`);
    const condition: Record<string, unknown> = {
      key,
      type: 'behavioral',
      value,
      event_type: eventType,
      time_value: within,
      time_interval: 'day',
      ...extra,
    };
    const eventFilters = renderPropertyFilters(options.eventProperties);
    if (eventFilters) condition.event_filters = eventFilters;
    return CohortCriteria.leaf(condition, options.negate);
  }

  private constructor(
    private readonly groupSpec: { logic: FilterLogic; children: CohortCriteria[] } | undefined,
    private readonly condition: { [key: string]: any } | undefined,
    private readonly negated: boolean,
  ) {}

  /**
   * Renders the criteria as the cohort's `filters` object:
   * `{properties: {type, values: [group, ...]}}`. The top level is always a
   * group of groups, and a group never mixes conditions and nested groups
   * (PostHog requires both); conditions are wrapped as needed.
   *
   * @internal
   */
  public _toFilters(): { [key: string]: any } {
    const rendered = this.render();
    if (!this.groupSpec) {
      return { properties: { type: FilterLogic.AND, values: [{ type: FilterLogic.AND, values: [rendered] }] } };
    }
    const values = rendered.values as any[];
    const allGroups = values.every(v => isGroup(v));
    return { properties: allGroups ? rendered : { type: rendered.type, values: [rendered] } };
  }

  private render(): { [key: string]: any } {
    if (!this.groupSpec) return this.condition!;
    const { logic, children } = this.groupSpec;
    const values = children.map(c => c.render());
    const hasGroups = values.some(isGroup);
    return {
      type: logic,
      values: hasGroups ? values.map(v => (isGroup(v) ? v : { type: logic, values: [v] })) : values,
    };
  }
}

function isGroup(value: { [key: string]: any }): boolean {
  return (value.type === FilterLogic.AND || value.type === FilterLogic.OR) && Array.isArray(value.values);
}

/**
 * Options for creating a cohort in a project (`project.addCohort()`).
 */
export interface CohortOptions {
  /** Name of the cohort. At most 400 characters. */
  readonly name: string;

  /**
   * Description of the cohort. At most 1000 characters.
   * @default - none
   */
  readonly description?: string;

  /**
   * Who belongs to the cohort. Not allowed for static cohorts.
   * @default - no criteria
   */
  readonly criteria?: CohortCriteria;

  /**
   * Escape hatch: the cohort's `filters` object in PostHog's JSON shape
   * (`{ properties: { type: 'OR', values: [...] } }`). Use instead of
   * `criteria`.
   * @default - none
   */
  readonly rawFilters?: { [key: string]: any };

  /**
   * HogQL query that defines the cohort's members, in PostHog's JSON shape.
   * Use instead of `criteria` for query-based (analytical) cohorts.
   * @default - none
   */
  readonly rawQuery?: { [key: string]: any };

  /**
   * Whether the cohort is a fixed list of persons, filled in PostHog (CSV
   * upload or "add to cohort"), rather than computed from criteria.
   * Membership of static cohorts is not managed by this construct. Can't be
   * changed after creation (changing it replaces the cohort).
   * @default false
   */
  readonly isStatic?: boolean;

  /**
   * How the cohort is computed.
   * @default - derived by PostHog from the criteria
   */
  readonly cohortType?: CohortType;

  /**
   * What happens to the PostHog cohort when it is removed from the stack.
   * PostHog soft-deletes cohorts.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Cohort.
 */
export interface CohortProps extends CohortOptions {
  /** The project to create the cohort in. */
  readonly project: IProject;
}

/**
 * A PostHog cohort: a named group of persons defined by person properties,
 * behavior and membership of other cohorts, used to filter insights, target
 * feature flags and build audiences.
 *
 * @resource PostHog::ProductAnalytics::Cohort
 */
export class Cohort extends Resource implements ICohort {
  /**
   * Import an existing cohort by its PostHog ID.
   */
  public static fromCohortId(scope: Construct, id: string, project: IProject, cohortId: string): ICohort {
    class Import extends Resource implements ICohort {
      public readonly cohortId = cohortId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly cohortId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly cohortCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnCohort;

  constructor(scope: Construct, id: string, props: CohortProps) {
    super(scope, id);
    validateLength('Cohort name', props.name, 1, 400);
    validateLength('Cohort description', props.description, 0, 1000);

    const definitions = Object.entries({ criteria: props.criteria, rawFilters: props.rawFilters, rawQuery: props.rawQuery })
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);
    if (definitions.length > 1) {
      throw new Error(`Cohort: specify at most one of criteria, rawFilters, rawQuery (got ${definitions.join(', ')})`);
    }
    if (props.isStatic && definitions.length > 0) {
      throw new Error(`Cohort: a static cohort can't have ${definitions[0]}; its members are filled in PostHog`);
    }

    this.project = props.project;

    this.resource = new CfnCohort(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      filters: jsonProp(this, props.criteria ? props.criteria._toFilters() : props.rawFilters),
      query: jsonProp(this, props.rawQuery),
      isStatic: props.isStatic,
      cohortType: props.cohortType as string as CfnCohortPropsCohortType | undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.cohortId = this.resource.attrId;
    this.cohortCreatedAt = this.resource.attrCreatedAt;
  }
}
