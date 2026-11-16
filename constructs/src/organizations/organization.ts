import { IResource, Resource } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * A PostHog organization.
 */
export interface IOrganization extends IResource {
  /**
   * The PostHog organization ID (a UUID).
   * @attribute
   */
  readonly organizationId: string;
}

/**
 * A reference to an existing PostHog organization.
 *
 * Organizations themselves are not managed by CloudFormation (there is no
 * `PostHog::Organizations::Organization` resource type); create them in
 * PostHog and import them here to scope projects, roles and domains.
 */
export class Organization extends Resource implements IOrganization {
  /**
   * Import an existing organization by its PostHog ID.
   */
  public static fromOrganizationId(scope: Construct, id: string, organizationId: string): IOrganization {
    return new Organization(scope, id, organizationId);
  }

  public readonly organizationId: string;

  private constructor(scope: Construct, id: string, organizationId: string) {
    super(scope, id);
    this.organizationId = organizationId;
  }
}
