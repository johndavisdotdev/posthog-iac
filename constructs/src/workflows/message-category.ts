import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnMessageCategory, CfnMessageCategoryPropsCategoryType } from './message-category.generated';
import type { IProject } from '../organizations/project';
import { validateLength } from '../private/helpers';

/**
 * Kind of messaging category.
 */
export enum MessageCategoryType {
  /** Recipients can opt out; sends skip recipients who did. */
  MARKETING = 'marketing',
  /** Messages a recipient must get (receipts, password resets); opt-outs are ignored. */
  TRANSACTIONAL = 'transactional',
}

/**
 * A PostHog messaging category.
 */
export interface IMessageCategory extends IResource {
  /**
   * The message category ID (UUID).
   * @attribute
   */
  readonly messageCategoryId: string;

  /** The project the category belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a messaging category in a project.
 */
export interface MessageCategoryOptions {
  /**
   * Stable identifier, unique within the project (1 to 64 characters), e.g.
   * `newsletter`. Opt-out lists refer to categories by key. Create-only:
   * changing it replaces the category.
   */
  readonly key: string;

  /** Display name (1 to 128 characters). */
  readonly name: string;

  /**
   * Internal notes; recipients don't see them.
   * @default - none
   */
  readonly description?: string;

  /**
   * Description shown to recipients on the preferences page.
   * @default - none
   */
  readonly publicDescription?: string;

  /**
   * Category type.
   * @default - PostHog default (MessageCategoryType.MARKETING)
   */
  readonly categoryType?: MessageCategoryType;

  /**
   * What happens to the category when it is removed from the stack. PostHog
   * archives categories.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a MessageCategory.
 */
export interface MessageCategoryProps extends MessageCategoryOptions {
  /** The project to create the category in. */
  readonly project: IProject;
}

/**
 * A PostHog messaging category: a group of workflow messages that recipients
 * can opt out of.
 *
 * @resource PostHog::Workflows::MessageCategory
 */
export class MessageCategory extends Resource implements IMessageCategory {
  /**
   * Import an existing messaging category by its PostHog ID.
   */
  public static fromMessageCategoryId(scope: Construct, id: string, project: IProject, messageCategoryId: string): IMessageCategory {
    class Import extends Resource implements IMessageCategory {
      public readonly messageCategoryId = messageCategoryId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly messageCategoryId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly messageCategoryCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnMessageCategory;

  constructor(scope: Construct, id: string, props: MessageCategoryProps) {
    super(scope, id);
    validateLength('MessageCategory key', props.key, 1, 64);
    validateLength('MessageCategory name', props.name, 1, 128);

    this.project = props.project;

    this.resource = new CfnMessageCategory(this, 'Resource', {
      projectId: props.project.projectId,
      key: props.key,
      name: props.name,
      description: props.description,
      publicDescription: props.publicDescription,
      categoryType: props.categoryType as string as CfnMessageCategoryPropsCategoryType | undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.messageCategoryId = this.resource.attrId;
    this.messageCategoryCreatedAt = this.resource.attrCreatedAt;
  }
}
