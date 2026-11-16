// Internal rendering helpers for projects.ApprovalPolicy.
import { Duration, Token, Tokenization } from 'aws-cdk-lib';
import { validateRange } from './helpers';
import type { ApprovalConditions, ApproverConfig, OrganizationMembershipLevel } from '../projects/approval-policy';

/** PostHog's numeric OrganizationMembership levels. */
const MEMBERSHIP_LEVELS: Record<string, number> = {
  member: 1,
  admin: 8,
  owner: 15,
};

/** Renders the typed approver config to PostHog's `approver_config` object. */
export function renderApproverConfig(config: ApproverConfig): { [key: string]: any } {
  const users = config.users ?? [];
  const roles = config.roles ?? [];
  if (users.length === 0 && roles.length === 0) {
    throw new Error('ApprovalPolicy approverConfig must name at least one user or role');
  }
  const quorum = config.minimumApprovals ?? 1;
  validateRange('ApprovalPolicy approverConfig.minimumApprovals', quorum, 1, Number.MAX_SAFE_INTEGER);
  if (roles.length === 0 && !Token.isUnresolved(quorum) && users.every(u => !Token.isUnresolved(u))) {
    const distinct = new Set(users).size;
    if (quorum > distinct) {
      throw new Error(`ApprovalPolicy approverConfig.minimumApprovals (${quorum}) exceeds the number of approvers (${distinct})`);
    }
  }
  return {
    users: [...new Set(users)],
    roles: [...new Set(roles.map(r => r.roleId))],
    quorum,
  };
}

/** Renders typed conditions to PostHog's `conditions` object; undefined when empty. */
export function renderConditions(conditions: ApprovalConditions | undefined): { [key: string]: any } | undefined {
  if (!conditions) return undefined;
  const out: { [key: string]: any } = {};
  if (conditions.featureFlags && conditions.featureFlags.length > 0) {
    out.flag_keys = [...new Set(conditions.featureFlags.map(f => f.flagKey))];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Renders membership levels to PostHog's numeric levels; undefined when empty. */
export function renderMembershipLevels(levels: OrganizationMembershipLevel[] | undefined): number[] | undefined {
  if (!levels || levels.length === 0) return undefined;
  return [...new Set(levels.map(l => MEMBERSHIP_LEVELS[l as string]))];
}

/**
 * Renders a Duration as a Django duration string, which is what PostHog
 * returns: `D HH:MM:SS` (e.g. `7 00:00:00`), or `HH:MM:SS` under a day.
 * A token duration is rendered as plain seconds, which Django also accepts.
 */
export function renderExpiresAfter(duration: Duration | undefined): string | undefined {
  if (duration === undefined) return undefined;
  const seconds = duration.toSeconds();
  if (Token.isUnresolved(seconds)) {
    return Tokenization.stringifyNumber(seconds);
  }
  if (seconds <= 0) {
    throw new Error(`ApprovalPolicy expiresAfter must be positive, got ${seconds} seconds`);
  }
  const days = Math.floor(seconds / 86400);
  let rest = seconds % 86400;
  const hours = Math.floor(rest / 3600);
  rest %= 3600;
  const minutes = Math.floor(rest / 60);
  const secs = rest % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const time = `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  return days > 0 ? `${days} ${time}` : time;
}
