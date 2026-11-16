import { Duration, IResource, RemovalPolicy, Resource, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TargetingCondition, UrlMatchType } from './common';
import { DescriptionContentType, SurveyQuestion } from './survey-question';
import { CfnSurvey, CfnSurveyPropsResponseSamplingIntervalType, CfnSurveyPropsSchedule, CfnSurveyPropsType } from './survey.generated';
import type { IFeatureFlag } from '../feature-flags/feature-flag';
import type { IProject } from '../organizations/project';
import { jsonProp, validateLength, validateRange } from '../private/helpers';
import { compact, renderTargetingFlagFilters, renderTimestamp, wholeDays, wholeSeconds } from '../private/surveys';
import type { IInsight } from '../product-analytics/insight';

/**
 * Where and how a survey is shown.
 */
export enum SurveyType {
  /** An in-app popover shown by posthog-js. */
  POPOVER = 'popover',
  /** An in-app feedback widget (button, tab or custom selector). */
  WIDGET = 'widget',
  /** A hosted survey page with a public link. */
  HOSTED = 'external_survey',
  /** Rendered by your own code; responses are sent through the API. */
  API = 'api',
}

/**
 * How often a user sees a survey.
 */
export enum SurveySchedule {
  /** Once per user. */
  ONCE = 'once',
  /** Repeatedly, every `recurrence.frequency`. */
  RECURRING = 'recurring',
  /** Every time the display conditions match (mainly for widgets). */
  ALWAYS = 'always',
}

/**
 * Device types for display conditions.
 */
export enum SurveyDeviceType {
  /** Desktop browsers. */
  DESKTOP = 'Desktop',
  /** Phones. */
  MOBILE = 'Mobile',
  /** Tablets. */
  TABLET = 'Tablet',
}

/**
 * Where a popover survey appears on the page.
 */
export enum SurveyPosition {
  /** Top left. */
  TOP_LEFT = 'top_left',
  /** Top centre. */
  TOP_CENTER = 'top_center',
  /** Top right. */
  TOP_RIGHT = 'top_right',
  /** Middle left. */
  MIDDLE_LEFT = 'middle_left',
  /** Middle centre. */
  MIDDLE_CENTER = 'middle_center',
  /** Middle right. */
  MIDDLE_RIGHT = 'middle_right',
  /** Bottom left. */
  LEFT = 'left',
  /** Bottom centre. */
  CENTER = 'center',
  /** Bottom right (PostHog's default). */
  RIGHT = 'right',
  /** Next to the widget trigger element. */
  NEXT_TO_TRIGGER = 'next_to_trigger',
}

/**
 * How a widget survey is opened.
 */
export enum SurveyWidgetType {
  /** A floating feedback button. */
  BUTTON = 'button',
  /** A tab on the edge of the page. */
  TAB = 'tab',
  /** Your own element, matched by `widgetSelector`. */
  SELECTOR = 'selector',
}

/**
 * Which edge of the page holds a widget tab.
 */
export enum SurveyTabPosition {
  /** Top edge. */
  TOP = 'top',
  /** Left edge. */
  LEFT = 'left',
  /** Right edge. */
  RIGHT = 'right',
  /** Bottom edge. */
  BOTTOM = 'bottom',
}

/**
 * Unit of the response sampling interval.
 */
export enum SurveySamplingIntervalType {
  /** Days. */
  DAY = 'day',
  /** Weeks. */
  WEEK = 'week',
  /** Months. */
  MONTH = 'month',
}

/**
 * Look and feel of an in-app survey.
 */
export interface SurveyAppearance {
  /** Background colour. @default - PostHog default */
  readonly backgroundColor?: string;
  /** Border colour. @default - PostHog default */
  readonly borderColor?: string;
  /** Text colour. @default - PostHog default */
  readonly textColor?: string;
  /** Colour of secondary text such as question descriptions. @default - PostHog default */
  readonly textSubtleColor?: string;
  /** Description text colour. @default - PostHog default */
  readonly descriptionTextColor?: string;
  /** Submit button colour. @default - PostHog default */
  readonly submitButtonColor?: string;
  /** Submit button text colour. @default - PostHog default */
  readonly submitButtonTextColor?: string;
  /** Submit button text. @default "Submit" */
  readonly submitButtonText?: string;
  /** Rating button colour. @default - PostHog default */
  readonly ratingButtonColor?: string;
  /** Active rating button colour. @default - PostHog default */
  readonly ratingButtonActiveColor?: string;
  /** Hovered rating button colour. @default - PostHog default */
  readonly ratingButtonHoverColor?: string;
  /** Background of text inputs and rating buttons. @default - PostHog default */
  readonly inputBackground?: string;
  /** Text colour of inputs and rating buttons. @default - calculated from inputBackground */
  readonly inputTextColor?: string;
  /** Placeholder of open text inputs. @default - none */
  readonly placeholder?: string;
  /** Hide the "Survey by PostHog" branding. @default false */
  readonly whiteLabel?: boolean;
  /** Close the survey automatically after it is completed. @default false */
  readonly autoDisappear?: boolean;
  /** Show a thank-you message after the last question. @default false */
  readonly displayThankYouMessage?: boolean;
  /** Thank-you message heading. @default - PostHog default */
  readonly thankYouMessageHeader?: string;
  /** Thank-you message body. @default - none */
  readonly thankYouMessageDescription?: string;
  /** How `thankYouMessageDescription` is interpreted. @default DescriptionContentType.TEXT */
  readonly thankYouMessageDescriptionContentType?: DescriptionContentType;
  /** Text of the thank-you close button. @default - PostHog default */
  readonly thankYouMessageCloseButtonText?: string;
  /** Show an intro screen before the first question. @default false */
  readonly displayIntroScreen?: boolean;
  /** Intro screen heading. @default - none */
  readonly introScreenHeader?: string;
  /** Intro screen body. @default - none */
  readonly introScreenDescription?: string;
  /** How `introScreenDescription` is interpreted. @default DescriptionContentType.TEXT */
  readonly introScreenDescriptionContentType?: DescriptionContentType;
  /** Intro screen start button text. @default - PostHog default */
  readonly introScreenButtonText?: string;
  /** Where a popover survey appears. @default SurveyPosition.RIGHT */
  readonly position?: SurveyPosition;
  /** Show the questions in random order. @default false */
  readonly shuffleQuestions?: boolean;
  /** Delay before a popover survey appears (whole seconds). @default - no delay */
  readonly surveyPopupDelay?: Duration;
  /** Show a Back button after the first question. @default false */
  readonly allowGoBack?: boolean;
  /** Back button text. @default "Back" */
  readonly backButtonText?: string;
  /** How a widget survey is opened. @default - PostHog default */
  readonly widgetType?: SurveyWidgetType;
  /** CSS selector of your trigger element, for `SurveyWidgetType.SELECTOR`. @default - none */
  readonly widgetSelector?: string;
  /** Widget button or tab label. @default - PostHog default */
  readonly widgetLabel?: string;
  /** Widget button or tab colour. @default - PostHog default */
  readonly widgetColor?: string;
  /** Edge of the page that holds a widget tab. @default - PostHog default */
  readonly tabPosition?: SurveyTabPosition;
  /** CSS font family. @default - inherited */
  readonly fontFamily?: string;
  /** CSS max-width of the survey box. @default - PostHog default */
  readonly maxWidth?: string;
  /** CSS z-index of the survey box. @default - PostHog default */
  readonly zIndex?: string;
  /** CSS opacity of disabled buttons. @default - PostHog default */
  readonly disabledButtonOpacity?: string;
  /** CSS padding of the survey box. @default - PostHog default */
  readonly boxPadding?: string;
  /** CSS box-shadow of the survey box. @default - PostHog default */
  readonly boxShadow?: string;
  /** CSS border-radius of the survey box. @default - PostHog default */
  readonly borderRadius?: string;
}

/**
 * When and where an in-app survey is shown.
 */
export interface SurveyConditions {
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
   * Show the survey only when an element matching this CSS selector is on the page.
   * @default - no selector condition
   */
  readonly selector?: string;

  /**
   * Don't show the survey to users who saw any survey within this period
   * (whole days).
   * @default - no wait period
   */
  readonly seenSurveyWaitPeriod?: Duration;

  /**
   * Show the survey when one of these events is captured.
   * @default - no event trigger
   */
  readonly events?: string[];

  /**
   * Show the survey every time one of `events` is captured, not just once.
   * @default false
   */
  readonly repeatedActivation?: boolean;

  /**
   * Device types to match.
   * @default - all devices
   */
  readonly deviceTypes?: SurveyDeviceType[];

  /**
   * How `deviceTypes` is compared.
   * @default UrlMatchType.EXACT
   */
  readonly deviceTypesMatchType?: UrlMatchType;

  /**
   * Show the survey only to users on this variant of the linked flag.
   * @default - any enabled variant
   */
  readonly linkedFlagVariant?: string;
}

/**
 * Repetition of a recurring survey (`SurveySchedule.RECURRING`).
 */
export interface SurveyRecurrence {
  /** Time between iterations (whole days, 1-365). */
  readonly frequency: Duration;

  /**
   * How many times the survey is shown (1-500). Ignored when `untilStopped` is true.
   * @default - PostHog default
   */
  readonly count?: number;

  /**
   * Keep repeating until the survey is stopped.
   * @default false
   */
  readonly untilStopped?: boolean;
}

/**
 * Response sampling: collect at most `limit` responses per interval.
 */
export interface SurveyResponseSampling {
  /** Start of sampling. */
  readonly startDate: Date | string;

  /** Length of the interval, in `intervalType` units. */
  readonly interval: number;

  /** Unit of the interval. */
  readonly intervalType: SurveySamplingIntervalType;

  /** Maximum responses per interval. */
  readonly limit: number;
}

/**
 * Survey-level translations, for one language.
 */
export interface SurveyTranslation {
  /** Translated survey name. @default - untranslated */
  readonly name?: string;
  /** Translated thank-you heading. @default - untranslated */
  readonly thankYouMessageHeader?: string;
  /** Translated thank-you body. @default - untranslated */
  readonly thankYouMessageDescription?: string;
  /** Translated thank-you close button text. @default - untranslated */
  readonly thankYouMessageCloseButtonText?: string;
  /** Translated intro screen heading. @default - untranslated */
  readonly introScreenHeader?: string;
  /** Translated intro screen body. @default - untranslated */
  readonly introScreenDescription?: string;
  /** Translated intro screen button text. @default - untranslated */
  readonly introScreenButtonText?: string;
  /** Translated back button text. @default - untranslated */
  readonly backButtonText?: string;
}

/**
 * A PostHog survey.
 */
export interface ISurvey extends IResource {
  /**
   * The PostHog survey ID (UUID).
   * @attribute
   */
  readonly surveyId: string;

  /** The project the survey belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a survey in a project (`project.addSurvey()`).
 */
export interface SurveyOptions {
  /**
   * Survey name. In-app surveys send it to visitors' browsers, so keep
   * private details out of it.
   */
  readonly name: string;

  /**
   * Internal description. Never shown to visitors.
   * @default - none
   */
  readonly description?: string;

  /**
   * Where and how the survey is shown.
   * @default SurveyType.POPOVER
   */
  readonly type?: SurveyType;

  /**
   * The questions, in order.
   * @default - no questions
   */
  readonly questions?: SurveyQuestion[];

  /**
   * Look and feel.
   * @default - PostHog defaults
   */
  readonly appearance?: SurveyAppearance;

  /**
   * Display conditions.
   * @default - shown on every page
   */
  readonly conditions?: SurveyConditions;

  /**
   * Person targeting. A user matching any condition sees the survey.
   * PostHog keeps it on a targeting flag it manages.
   * @default - every user
   */
  readonly targeting?: TargetingCondition[];

  /**
   * Show the survey only to users with this feature flag enabled.
   * @default - no linked flag
   */
  readonly linkedFlag?: IFeatureFlag;

  /**
   * Insight linked to the survey.
   * @default - none
   */
  readonly linkedInsight?: IInsight;

  /**
   * How often a user sees the survey.
   * @default SurveySchedule.ONCE
   */
  readonly schedule?: SurveySchedule;

  /**
   * Repetition, for `SurveySchedule.RECURRING`.
   * @default - none
   */
  readonly recurrence?: SurveyRecurrence;

  /**
   * Launch time (ISO 8601 string or Date). Setting it launches the survey.
   * @default - draft
   */
  readonly startDate?: Date | string;

  /**
   * End time (ISO 8601 string or Date). Setting it completes the survey.
   * @default - runs until stopped
   */
  readonly endDate?: Date | string;

  /**
   * Translations of the survey-level text, keyed by language code. Question
   * text is translated on each question.
   * @default - none
   */
  readonly translations?: { [language: string]: SurveyTranslation };

  /**
   * BCP-47 code of the language of the untranslated text.
   * @default "en"
   */
  readonly baseLanguage?: string;

  /**
   * Stop the survey after this many responses.
   * @default - no limit
   */
  readonly responsesLimit?: number;

  /**
   * Response sampling.
   * @default - no sampling
   */
  readonly responseSampling?: SurveyResponseSampling;

  /**
   * Store a response as soon as one question is answered.
   * @default - PostHog default
   */
  readonly enablePartialResponses?: boolean;

  /**
   * Allow the hosted survey page to be embedded in an iframe.
   * @default false
   */
  readonly enableIframeEmbedding?: boolean;

  /**
   * Whether the survey is archived.
   * @default false
   */
  readonly archived?: boolean;

  /**
   * What happens to the PostHog survey when it is removed from the stack.
   * PostHog hard-deletes surveys; collected responses stay as events.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Survey.
 */
export interface SurveyProps extends SurveyOptions {
  /** The project to create the survey in. */
  readonly project: IProject;
}

/**
 * A PostHog survey: questions shown in-app (popover or widget), on a hosted
 * page, or collected through the API.
 *
 * @resource PostHog::Surveys::Survey
 */
export class Survey extends Resource implements ISurvey {
  /**
   * Import an existing survey by its PostHog ID.
   */
  public static fromSurveyId(scope: Construct, id: string, project: IProject, surveyId: string): ISurvey {
    class Import extends Resource implements ISurvey {
      public readonly surveyId = surveyId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly surveyId: string;
  public readonly project: IProject;

  /**
   * ID of the targeting flag PostHog manages for `targeting`.
   * @attribute
   */
  public readonly surveyTargetingFlagId: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly surveyCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnSurvey;

  constructor(scope: Construct, id: string, props: SurveyProps) {
    super(scope, id);
    validateLength('Survey name', props.name, 1, 400);
    validateLength('Survey baseLanguage', props.baseLanguage, 1, 20);
    validateRange('Survey responsesLimit', props.responsesLimit, 1, Number.MAX_SAFE_INTEGER);

    const schedule = props.schedule ?? (props.recurrence ? SurveySchedule.RECURRING : undefined);
    if (props.recurrence && schedule !== SurveySchedule.RECURRING) {
      throw new Error('Survey recurrence requires SurveySchedule.RECURRING');
    }
    const recurrence = props.recurrence;
    validateRange('Survey recurrence.count', recurrence?.count, 1, 500);
    const sampling = props.responseSampling;
    validateRange('Survey responseSampling.interval', sampling?.interval, 0, Number.MAX_SAFE_INTEGER);
    validateRange('Survey responseSampling.limit', sampling?.limit, 0, Number.MAX_SAFE_INTEGER);

    this.project = props.project;
    const questions = props.questions;

    this.resource = new CfnSurvey(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      description: props.description,
      type: (props.type ?? SurveyType.POPOVER) as string as CfnSurveyPropsType,
      schedule: schedule as string as CfnSurveyPropsSchedule | undefined,
      linkedFlagId: props.linkedFlag?.flagId,
      linkedInsightId: props.linkedInsight?.insightId,
      targetingFlagFilters: jsonProp(this, renderTargetingFlagFilters('Survey', props.targeting)),
      questions: questions && questions.length
        ? jsonProp(this, questions.map((q, i) => q._render(i, questions.length)))
        : undefined,
      conditions: jsonProp(this, renderConditions(props.conditions)),
      appearance: jsonProp(this, renderAppearance(props.appearance)),
      translations: jsonProp(this, renderTranslations(props.translations)),
      startDate: renderTimestamp('Survey startDate', props.startDate),
      endDate: renderTimestamp('Survey endDate', props.endDate),
      archived: props.archived,
      responsesLimit: props.responsesLimit,
      iterationCount: recurrence?.count,
      iterationFrequencyDays: wholeDays('Survey recurrence.frequency', recurrence?.frequency, 1, 365),
      repeatUntilStopped: recurrence?.untilStopped,
      enablePartialResponses: props.enablePartialResponses,
      enableIframeEmbedding: props.enableIframeEmbedding,
      baseLanguage: props.baseLanguage,
      responseSamplingStartDate: renderTimestamp('Survey responseSampling.startDate', sampling?.startDate),
      responseSamplingIntervalType: sampling?.intervalType as string as CfnSurveyPropsResponseSamplingIntervalType | undefined,
      responseSamplingInterval: sampling?.interval,
      responseSamplingLimit: sampling?.limit,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.surveyId = this.resource.attrId;
    this.surveyTargetingFlagId = this.resource.attrTargetingFlagId;
    this.surveyCreatedAt = this.resource.attrCreatedAt;
  }
}

function renderConditions(c: SurveyConditions | undefined): Record<string, unknown> | undefined {
  if (!c) return undefined;
  const events = c.events && (Token.isUnresolved(c.events) || c.events.length)
    ? compact({ values: Token.isUnresolved(c.events) ? c.events : c.events.map(name => ({ name })), repeatedActivation: c.repeatedActivation })
    : undefined;
  return compact({
    url: c.url,
    urlMatchType: c.urlMatchType,
    selector: c.selector,
    seenSurveyWaitPeriodInDays: wholeDays('Survey conditions.seenSurveyWaitPeriod', c.seenSurveyWaitPeriod, 0, Number.MAX_SAFE_INTEGER),
    events,
    deviceTypes: c.deviceTypes && c.deviceTypes.length ? c.deviceTypes : undefined,
    deviceTypesMatchType: c.deviceTypesMatchType,
    linkedFlagVariant: c.linkedFlagVariant,
  });
}

function renderAppearance(a: SurveyAppearance | undefined): Record<string, unknown> | undefined {
  if (!a) return undefined;
  const { surveyPopupDelay, ...rest } = a;
  return compact({
    ...rest,
    surveyPopupDelaySeconds: wholeSeconds('Survey appearance.surveyPopupDelay', surveyPopupDelay, 0, Number.MAX_SAFE_INTEGER),
  });
}

function renderTranslations(t: { [language: string]: SurveyTranslation } | undefined): Record<string, unknown> | undefined {
  if (!t || Object.keys(t).length === 0) return undefined;
  return Object.fromEntries(Object.entries(t).map(([lang, v]) => {
    validateLength('Survey translation language code', lang, 1, 20);
    return [lang, compact({ ...v }) ?? {}];
  }));
}
