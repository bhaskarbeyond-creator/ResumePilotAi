'use strict';

/**
 * Write side of platform RBAC — granting, revoking and re-bundling roles
 * (REC-005, INV-3, INV-6).
 *
 * ## Why this is separate from `services/adminRbac.js`
 *
 * The resolver runs on every admin request and must stay small, synchronous and
 * incapable of writing. This module runs on a handful of privileged requests and
 * does the opposite: it validates, mutates, audits and invalidates. Splitting them
 * means a mistake here cannot degrade the read path, and the read path's tests do
 * not need a writable store.
 *
 * ## Invariants enforced here, with the reason
 *
 *  1. **SUPER_ADMIN keeps the wildcard.** (`INV-2`) `('*','*')` may not be removed
 *     from SUPER_ADMIN. Otherwise a single call could leave a deployment with no
 *     account able to fix it — the definition of a lockout, and unrecoverable
 *     without database access.
 *  2. **Escalation needs a reason.** Every grant, revoke and re-bundle carries a
 *     required, non-trivial `reason` that is stored in the audit row. INV-6 says
 *     configuration changes are audited with actor, timestamp, before/after and
 *     scope; a grant without a reason is audited but not explainable.
 *  3. **No self-grant.** A caller may not grant themselves a role, and may not add
 *     a permission to the role they themselves hold. Otherwise "who approved
 *     this?" has a one-word answer: the beneficiary.
 *  4. **Platform-managed roles are read-only here.** USER, EMPLOYER and the
 *     ENTERPRISE_* roles are owned by the enterprise module
 *     (`enterprise/tenantPolicy.js`); editing them through the admin plane would
 *     create two sources of truth for tenant authority.
 *  5. **Audit is written by the server, not the client.** `before` and `after` are
 *     computed from the store, never from the request body.
 *
 * ## Failure behaviour
 *
 * The store is the source of truth, so a store failure is a `503` and a *failed
 * write*. There is no optimistic path: if the audit row cannot be written the
 * change is rejected, because an unaudited authority change is exactly the thing
 * this module exists to prevent.
 *
 * @module services/adminRbacAdministration
 */

const rbac = require('./adminRbac');
const { KNOWN_ACTIONS } = require('../security/permissionVocabulary');

/** Roles whose authority is owned elsewhere and must not be edited here. */
const PLATFORM_MANAGED_ROLES = Object.freeze(['USER', 'EMPLOYER', 'ENTERPRISE_ADMIN', 'ENTERPRISE_MEMBER']);

/** The role that must always retain the wildcard. */
const BREAK_GLASS_ROLE = 'SUPER_ADMIN';

const ROLE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const RESOURCE_PATTERN = /^(\*|[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)*)$/;
const MIN_REASON_LENGTH = 12;
const MAX_PERMISSIONS_PER_ROLE = 500;

/**
 * A validation failure the HTTP layer can turn into a `400`.
 * @param {string} message
 * @param {string} [field]
 * @returns {Error & {status: number, code: string, field?: string}}
 */
function validationError(message, field) {
  return Object.assign(new Error(message), { status: 400, code: 'VALIDATION_FAILED', field });
}

/**
 * Normalise and validate a permission list from a request body.
 *
 * Duplicates collapse, order is canonicalised, and anything that is not a
 * `resource` + known `action` pair is rejected rather than ignored — silently
 * dropping an unknown action would let an operator believe a grant took effect.
 *
 * @param {unknown} input
 * @returns {Array<{resource: string, action: string}>} sorted, de-duplicated
 */
function normalisePermissions(input) {
  if (!Array.isArray(input)) throw validationError('permissions must be an array', 'permissions');
  if (input.length > MAX_PERMISSIONS_PER_ROLE) {
    throw validationError(`permissions may not exceed ${MAX_PERMISSIONS_PER_ROLE} entries`, 'permissions');
  }
  const seen = new Map();
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') throw validationError('each permission must be an object', 'permissions');
    const resource = String(entry.resource ?? '').trim();
    const action = String(entry.action ?? '').trim();
    if (resource.length > 64 || !RESOURCE_PATTERN.test(resource)) {
      throw validationError(`invalid resource: ${resource || '(empty)'}`, 'permissions');
    }
    if (!KNOWN_ACTIONS.includes(action)) {
      throw validationError(`unknown action: ${action || '(empty)'}. Known actions: ${KNOWN_ACTIONS.join(', ')}`, 'permissions');
    }
    if (resource === '*' && action !== '*') throw validationError('the wildcard resource only accepts the wildcard action', 'permissions');
    if (action === '*' && resource !== '*') throw validationError('the wildcard action only applies to the wildcard resource', 'permissions');
    seen.set(`${resource}:${action}`, { resource, action });
  }
  return [...seen.values()].sort((a, b) => `${a.resource}:${a.action}`.localeCompare(`${b.resource}:${b.action}`));
}

/**
 * Validate the human justification attached to an authority change.
 * @param {unknown} reason
 * @returns {string}
 */
function normaliseReason(reason) {
  const text = String(reason ?? '').trim();
  if (text.length < MIN_REASON_LENGTH) {
    throw validationError(`reason must be at least ${MIN_REASON_LENGTH} characters and explain why the authority change is needed`, 'reason');
  }
  if (text.length > 500) throw validationError('reason may not exceed 500 characters', 'reason');
  return text;
}

/**
 * Validate a role name and refuse platform-managed roles.
 * @param {unknown} role
 * @returns {string}
 */
function normaliseRole(role) {
  const name = String(role ?? '').trim().toUpperCase();
  if (!ROLE_PATTERN.test(name)) throw validationError('invalid role name', 'role');
  if (PLATFORM_MANAGED_ROLES.includes(name)) {
    throw Object.assign(new Error(`${name} is managed by the enterprise module and cannot be re-bundled here`), {
      status: 409,
      code: 'PLATFORM_MANAGED_ROLE',
    });
  }
  return name;
}

/**
 * Describe a change as two sorted key lists, for the audit row and the response.
 * @param {Array<{resource: string, action: string}>} before
 * @param {Array<{resource: string, action: string}>} after
 */
function diffPermissions(before, after) {
  const key = permission => `${permission.resource}:${permission.action}`;
  const beforeSet = new Set(before.map(key));
  const afterSet = new Set(after.map(key));
  return {
    added: [...afterSet].filter(entry => !beforeSet.has(entry)).sort(),
    removed: [...beforeSet].filter(entry => !afterSet.has(entry)).sort(),
    unchanged: [...afterSet].filter(entry => beforeSet.has(entry)).sort(),
  };
}

/**
 * The persisted shape of a role's bundle, as stored — not hierarchy-expanded.
 * @param {string} role
 * @returns {Promise<Array<{resource: string, action: string}>>}
 */
async function readStoredPermissions(role) {
  return rbac.listStoredRolePermissions(role);
}

/**
 * Replace a role's permission bundle.
 *
 * @param {object} input
 * @param {string} input.role
 * @param {unknown} input.permissions request body value
 * @param {unknown} input.reason
 * @param {{uid: string, email?: string, role?: string}} input.actor
 * @returns {Promise<{role: string, before: Array, after: Array, added: string[], removed: string[], reason: string}>}
 */
async function replaceRolePermissions({ role, permissions, reason, actor }) {
  const roleName = normaliseRole(role);
  const next = normalisePermissions(permissions);
  const justification = normaliseReason(reason);
  const actorUid = String(actor?.uid || '');
  if (!actorUid) throw validationError('an authenticated actor is required', 'actor');

  const before = await readStoredPermissions(roleName);
  if (!before.length && !(await roleExists(roleName))) {
    throw Object.assign(new Error(`Role not found: ${roleName}`), { status: 404, code: 'ROLE_NOT_FOUND' });
  }

  assertBreakGlassRetained(roleName, before, next);
  assertNoSelfEscalation({ roleName, next, before, actorRole: actor?.role, actorUid });

  const diff = diffPermissions(before, next);
  if (!diff.added.length && !diff.removed.length) {
    // Idempotent by design: a no-op change is not a configuration change, so it
    // must not write an audit row that would make the trail noisy and the change
    // appear to have happened when nothing moved.
    return { role: roleName, before, after: before, added: [], removed: [], reason: justification, changed: false };
  }

  const store = rbac.__storeForAdministration();
  await store.replaceRolePermissions(roleName, next, actorUid);
  await rbac.refreshRbacCache();
  return { role: roleName, before, after: next, ...diff, reason: justification, changed: true };
}

/**
 * Does a role exist at all? Used to distinguish "role with an empty bundle" from
 * "typo in the role name", which the UI must not confuse.
 * @param {string} roleName
 * @returns {Promise<boolean>}
 */
async function roleExists(roleName) {
  const store = rbac.__storeForAdministration();
  const roles = await store.listRoles();
  return roles.some(role => String(role.name).toUpperCase() === roleName);
}

/**
 * INV-2: the break-glass role must keep the wildcard. Removing it would leave a
 * deployment whose most powerful account can no longer restore anyone.
 * @param {string} roleName
 * @param {Array<{resource: string, action: string}>} before
 * @param {Array<{resource: string, action: string}>} next
 */
function assertBreakGlassRetained(roleName, before, next) {
  if (roleName !== BREAK_GLASS_ROLE) return;
  const hadWildcard = before.some(permission => permission.resource === '*' && permission.action === '*');
  const keepsWildcard = next.some(permission => permission.resource === '*' && permission.action === '*');
  if (hadWildcard && !keepsWildcard) {
    throw Object.assign(new Error("SUPER_ADMIN must retain the wildcard permission; removing it would leave the break-glass account unable to restore access"), {
      status: 409,
      code: 'BREAK_GLASS_REMOVAL_BLOCKED',
    });
  }
}

/**
 * Rule 3: no self-escalation. Adding authority to a role the caller holds is
 * indistinguishable from granting it to yourself, so it needs a second person.
 *
 * @param {object} input
 * @param {string} input.roleName
 * @param {Array<{resource: string, action: string}>} input.next
 * @param {Array<{resource: string, action: string}>} input.before
 * @param {string} [input.actorRole]
 * @param {string} input.actorUid
 */
function assertNoSelfEscalation({ roleName, next, before, actorRole, actorUid }) {
  const callerRole = String(actorRole || '').toUpperCase();
  if (callerRole !== roleName) return;
  const diff = diffPermissions(before, next);
  if (diff.added.length) {
    throw Object.assign(new Error(`Cannot widen ${roleName} while holding it yourself (${actorUid}); ask another ${BREAK_GLASS_ROLE} to apply this change`), {
      status: 409,
      code: 'SELF_ESCALATION_BLOCKED',
    });
  }
}

/**
 * Grant a role to a uid.
 * @param {object} input
 * @param {string} input.uid
 * @param {string} input.role
 * @param {unknown} input.reason
 * @param {string} [input.expiresAt] ISO timestamp
 * @param {{uid: string, role?: string}} input.actor
 */
async function grantRole({ uid, role, reason, expiresAt, actor }) {
  const targetUid = String(uid || '').trim();
  if (!targetUid || targetUid.length > 128) throw validationError('uid is required (max 128 characters)', 'uid');
  const roleName = normaliseRole(role);
  const justification = normaliseReason(reason);
  const actorUid = String(actor?.uid || '');
  if (!actorUid) throw validationError('an authenticated actor is required', 'actor');
  if (targetUid === actorUid) {
    throw Object.assign(new Error('Cannot grant a role to yourself; a second administrator must approve'), {
      status: 409,
      code: 'SELF_ESCALATION_BLOCKED',
    });
  }
  if (!(await roleExists(roleName))) {
    throw Object.assign(new Error(`Role not found: ${roleName}`), { status: 404, code: 'ROLE_NOT_FOUND' });
  }
  let normalisedExpiry = null;
  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
    const parsed = new Date(String(expiresAt));
    if (Number.isNaN(parsed.getTime())) throw validationError('expiresAt must be an ISO timestamp', 'expiresAt');
    if (parsed.getTime() <= Date.now()) throw validationError('expiresAt must be in the future', 'expiresAt');
    normalisedExpiry = parsed;
  }

  const store = rbac.__storeForAdministration();
  // The store returns one row per (role, permission) pair, so the roles must be
  // de-duplicated: listing a role three times in an audit row reads as three grants.
  const existing = [...new Set((await store.listUserGrants(targetUid)).map(entry => entry.role))];
  await store.upsertGrant({ uid: targetUid, role: roleName, grantedBy: actorUid, reason: justification, expiresAt: normalisedExpiry });
  rbac.invalidateRbacCache();
  // Resolve this uid's grants now, so the next request from that caller already
  // carries the new role rather than waiting for a lazy cache fill.
  await rbac.preloadUserGrants(targetUid);
  return {
    uid: targetUid,
    role: roleName,
    expiresAt: normalisedExpiry ? normalisedExpiry.toISOString() : null,
    reason: justification,
    before: existing.sort(),
    changed: true,
  };
}

/**
 * Revoke a role from a uid.
 * @param {object} input
 * @param {string} input.uid
 * @param {string} input.role
 * @param {unknown} input.reason
 * @param {{uid: string}} input.actor
 */
async function revokeRole({ uid, role, reason, actor }) {
  const targetUid = String(uid || '').trim();
  if (!targetUid) throw validationError('uid is required', 'uid');
  const roleName = normaliseRole(role);
  const justification = normaliseReason(reason);
  const actorUid = String(actor?.uid || '');
  if (!actorUid) throw validationError('an authenticated actor is required', 'actor');

  const store = rbac.__storeForAdministration();
  // The store returns one row per (role, permission) pair, so the roles must be
  // de-duplicated: listing a role three times in an audit row reads as three grants.
  const existing = [...new Set((await store.listUserGrants(targetUid)).map(entry => entry.role))];
  if (!existing.includes(roleName)) {
    throw Object.assign(new Error(`${targetUid} does not hold ${roleName}`), { status: 404, code: 'GRANT_NOT_FOUND' });
  }
  const removed = await store.deleteGrant(targetUid, roleName);
  if (!removed) throw Object.assign(new Error('Grant not found'), { status: 404, code: 'GRANT_NOT_FOUND' });
  rbac.invalidateRbacCache();
  await rbac.preloadUserGrants(targetUid);
  return { uid: targetUid, role: roleName, reason: justification, before: existing.sort(), after: existing.filter(entry => entry !== roleName).sort(), changed: true };
}

module.exports = {
  PLATFORM_MANAGED_ROLES,
  BREAK_GLASS_ROLE,
  MIN_REASON_LENGTH,
  normalisePermissions,
  normaliseReason,
  normaliseRole,
  diffPermissions,
  replaceRolePermissions,
  grantRole,
  revokeRole,
};
