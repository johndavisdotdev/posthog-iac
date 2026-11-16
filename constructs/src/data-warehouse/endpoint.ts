import { Duration, IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnEndpoint, CfnEndpointPropsDataFreshnessSeconds } from './endpoint.generated';
import type { IProject } from '../organizations/project';
import { durationToChoice, ENDPOINT_FRESHNESS } from '../private/data-warehouse';
import { exactlyOne, jsonProp, mapOrUndefined, uniqueOrUndefined, validateLength, validatePattern } from '../private/helpers';

/**
 * A PostHog endpoint.
 */
export interface IEndpoint extends IResource {
  /**
   * The endpoint name, which identifies it and is used in its path.
   * @attribute
   */
  readonly endpointName: string;

  /** The project the endpoint belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating an endpoint in a project (`project.addEndpoint()`).
 */
export interface EndpointOptions {
  /**
   * Unique URL-safe name used in the endpoint's path
   * (`/api/projects/{project_id}/endpoints/{name}/run`). Starts with a
   * letter; letters, numbers, hyphens and underscores only. Changing it
   * replaces the endpoint.
   */
  readonly name: string;

  /**
   * HogQL query the endpoint executes, e.g. `SELECT count() FROM events`.
   * Changing it creates a new endpoint version.
   * @default - use `rawQuery`
   */
  readonly hogql?: string;

  /**
   * Any PostHog query (e.g. an insight query) as a JSON object with a
   * `kind` key. Escape hatch for queries other than HogQL.
   * @default - use `hogql`
   */
  readonly rawQuery?: { [key: string]: any };

  /**
   * Description of what the endpoint returns.
   * @default - none
   */
  readonly description?: string;

  /**
   * How fresh the data must be: 15 or 30 minutes, 1, 6, 12 or 24 hours, or
   * 7 days. Controls cache TTL and materialization frequency.
   * @default Duration.days(1)
   */
  readonly dataFreshness?: Duration;

  /**
   * Materialize query results.
   * @default false
   */
  readonly materialized?: boolean;

  /**
   * Whether the endpoint can be executed through the API.
   * @default true
   */
  readonly active?: boolean;

  /**
   * Short ID of the insight the endpoint was derived from. Create-only.
   * @default - none
   */
  readonly derivedFromInsight?: string;

  /**
   * Per-column bucket overrides for range variable materialization
   * (column name to bucket key).
   * @default - none
   */
  readonly bucketOverrides?: { [column: string]: string };

  /**
   * Tags.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * Breakdown properties that may be omitted on `/run`.
   * @default - every breakdown variable is required
   */
  readonly optionalBreakdownProperties?: string[];

  /**
   * What happens to the endpoint when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for an Endpoint.
 */
export interface EndpointProps extends EndpointOptions {
  /** The project to create the endpoint in. */
  readonly project: IProject;
}

/**
 * A PostHog endpoint: a named HogQL or insight query exposed as an API
 * route, optionally materialized.
 *
 * @resource PostHog::DataWarehouse::Endpoint
 */
export class Endpoint extends Resource implements IEndpoint {
  /**
   * Import an existing endpoint by its name.
   */
  public static fromEndpointName(scope: Construct, id: string, project: IProject, endpointName: string): IEndpoint {
    class Import extends Resource implements IEndpoint {
      public readonly endpointName = endpointName;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly endpointName: string;
  public readonly project: IProject;

  /**
   * The PostHog endpoint ID.
   * @attribute
   */
  public readonly endpointId: string;

  /**
   * API path of the endpoint.
   * @attribute
   */
  public readonly endpointPath: string;

  /**
   * Full URL of the endpoint.
   * @attribute
   */
  public readonly endpointUrl: string;

  /**
   * Current version number.
   * @attribute
   */
  public readonly endpointCurrentVersion: number;

  /**
   * Materialization status.
   * @attribute
   */
  public readonly endpointMaterializationStatus: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnEndpoint;

  constructor(scope: Construct, id: string, props: EndpointProps) {
    super(scope, id);
    validateLength('Endpoint name', props.name, 1, 128);
    validatePattern('Endpoint name', props.name, /^[A-Za-z][A-Za-z0-9_-]*$/, 'start with a letter and use only letters, numbers, hyphens and underscores');
    exactlyOne('Endpoint query', { hogql: props.hogql, rawQuery: props.rawQuery });
    validateLength('Endpoint hogql', props.hogql, 1, Number.MAX_SAFE_INTEGER);
    if (props.rawQuery && typeof props.rawQuery.kind !== 'string') {
      throw new Error("Endpoint rawQuery must have a 'kind' key");
    }
    const freshness = props.dataFreshness && durationToChoice('Endpoint dataFreshness', props.dataFreshness, ENDPOINT_FRESHNESS);

    this.project = props.project;
    const query = props.rawQuery ?? { kind: 'HogQLQuery', query: props.hogql };

    this.resource = new CfnEndpoint(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      query: jsonProp(this, query)!,
      description: props.description,
      dataFreshnessSeconds: freshness as CfnEndpointPropsDataFreshnessSeconds | undefined,
      isActive: props.active,
      isMaterialized: props.materialized,
      derivedFromInsight: props.derivedFromInsight,
      bucketOverrides: mapOrUndefined(props.bucketOverrides),
      tags: uniqueOrUndefined(props.tags),
      optionalBreakdownProperties: uniqueOrUndefined(props.optionalBreakdownProperties),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.endpointName = props.name;
    this.endpointId = this.resource.attrId;
    this.endpointPath = this.resource.attrEndpointPath;
    this.endpointUrl = this.resource.attrUrl;
    this.endpointCurrentVersion = this.resource.attrCurrentVersion;
    this.endpointMaterializationStatus = this.resource.attrMaterializationStatus;
  }
}
