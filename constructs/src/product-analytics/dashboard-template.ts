import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DashboardFilters, GroupDisplay, LayoutCompaction, TileSpacing } from './dashboard';
import {
  CfnDashboardTemplate,
  CfnDashboardTemplateCustomizationGroupDisplay,
  CfnDashboardTemplateCustomizationLayoutCompaction,
  CfnDashboardTemplateCustomizationTileSpacing,
  CfnDashboardTemplatePropsScope,
} from './dashboard-template.generated';
import { InsightQuery } from './insight-query';
import type { IProject } from '../organizations/project';
import { isConcreteNumber, jsonProp, uniqueOrUndefined, validateLength, validatePattern, validateRange } from '../private/helpers';
import { renderDashboardFilters } from '../private/insights';

/**
 * Who can use a dashboard template.
 */
export enum DashboardTemplateScope {
  /** Only this project. */
  PROJECT = 'team',
  /** Every project in the organization. */
  ORGANIZATION = 'organization',
}

/**
 * Position and size of a tile on the dashboard grid (12 columns wide).
 */
export interface TileLayout {
  /** Column of the tile's left edge (0-11). */
  readonly x: number;
  /** Row of the tile's top edge. */
  readonly y: number;
  /** Width in columns (1-12). */
  readonly w: number;
  /** Height in rows. */
  readonly h: number;
}

/**
 * Options for an insight tile of a dashboard template.
 */
export interface TemplateInsightTileOptions {
  /**
   * Description of the insight.
   * @default - none
   */
  readonly description?: string;

  /**
   * Position and size of the tile.
   * @default - PostHog places the tile
   */
  readonly layout?: TileLayout;

  /**
   * Tile color.
   * @default - none
   */
  readonly color?: string;
}

/**
 * Options for a text tile of a dashboard template.
 */
export interface TemplateTextTileOptions {
  /**
   * Position and size of the tile.
   * @default - PostHog places the tile
   */
  readonly layout?: TileLayout;
}

/**
 * A tile of a dashboard template.
 */
export class TemplateTile {
  /**
   * An insight tile. Queries can use the template's variables, e.g.
   * `InsightSeries.event('{VARIABLE_1}')`.
   */
  public static insight(name: string, query: InsightQuery, options: TemplateInsightTileOptions = {}): TemplateTile {
    validateLength('Template tile name', name, 1, 400);
    const tile: Record<string, unknown> = { type: 'INSIGHT', name, query: query.toJson() };
    if (options.description !== undefined) tile.description = options.description;
    tile.layouts = renderLayouts(options.layout);
    tile.color = options.color ?? null;
    return new TemplateTile(tile);
  }

  /**
   * A text (markdown) tile.
   */
  public static text(body: string, options: TemplateTextTileOptions = {}): TemplateTile {
    return new TemplateTile({ type: 'TEXT', body, layouts: renderLayouts(options.layout) });
  }

  private constructor(private readonly tile: Record<string, unknown>) {}

  /** @internal */
  public _render(): Record<string, unknown> {
    return this.tile;
  }
}

/**
 * A dashboard template variable: an event the user picks when creating a
 * dashboard from the template. Tiles reference it as `{<id>}`.
 */
export interface TemplateVariable {
  /** Identifier referenced from tiles as `{<id>}`, e.g. `VARIABLE_1`. */
  readonly id: string;

  /** Name shown when the template is used. */
  readonly name: string;

  /**
   * Explanation shown when the template is used.
   * @default - none
   */
  readonly description?: string;

  /**
   * Event used unless the user picks another.
   * @default - none
   */
  readonly defaultEvent?: string;

  /**
   * Whether the user must pick a value.
   * @default true
   */
  readonly required?: boolean;
}

/**
 * A PostHog dashboard template.
 */
export interface IDashboardTemplate extends IResource {
  /**
   * The PostHog dashboard template ID (UUID).
   * @attribute
   */
  readonly dashboardTemplateId: string;
}

/**
 * Options for creating a dashboard template in a project.
 */
export interface DashboardTemplateOptions {
  /** Name of the template. */
  readonly templateName: string;

  /**
   * Description given to dashboards created from the template.
   * @default - none
   */
  readonly dashboardDescription?: string;

  /**
   * The template's tiles.
   * @default - none
   */
  readonly tiles?: TemplateTile[];

  /**
   * The template's variables.
   * @default - none
   */
  readonly variables?: TemplateVariable[];

  /**
   * Dashboard-level filters of dashboards created from the template.
   * @default - none
   */
  readonly dashboardFilters?: DashboardFilters;

  /**
   * Who can use the template.
   * @default DashboardTemplateScope.PROJECT
   */
  readonly scope?: DashboardTemplateScope;

  /**
   * Tags on the template.
   * @default - none
   */
  readonly tags?: string[];

  /**
   * URL of a preview image.
   * @default - none
   */
  readonly imageUrl?: string;

  /**
   * Tile density of dashboards created from the template.
   * @default - PostHog default
   */
  readonly tileSpacing?: TileSpacing;

  /**
   * How tiles rearrange after a move or resize.
   * @default - PostHog default
   */
  readonly layoutCompaction?: LayoutCompaction;

  /**
   * How tile groups show.
   * @default - PostHog default
   */
  readonly groupDisplay?: GroupDisplay;

  /**
   * What happens to the PostHog template when it is removed from the stack.
   * PostHog soft-deletes templates.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a DashboardTemplate.
 */
export interface DashboardTemplateProps extends DashboardTemplateOptions {
  /** The project to create the template in. */
  readonly project: IProject;
}

/**
 * A PostHog dashboard template: a reusable dashboard definition.
 *
 * @resource PostHog::ProductAnalytics::DashboardTemplate
 */
export class DashboardTemplate extends Resource implements IDashboardTemplate {
  /**
   * Import an existing dashboard template by its PostHog ID.
   */
  public static fromDashboardTemplateId(scope: Construct, id: string, dashboardTemplateId: string): IDashboardTemplate {
    class Import extends Resource implements IDashboardTemplate {
      public readonly dashboardTemplateId = dashboardTemplateId;
    }
    return new Import(scope, id);
  }

  public readonly dashboardTemplateId: string;

  /** The project the template belongs to. */
  public readonly project: IProject;

  /** The underlying L1 resource. */
  public readonly resource: CfnDashboardTemplate;

  constructor(scope: Construct, id: string, props: DashboardTemplateProps) {
    super(scope, id);
    validateLength('DashboardTemplate templateName', props.templateName, 1, 400);
    validateLength('DashboardTemplate dashboardDescription', props.dashboardDescription, 0, 400);
    validateLength('DashboardTemplate imageUrl', props.imageUrl, 0, 8201);
    for (const tag of props.tags ?? []) validateLength('DashboardTemplate tag', tag, 1, 255);
    const ids = new Set<string>();
    for (const v of props.variables ?? []) {
      validatePattern('Template variable id', v.id, /^[A-Za-z0-9_]+$/, 'use letters, digits and underscores, e.g. VARIABLE_1');
      if (ids.has(v.id)) throw new Error(`Template variable id '${v.id}' is used more than once`);
      ids.add(v.id);
    }

    this.project = props.project;
    const customization = props.tileSpacing || props.layoutCompaction || props.groupDisplay ? {
      tileSpacing: props.tileSpacing as string as CfnDashboardTemplateCustomizationTileSpacing | undefined,
      layoutCompaction: props.layoutCompaction as string as CfnDashboardTemplateCustomizationLayoutCompaction | undefined,
      groupDisplay: props.groupDisplay as string as CfnDashboardTemplateCustomizationGroupDisplay | undefined,
    } : undefined;

    this.resource = new CfnDashboardTemplate(this, 'Resource', {
      projectId: props.project.projectId,
      templateName: props.templateName,
      dashboardDescription: props.dashboardDescription,
      dashboardFilters: jsonProp(this, renderDashboardFilters(props.dashboardFilters, undefined)),
      tiles: props.tiles?.length ? jsonProp(this, props.tiles.map(t => t._render())) : undefined,
      variables: props.variables?.length ? jsonProp(this, props.variables.map(renderVariable)) : undefined,
      tags: uniqueOrUndefined(props.tags),
      imageUrl: props.imageUrl,
      scope: props.scope as string as CfnDashboardTemplatePropsScope | undefined,
      customization,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.dashboardTemplateId = this.resource.attrId;
  }
}

function renderLayouts(layout: TileLayout | undefined): Record<string, unknown> {
  if (!layout) return {};
  validateRange('Tile layout x', layout.x, 0, 11);
  validateRange('Tile layout w', layout.w, 1, 12);
  validateRange('Tile layout y', layout.y, 0, Number.MAX_SAFE_INTEGER);
  validateRange('Tile layout h', layout.h, 1, Number.MAX_SAFE_INTEGER);
  if (isConcreteNumber(layout.x) && isConcreteNumber(layout.w) && layout.x + layout.w > 12) throw new Error(`Tile layout: x + w must not exceed 12, got ${layout.x + layout.w}`);
  return { sm: { x: layout.x, y: layout.y, w: layout.w, h: layout.h } };
}

function renderVariable(v: TemplateVariable): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: v.id,
    name: v.name,
    type: 'event',
    default: v.defaultEvent !== undefined ? { id: v.defaultEvent } : {},
    required: v.required ?? true,
  };
  if (v.description !== undefined) out.description = v.description;
  return out;
}
