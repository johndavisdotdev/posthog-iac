import { App, CfnParameter, Duration, RemovalPolicy, Resource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { IFeatureFlag } from '../../src/feature-flags';
import { IProject, Project } from '../../src/organizations';
import { IInsight } from '../../src/product-analytics';
import {
  DescriptionContentType,
  RatingDisplay,
  Survey,
  SurveyBranching,
  SurveyDeviceType,
  SurveyPosition,
  SurveyQuestion,
  SurveySamplingIntervalType,
  SurveySchedule,
  SurveyType,
  UrlMatchType,
} from '../../src/surveys';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function flag(stack: Stack, project: IProject): IFeatureFlag {
  class F extends Resource implements IFeatureFlag {
    public readonly flagId = '77';
    public readonly flagKey = 'beta';
    public readonly project = project;
  }
  return new F(stack, 'Flag');
}

function insight(stack: Stack, project: IProject): IInsight {
  class I extends Resource implements IInsight {
    public readonly insightId = '88';
    public readonly project = project;
  }
  return new I(stack, 'Insight');
}

function props(stack: Stack): Record<string, any> {
  return Object.values(Template.fromStack(stack).findResources('PostHog::Surveys::Survey'))[0].Properties;
}

function questions(stack: Stack): any[] {
  return JSON.parse(props(stack).Questions);
}

test('creates a survey with typed questions, conditions, appearance and targeting', () => {
  const { stack, project } = setup();
  const survey = new Survey(stack, 'Nps', {
    project,
    name: 'Net Promoter Score',
    description: 'Quarterly NPS',
    type: SurveyType.POPOVER,
    questions: [
      SurveyQuestion.rating({
        question: 'How likely are you to recommend us?',
        isNps: true,
        lowerLabel: 'Unlikely',
        upperLabel: 'Very likely',
        branching: SurveyBranching.byResponse([
          { response: 'promoters', end: true },
          { response: 'detractors', questionIndex: 2 },
        ]),
      }),
      SurveyQuestion.openText({ question: 'What do you love?', branching: SurveyBranching.end() }),
      SurveyQuestion.openText({ question: 'What should we fix?', optional: true }),
    ],
    conditions: {
      url: '/app',
      urlMatchType: UrlMatchType.CONTAINS,
      selector: '#main',
      seenSurveyWaitPeriod: Duration.days(30),
      events: ['purchase'],
      deviceTypes: [SurveyDeviceType.DESKTOP],
    },
    appearance: { position: SurveyPosition.RIGHT, thankYouMessageHeader: 'Thanks!', surveyPopupDelay: Duration.seconds(5) },
    targeting: [{ properties: [{ key: 'plan', value: ['pro'], type: PropertyFilterType.PERSON }] }],
    linkedFlag: flag(stack, project),
    linkedInsight: insight(stack, project),
    responsesLimit: 1000,
    startDate: new Date('2026-12-01T00:00:00Z'),
    endDate: '2027-01-01T00:00:00Z',
    translations: { fr: { name: 'Score NPS', thankYouMessageHeader: 'Merci !' } },
  });

  const t = Template.fromStack(stack);
  t.hasResource('PostHog::Surveys::Survey', { DeletionPolicy: 'Delete' });
  const p = props(stack);
  expect(p).toMatchObject({
    ProjectId: '12345',
    Name: 'Net Promoter Score',
    Description: 'Quarterly NPS',
    Type: 'popover',
    LinkedFlagId: '77',
    LinkedInsightId: '88',
    ResponsesLimit: 1000,
    StartDate: '2026-12-01T00:00:00.000Z',
    EndDate: '2027-01-01T00:00:00Z',
  });
  expect(JSON.parse(p.Conditions)).toEqual({
    url: '/app',
    urlMatchType: 'icontains',
    selector: '#main',
    seenSurveyWaitPeriodInDays: 30,
    events: { values: [{ name: 'purchase' }] },
    deviceTypes: ['Desktop'],
  });
  expect(JSON.parse(p.Appearance)).toEqual({ position: 'right', thankYouMessageHeader: 'Thanks!', surveyPopupDelaySeconds: 5 });
  expect(JSON.parse(p.TargetingFlagFilters)).toEqual({
    groups: [{ properties: [{ key: 'plan', operator: 'exact', type: 'person', value: ['pro'] }], rollout_percentage: 100 }],
  });
  expect(JSON.parse(p.Translations)).toEqual({ fr: { name: 'Score NPS', thankYouMessageHeader: 'Merci !' } });
  expect(stack.resolve(survey.surveyId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Nps/), 'Id'] });
  expect(stack.resolve(survey.surveyTargetingFlagId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Nps/), 'TargetingFlagId'] });
  expect(stack.resolve(survey.surveyCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Nps/), 'CreatedAt'] });
});

test('serializes every question type', () => {
  const { stack, project } = setup();
  new Survey(stack, 'All', {
    project,
    name: 'All questions',
    questions: [
      SurveyQuestion.openText({
        question: 'Your email?',
        id: 'q-email',
        description: '<b>We never share it</b>',
        descriptionContentType: DescriptionContentType.HTML,
        buttonText: 'Next',
        requireEmail: true,
        minLength: 3,
        maxLength: 200,
        translations: { de: { question: 'Deine E-Mail?' } },
      }),
      SurveyQuestion.link({ question: 'Read the docs', link: 'https://posthog.com/docs' }),
      SurveyQuestion.rating({ question: 'How was it?', display: RatingDisplay.EMOJI, scale: 3 }),
      SurveyQuestion.rating({ question: 'Rate us' }),
      SurveyQuestion.singleChoice({
        question: 'Role?',
        choices: ['Engineer', 'Designer', 'Other'],
        hasOpenChoice: true,
        branching: SurveyBranching.byResponse([{ response: 'Designer', questionIndex: 6 }, { response: '0', end: true }]),
      }),
      SurveyQuestion.multipleChoice({ question: 'Tools?', choices: ['A', 'B'], shuffleOptions: true }),
      SurveyQuestion.openText({ question: 'Anything else?', branching: SurveyBranching.nextQuestion() }),
    ],
  });
  expect(questions(stack)).toMatchSnapshot();
  expect(questions(stack)[4].branching).toEqual({ type: 'response_based', responseValues: { 1: 6, 0: 'end' } });
});

test('specific question branching', () => {
  const { stack, project } = setup();
  new Survey(stack, 'S', {
    project,
    name: 'S',
    questions: [
      SurveyQuestion.openText({ question: 'a', branching: SurveyBranching.toQuestion(2) }),
      SurveyQuestion.openText({ question: 'b' }),
      SurveyQuestion.openText({ question: 'c' }),
    ],
  });
  expect(questions(stack)[0]).toEqual({ type: 'open', question: 'a', branching: { type: 'specific_question', index: 2 } });
});

test('recurring schedules, sampling and flags', () => {
  const { stack, project } = setup();
  new Survey(stack, 'R', {
    project,
    name: 'R',
    type: SurveyType.WIDGET,
    recurrence: { frequency: Duration.days(90), count: 4 },
    responseSampling: { startDate: '2026-12-01', interval: 1, intervalType: SurveySamplingIntervalType.WEEK, limit: 50 },
    baseLanguage: 'en-GB',
    enablePartialResponses: true,
    enableIframeEmbedding: false,
    archived: false,
  });
  expect(props(stack)).toEqual({
    ProjectId: '12345',
    Name: 'R',
    Type: 'widget',
    Schedule: 'recurring',
    IterationCount: 4,
    IterationFrequencyDays: 90,
    ResponseSamplingStartDate: '2026-12-01',
    ResponseSamplingIntervalType: 'week',
    ResponseSamplingInterval: 1,
    ResponseSamplingLimit: 50,
    BaseLanguage: 'en-GB',
    EnablePartialResponses: true,
    EnableIframeEmbedding: false,
    Archived: false,
  });
});

test('leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Survey(stack, 'Bare', { project, name: 'Bare', removalPolicy: RemovalPolicy.RETAIN });
  Template.fromStack(stack).hasResource('PostHog::Surveys::Survey', { DeletionPolicy: 'Retain' });
  expect(props(stack)).toEqual({ ProjectId: '12345', Name: 'Bare', Type: 'popover' });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  const q = (...qs: SurveyQuestion[]) => ({ project, name: 'x', questions: qs });
  expect(() => new Survey(stack, 'E1', { project, name: '' })).toThrow(/Survey name must be between 1 and 400/);
  expect(() => new Survey(stack, 'E2', { project, name: 'x', responsesLimit: 0 })).toThrow(/responsesLimit/);
  expect(() => new Survey(stack, 'E3', { project, name: 'x', schedule: SurveySchedule.ONCE, recurrence: { frequency: Duration.days(1) } }))
    .toThrow(/RECURRING/);
  expect(() => new Survey(stack, 'E4', { project, name: 'x', recurrence: { frequency: Duration.days(400) } })).toThrow(/frequency/);
  expect(() => new Survey(stack, 'E5', { project, name: 'x', startDate: 'tomorrow' })).toThrow(/ISO 8601/);
  expect(() => new Survey(stack, 'E6', q(SurveyQuestion.singleChoice({ question: 'a', choices: ['only'] })))).toThrow(/between 2 and 20 choices/);
  expect(() => new Survey(stack, 'E7', q(SurveyQuestion.rating({ question: 'a', display: RatingDisplay.EMOJI, scale: 10 })))).toThrow(/3 or 5/);
  expect(() => new Survey(stack, 'E8', q(SurveyQuestion.rating({ question: 'a', scale: 11 })))).toThrow(/scale/);
  expect(() => new Survey(stack, 'E9', q(SurveyQuestion.rating({ question: 'a', isNps: true, scale: 5 })))).toThrow(/NPS/);
  expect(() => new Survey(stack, 'E10', q(SurveyQuestion.openText({ question: 'a', branching: SurveyBranching.toQuestion(0) }))))
    .toThrow(/later question/);
  expect(() => new Survey(stack, 'E11', q(SurveyQuestion.openText({ question: 'a', branching: SurveyBranching.byResponse([]) }))))
    .toThrow(/single choice and rating/);
  expect(() => new Survey(stack, 'E12', q(
    SurveyQuestion.singleChoice({ question: 'a', choices: ['x', 'y'], branching: SurveyBranching.byResponse([{ response: 'z', end: true }]) }),
  ))).toThrow(/not one of the choices/);
  expect(() => new Survey(stack, 'E13', q(
    SurveyQuestion.rating({ question: 'a', branching: SurveyBranching.byResponse([{ response: 'meh', end: true }]) }),
  ))).toThrow(/rating branch response/);
  expect(() => new Survey(stack, 'E14', q(
    SurveyQuestion.rating({ question: 'a', branching: SurveyBranching.byResponse([{ response: 'positive' }]) }),
  ))).toThrow(/exactly one of questionIndex, end/);
  expect(() => new Survey(stack, 'E15', { project, name: 'x', targeting: [{ rolloutPercentage: 101 }] })).toThrow(/rolloutPercentage/);
  expect(() => new Survey(stack, 'E16', { project, name: 'x', targeting: [{ properties: [{ key: 'plan' }] }] })).toThrow(/value is required/);
  expect(() => new Survey(stack, 'E17', { project, name: 'x', conditions: { seenSurveyWaitPeriod: Duration.hours(5) } })).toThrow();

  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  const date = new CfnParameter(stack, 'Start', { type: 'String' });
  expect(() => new Survey(stack, 'Token', {
    project,
    name: name.valueAsString,
    startDate: date.valueAsString,
    questions: [SurveyQuestion.openText({ question: name.valueAsString })],
  })).not.toThrow();
});

test('imports existing surveys', () => {
  const { stack, project } = setup();
  const survey = Survey.fromSurveyId(stack, 'Existing', project, 'uuid-1');
  expect(survey.surveyId).toBe('uuid-1');
  expect(survey.project).toBe(project);
});

test('question accessors', () => {
  const q = SurveyQuestion.link({ question: 'Docs', link: 'https://x' });
  expect(q.type).toBe('link');
  expect(q.question).toBe('Docs');
});
