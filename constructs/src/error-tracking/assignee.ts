import { Tokenization } from 'aws-cdk-lib';
import type { IRole } from '../organizations/role';

/**
 * What kind of assignee an error tracking issue gets.
 */
export enum AssigneeType {
  /** A PostHog user. */
  USER = 'user',
  /** A PostHog organization role. */
  ROLE = 'role',
}

/**
 * The user or role that error tracking rules assign issues to.
 */
export class Assignee {
  /**
   * Assign to a PostHog user, by numeric user ID.
   */
  public static user(userId: number): Assignee {
    return new Assignee(AssigneeType.USER, Tokenization.stringifyNumber(userId));
  }

  /**
   * Assign to a PostHog organization role.
   */
  public static role(role: IRole): Assignee {
    return new Assignee(AssigneeType.ROLE, role.roleId);
  }

  private constructor(
    /** User or role. */
    public readonly type: AssigneeType,
    /** The user ID or role UUID, as a string. */
    public readonly id: string,
  ) {}
}
