import { IResource, RemovalPolicy, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnDataColorTheme } from './data-color-theme.generated';
import type { IProject } from '../organizations/project';
import { validateHexColor } from '../private/definitions';
import { validateLength } from '../private/helpers';

/**
 * A PostHog data color theme.
 */
export interface IDataColorTheme extends IResource {
  /**
   * The PostHog data color theme ID.
   * @attribute
   */
  readonly dataColorThemeId: string;

  /** The project the theme belongs to. */
  readonly project: IProject;
}

/**
 * Options for creating a data color theme in a project
 * (`project.addDataColorTheme()`).
 */
export interface DataColorThemeOptions {
  /** Name of the theme. At most 100 characters. */
  readonly name: string;

  /**
   * Series colors in order, as CSS hex colors (`#1d4aff`, `#fff`).
   * @default - an empty palette
   */
  readonly colors?: string[];

  /**
   * What happens to the PostHog theme when it is removed from the stack.
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * Properties for a DataColorTheme.
 */
export interface DataColorThemeProps extends DataColorThemeOptions {
  /** The project to create the theme in. */
  readonly project: IProject;
}

/**
 * A PostHog data color theme: a named, ordered palette of series colors for
 * insights and dashboards. Creating or changing themes may require project
 * admin access.
 *
 * @resource PostHog::ProductAnalytics::DataColorTheme
 */
export class DataColorTheme extends Resource implements IDataColorTheme {
  /**
   * Import an existing data color theme by its PostHog ID.
   */
  public static fromDataColorThemeId(scope: Construct, id: string, project: IProject, dataColorThemeId: string): IDataColorTheme {
    class Import extends Resource implements IDataColorTheme {
      public readonly dataColorThemeId = dataColorThemeId;
      public readonly project = project;
    }
    return new Import(scope, id);
  }

  public readonly dataColorThemeId: string;
  public readonly project: IProject;

  /**
   * ISO 8601 creation timestamp.
   * @attribute
   */
  public readonly dataColorThemeCreatedAt: string;

  /** The underlying L1 resource. */
  public readonly resource: CfnDataColorTheme;

  constructor(scope: Construct, id: string, props: DataColorThemeProps) {
    super(scope, id);
    validateLength('DataColorTheme name', props.name, 1, 100);
    props.colors?.forEach((color, i) => validateHexColor(`DataColorTheme colors[${i}]`, color));

    this.project = props.project;

    this.resource = new CfnDataColorTheme(this, 'Resource', {
      projectId: props.project.projectId,
      name: props.name,
      colors: props.colors && props.colors.length > 0 ? props.colors : undefined,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.dataColorThemeId = this.resource.attrId;
    this.dataColorThemeCreatedAt = this.resource.attrCreatedAt;
  }
}
