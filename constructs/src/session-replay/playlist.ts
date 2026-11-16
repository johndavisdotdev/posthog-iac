import { Duration, IResource, RemovalPolicy, Resource, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnPlaylist, CfnPlaylistPropsType } from './playlist.generated';
import { FilterLogic, PropertyFilter } from '../core/filters';
import type { IProject } from '../organizations/project';
import { renderPropertyGroup } from '../private/filters';
import { jsonProp, validateLength } from '../private/helpers';
import { compact, renderTimestamp } from '../private/surveys';

/**
 * The kind of a session replay playlist.
 */
export enum PlaylistType {
  /** A saved filter view: recordings matching `filters`. */
  FILTERS = 'filters',
  /** A manually curated collection of recordings. */
  COLLECTION = 'collection',
}

/**
 * Which duration a recording duration filter measures.
 */
export enum RecordingDurationType {
  /** Total recording length. */
  TOTAL = 'duration',
  /** Time the user was active. */
  ACTIVE = 'active_seconds',
  /** Time the user was inactive. */
  INACTIVE = 'inactive_seconds',
}

/**
 * How a recording duration filter compares.
 */
export enum RecordingDurationOperator {
  /** Longer than. */
  GREATER_THAN = 'gt',
  /** Shorter than. */
  LESS_THAN = 'lt',
}

/**
 * Filter recordings by length.
 */
export interface RecordingDurationFilter {
  /** The threshold (whole seconds). */
  readonly value: Duration;

  /**
   * How the recording is compared with `value`.
   * @default RecordingDurationOperator.GREATER_THAN
   */
  readonly operator?: RecordingDurationOperator;

  /**
   * Which duration is measured.
   * @default RecordingDurationType.TOTAL
   */
  readonly durationType?: RecordingDurationType;
}

/**
 * The time window of recordings.
 */
export interface RecordingDateRange {
  /**
   * Start: a relative date such as `-7d`, `-24h` or `-3m`, an ISO 8601
   * timestamp, or a Date.
   * @default "-3d" (PostHog default)
   */
  readonly from?: Date | string;

  /**
   * End: a relative date, an ISO 8601 timestamp, or a Date.
   * @default - now
   */
  readonly to?: Date | string;
}

/**
 * Which recordings a `filters` playlist matches.
 */
export interface RecordingFilters {
  /**
   * Event, person, session or cohort property conditions.
   * @default - none
   */
  readonly properties?: PropertyFilter[];

  /**
   * How `properties` combine.
   * @default FilterLogic.AND
   */
  readonly logic?: FilterLogic;

  /**
   * Recording length filter.
   * @default - any length
   */
  readonly duration?: RecordingDurationFilter;

  /**
   * Time window.
   * @default - PostHog default (last 3 days)
   */
  readonly dateRange?: RecordingDateRange;

  /**
   * Exclude internal and test users.
   * @default false
   */
  readonly filterTestAccounts?: boolean;

  /**
   * Extra filter fields merged into the rendered object, for criteria this
   * construct does not model (events, actions, order, ...).
   * @default - none
   */
  readonly rawFilters?: { [key: string]: any };
}

/**
 * A PostHog session replay playlist.
 */
export interface IPlaylist extends IResource {
  /**
   * The playlist short ID, which PostHog uses to address playlists.
   * @attribute
   */
  readonly playlistShortId: string;

  /** The project the playlist belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a playlist in a project (`project.addPlaylist()`).
 */
export interface PlaylistOptions {
  /**
   * Name of the playlist.
   * @default - PostHog shows a derived name
   */
  readonly name?: string;

  /**
   * Description of the playlist.
   * @default - none
   */
  readonly description?: string;

  /**
   * Pin the playlist to the top of the list.
   * @default false
   */
  readonly pinned?: boolean;

  /**
   * The kind of playlist. Cannot be changed after creation.
   * @default - PlaylistType.FILTERS when `filters` is set, otherwise PlaylistType.COLLECTION
   */
  readonly type?: PlaylistType;

  /**
   * Which recordings the playlist matches. Only for `PlaylistType.FILTERS`.
   * @default - no filters
   */
  readonly filters?: RecordingFilters;

  /**
   * What happens to the PostHog playlist when it is removed from the stack.
   * PostHog soft-deletes playlists.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a Playlist.
 */
export interface PlaylistProps extends PlaylistOptions {
  /** The project to create the playlist in. */
  readonly project: IProject;
}

/**
 * A PostHog session replay playlist: a saved filter view of recordings, or a
 * manually curated collection. Which recordings are in a collection is not
 * managed.
 *
 * @resource PostHog::SessionReplay::Playlist
 */
export class Playlist extends Resource implements IPlaylist {
  /**
   * Import an existing playlist by its short ID.
   */
  public static fromPlaylistShortId(scope: Construct, id: string, project: IProject, playlistShortId: string): IPlaylist {
    class Import extends Resource implements IPlaylist {
      public readonly playlistShortId = playlistShortId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly playlistShortId: string;
  public readonly project: IProject;

  /**
   * The numeric PostHog playlist ID.
   * @attribute
   */
  public readonly playlistId: string;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly playlistCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnPlaylist;

  constructor(scope: Construct, id: string, props: PlaylistProps) {
    super(scope, id);
    validateLength('Playlist name', props.name, 0, 400);
    const type = props.type ?? (props.filters ? PlaylistType.FILTERS : PlaylistType.COLLECTION);
    if (props.filters && type !== PlaylistType.FILTERS) {
      throw new Error('Playlist filters can only be set on PlaylistType.FILTERS playlists');
    }

    this.project = props.project;
    this.resource = new CfnPlaylist(this, 'Resource', {
      projectId: props.project.projectId,
      type: type as string as CfnPlaylistPropsType,
      name: props.name,
      description: props.description,
      pinned: props.pinned,
      filters: jsonProp(this, renderRecordingFilters(props.filters)),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.playlistShortId = this.resource.attrShortId;
    this.playlistId = this.resource.attrId;
    this.playlistCreatedAt = this.resource.attrCreatedAt;
  }
}

const RELATIVE_DATE = /^(-\d+[hdwmyHDWMQ]|all|[dwmqy]Start)$/;

function renderDate(what: string, value: Date | string | undefined): string | undefined {
  if (typeof value === 'string' && (Token.isUnresolved(value) || RELATIVE_DATE.test(value))) return value;
  try {
    return renderTimestamp(what, value);
  } catch {
    throw new Error(`${what} '${String(value)}' is invalid: use a relative date such as -7d, or an ISO 8601 timestamp`);
  }
}

function renderRecordingFilters(f: RecordingFilters | undefined): Record<string, unknown> | undefined {
  if (!f) return undefined;
  let duration: unknown;
  if (f.duration) {
    const seconds = f.duration.value.toSeconds();
    if (!Token.isUnresolved(seconds) && seconds < 0) throw new Error('Playlist duration filter must not be negative');
    duration = [{
      key: f.duration.durationType ?? RecordingDurationType.TOTAL,
      type: 'recording',
      value: seconds,
      operator: f.duration.operator ?? RecordingDurationOperator.GREATER_THAN,
    }];
  }
  const filterGroup = f.properties && f.properties.length
    ? renderPropertyGroup({ logic: f.logic ?? FilterLogic.AND, groups: [{ logic: f.logic ?? FilterLogic.AND, filters: f.properties }] })
    : undefined;
  return compact({
    date_from: renderDate('Playlist dateRange.from', f.dateRange?.from),
    date_to: renderDate('Playlist dateRange.to', f.dateRange?.to),
    duration,
    filter_group: filterGroup,
    filter_test_accounts: f.filterTestAccounts,
    ...f.rawFilters,
  }) ?? {};
}
