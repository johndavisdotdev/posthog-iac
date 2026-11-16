import { IResource, RemovalPolicy, Resource, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnInsightVariable, CfnInsightVariablePropsType } from './insight-variable.generated';
import type { IProject } from '../organizations/project';
import { jsonProp, validateLength } from '../private/helpers';
import { renderDate } from '../private/insights';

/**
 * Type of a SQL variable.
 */
export enum VariableType {
  /** Free-text string. */
  STRING = 'String',
  /** Number. */
  NUMBER = 'Number',
  /** True or false. */
  BOOLEAN = 'Boolean',
  /** One (or, with `isMulti`, several) values from a list. */
  LIST = 'List',
  /** Date. */
  DATE = 'Date',
}

/**
 * The default value of a SQL variable. Use the factory matching the
 * variable's type.
 */
export class VariableValue {
  /** A `String` (or single-value `List`) default. */
  public static string(value: string): VariableValue {
    return new VariableValue([VariableType.STRING, VariableType.LIST], value);
  }

  /** A `Number` default. */
  public static number(value: number): VariableValue {
    return new VariableValue([VariableType.NUMBER], Token.isUnresolved(value) ? Token.asString(value) : String(value));
  }

  /** A `Boolean` default. */
  public static boolean(value: boolean): VariableValue {
    return new VariableValue([VariableType.BOOLEAN], value ? 'true' : 'false');
  }

  /** A `Date` default: a `Date` (rendered as ISO 8601) or a date string such as `2026-01-01` or `-7d`. */
  public static date(value: Date | string): VariableValue {
    return new VariableValue([VariableType.DATE], renderDate(value)!);
  }

  /** Several selected values, for a `List` variable with `isMulti`. */
  public static list(values: string[]): VariableValue {
    return new VariableValue([VariableType.LIST], undefined, values);
  }

  private constructor(
    private readonly types: VariableType[],
    private readonly value: string | undefined,
    private readonly values?: string[],
  ) {}

  /** @internal */
  public _render(scope: Construct, type: VariableType, isMulti: boolean): string {
    if (!this.types.includes(type)) {
      throw new Error(`InsightVariable: a ${this.types.join('/')} default value does not fit a ${type} variable`);
    }
    if (this.values !== undefined) {
      if (!isMulti) throw new Error('InsightVariable: VariableValue.list() requires isMulti');
      return jsonProp(scope, this.values)!;
    }
    return this.value!;
  }
}

/**
 * A PostHog SQL variable.
 */
export interface IInsightVariable extends IResource {
  /**
   * The PostHog SQL variable ID (UUID).
   * @attribute
   */
  readonly variableId: string;

  /**
   * The name used in HogQL as `{variables.<codeName>}`.
   * @attribute
   */
  readonly codeName: string;

  /** The project the variable belongs to. */
  readonly project: IProject;
}

/**
 * Attributes for importing a SQL variable.
 */
export interface InsightVariableAttributes {
  /** The project the variable belongs to. */
  readonly project: IProject;
  /** The PostHog SQL variable ID (UUID). */
  readonly variableId: string;
  /** The variable's code name. */
  readonly codeName: string;
}

/**
 * Options for creating a SQL variable in a project.
 */
export interface InsightVariableOptions {
  /** Human-readable name. PostHog derives the code name from it. */
  readonly name: string;

  /** Variable type. */
  readonly type: VariableType;

  /**
   * Default value used when a query doesn't set one.
   * @default - none
   */
  readonly defaultValue?: VariableValue;

  /**
   * Allowed values, for `List` variables.
   * @default - none
   */
  readonly values?: string[];

  /**
   * Whether a `List` variable accepts several values.
   * @default false
   */
  readonly isMulti?: boolean;

  /**
   * HogQL query whose first column supplies the allowed values of a `List`
   * variable (an optional second column supplies labels).
   * @default - none
   */
  readonly valuesQuery?: string;

  /**
   * What happens to the PostHog variable when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an InsightVariable.
 */
export interface InsightVariableProps extends InsightVariableOptions {
  /** The project to create the variable in. */
  readonly project: IProject;
}

/**
 * A PostHog SQL variable, referenced from HogQL insights as
 * `{variables.<codeName>}`.
 *
 * @resource PostHog::ProductAnalytics::InsightVariable
 */
export class InsightVariable extends Resource implements IInsightVariable {
  /**
   * Import an existing SQL variable.
   */
  public static fromInsightVariableAttributes(scope: Construct, id: string, attrs: InsightVariableAttributes): IInsightVariable {
    class Import extends Resource implements IInsightVariable {
      public readonly variableId = attrs.variableId;
      public readonly codeName = attrs.codeName;
      public readonly project = attrs.project;
    }
    return new Import(scope, id);
  }

  public readonly variableId: string;
  public readonly codeName: string;
  public readonly project: IProject;

  /** The underlying L1 resource. */
  public readonly resource: CfnInsightVariable;

  constructor(scope: Construct, id: string, props: InsightVariableProps) {
    super(scope, id);
    validateLength('InsightVariable name', props.name, 1, 400);
    const isList = props.type === VariableType.LIST;
    if (!isList && (props.values !== undefined || props.isMulti !== undefined || props.valuesQuery !== undefined)) {
      throw new Error('InsightVariable: values, isMulti and valuesQuery are only valid for List variables');
    }

    this.project = props.project;
    this.resource = new CfnInsightVariable(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      type: props.type as string as CfnInsightVariablePropsType,
      defaultValue: props.defaultValue?._render(this, props.type, props.isMulti ?? false),
      values: props.values,
      isMulti: props.isMulti,
      valuesQuery: props.valuesQuery,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.variableId = this.resource.attrId;
    this.codeName = this.resource.attrCodeName;
  }

  /**
   * The placeholder to use in HogQL: `{variables.<codeName>}`.
   */
  public get placeholder(): string {
    return `{variables.${this.codeName}}`;
  }
}
