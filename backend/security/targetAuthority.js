'use strict';

/**
 * Target-authority ceiling (RCA-005, RCA-006, REC-004).
 *
 * ## Why this module exists
 *
 * Every user-mutating admin handler previously answered only one question:
 * "is the caller an admin?" It never asked the second, decisive question:
 * "may THIS admin act on THIS account?" The consequence (proven by probe
 * `[PROBE-004]`) was that an `ADMIN` could clear the second factor of a
 * `SUPER_ADMIN`, which is step one of an account-takeover chain.
 *
 * Authorisation therefore has two dimensions, and only the first existed:
 *
 *   dimension 1 — caller authority  : requirePermission(...) / requireAdmin
 *   dimension 2 — target authority  : this module
 *
 * ## Contract
 *
 * `assertCanActOnTarget(caller, target, operation)` returns a decision object
 * and never throws. A caller may act on a target when
 * `rank(caller) >= rank(target)`, with two explicit refinements:
 *
 *  - `SUPER_ADMIN` may act on any target, including another `SUPER_ADMIN`
 *    (INV-2: super-admin rights are unconditional; break-glass must exist).
 *  - `AUDITOR` and `SUPPORT` are read-only roles for every user mutation,
 *    regardless of what bundles they may acquire later.
 *
 * An unknown or absent role is treated as rank 0 and can therefore never act
 * on a staff account.
 *
 * ## Failure modes
 *
 *  - Target identity unknown  → `targetRole` is `null`, ranked 0, decision
 *    `allowed: true` for any staff caller. This is deliberate: the handlers
 *    resolve the identity from Firebase *after* the guard in some paths, and
 *    refusing on an unresolvable identity would turn a Firebase outage into an
 *    authorisation outage. The identity lookup that follows returns 404.
 *  - Caller role unknown      → rank 0 → denied for any staff target.
 *
 * There are no side effects: this module performs no I/O, emits no audit row
 * and mutates no argument. Handlers are responsible for auditing a denial.
 *
 * @module security/targetAuthority
 */

/**
 * Canonical role ranks. Higher may act on lower.
 *
 * The ordering encodes the operational hierarchy, not the permission
 * vocabulary: an AUDITOR outranks a SUPPORT agent for *reading* purposes but
 * neither may mutate, which is enforced separately by the read-only set below.
 *
 * @type {Readonly<Record<string, number>>}
 */
const ROLE_RANK = Object.freeze({
  SUPER_ADMIN: 100,
  ADMIN: 80,
  AUDITOR: 60,
  SUPPORT: 60,
  EMPLOYER: 40,
  ENTERPRISE_ADMIN: 30,
  ENTERPRISE_MEMBER: 20,
  USER: 10,
});

/** Roles that may never perform a user mutation, whatever their bundle says. */
const READ_ONLY_ROLES = Object.freeze(new Set(['AUDITOR', 'SUPPORT', 'EMPLOYER', 'ENTERPRISE_MEMBER', 'USER']));

/** Operations whose blast radius is raised further in the audit record. */
const HIGH_RISK_OPERATIONS = Object.freeze(new Set([
  'unenroll-mfa',
  'revoke-sessions',
  'send-password-reset',
  'delete-user',
  'change-role',
  'ai-entitlement',
]));

const UNKNOWN_RANK = 0;

/**
 * Normalise any role-shaped value to an upper-case role key.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeRole(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}

/**
 * Extract the role from an Express request user, a Firebase identity record or
 * a plain role string, so that callers cannot pass the wrong shape by mistake.
 *
 * @param {object|string|null|undefined} subject
 * @returns {string} upper-case role, or `''` when unknown
 */
function roleOf(subject) {
  if (!subject) return '';
  if (typeof subject === 'string') return normalizeRole(subject);
  const fromClaims = normalizeRole(subject.claims?.role);
  if (fromClaims) return fromClaims;
  const fromCustomClaims = normalizeRole(subject.customClaims?.role);
  if (fromCustomClaims) return fromCustomClaims;
  return normalizeRole(subject.role);
}

/**
 * Rank a role.
 * @param {string} role
 * @returns {number} 0 for an unknown role
 */
function rankOf(role) {
  const key = normalizeRole(role);
  return Object.hasOwn(ROLE_RANK, key) ? ROLE_RANK[key] : UNKNOWN_RANK;
}

/**
 * Decide whether `caller` may perform `operation` against `target`.
 *
 * @param {{role?: string, claims?: object}|string|null} caller
 * @param {{role?: string, customClaims?: object}|string|null} target
 * @param {string} operation short operation key, e.g. `'unenroll-mfa'`
 * @returns {{allowed: boolean, code: string, message: string, callerRole: string,
 *            targetRole: string, callerRank: number, targetRank: number,
 *            operation: string, highRisk: boolean}}
 */
function evaluateTargetAuthority(caller, target, operation) {
  const callerRole = roleOf(caller);
  const targetRole = roleOf(target);
  const callerRank = rankOf(callerRole);
  const targetRank = rankOf(targetRole);
  const operationKey = String(operation || 'unknown');
  const highRisk = HIGH_RISK_OPERATIONS.has(operationKey);

  const base = {
    callerRole,
    targetRole,
    callerRank,
    targetRank,
    operation: operationKey,
    highRisk,
  };

  if (!callerRole || callerRank === UNKNOWN_RANK) {
    return {
      ...base,
      allowed: false,
      code: 'CALLER_ROLE_UNKNOWN',
      message: 'The calling account has no recognised platform role.',
    };
  }

  if (READ_ONLY_ROLES.has(callerRole)) {
    return {
      ...base,
      allowed: false,
      code: 'READ_ONLY_ROLE',
      message: `${callerRole} may read this record but may not modify it.`,
    };
  }

  // INV-2: a super admin may act on anyone, including another super admin,
  // so that a locked-out root account always has an in-product recovery path.
  if (callerRole === 'SUPER_ADMIN') {
    return {
      ...base,
      allowed: true,
      code: 'SUPER_ADMIN_UNCONDITIONAL',
      message: 'Super admin performs this operation unconditionally.',
    };
  }

  // Equal rank is not "outranking": peer support between two ADMINs must keep
  // working, otherwise the ceiling would block legitimate rescue work.
  if (targetRole && targetRank > callerRank) {
    return {
      ...base,
      allowed: false,
      code: 'TARGET_OUTRANKS_CALLER',
      message: `A ${callerRole} may not perform this operation on a ${targetRole} account.`,
    };
  }

  return {
    ...base,
    allowed: true,
    code: 'CALLER_OUTRANKS_TARGET',
    message: `${callerRole} may act on a ${targetRole || 'non-staff'} account.`,
  };
}

/**
 * Express-friendly wrapper. Sends `403` and returns the decision when the
 * caller may not act; otherwise returns `null` and the handler continues.
 *
 * Handlers MUST audit a denial themselves (the audit row needs request
 * context that this module deliberately does not touch):
 *
 * ```js
 * const denied = denyIfCannotActOnTarget(req, res, identity, 'unenroll-mfa');
 * if (denied) { await recordAdminAuditLog(req, {...}); return denied; }
 * ```
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object|string|null} target
 * @param {string} operation
 * @returns {import('express').Response|null} the 403 response, or `null` to continue
 */
function denyIfCannotActOnTarget(req, res, target, operation) {
  const decision = evaluateTargetAuthority(req.user, target, operation);
  if (decision.allowed) return null;
  return res.status(403).json({
    success: false,
    code: decision.code,
    error: decision.message,
    operation: decision.operation,
    requestId: res.locals?.requestId,
  });
}

/**
 * Compact decision summary for the audit trail.
 * @param {ReturnType<typeof evaluateTargetAuthority>} decision
 * @returns {{code: string, callerRole: string, targetRole: string, operation: string}}
 */
function auditTargetAuthority(decision) {
  return {
    code: decision.code,
    callerRole: decision.callerRole,
    targetRole: decision.targetRole,
    operation: decision.operation,
  };
}

module.exports = {
  ROLE_RANK,
  READ_ONLY_ROLES,
  HIGH_RISK_OPERATIONS,
  normalizeRole,
  roleOf,
  rankOf,
  evaluateTargetAuthority,
  denyIfCannotActOnTarget,
  auditTargetAuthority,
};
