'use strict';

/**
 * Enterprise workspace seat policy (DISC-034 / DISC-050).
 *
 * Pure policy, no I/O: the counting and the atomic enforcement live in
 * `enterprise/mysqlTenantRegistry.js`, inside the same transaction that writes
 * the membership. Keeping the arithmetic here means the API response and the
 * write-time guard can never disagree about what "a seat" is.
 *
 * DEFINITIONS (documented because they are product decisions):
 *
 *   seatLimit      The commercial cap from the tenant's subscription
 *                  (`enterprise_tenant_configurations.commercials.seatLimit`,
 *                  managed by the platform operator). When more than one cap
 *                  applies — for example a future per-workspace cap — the MOST
 *                  RESTRICTIVE positive cap wins. `null` means "no cap
 *                  configured", never "zero seats".
 *
 *   activeMembers  Memberships in state ACTIVE. OWNERS COUNT: an owner holds an
 *                  assigned membership exactly like any other member, so the
 *                  owner consumes one seat. (This is the existing product
 *                  policy: `enterprise_memberships` has no owner-exempt concept.)
 *
 *   pendingInvites INVITED memberships whose invitation is still PENDING and not
 *                  expired. A PENDING invitation RESERVES a seat, otherwise N
 *                  concurrent invitations could all pass a count that ignored
 *                  them and oversubscribe the workspace.
 *
 *   seatsUsed      activeMembers + pendingInvites (no double counting: an ACTIVE
 *                  membership whose invitation was accepted is counted once, by
 *                  the ACTIVE branch only).
 *
 *   seatsRemaining max(0, seatLimit - seatsUsed)
 */

const SEAT_ROLES = Object.freeze(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

/** Seat role -> the tenant role the existing RBAC layer already understands. */
const SEAT_ROLE_TO_TENANT_ROLE = Object.freeze({
  OWNER: 'ENTERPRISE_OWNER',
  ADMIN: 'ENTERPRISE_ADMIN',
  MEMBER: 'ENTERPRISE_MEMBER',
  VIEWER: 'ENTERPRISE_VIEWER',
});

/** Accept both the API vocabulary and stored tenant roles. */
const ROLE_ALIASES = Object.freeze({
  OWNER: 'OWNER',
  TENANT_OWNER: 'OWNER',
  ENTERPRISE_OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  TENANT_ADMIN: 'ADMIN',
  ENTERPRISE_ADMIN: 'ADMIN',
  WORKSPACE_MANAGER: 'ADMIN',
  MEMBER: 'MEMBER',
  ENTERPRISE_MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
  ENTERPRISE_VIEWER: 'VIEWER',
  BILLING_ADMIN: 'VIEWER',
});

/**
 * Which roles an assigner may grant. A tenant owner may grant anything
 * (including ownership); an administrator may not mint owners; members and
 * viewers may grant nothing. The registry/service layers enforce this again.
 */
const ASSIGNABLE_BY_SEAT_ROLE = Object.freeze({
  OWNER: Object.freeze(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
  ADMIN: Object.freeze(['ADMIN', 'MEMBER', 'VIEWER']),
  MEMBER: Object.freeze([]),
  VIEWER: Object.freeze([]),
});

function seatError(code, message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { code, status }, extra);
}

function normalizeSeatRole(value) {
  const role = ROLE_ALIASES[String(value == null ? '' : value).trim().toUpperCase()];
  if (!role) {
    throw seatError('INVALID_ROLE', `role must be one of ${SEAT_ROLES.join(', ')}.`);
  }
  return role;
}

function tenantRoleForSeatRole(value) {
  const role = normalizeSeatRole(value);
  return SEAT_ROLE_TO_TENANT_ROLE[role];
}

function seatRolesFor(assignerRoles = []) {
  const normalized = new Set();
  for (const role of assignerRoles || []) {
    const seatRole = ROLE_ALIASES[String(role || '').trim().toUpperCase()];
    if (seatRole) normalized.add(seatRole);
  }
  return normalized;
}

function canAssignRole({ assignerRoles = [], targetSeatRole } = {}) {
  const target = normalizeSeatRole(targetSeatRole);
  const roles = seatRolesFor(assignerRoles);
  return [...roles].some(role => ASSIGNABLE_BY_SEAT_ROLE[role]?.includes(target));
}

/**
 * Resolve the effective cap from every applicable commercial source.
 * @returns {number|null} the most restrictive positive cap, or null when none
 */
function resolveSeatLimit({ tenantSeatLimit = null, subscriptionSeatLimit = null } = {}) {
  const candidates = [tenantSeatLimit, subscriptionSeatLimit]
    .map(value => (value === null || value === undefined || value === '' ? null : Number(value)))
    .filter(value => value !== null)
    .filter(value => Number.isInteger(value) && value > 0);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

/**
 * Compute seat usage. `seatsUsed` includes pending invitations by design; see
 * the module header.
 */
function computeSeatUsage({
  seatLimit = null,
  activeMembers = 0,
  pendingInvites = 0,
  owners = 0,
} = {}) {
  const active = Math.max(0, Number(activeMembers) || 0);
  const pending = Math.max(0, Number(pendingInvites) || 0);
  const limit = seatLimit === null || seatLimit === undefined ? null : Number(seatLimit);
  const seatsUsed = active + pending;
  return {
    seatLimit: Number.isInteger(limit) && limit > 0 ? limit : null,
    activeMembers: active,
    pendingInvites: pending,
    ownersIncluded: Math.max(0, Number(owners) || 0),
    seatsUsed,
    seatsRemaining: Number.isInteger(limit) && limit > 0 ? Math.max(0, limit - seatsUsed) : null,
    limitReached: Number.isInteger(limit) && limit > 0 ? seatsUsed >= limit : false,
  };
}

/** The exact 409 body the invitation endpoint must return. */
function seatLimitReachedError(usage = {}) {
  return seatError(
    'SEAT_LIMIT_REACHED',
    'Workspace seat limit reached. Please upgrade your enterprise tier.',
    409,
    {
      quotaCode: 'QUOTA_EXCEEDED',
      seatLimit: usage.seatLimit ?? null,
      seatsUsed: usage.seatsUsed ?? null,
      seatsRemaining: 0,
    }
  );
}

/** Would occupying this seat exceed the cap? */
function assertSeatCapacity({ usage, requiresNewSeat = true } = {}) {
  if (!requiresNewSeat) return usage;
  const limit = usage?.seatLimit;
  if (!Number.isInteger(limit) || limit <= 0) return usage;
  if (Number(usage.seatsUsed || 0) + 1 > limit) throw seatLimitReachedError(usage);
  return usage;
}

module.exports = {
  ASSIGNABLE_BY_SEAT_ROLE,
  ROLE_ALIASES,
  SEAT_ROLES,
  SEAT_ROLE_TO_TENANT_ROLE,
  assertSeatCapacity,
  canAssignRole,
  computeSeatUsage,
  normalizeSeatRole,
  resolveSeatLimit,
  seatError,
  seatLimitReachedError,
  seatRolesFor,
  tenantRoleForSeatRole,
};
