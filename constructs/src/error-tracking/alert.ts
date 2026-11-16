import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnAlert, CfnAlertDestinationChannelType, CfnAlertPropsTriggers } from './alert.generated';
import { ErrorFilter } from './error-filter';
import type { IProject } from '../organizations/project';
import { renderAlertProperties } from '../private/error-tracking';
import { jsonProp, validateLength, validateRange } from '../private/helpers';

/** Longest throttle PostHog accepts: 30 days. */
const MAX_THROTTLE_SECONDS = 2_592_000;

/**
 * Issue lifecycle events that open a notification thread.
 */
export enum AlertTrigger {
  /** A new issue is created. */
  ISSUE_CREATED = 'issue_created',
  /** A resolved issue occurs again. */
  ISSUE_REOPENED = 'issue_reopened',
  /** An issue's occurrence rate spikes. */
  ISSUE_SPIKING = 'issue_spiking',
  /** An issue is assigned. */
  ISSUE_ASSIGNED = 'issue_assigned',
}

/**
 * A Slack channel that error tracking alert notifications are posted to.
 */
export interface SlackDestination {
  /** ID of the PostHog Slack integration that delivers the notifications. */
  readonly integrationId: number;

  /** Slack channel ID, e.g. `C0123ABCD`. */
  readonly channel: string;

  /**
   * Human-readable channel name, e.g. `#errors`. Stored for display only.
   * @default - none
   */
  readonly channelName?: string;
}

/**
 * A PostHog error tracking alert.
 */
export interface IAlert extends IResource {
  /**
   * The PostHog alert ID (a UUID).
   * @attribute
   */
  readonly alertId: string;

  /** The project the alert belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an error tracking alert in a project.
 */
export interface AlertOptions {
  /** Name of the alert. */
  readonly name: string;

  /** Issue lifecycle events that open a notification thread. */
  readonly triggers: AlertTrigger[];

  /** Slack channels the notifications are posted to. */
  readonly destinations: SlackDestination[];

  /**
   * Which issues the alert notifies about. Alerts use PostHog's hog function
   * filter shape, which ANDs its conditions, so `ErrorFilter.any()` with
   * more than one condition is not supported here.
   * @default - every issue
   */
  readonly filters?: ErrorFilter;

  /**
   * Exclude internal and test accounts.
   * @default false
   */
  readonly filterTestAccounts?: boolean;

  /**
   * Minimum time between notifications for the same issue, in whole seconds,
   * at most 30 days.
   * @default - no throttle
   */
  readonly throttle?: Duration;

  /**
   * Whether the alert sends notifications.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * What happens to the PostHog alert when it is removed from the stack.
   * PostHog hard-deletes alerts.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an error tracking Alert.
 */
export interface AlertProps extends AlertOptions {
  /** The project to create the alert in. */
  readonly project: IProject;
}

/**
 * A PostHog error tracking alert: posts to Slack when an issue is created,
 * reopened, starts spiking or is assigned.
 *
 * @resource PostHog::ErrorTracking::Alert
 */
export class Alert extends Resource implements IAlert {
  /**
   * Import an existing error tracking alert by its PostHog ID.
   */
  public static fromAlertId(scope: Construct, id: string, project: IProject, alertId: string): IAlert {
    class Import extends Resource implements IAlert {
      public readonly alertId = alertId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly alertId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly alertCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnAlert;

  constructor(scope: Construct, id: string, props: AlertProps) {
    super(scope, id);
    validateLength('Alert name', props.name, 1, 400);
    if (props.triggers.length === 0) {
      throw new Error('Alert needs at least one trigger');
    }
    if (props.destinations.length === 0) {
      throw new Error('Alert needs at least one destination');
    }
    props.destinations.forEach((d, i) => validateLength(`Alert destination ${i} channel`, d.channel, 1, Number.MAX_SAFE_INTEGER));
    const throttleSeconds = props.throttle?.toSeconds();
    validateRange('Alert throttle (seconds)', throttleSeconds, 0, MAX_THROTTLE_SECONDS);

    this.project = props.project;

    this.resource = new CfnAlert(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      enabled: props.enabled,
      triggers: [...new Set(props.triggers)].map(t => t as string as CfnAlertPropsTriggers),
      destinations: props.destinations.map(d => ({
        channelType: CfnAlertDestinationChannelType.SLACK,
        integrationId: d.integrationId,
        config: { channel: d.channel, channelName: d.channelName },
      })),
      filters: jsonProp(this, this.renderFilters(props)),
      throttleSeconds,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.alertId = this.resource.attrId;
    this.alertCreatedAt = this.resource.attrCreatedAt;
  }

  private renderFilters(props: AlertProps): Record<string, unknown> | undefined {
    const properties = props.filters ? renderAlertProperties(props.filters) : [];
    if (properties.length === 0 && props.filterTestAccounts === undefined) return undefined;
    const out: Record<string, unknown> = {};
    if (properties.length > 0) out.properties = properties;
    if (props.filterTestAccounts !== undefined) out.filter_test_accounts = props.filterTestAccounts;
    return out;
  }
}
