import { IResource, Lazy, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CfnSchemaPropertyGroup,
  CfnSchemaPropertyGroupProperty,
  CfnSchemaPropertyGroupPropertyPropertyType,
} from './schema-property-group.generated';
import type { IProject } from '../organizations/project';
import { schemaPropertyToCfn, validateUnique } from '../private/definitions';
import { validateLength } from '../private/helpers';

/**
 * The type of a schema property.
 */
export enum PropertyType {
  /** A date and time. */
  DATE_TIME = 'DateTime',
  /** A string. */
  STRING = 'String',
  /** A number. */
  NUMERIC = 'Numeric',
  /** A boolean. */
  BOOLEAN = 'Boolean',
  /** A JSON object. */
  OBJECT = 'Object',
  /** A JSON array. */
  ARRAY = 'Array',
}

/**
 * One property of a schema property group.
 */
export interface SchemaProperty {
  /** The property name. At most 400 characters, unique within the group. */
  readonly name: string;

  /** The property type. */
  readonly type: PropertyType;

  /**
   * Whether events must include the property.
   * @default false
   */
  readonly required?: boolean;

  /**
   * Whether the property is optional in generated types even when
   * `required` is set.
   * @default false
   */
  readonly optionalInTypes?: boolean;

  /**
   * Description of the property.
   * @default - none
   */
  readonly description?: string;
}

/**
 * A PostHog schema property group.
 */
export interface ISchemaPropertyGroup extends IResource {
  /**
   * The PostHog schema property group ID.
   * @attribute
   */
  readonly schemaPropertyGroupId: string;

  /** The project the group belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a schema property group in a project
 * (`project.addSchemaPropertyGroup()`).
 */
export interface SchemaPropertyGroupOptions {
  /** Name of the group. At most 400 characters. */
  readonly name: string;

  /**
   * Description of the group.
   * @default - none
   */
  readonly description?: string;

  /**
   * The group's properties. Add more with `addProperty()`.
   * @default - none
   */
  readonly properties?: SchemaProperty[];

  /**
   * What happens to the PostHog group when it is removed from the stack.
   * PostHog hard-deletes schema property groups.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a SchemaPropertyGroup.
 */
export interface SchemaPropertyGroupProps extends SchemaPropertyGroupOptions {
  /** The project to create the group in. */
  readonly project: IProject;
}

/**
 * A PostHog schema property group: a reusable, named set of typed
 * properties attached to event definitions to describe and enforce their
 * schema.
 *
 * @resource PostHog::ProductAnalytics::SchemaPropertyGroup
 */
export class SchemaPropertyGroup extends Resource implements ISchemaPropertyGroup {
  /**
   * Import an existing schema property group by its PostHog ID.
   */
  public static fromSchemaPropertyGroupId(
    scope: Construct,
    id: string,
    project: IProject,
    schemaPropertyGroupId: string,
  ): ISchemaPropertyGroup {
    class Import extends Resource implements ISchemaPropertyGroup {
      public readonly schemaPropertyGroupId = schemaPropertyGroupId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly schemaPropertyGroupId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly schemaPropertyGroupCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSchemaPropertyGroup;

  private readonly properties: CfnSchemaPropertyGroupProperty[] = [];
  private lazyProperties = false;

  constructor(scope: Construct, id: string, props: SchemaPropertyGroupProps) {
    super(scope, id);
    validateLength('SchemaPropertyGroup name', props.name, 1, 400);

    this.project = props.project;
    for (const property of props.properties ?? []) {
      this.properties.push(this.renderProperty(property));
    }

    // Constructor properties go through the L1 (and its toJson mapping);
    // addProperty() switches to a lazy override of the full list.
    this.resource = new CfnSchemaPropertyGroup(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      properties: this.properties.length > 0 ? [...this.properties] : undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.schemaPropertyGroupId = this.resource.attrId;
    this.schemaPropertyGroupCreatedAt = this.resource.attrCreatedAt;
  }

  /**
   * Adds a property to the group.
   */
  public addProperty(property: SchemaProperty): void {
    this.properties.push(this.renderProperty(property));
    if (!this.lazyProperties) {
      this.lazyProperties = true;
      this.resource.addPropertyOverride('Properties', Lazy.any({ produce: () => this.properties.map(schemaPropertyToCfn) }));
    }
  }

  private renderProperty(property: SchemaProperty): CfnSchemaPropertyGroupProperty {
    validateLength('SchemaPropertyGroup property name', property.name, 1, 400);
    validateUnique('SchemaPropertyGroup property', [...this.properties.map(p => p.name), property.name]);
    return {
      name: property.name,
      propertyType: property.type as string as CfnSchemaPropertyGroupPropertyPropertyType,
      isRequired: property.required,
      isOptionalInTypes: property.optionalInTypes,
      description: property.description,
    };
  }
}
