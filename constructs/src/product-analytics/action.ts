import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnAction, CfnActionStep, CfnActionStepHrefMatching, CfnActionStepTextMatching, CfnActionStepUrlMatching } from './action.generated';
import { PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { renderPropertyFilters } from '../private/filters';
import { jsonProp, uniqueOrUndefined, validateLength } from '../private/helpers';

/**
 * How an action step compares text, href or URL values.
 */
export enum StringMatching {
  /** The value must equal the given string. */
  EXACT = 'exact',
  /** The value must contain the given string. */
  CONTAINS = 'contains',
  /** The value must match the given regular expression. */
  REGEX = 'regex',
}

/**
 * One match condition of an action. An event matches the action when it
 * matches any one of the action's steps; within a step, every condition set
 * must match.
 */
export interface ActionStep {
  /**
   * Event name, e.g. `$pageview`, `$autocapture` or a custom event.
   * @default - any event
   */
  readonly event?: string;

  /**
   * Page URL to match.
   * @default - any URL
   */
  readonly url?: string;

  /**
   * How `url` is compared.
   * @default StringMatching.CONTAINS
   */
  readonly urlMatching?: StringMatching;

  /**
   * CSS selector of the clicked element, e.g. `button.cta`.
   * @default - any element
   */
  readonly selector?: string;

  /**
   * HTML tag name of the element, e.g. `button`.
   * @default - any tag
   */
  readonly tagName?: string;

  /**
   * Element text to match.
   * @default - any text
   */
  readonly text?: string;

  /**
   * How `text` is compared.
   * @default StringMatching.EXACT
   */
  readonly textMatching?: StringMatching;

  /**
   * Link href to match.
   * @default - any href
   */
  readonly href?: string;

  /**
   * How `href` is compared.
   * @default StringMatching.EXACT
   */
  readonly hrefMatching?: StringMatching;

  /**
   * Event or person property conditions.
   * @default - none
   */
  readonly properties?: PropertyFilter[];
}

/**
 * A PostHog action.
 */
export interface IAction extends IResource {
  /**
   * The PostHog action ID.
   * @attribute
   */
  readonly actionId: string;

  /** The project the action belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an action in a project (`project.addAction()`).
 */
export interface ActionOptions {
  /** Name of the action. Must be unique within the project. */
  readonly name: string;

  /**
   * What the action matches. An event matches when it matches any step.
   * @default - no steps
   */
  readonly steps?: ActionStep[];

  /**
   * Description of what the action represents.
   * @default - none
   */
  readonly description?: string;

  /**
   * Tags on the action.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Post a message to the project's Slack or webhook integration when the
   * action is triggered.
   * @default false
   */
  readonly postToSlack?: boolean;

  /**
   * Message format for Slack or webhook notifications.
   * @default - PostHog default format
   */
  readonly slackMessageFormat?: string;

  /**
   * What happens to the PostHog action when it is removed from the stack.
   * PostHog soft-deletes actions.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an Action.
 */
export interface ActionProps extends ActionOptions {
  /** The project to create the action in. */
  readonly project: IProject;
}

/**
 * A PostHog action: a named, reusable definition of one or more events, used
 * in insights, cohorts, alerts and destinations.
 *
 * @resource PostHog::ProductAnalytics::Action
 */
export class Action extends Resource implements IAction {
  /**
   * Import an existing action by its PostHog ID.
   */
  public static fromActionId(scope: Construct, id: string, project: IProject, actionId: string): IAction {
    class Import extends Resource implements IAction {
      public readonly actionId = actionId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly actionId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly actionCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnAction;

  constructor(scope: Construct, id: string, props: ActionProps) {
    super(scope, id);
    validateLength('Action name', props.name, 1, 400);
    validateLength('Action slackMessageFormat', props.slackMessageFormat, 0, 1200);

    this.project = props.project;

    this.resource = new CfnAction(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      tags: uniqueOrUndefined(props.tags),
      postToSlack: props.postToSlack,
      slackMessageFormat: props.slackMessageFormat,
      steps: props.steps?.map(step => this.renderStep(step)),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.actionId = this.resource.attrId;
    this.actionCreatedAt = this.resource.attrCreatedAt;
  }

  private renderStep(step: ActionStep): CfnActionStep {
    return {
      event: step.event,
      url: step.url,
      urlMatching: step.urlMatching as string as CfnActionStepUrlMatching | undefined,
      selector: step.selector,
      tagName: step.tagName,
      text: step.text,
      textMatching: step.textMatching as string as CfnActionStepTextMatching | undefined,
      href: step.href,
      hrefMatching: step.hrefMatching as string as CfnActionStepHrefMatching | undefined,
      properties: jsonProp(this, renderPropertyFilters(step.properties)),
    };
  }
}
