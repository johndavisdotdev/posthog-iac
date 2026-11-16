import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { IMessageCategory } from './message-category';
import { CfnMessageTemplate } from './message-template.generated';
import type { IProject } from '../organizations/project';
import { jsonProp, uniqueOrUndefined, validateLength } from '../private/helpers';
import { renderEmailContent } from '../private/workflows';

/**
 * Template language used in message content.
 */
export enum MessageTemplating {
  /** Liquid, e.g. `{{ person.properties.first_name }}` (the PostHog default). */
  LIQUID = 'liquid',
  /** Hog templates, e.g. `{person.properties.first_name}`. */
  HOG = 'hog',
}

/**
 * The content of an email.
 */
export interface EmailContent {
  /** Subject line. May contain template expressions. */
  readonly subject: string;

  /**
   * HTML body.
   * @default - none (leave it out when authoring with `design`, PostHog renders it)
   */
  readonly html?: string;

  /**
   * Plain-text body.
   * @default - none
   */
  readonly text?: string;

  /**
   * Preview text shown after the subject in the inbox.
   * @default - none
   */
  readonly preheader?: string;

  /**
   * Sender address, e.g. `Acme <hello@acme.com>`.
   * @default - the project's default sender
   */
  readonly from?: string;

  /**
   * Reply-to address.
   * @default - the sender
   */
  readonly replyTo?: string;

  /**
   * Design JSON of PostHog's visual email editor.
   * @default - none
   */
  readonly design?: { [key: string]: any };
}

/**
 * A PostHog messaging template.
 */
export interface IMessageTemplate extends IResource {
  /**
   * The message template ID (UUID).
   * @attribute
   */
  readonly messageTemplateId: string;

  /** The project the template belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a messaging template in a project.
 */
export interface MessageTemplateOptions {
  /** Template name (1 to 400 characters). */
  readonly name: string;

  /** The email content. */
  readonly email: EmailContent;

  /**
   * Template language of the content.
   * @default - PostHog default (MessageTemplating.LIQUID)
   */
  readonly templating?: MessageTemplating;

  /**
   * Description of what the template is for.
   * @default - none
   */
  readonly description?: string;

  /**
   * Tags on the template.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Messaging category to file the template under.
   * @default - none
   */
  readonly category?: IMessageCategory;

  /**
   * For emails carrying login codes or reset links: PostHog keeps no copy of
   * the sent body.
   * @default false
   */
  readonly sensitive?: boolean;

  /**
   * What happens to the template when it is removed from the stack. PostHog
   * soft-deletes templates.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a MessageTemplate.
 */
export interface MessageTemplateProps extends MessageTemplateOptions {
  /** The project to create the template in. */
  readonly project: IProject;
}

/**
 * A PostHog messaging template: reusable email content for workflow email
 * steps and the transactional email API.
 *
 * @resource PostHog::Workflows::MessageTemplate
 */
export class MessageTemplate extends Resource implements IMessageTemplate {
  /**
   * Import an existing messaging template by its PostHog ID.
   */
  public static fromMessageTemplateId(scope: Construct, id: string, project: IProject, messageTemplateId: string): IMessageTemplate {
    class Import extends Resource implements IMessageTemplate {
      public readonly messageTemplateId = messageTemplateId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly messageTemplateId: string;
  public readonly project: IProject;

  /**
   * ID of the workflow that sends this template over the transactional email
   * API, once the template has been made transactional in PostHog.
   * @attribute
   */
  public readonly transactionalHogFlowId: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly messageTemplateCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnMessageTemplate;

  constructor(scope: Construct, id: string, props: MessageTemplateProps) {
    super(scope, id);
    validateLength('MessageTemplate name', props.name, 1, 400);
    validateLength('MessageTemplate email subject', props.email.subject, 1, Number.MAX_SAFE_INTEGER);
    props.tags?.forEach(tag => validateLength('MessageTemplate tag', tag, 1, 255));

    this.project = props.project;

    const content: Record<string, unknown> = { email: renderEmailContent(props.email) };
    if (props.templating !== undefined) content.templating = props.templating;

    this.resource = new CfnMessageTemplate(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      tags: uniqueOrUndefined(props.tags),
      content: jsonProp(this, content)!,
      messageCategory: props.category?.messageCategoryId,
      sensitive: props.sensitive,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.messageTemplateId = this.resource.attrId;
    this.transactionalHogFlowId = this.resource.attrTransactionalHogFlowId;
    this.messageTemplateCreatedAt = this.resource.attrCreatedAt;
  }
}
