import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TargetingCondition, UrlMatchType } from './common';
import { CfnProductTour } from './product-tour.generated';
import type { IFeatureFlag } from '../feature-flags/feature-flag';
import type { IProject } from '../organizations/project';
import { isConcrete, jsonProp, validateLength, validateRange } from '../private/helpers';
import { compact, escapeHtml, renderTargetingFlagFilters, renderTimestamp, wholeSeconds } from '../private/surveys';

/**
 * The kind of a product tour step.
 */
export enum ProductTourStepType {
  /** A tooltip attached to a page element (requires `selector`). */
  ELEMENT = 'element',
  /** A modal dialog, not attached to an element. */
  MODAL = 'modal',
  /** A banner across the page. */
  BANNER = 'banner',
}

/**
 * Where an element step's tooltip is placed relative to its element.
 */
export enum ProductTourStepPlacement {
  /** Above the element. */
  TOP = 'top',
  /** Below the element. */
  BOTTOM = 'bottom',
  /** Left of the element. */
  LEFT = 'left',
  /** Right of the element. */
  RIGHT = 'right',
}

/**
 * What moves the tour on to the next step.
 */
export enum ProductTourProgressionTrigger {
  /** The user clicks the step's Next button. */
  BUTTON = 'button',
  /** The user clicks the targeted element. */
  CLICK = 'click',
}

/**
 * How often a user sees a product tour.
 */
export enum ProductTourDisplayFrequency {
  /** Once per user. */
  SHOW_ONCE = 'show_once',
  /** Until the user completes or dismisses it. */
  UNTIL_INTERACTED = 'until_interacted',
  /** Every time the conditions match. */
  ALWAYS = 'always',
}

/**
 * One step of a product tour.
 */
export interface ProductTourStep {
  /**
   * The kind of step.
   * @default - ProductTourStepType.ELEMENT when `selector` is set, otherwise ProductTourStepType.MODAL
   */
  readonly type?: ProductTourStepType;

  /**
   * CSS selector of the element the step points at. Required for element steps.
   * @default - none
   */
  readonly selector?: string;

  /** Step heading. */
  readonly title: string;

  /**
   * Step body text (plain text; it is HTML-escaped).
   * @default - none
   */
  readonly body?: string;

  /**
   * Tooltip placement, for element steps.
   * @default - chosen by posthog-js
   */
  readonly placement?: ProductTourStepPlacement;

  /**
   * What moves the tour on.
   * @default ProductTourProgressionTrigger.BUTTON
   */
  readonly progressionTrigger?: ProductTourProgressionTrigger;

  /**
   * Stable step ID.
   * @default - assigned by PostHog
   */
  readonly id?: string;

  /**
   * Extra step fields merged into the rendered step, for settings this
   * construct does not model (buttons, banner config, linked survey, ...).
   * @default - none
   */
  readonly rawStep?: { [key: string]: any };
}

/**
 * Look and feel of a product tour.
 */
export interface ProductTourAppearance {
  /** Background colour. @default - PostHog default */
  readonly backgroundColor?: string;
  /** Text colour. @default - PostHog default */
  readonly textColor?: string;
  /** Button colour. @default - PostHog default */
  readonly buttonColor?: string;
  /** Button text colour. @default - PostHog default */
  readonly buttonTextColor?: string;
  /** Border colour. @default - PostHog default */
  readonly borderColor?: string;
  /** Border radius in pixels. @default - PostHog default */
  readonly borderRadius?: number;
  /** Button border radius in pixels. @default - PostHog default */
  readonly buttonBorderRadius?: number;
  /** CSS font family. @default - inherited */
  readonly fontFamily?: string;
  /** CSS box-shadow. @default - PostHog default */
  readonly boxShadow?: string;
  /** Dim the page behind the step. @default - PostHog default */
  readonly showOverlay?: boolean;
  /** Close the tour when the user clicks outside the step. @default - PostHog default */
  readonly dismissOnClickOutside?: boolean;
  /** Hide the PostHog branding. @default false */
  readonly whiteLabel?: boolean;
  /** CSS z-index. @default - PostHog default */
  readonly zIndex?: number;
}

/**
 * When and where a product tour starts.
 */
export interface ProductTourConditions {
  /**
   * Page URL to match.
   * @default - any page
   */
  readonly url?: string;

  /**
   * How `url` is compared.
   * @default UrlMatchType.CONTAINS
   */
  readonly urlMatchType?: UrlMatchType;

  /**
   * Start only when an element matching this CSS selector is on the page.
   * @default - no selector condition
   */
  readonly selector?: string;

  /**
   * Delay before an auto-launched tour starts (whole seconds).
   * @default - no delay
   */
  readonly autoShowDelay?: Duration;
}

/**
 * A PostHog product tour.
 */
export interface IProductTour extends IResource {
  /**
   * The PostHog product tour ID (UUID).
   * @attribute
   */
  readonly productTourId: string;

  /** The project the product tour belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a product tour in a project (`project.addProductTour()`).
 */
export interface ProductTourOptions {
  /** Name of the tour. */
  readonly name: string;

  /**
   * Description of the tour.
   * @default - none
   */
  readonly description?: string;

  /**
   * The steps, in order.
   * @default - no steps
   */
  readonly steps?: ProductTourStep[];

  /**
   * Look and feel.
   * @default - PostHog defaults
   */
  readonly appearance?: ProductTourAppearance;

  /**
   * Display conditions.
   * @default - any page
   */
  readonly conditions?: ProductTourConditions;

  /**
   * How often a user sees the tour.
   * @default - PostHog default
   */
  readonly displayFrequency?: ProductTourDisplayFrequency;

  /**
   * Extra content fields merged into the rendered `content` object, for
   * settings this construct does not model.
   * @default - none
   */
  readonly rawContent?: { [key: string]: any };

  /**
   * Person targeting. A user matching any condition sees the tour.
   * @default - every user
   */
  readonly targeting?: TargetingCondition[];

  /**
   * Show the tour only to users with this feature flag enabled.
   * @default - no linked flag
   */
  readonly linkedFlag?: IFeatureFlag;

  /**
   * Launch the tour automatically for matching users.
   * @default false
   */
  readonly autoLaunch?: boolean;

  /**
   * Launch time (ISO 8601 string or Date). Setting it launches the tour.
   * @default - draft
   */
  readonly startDate?: Date | string;

  /**
   * End time (ISO 8601 string or Date). Setting it stops the tour.
   * @default - runs until stopped
   */
  readonly endDate?: Date | string;

  /**
   * Whether the tour is archived.
   * @default false
   */
  readonly archived?: boolean;

  /**
   * What happens to the PostHog product tour when it is removed from the
   * stack. PostHog hard-deletes tours.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a ProductTour.
 */
export interface ProductTourProps extends ProductTourOptions {
  /** The project to create the product tour in. */
  readonly project: IProject;
}

/**
 * A PostHog product tour: a sequence of in-app steps (tooltips, modals,
 * banners) shown by posthog-js to targeted users.
 *
 * @resource PostHog::Surveys::ProductTour
 */
export class ProductTour extends Resource implements IProductTour {
  /**
   * Import an existing product tour by its PostHog ID.
   */
  public static fromProductTourId(scope: Construct, id: string, project: IProject, productTourId: string): IProductTour {
    class Import extends Resource implements IProductTour {
      public readonly productTourId = productTourId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly productTourId: string;
  public readonly project: IProject;

  /**
   * ID of the internal targeting flag PostHog manages for `targeting`.
   * @attribute
   */
  public readonly productTourInternalTargetingFlagId: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly productTourCreatedAt: string;

  /**
   * ISO 8601 last update timestamp.
   * @attribute
   */
  public readonly productTourUpdatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnProductTour;

  constructor(scope: Construct, id: string, props: ProductTourProps) {
    super(scope, id);
    validateLength('Product tour name', props.name, 1, 400);
    this.project = props.project;

    this.resource = new CfnProductTour(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      content: jsonProp(this, renderContent(props)),
      targetingFlagFilters: jsonProp(this, renderTargetingFlagFilters('Product tour', props.targeting)),
      linkedFlagId: props.linkedFlag?.flagId,
      autoLaunch: props.autoLaunch,
      startDate: renderTimestamp('Product tour startDate', props.startDate),
      endDate: renderTimestamp('Product tour endDate', props.endDate),
      archived: props.archived,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.productTourId = this.resource.attrId;
    this.productTourInternalTargetingFlagId = this.resource.attrInternalTargetingFlagId;
    this.productTourCreatedAt = this.resource.attrCreatedAt;
    this.productTourUpdatedAt = this.resource.attrUpdatedAt;
  }
}

function renderContent(props: ProductTourOptions): Record<string, unknown> | undefined {
  const c = props.conditions;
  const conditions = c ? compact({
    url: c.url,
    urlMatchType: c.urlMatchType,
    selector: c.selector,
    autoShowDelaySeconds: wholeSeconds('Product tour conditions.autoShowDelay', c.autoShowDelay, 0, Number.MAX_SAFE_INTEGER),
  }) : undefined;
  const appearance = props.appearance ? compact({ ...props.appearance }) : undefined;
  validateRange('Product tour appearance.borderRadius', props.appearance?.borderRadius, 0, Number.MAX_SAFE_INTEGER);
  return compact({
    steps: props.steps && props.steps.length ? props.steps.map(renderStep) : undefined,
    appearance,
    conditions,
    displayFrequency: props.displayFrequency,
    ...props.rawContent,
  });
}

function renderStep(step: ProductTourStep, index: number): Record<string, unknown> {
  const what = `Product tour step ${index}`;
  const type = step.type ?? (step.selector !== undefined ? ProductTourStepType.ELEMENT : ProductTourStepType.MODAL);
  if (type === ProductTourStepType.ELEMENT && step.selector === undefined) {
    throw new Error(`${what}: element steps require a selector`);
  }
  if (step.placement !== undefined && type !== ProductTourStepType.ELEMENT) {
    throw new Error(`${what}: placement only applies to element steps`);
  }
  validateLength(`${what} title`, step.title, 1, 1000);
  validateLength(`${what} selector`, step.selector, 1, 1000);
  return compact({
    id: step.id,
    type,
    selector: step.selector,
    title: step.title,
    body: step.body,
    placement: step.placement,
    progressionTrigger: step.progressionTrigger ?? ProductTourProgressionTrigger.BUTTON,
    content: richText(step.title, step.body),
    contentHtml: htmlText(step.title, step.body),
    ...step.rawStep,
  })!;
}

/** The step text as the TipTap document the PostHog editor stores. */
function richText(title: string, body: string | undefined): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: title }] },
      ...(body !== undefined ? [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] : []),
    ],
  };
}

/** The step text as the HTML posthog-js renders. Tokens are embedded unescaped. */
function htmlText(title: string, body: string | undefined): string {
  const esc = (s: string) => (isConcrete(s) ? escapeHtml(s) : s);
  return `<h2>${esc(title)}</h2>${body !== undefined ? `<p>${esc(body)}</p>` : ''}`;
}
