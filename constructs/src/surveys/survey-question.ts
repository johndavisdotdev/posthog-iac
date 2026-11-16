import { Token } from 'aws-cdk-lib';
import { exactlyOne, isConcrete, validateLength, validateRange } from '../private/helpers';
import { compact } from '../private/surveys';

/**
 * The kind of a survey question.
 */
export enum SurveyQuestionType {
  /** Free-text answer. */
  OPEN = 'open',
  /** A message with a link button. */
  LINK = 'link',
  /** A numeric or emoji rating scale. */
  RATING = 'rating',
  /** Pick one of several choices. */
  SINGLE_CHOICE = 'single_choice',
  /** Pick any number of several choices. */
  MULTIPLE_CHOICE = 'multiple_choice',
}

/**
 * How a question description (or another rich text field) is interpreted.
 */
export enum DescriptionContentType {
  /** Plain text. */
  TEXT = 'text',
  /** HTML. */
  HTML = 'html',
}

/**
 * How a rating question is displayed.
 */
export enum RatingDisplay {
  /** Numbered buttons. */
  NUMBER = 'number',
  /** Emoji faces (scale 3 or 5). */
  EMOJI = 'emoji',
}

/**
 * Translated text of one question, for one language.
 */
export interface SurveyQuestionTranslation {
  /**
   * Translated question text.
   * @default - untranslated
   */
  readonly question?: string;

  /**
   * Translated button text.
   * @default - untranslated
   */
  readonly buttonText?: string;

  /**
   * Translated lower label of a rating question.
   * @default - untranslated
   */
  readonly lowerBoundLabel?: string;

  /**
   * Translated upper label of a rating question.
   * @default - untranslated
   */
  readonly upperBoundLabel?: string;

  /**
   * Translated choices of a choice question, in the same order.
   * @default - untranslated
   */
  readonly choices?: string[];

  /**
   * Translated link of a link question.
   * @default - untranslated
   */
  readonly link?: string;
}

/**
 * One response-based branch: when the answer is `response`, go to a question
 * or end the survey.
 */
export interface SurveyResponseBranch {
  /**
   * The answer to branch on.
   *
   * - Single choice questions: the choice text, or its zero-based index as a string.
   * - Rating questions: `negative`, `neutral` or `positive`, or for NPS
   *   questions `detractors`, `passives` or `promoters`.
   */
  readonly response: string;

  /**
   * Zero-based index of the question to go to. Must come after the current
   * question.
   * @default - set `end` instead
   */
  readonly questionIndex?: number;

  /**
   * End the survey.
   * @default - set `questionIndex` instead
   */
  readonly end?: boolean;
}

const RATING_RESPONSES = new Set(['negative', 'neutral', 'positive', 'detractors', 'passives', 'promoters']);

/**
 * What happens after a question is answered.
 */
export class SurveyBranching {
  /** Go to the next question (the default). */
  public static nextQuestion(): SurveyBranching {
    return new SurveyBranching('next_question');
  }

  /** End the survey. */
  public static end(): SurveyBranching {
    return new SurveyBranching('end');
  }

  /**
   * Go to the question with this zero-based index. It must come after the
   * current question.
   */
  public static toQuestion(questionIndex: number): SurveyBranching {
    return new SurveyBranching('specific_question', questionIndex);
  }

  /**
   * Branch on the answer. Only for single choice and rating questions.
   * Answers without a branch go to the next question.
   */
  public static byResponse(branches: SurveyResponseBranch[]): SurveyBranching {
    return new SurveyBranching('response_based', undefined, branches);
  }

  private constructor(
    private readonly kind: string,
    private readonly index?: number,
    private readonly branches?: SurveyResponseBranch[],
  ) {}

  /** @internal */
  public _render(what: string, question: SurveyQuestion, position: number, total: number): Record<string, unknown> {
    const checkTarget = (target: number, label: string) => {
      if (!Token.isUnresolved(target) && (!Number.isInteger(target) || target <= position || target >= total)) {
        throw new Error(`${what}: ${label} ${target} must be a later question (between ${position + 1} and ${total - 1})`);
      }
    };
    switch (this.kind) {
      case 'specific_question':
        checkTarget(this.index!, 'branch target');
        return { type: this.kind, index: this.index };
      case 'response_based': {
        if (question.type !== SurveyQuestionType.SINGLE_CHOICE && question.type !== SurveyQuestionType.RATING) {
          throw new Error(`${what}: response-based branching is only supported on single choice and rating questions`);
        }
        const responseValues: Record<string, unknown> = {};
        for (const branch of this.branches ?? []) {
          exactlyOne(`${what} branch '${branch.response}'`, { questionIndex: branch.questionIndex, end: branch.end ? true : undefined });
          const key = question._responseKey(what, branch.response);
          if (branch.questionIndex !== undefined) checkTarget(branch.questionIndex, `branch for '${branch.response}'`);
          responseValues[key] = branch.end ? 'end' : branch.questionIndex;
        }
        return { type: this.kind, responseValues };
      }
      default:
        return { type: this.kind };
    }
  }
}

/**
 * Options shared by every question type.
 */
export interface SurveyQuestionBaseOptions {
  /** The question text. */
  readonly question: string;

  /**
   * Extra text shown below the question.
   * @default - none
   */
  readonly description?: string;

  /**
   * How `description` is interpreted.
   * @default DescriptionContentType.TEXT
   */
  readonly descriptionContentType?: DescriptionContentType;

  /**
   * Whether the question can be skipped.
   * @default false
   */
  readonly optional?: boolean;

  /**
   * Text of the submit button.
   * @default - PostHog default ("Submit")
   */
  readonly buttonText?: string;

  /**
   * Stable question ID. Responses are stored by question ID, so set one to
   * keep results attached when the question text changes.
   * @default - assigned by PostHog
   */
  readonly id?: string;

  /**
   * Translations of this question, keyed by language code (e.g. `fr`, `pt-BR`).
   * @default - none
   */
  readonly translations?: { [language: string]: SurveyQuestionTranslation };
}

/**
 * Options for an open text question.
 */
export interface OpenTextQuestionOptions extends SurveyQuestionBaseOptions {
  /**
   * What happens after the question.
   * @default - next question
   */
  readonly branching?: SurveyBranching;

  /**
   * Minimum answer length.
   * @default - no minimum
   */
  readonly minLength?: number;

  /**
   * Maximum answer length.
   * @default - no maximum
   */
  readonly maxLength?: number;

  /**
   * Require the answer to be an email address.
   * @default false
   */
  readonly requireEmail?: boolean;
}

/**
 * Options for a link question.
 */
export interface LinkQuestionOptions extends SurveyQuestionBaseOptions {
  /** URL the button opens (`https://` or `mailto:`). */
  readonly link: string;

  /**
   * What happens after the question.
   * @default - next question
   */
  readonly branching?: SurveyBranching;
}

/**
 * Options for a rating question.
 */
export interface RatingQuestionOptions extends SurveyQuestionBaseOptions {
  /**
   * Number of points on the scale (1-10). Emoji ratings support 3 or 5.
   * @default - 10 for numbers, 5 for emoji
   */
  readonly scale?: number;

  /**
   * How the scale is displayed.
   * @default RatingDisplay.NUMBER
   */
  readonly display?: RatingDisplay;

  /**
   * Label under the lowest value.
   * @default - none
   */
  readonly lowerLabel?: string;

  /**
   * Label under the highest value.
   * @default - none
   */
  readonly upperLabel?: string;

  /**
   * Treat the question as a Net Promoter Score question (0-10 scale).
   * @default false
   */
  readonly isNps?: boolean;

  /**
   * What happens after the question.
   * @default - next question
   */
  readonly branching?: SurveyBranching;
}

/**
 * Options for a multiple choice question.
 */
export interface ChoiceQuestionOptions extends SurveyQuestionBaseOptions {
  /** The choices (2-20). */
  readonly choices: string[];

  /**
   * Show the choices in random order.
   * @default false
   */
  readonly shuffleOptions?: boolean;

  /**
   * Make the last choice an "Other" option with a free-text field.
   * @default false
   */
  readonly hasOpenChoice?: boolean;
}

/**
 * Options for a single choice question.
 */
export interface SingleChoiceQuestionOptions extends ChoiceQuestionOptions {
  /**
   * What happens after the question.
   * @default - next question
   */
  readonly branching?: SurveyBranching;
}

/**
 * A survey question. Create one with the static methods.
 */
export class SurveyQuestion {
  /** A free-text question. */
  public static openText(options: OpenTextQuestionOptions): SurveyQuestion {
    return new SurveyQuestion(SurveyQuestionType.OPEN, options, () => {
      validateRange('Open text question minLength', options.minLength, 1, Number.MAX_SAFE_INTEGER);
      validateRange('Open text question maxLength', options.maxLength, 1, Number.MAX_SAFE_INTEGER);
      const validation = [
        ...(options.minLength !== undefined ? [{ type: 'min_length', value: options.minLength }] : []),
        ...(options.maxLength !== undefined ? [{ type: 'max_length', value: options.maxLength }] : []),
        ...(options.requireEmail ? [{ type: 'email' }] : []),
      ];
      return { validation: validation.length ? validation : undefined };
    });
  }

  /** A message with a button that opens a link. */
  public static link(options: LinkQuestionOptions): SurveyQuestion {
    return new SurveyQuestion(SurveyQuestionType.LINK, options, () => {
      validateLength('Link question link', options.link, 1, 2048);
      return { link: options.link };
    });
  }

  /** A rating scale. */
  public static rating(options: RatingQuestionOptions): SurveyQuestion {
    return new SurveyQuestion(SurveyQuestionType.RATING, options, () => {
      const display = options.display ?? RatingDisplay.NUMBER;
      const scale = options.scale ?? (display === RatingDisplay.EMOJI ? 5 : 10);
      validateRange('Rating question scale', scale, 1, 10);
      if (display === RatingDisplay.EMOJI && !Token.isUnresolved(scale) && scale !== 3 && scale !== 5) {
        throw new Error(`Rating question scale must be 3 or 5 for emoji display, got ${scale}`);
      }
      if (options.isNps && !Token.isUnresolved(scale) && (display !== RatingDisplay.NUMBER || scale !== 10)) {
        throw new Error('NPS rating questions must use the number display with a scale of 10');
      }
      return {
        display,
        scale,
        lowerBoundLabel: options.lowerLabel,
        upperBoundLabel: options.upperLabel,
        isNpsQuestion: options.isNps,
      };
    });
  }

  /** Pick one choice. */
  public static singleChoice(options: SingleChoiceQuestionOptions): SurveyQuestion {
    return new SurveyQuestion(SurveyQuestionType.SINGLE_CHOICE, options, () => SurveyQuestion.renderChoices(options));
  }

  /** Pick any number of choices. Multiple choice questions cannot branch. */
  public static multipleChoice(options: ChoiceQuestionOptions): SurveyQuestion {
    return new SurveyQuestion(SurveyQuestionType.MULTIPLE_CHOICE, options, () => SurveyQuestion.renderChoices(options));
  }

  private static renderChoices(options: ChoiceQuestionOptions): Record<string, unknown> {
    if (!Token.isUnresolved(options.choices) && (options.choices.length < 2 || options.choices.length > 20)) {
      throw new Error(`Choice question '${options.question}' must have between 2 and 20 choices, got ${options.choices.length}`);
    }
    return { choices: options.choices, shuffleOptions: options.shuffleOptions, hasOpenChoice: options.hasOpenChoice };
  }

  private constructor(
    /** The kind of question. */
    public readonly type: SurveyQuestionType,
    private readonly options: SurveyQuestionBaseOptions & { readonly branching?: SurveyBranching; readonly choices?: string[] },
    private readonly renderSpecific: () => Record<string, unknown>,
  ) {}

  /** The question text. */
  public get question(): string {
    return this.options.question;
  }

  /**
   * Renders the question as PostHog stores it.
   * @internal
   */
  public _render(position: number, total: number): Record<string, unknown> {
    const what = `Survey question ${position}`;
    validateLength(`${what} text`, this.options.question, 1, 10000);
    const translations = this.options.translations && Object.keys(this.options.translations).length
      ? Object.fromEntries(Object.entries(this.options.translations).map(([lang, t]) => [lang, compact({ ...t }) ?? {}]))
      : undefined;
    return compact({
      id: this.options.id,
      type: this.type,
      question: this.options.question,
      description: this.options.description,
      descriptionContentType: this.options.descriptionContentType,
      optional: this.options.optional,
      buttonText: this.options.buttonText,
      ...this.renderSpecific(),
      translations,
      branching: this.options.branching?._render(what, this, position, total),
    })!;
  }

  /**
   * Maps a response-based branch answer to PostHog's `responseValues` key.
   * @internal
   */
  public _responseKey(what: string, response: string): string {
    if (!isConcrete(response)) return response;
    if (this.type === SurveyQuestionType.SINGLE_CHOICE) {
      const choices = this.options.choices ?? [];
      const byText = choices.indexOf(response);
      if (byText >= 0) return String(byText);
      if (/^\d+$/.test(response) && Number(response) < choices.length) return response;
      throw new Error(`${what}: branch response '${response}' is not one of the choices`);
    }
    if (!RATING_RESPONSES.has(response)) {
      throw new Error(`${what}: rating branch response '${response}' must be one of ${[...RATING_RESPONSES].join(', ')}`);
    }
    return response;
  }
}
