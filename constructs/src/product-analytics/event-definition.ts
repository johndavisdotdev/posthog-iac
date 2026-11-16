import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnEventDefinition, CfnEventDefinitionPropsEnforcementMode } from './event-definition.generated';
import type { IProject } from '../organizations/project';
import { uniqueOrUndefined, validateLength, validatePattern } from '../private/helpers';

/**
 * What PostHog does with events that don't match the event's schema.
 */
export enum EventEnforcementMode {
  /** Accept them. */
  ALLOW = 'allow',
  /** Reject them. */
  REJECT = 'reject',
}

/**
 * A PostHog event definition.
 */
export interface IEventDefinition extends IResource {
  /**
   * The PostHog event definition ID.
   * @attribute
   */
  readonly eventDefinitionId: string;

  /**
   * The event name, e.g. `signed_up`.
   * @attribute
   */
  readonly eventName: string;

  /** The project the event definition belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an event definition in a project
 * (`project.addEventDefinition()`).
 */
export interface EventDefinitionOptions {
  /**
   * The event name, e.g. `signed_up`. At most 400 characters. Can't be
   * changed after creation (renaming replaces the definition).
   */
  readonly name: string;

  /**
   * Description of the event.
   * @default - none
   */
  readonly description?: string;

  /**
   * Numeric PostHog user ID of the event's owner.
   * @default - no owner
   */
  readonly owner?: string;

  /**
   * Tags on the event.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Mark the event as verified.
   * @default false
   */
  readonly verified?: boolean;

  /**
   * Hide the event from event pickers and lists.
   * @default false
   */
  readonly hidden?: boolean;

  /**
   * What PostHog does with events that don't match the event's schema.
   * @default EventEnforcementMode.ALLOW
   */
  readonly enforcementMode?: EventEnforcementMode;

  /**
   * The property shown as the event's primary property in lists. At most
   * 400 characters.
   * @default - none
   */
  readonly primaryProperty?: string;

  /**
   * Post a message to the project's Slack integration when the event is
   * ingested.
   * @default false
   */
  readonly postToSlack?: boolean;

  /**
   * Columns shown by default when exploring this event, in order.
   * @default - PostHog defaults
   */
  readonly defaultColumns?: string[];

  /**
   * What happens to the PostHog event definition when it is removed from the
   * stack. PostHog hard-deletes event definitions, and recreates them if the
   * event is ingested again.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an EventDefinition.
 */
export interface EventDefinitionProps extends EventDefinitionOptions {
  /** The project to create the event definition in. */
  readonly project: IProject;
}

/**
 * A PostHog event definition: the metadata PostHog keeps for an event name
 * (description, owner, tags, verification, visibility and schema
 * enforcement). Requires a PostHog plan with data management.
 *
 * PostHog creates an event definition automatically the first time it
 * ingests an event. Creating a definition for an event that has already been
 * ingested fails with `AlreadyExists`: import such events into the stack
 * (`cdk import`, with the project ID and the definition's PostHog ID) instead
 * of creating them. Use this construct to create definitions for events that
 * haven't been sent yet.
 *
 * @resource PostHog::ProductAnalytics::EventDefinition
 */
export class EventDefinition extends Resource implements IEventDefinition {
  /**
   * Reference an existing event definition by its PostHog ID and event name.
   */
  public static fromEventDefinitionId(
    scope: Construct,
    id: string,
    project: IProject,
    eventDefinitionId: string,
    eventName: string,
  ): IEventDefinition {
    class Import extends Resource implements IEventDefinition {
      public readonly eventDefinitionId = eventDefinitionId;
      public readonly eventName = eventName;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly eventDefinitionId: string;
  public readonly eventName: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly eventDefinitionCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnEventDefinition;

  constructor(scope: Construct, id: string, props: EventDefinitionProps) {
    super(scope, id);
    validateLength('EventDefinition name', props.name, 1, 400);
    validateLength('EventDefinition primaryProperty', props.primaryProperty, 0, 400);
    validatePattern('EventDefinition owner', props.owner, /^\d+$/, 'use the numeric PostHog user ID');

    this.project = props.project;
    this.eventName = props.name;

    this.resource = new CfnEventDefinition(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      owner: props.owner,
      tags: uniqueOrUndefined(props.tags),
      verified: props.verified,
      hidden: props.hidden,
      enforcementMode: props.enforcementMode as string as CfnEventDefinitionPropsEnforcementMode | undefined,
      primaryProperty: props.primaryProperty,
      postToSlack: props.postToSlack,
      defaultColumns: props.defaultColumns && props.defaultColumns.length > 0 ? props.defaultColumns : undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.eventDefinitionId = this.resource.attrId;
    this.eventDefinitionCreatedAt = this.resource.attrCreatedAt;
  }
}
