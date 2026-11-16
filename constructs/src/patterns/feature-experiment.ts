import { Construct } from 'constructs';
import { PropertyFilter, PropertyFilterType, PropertyOperator } from '../core/filters';
import { Experiment } from '../experiments/experiment';
import type { IHoldout } from '../experiments/holdout';
import { ExperimentMetric } from '../experiments/metric';
import { ISavedMetric, SavedMetric } from '../experiments/saved-metric';
import { EarlyAccessFeature, EarlyAccessStage } from '../feature-flags/early-access-feature';
import { FeatureFlag } from '../feature-flags/feature-flag';
import type { IProject } from '../organizations/project';
import { compact, validateTimestamp, validateVariants } from '../private/experiments';
import { validateLength, validateRange } from '../private/helpers';
import type { ICohort } from '../product-analytics/cohort';
import { Dashboard } from '../product-analytics/dashboard';
import { Insight } from '../product-analytics/insight';
import { InsightQuery } from '../product-analytics/insight-query';

/** The event PostHog SDKs send when a flag is evaluated (the default exposure event). */
const EXPOSURE_EVENT = '$feature_flag_called';

/**
 * One variant of a `FeatureExperiment`.
 */
export interface FeatureExperimentVariant {
  /**
   * Variant key returned by SDKs. Exactly one variant must be `control`.
   * Letters, numbers, hyphens and underscores only.
   */
  readonly key: string;

  /** Percentage (0-100) of users served this variant. All variants add up to 100. */
  readonly rolloutPercentage: number;

  /**
   * Description of the variant.
   * @default - none
   */
  readonly name?: string;
}

/**
 * Which users enter a `FeatureExperiment`.
 */
export interface FeatureExperimentTargeting {
  /**
   * Person, group or other property conditions. All must match.
   * @default - no property conditions
   */
  readonly properties?: PropertyFilter[];

  /**
   * Only members of this cohort enter the experiment.
   * @default - no cohort condition
   */
  readonly cohort?: ICohort;
}

/**
 * The early access feature of a `FeatureExperiment`.
 */
export interface FeatureExperimentEarlyAccess {
  /** Name of the feature, shown to users in the opt-in UI. */
  readonly name: string;

  /** Lifecycle stage of the early access feature. */
  readonly stage: EarlyAccessStage;

  /**
   * Description shown to users in the opt-in UI.
   * @default - none
   */
  readonly description?: string;

  /**
   * Only users who opted in to the early access feature enter the
   * experiment. The experiment flag then gets the release condition
   * `$feature_enrollment/<early access flag key> = true` (a person property
   * PostHog sets when a user opts in).
   * @default true
   */
  readonly enrolledUsersOnly?: boolean;
}

/**
 * Options for the results dashboard of a `FeatureExperiment`.
 */
export interface FeatureExperimentDashboardOptions {
  /**
   * Name of the dashboard.
   * @default - `<experiment name> results`
   */
  readonly name?: string;
}

/**
 * Properties for a FeatureExperiment.
 */
export interface FeatureExperimentProps {
  /** The project to create the experiment in. */
  readonly project: IProject;

  /** Name of the experiment. */
  readonly name: string;

  /**
   * Key of the experiment's feature flag, e.g. `new-checkout`. Letters,
   * numbers, hyphens and underscores only. Must not be the key of an
   * existing flag that is not managed by this construct.
   */
  readonly featureFlagKey: string;

  /**
   * Description of the hypothesis and expected outcome. Also used as the
   * flag description.
   * @default - none
   */
  readonly description?: string;

  /**
   * The variants. At least two, exactly one with the key `control`, with
   * rollouts adding up to 100.
   */
  readonly variants: FeatureExperimentVariant[];

  /**
   * Which users enter the experiment.
   * @default - everyone
   */
  readonly targeting?: FeatureExperimentTargeting;

  /**
   * Percentage (0-100) of the targeted users who enter the experiment.
   * @default 100
   */
  readonly rolloutPercentage?: number;

  /**
   * Primary metrics. At least one primary metric (here or in
   * `savedMetrics`) is required.
   */
  readonly metrics: ExperimentMetric[];

  /**
   * Secondary metrics.
   * @default - none
   */
  readonly secondaryMetrics?: ExperimentMetric[];

  /**
   * Shared metrics attached as primary metrics. Shared metrics created in
   * this app get a results dashboard insight; imported ones
   * (`SavedMetric.fromSavedMetricId`) don't, because their query is unknown.
   * @default - none
   */
  readonly savedMetrics?: ISavedMetric[];

  /**
   * Holdout group excluded from the experiment.
   * @default - no holdout
   */
  readonly holdout?: IHoldout;

  /**
   * ISO 8601 launch time. Setting it launches the experiment. Also the start
   * of the results dashboard's date range.
   * @default - draft (not launched)
   */
  readonly startDate?: string;

  /**
   * ISO 8601 end time. Setting it stops the experiment. Also the end of the
   * results dashboard's date range.
   * @default - not stopped
   */
  readonly endDate?: string;

  /**
   * An early access feature users can opt in to. PostHog does not allow an
   * early access feature on a multivariate or experiment flag, so it gets
   * its own boolean flag; by default only opted-in users enter the
   * experiment (see `enrolledUsersOnly`).
   * @default - no early access feature
   */
  readonly earlyAccess?: FeatureExperimentEarlyAccess;

  /**
   * Create a results dashboard with exposures per variant and one insight
   * per metric, broken down by variant. Pass options to name it.
   * @default true
   */
  readonly resultsDashboard?: boolean | FeatureExperimentDashboardOptions;
}

/**
 * An A/B test set up end to end from one definition: a multivariate feature
 * flag with the variants and targeting, the experiment linked to it, a
 * results dashboard and, optionally, an early access feature.
 *
 * The experiment is linked by key to the flag this construct creates, and
 * depends on it, so PostHog never creates a second flag. The flag stays the
 * source of truth for variants and targeting; PostHog reads the variants
 * from it.
 *
 * Each dashboard insight is derived from its metric and broken down by the
 * `$feature/<flagKey>` event property: mean metrics become a trends insight
 * of the metric's source, funnel metrics a funnel from the exposure event
 * through the metric's steps, ratio metrics a trends insight with the
 * formula `A / B`. Metrics the pattern can't map (e.g. from
 * `ExperimentMetric.fromJson()`) fall back to exposure events per variant.
 */
export class FeatureExperiment extends Construct {
  /** The multivariate feature flag. */
  public readonly featureFlag: FeatureFlag;

  /** The experiment. */
  public readonly experiment: Experiment;

  /** The results dashboard, unless `resultsDashboard` is false. */
  public readonly dashboard?: Dashboard;

  /** The insights on the results dashboard: exposures first, then one per metric. */
  public readonly insights: Insight[];

  /** The early access feature, when `earlyAccess` is set. */
  public readonly earlyAccessFeature?: EarlyAccessFeature;

  constructor(scope: Construct, id: string, props: FeatureExperimentProps) {
    super(scope, id);
    const what = `FeatureExperiment '${props.name}'`;
    validateLength(`${what} name`, props.name, 1, 400);
    validateVariants(what, props.variants);
    validateRange(`${what} rolloutPercentage`, props.rolloutPercentage, 0, 100);
    validateTimestamp(`${what} startDate`, props.startDate);
    validateTimestamp(`${what} endDate`, props.endDate);
    if (props.metrics.length + (props.savedMetrics?.length ?? 0) === 0) {
      throw new Error(`${what}: at least one primary metric (metrics or savedMetrics) is required`);
    }

    if (props.earlyAccess) {
      // PostHog rejects early access features on multivariate flags and on
      // flags linked to an experiment, so the feature gets its own flag.
      this.earlyAccessFeature = new EarlyAccessFeature(this, 'EarlyAccessFeature', {
        project: props.project,
        name: props.earlyAccess.name,
        description: props.earlyAccess.description,
        stage: props.earlyAccess.stage,
      });
    }

    const properties = [...(props.targeting?.properties ?? [])];
    if (this.earlyAccessFeature && props.earlyAccess?.enrolledUsersOnly !== false) {
      properties.push({
        key: `$feature_enrollment/${this.earlyAccessFeature.featureFlagKey}`,
        type: PropertyFilterType.PERSON,
        operator: PropertyOperator.EXACT,
        value: ['true'],
      });
    }

    this.featureFlag = new FeatureFlag(this, 'FeatureFlag', {
      project: props.project,
      key: props.featureFlagKey,
      name: props.description ?? props.name,
      variants: props.variants.map(v => ({ key: v.key, name: v.name, rolloutPercentage: v.rolloutPercentage })),
      releaseConditions: [{
        properties: properties.length ? properties : undefined,
        cohort: props.targeting?.cohort,
        rolloutPercentage: props.rolloutPercentage ?? 100,
      }],
    });

    // Linked by key (the flag's key is a plain string, so there is no
    // implicit reference). The explicit dependency makes the flag exist
    // before the experiment, so PostHog links to it instead of creating one.
    // Variants are left to the flag: PostHog projects them onto the experiment.
    this.experiment = new Experiment(this, 'Experiment', {
      project: props.project,
      name: props.name,
      description: props.description,
      featureFlag: this.featureFlag,
      metrics: props.metrics,
      secondaryMetrics: props.secondaryMetrics,
      savedMetrics: props.savedMetrics,
      holdout: props.holdout,
      startDate: props.startDate,
      endDate: props.endDate,
    });
    this.experiment.node.addDependency(this.featureFlag);

    this.insights = [];
    if (props.resultsDashboard !== false) {
      const options = typeof props.resultsDashboard === 'object' ? props.resultsDashboard : {};
      const dashboard = new Dashboard(this, 'Dashboard', {
        project: props.project,
        name: options.name ?? `${props.name} results`,
        description: `Results of the experiment '${props.name}' (feature flag '${props.featureFlagKey}'), by variant.`,
      });
      this.dashboard = dashboard;

      const ctx: QueryContext = {
        flagKey: props.featureFlagKey,
        dateRange: props.startDate !== undefined
          ? compact({ date_from: props.startDate, date_to: props.endDate })
          : undefined,
      };
      this.insights.push(dashboard.addInsight('Exposures', {
        name: `${props.name}: exposures`,
        description: 'Unique users exposed to each variant.',
        query: exposureQuery(ctx, 'dau'),
      }));
      const metrics: [string, ExperimentMetric, string?][] = [
        ...props.metrics.map((m, i) => [`Metric${i + 1}`, m] as [string, ExperimentMetric]),
        ...(props.savedMetrics ?? []).flatMap((m, i) => m instanceof SavedMetric
          ? [[`SavedMetric${i + 1}`, m.query, m.name] as [string, ExperimentMetric, string]]
          : []),
        ...(props.secondaryMetrics ?? []).map((m, i) => [`SecondaryMetric${i + 1}`, m] as [string, ExperimentMetric]),
      ];
      for (const [insightId, metric, fallbackName] of metrics) {
        const json = metric.render();
        const name = typeof json.name === 'string' && json.name !== '' ? json.name : fallbackName ?? metricName(json);
        this.insights.push(dashboard.addInsight(insightId, {
          name: `${props.name}: ${name}`,
          description: `Experiment metric (${json.metric_type ?? 'custom'}) by variant.`,
          query: metricQuery(json, ctx),
        }));
      }
    }
  }
}

interface QueryContext {
  readonly flagKey: string;
  readonly dateRange?: Record<string, unknown>;
}

/** The `$feature/<flagKey>` breakdown and the filter that drops users outside the experiment. */
function variantScope(ctx: QueryContext): Record<string, unknown> {
  const property = `$feature/${ctx.flagKey}`;
  return compact({
    breakdownFilter: { breakdown: property, breakdown_type: 'event' },
    properties: [{ key: property, operator: 'is_set', type: 'event' }],
    dateRange: ctx.dateRange,
  });
}

function viz(source: Record<string, unknown>): InsightQuery {
  return InsightQuery.fromJson({ kind: 'InsightVizNode', source });
}

/** Exposure events for the flag, per variant (`$feature_flag_response`). */
function exposureQuery(ctx: QueryContext, math: string): InsightQuery {
  return viz(compact({
    kind: 'TrendsQuery',
    series: [{
      kind: 'EventsNode',
      event: EXPOSURE_EVENT,
      name: EXPOSURE_EVENT,
      math,
      properties: [{ key: '$feature_flag', operator: 'exact', type: 'event', value: ctx.flagKey }],
    }],
    interval: 'day',
    breakdownFilter: { breakdown: '$feature_flag_response', breakdown_type: 'event' },
    dateRange: ctx.dateRange,
  }));
}

/** A metric source (EventsNode / ActionsNode) as a trends series. */
function trendsSeries(source: Record<string, any>): Record<string, unknown> {
  return compact({
    ...source,
    name: source.kind === 'EventsNode' ? source.name ?? source.event : source.name,
    math: source.math ?? 'total',
  });
}

/** A metric step as a funnel step (funnel steps carry no math). */
function funnelStep(step: Record<string, any>): Record<string, unknown> {
  const { math, math_property, math_hogql, math_group_type_index, ...rest } = step;
  return compact({ ...rest, name: rest.kind === 'EventsNode' ? rest.name ?? rest.event : rest.name });
}

function isSourceNode(node: unknown): node is Record<string, any> {
  const kind = (node as any)?.kind;
  return kind === 'EventsNode' || kind === 'ActionsNode';
}

/** Derives an insight query from rendered `ExperimentMetric` JSON. */
function metricQuery(json: Record<string, any>, ctx: QueryContext): InsightQuery {
  switch (json.metric_type) {
    case 'mean':
      if (isSourceNode(json.source)) {
        return viz({ kind: 'TrendsQuery', series: [trendsSeries(json.source)], interval: 'day', ...variantScope(ctx) });
      }
      break;
    case 'funnel':
      if (Array.isArray(json.series) && json.series.length > 0 && json.series.every(isSourceNode)) {
        const exposure = {
          kind: 'EventsNode',
          event: EXPOSURE_EVENT,
          name: EXPOSURE_EVENT,
          properties: [{ key: '$feature_flag', operator: 'exact', type: 'event', value: ctx.flagKey }],
        };
        const funnelsFilter = compact({
          funnelOrderType: json.funnel_order_type,
          funnelWindowInterval: json.conversion_window,
          funnelWindowIntervalUnit: json.conversion_window !== undefined ? json.conversion_window_unit : undefined,
        });
        return viz(compact({
          kind: 'FunnelsQuery',
          series: [exposure, ...json.series.map(funnelStep)],
          funnelsFilter: Object.keys(funnelsFilter).length ? funnelsFilter : undefined,
          ...variantScope(ctx),
        }));
      }
      break;
    case 'ratio':
      if (isSourceNode(json.numerator) && isSourceNode(json.denominator)) {
        return viz({
          kind: 'TrendsQuery',
          series: [trendsSeries(json.numerator), trendsSeries(json.denominator)],
          interval: 'day',
          trendsFilter: { formula: 'A / B' },
          ...variantScope(ctx),
        });
      }
      break;
    default:
      // e.g. quantile metrics from ExperimentMetric.fromJson() that have a source.
      if (isSourceNode(json.source)) {
        return viz({ kind: 'TrendsQuery', series: [trendsSeries(json.source)], interval: 'day', ...variantScope(ctx) });
      }
  }
  return exposureQuery(ctx, 'total');
}

/** The metric's name, or one derived from its events. */
function metricName(json: Record<string, any>): string {
  if (typeof json.name === 'string' && json.name !== '') return json.name;
  const label = (node: any): string => node?.event ?? (node?.kind === 'ActionsNode' ? 'action' : 'events');
  switch (json.metric_type) {
    case 'mean': return `${json.source?.math ?? 'total'} of ${label(json.source)}`;
    case 'funnel': return `funnel ${(json.series ?? []).map(label).join(' → ')}`;
    case 'ratio': return `${label(json.numerator)} / ${label(json.denominator)}`;
    default: return `${json.metric_type ?? 'custom'} metric`;
  }
}
