'use strict';

/**
 * Platform RBAC resolver — roles and permissions as configuration (REC-005, INV-3).
 *
 * ## The model
 *
 * A permission is a `resource` + `action` pair stored in
 * `admin_role_permissions` (migration 028). Actions form a hierarchy:
 *
 *     manage ⊃ write ⊃ read
 *
 * so holding `system.config:manage` satisfies a `system.config:read` check.
 * `view` is treated as a synonym of `read` because commercial contracts in this
 * product are written as "billing view".
 *
 * Authority for a caller is the union of:
 *   1. every permission of the role named on the token, from the database;
 *   2. every unexpired `admin_user_roles` grant for that uid.
 *
 * The retired third source — an arbitrary `permissions` array on the identity
 * token — is deliberately gone (RCA-009): a grant that is not persisted cannot
 * be audited, and an unaudited grant is indistinguishable from a compromise.
 *
 * ## Why resolution is synchronous
 *
 * `permissionsFor` is called inside synchronous Express middleware. The resolver
 * therefore serves from an in-process cache that is warmed at boot and
 * invalidated on write. Cache misses fall back to the frozen literal in
 * `security/auth.js`, which is exactly the pre-028 behaviour — so a cold cache or
 * an unavailable database can never fail *open*, only fall back.
 *
 * ## Failure modes
 *
 *  - Database unavailable → serve the legacy literal for the role, log once per
 *    process at WARN, expose `degraded: true` from `describeResolution()`.
 *  - Unknown role → empty set (fail closed).
 *  - Malformed stored permission row → skipped and counted; never guessed.
 *
 * @module services/adminRbac
 */

// Imported from `security/permissionVocabulary`, never from `security/auth`:
// `auth.js` requires this module, so importing it back would create a cycle in
// which one of the two modules sees a half-initialised export (the exact defect
// that made `resolvePermissionSet` throw `undefined` on first call).
const {
  PERMISSIONS: LEGACY_ROLE_PERMISSIONS,
  ACTION_IMPLIES,
} = require('../security/permissionVocabulary');

/** Legacy permission strings that are not `resource.action` shaped. */
const LEGACY_ALIASES = Object.freeze({
  blog_management: Object.freeze({ resource: 'blog', action: 'manage' }),
  '*': Object.freeze({ resource: '*', action: '*' }),
});

const CACHE_TTL_MS = Number(process.env.ADMIN_RBAC_CACHE_TTL_MS || 15_000);

/** @type {{listRoles: Function, listRolePermissions: Function, listUserGrants: Function}|null} */
let storeOverride = null;

/** @type {{roles: Map<string, {rank: number, isSystem: boolean}>, rolePermissions: Map<string, Set<string>>, loadedAt: number, degraded: boolean}|null} */
let cache = null;
/** @type {Map<string, {set: Set<string>, expiresAt: number}>} */
const userGrantCache = new Map();
/** In-flight grant reads, so concurrent resolutions share one query. @type {Map<string, Promise<Set<string>>>} */
const userGrantInFlight = new Map();

let warnedDegraded = false;

/**
 * Injectable store, for tests and for certification harnesses.
 * @param {object|null} store
 */
function setRbacStoreForTests(store) {
  if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_TEST_AUTH_VERIFIER !== 'true') {
    throw new Error('RBAC store injection is disabled outside tests');
  }
  storeOverride = store;
  cache = null;
  userGrantCache.clear();
}

/** Drop all cached authority, e.g. after a role or grant mutation. */
function invalidateRbacCache() {
  cache = null;
  userGrantCache.clear();
}

/**
 * Canonicalise a legacy permission string into `{resource, action}`.
 * @param {string} permission
 * @returns {{resource: string, action: string}|null}
 */
function parsePermission(permission) {
  const raw = String(permission || '').trim();
  if (!raw) return null;
  if (LEGACY_ALIASES[raw]) return { ...LEGACY_ALIASES[raw] };
  const index = raw.lastIndexOf('.');
  if (index <= 0 || index === raw.length - 1) return null;
  return { resource: raw.slice(0, index), action: raw.slice(index + 1) };
}

/**
 * Canonical storage key. `*:*` is the wildcard that satisfies every check.
 * @param {string} resource
 * @param {string} action
 * @returns {string}
 */
function canonicalKey(resource, action) {
  return `${resource}:${action}`;
}

/**
 * Expand an `(resource, action)` grant into every key it satisfies, including
 * the legacy dotted alias so that handlers using `permissions.has('users.update')`
 * keep working without a rewrite.
 *
 * @param {string} resource
 * @param {string} action
 * @returns {string[]} keys to add to the caller's set
 */
function expandGrant(resource, action) {
  const keys = [];
  const actions = [action, ...(ACTION_IMPLIES[action] || [])];
  for (const implied of new Set(actions)) {
    keys.push(canonicalKey(resource, implied));
    if (resource !== '*') keys.push(`${resource}.${implied}`);
  }
  if (resource === 'blog' && action === 'manage') keys.push('blog_management');
  return keys;
}

/**
 * Convert the frozen legacy literal into canonical keys, with hierarchy applied.
 * This is the fallback authority set and the seed reference for tests.
 * @param {string} roleName
 * @returns {Set<string>}
 */
function legacyPermissionSet(roleName) {
  const out = new Set();
  const bundle = LEGACY_ROLE_PERMISSIONS[String(roleName || '').toUpperCase()] || [];
  for (const permission of bundle) {
    const parsed = parsePermission(permission);
    if (!parsed) continue;
    for (const key of expandGrant(parsed.resource, parsed.action)) out.add(key);
  }
  return out;
}

/* ── persistence ─────────────────────────────────────────────────────── */

function defaultStore() {
  // Resolved lazily so that importing this module never opens a pool.
  const { getPool } = require('../database/mysql');
  return {
    async listRoles() {
      const [rows] = await getPool().query('SELECT name, rank, is_system FROM admin_roles');
      return rows.map(row => ({ name: String(row.name), rank: Number(row.rank) || 0, isSystem: row.is_system === 1 }));
    },
    async listRolePermissions() {
      const [rows] = await getPool().query(
        `SELECT r.name AS role, p.resource, p.action
           FROM admin_role_permissions p
           JOIN admin_roles r ON r.id = p.role_id`,
      );
      return rows.map(row => ({ role: String(row.role), resource: String(row.resource), action: String(row.action) }));
    },
    async listUserGrants(uid) {
      const [rows] = await getPool().query(
        `SELECT r.name AS role, p.resource, p.action
           FROM admin_user_roles ur
           JOIN admin_roles r ON r.id = ur.role_id
           JOIN admin_role_permissions p ON p.role_id = ur.role_id
          WHERE ur.uid = ?
            AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)`,
        [String(uid)],
      );
      return rows.map(row => ({ role: String(row.role), resource: String(row.resource), action: String(row.action) }));
    },
    /**
     * Replace a role's bundle atomically. Deleting then inserting inside one
     * transaction matters: a partial replace would leave a role with *more* or
     * *less* authority than either the before or the after state, and the audit
     * row would describe a state that never existed.
     * @param {string} roleName
     * @param {Array<{resource: string, action: string}>} permissions
     * @param {string} actor
     */
    async replaceRolePermissions(roleName, permissions, actor) {
      const pool = getPool();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [[role]] = await connection.query('SELECT id FROM admin_roles WHERE name = ? FOR UPDATE', [roleName]);
        if (!role) {
          const error = new Error('Role not found');
          error.code = 'ROLE_NOT_FOUND';
          throw error;
        }
        await connection.query('DELETE FROM admin_role_permissions WHERE role_id = ?', [role.id]);
        if (permissions.length) {
          await connection.query(
            'INSERT INTO admin_role_permissions (role_id, resource, action, granted_by) VALUES ?',
            [permissions.map(permission => [role.id, permission.resource, permission.action, actor])],
          );
        }
        await connection.commit();
      } catch (error) {
        try { await connection.rollback(); } catch { /* rollback is best effort */ }
        throw error;
      } finally {
        connection.release();
      }
    },
    /**
     * Grant a role to a uid. `ON DUPLICATE KEY UPDATE` means re-granting an
     * existing role refreshes its expiry and reason rather than failing, which is
     * what an operator re-issuing a time-boxed grant expects.
     */
    async upsertGrant({ uid, role, grantedBy, reason, expiresAt }) {
      const pool = getPool();
      const [[row]] = await pool.query('SELECT id FROM admin_roles WHERE name = ?', [role]);
      if (!row) {
        const error = new Error('Role not found');
        error.code = 'ROLE_NOT_FOUND';
        throw error;
      }
      await pool.query(
        `INSERT INTO admin_user_roles (uid, role_id, granted_by, reason, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE granted_by = VALUES(granted_by), reason = VALUES(reason),
                                 expires_at = VALUES(expires_at), granted_at = CURRENT_TIMESTAMP`,
        [String(uid), row.id, String(grantedBy), String(reason), expiresAt || null],
      );
    },
    /** @returns {Promise<Array<{uid: string, role: string, grantedBy: string, reason: string, expiresAt: string|null, grantedAt: string}>>} */
    async listGrants() {
      const [rows] = await getPool().query(
        `SELECT ur.uid, r.name AS role, ur.granted_by, ur.reason, ur.expires_at, ur.granted_at
           FROM admin_user_roles ur JOIN admin_roles r ON r.id = ur.role_id
          ORDER BY ur.granted_at DESC`,
      );
      return rows.map(row => ({
        uid: String(row.uid),
        role: String(row.role),
        grantedBy: String(row.granted_by),
        reason: String(row.reason),
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        grantedAt: row.granted_at ? new Date(row.granted_at).toISOString() : null,
      }));
    },
    /** @returns {Promise<number>} rows deleted */
    async deleteGrant(uid, role) {
      const pool = getPool();
      const [result] = await pool.query(
        `DELETE ur FROM admin_user_roles ur JOIN admin_roles r ON r.id = ur.role_id
          WHERE ur.uid = ? AND r.name = ?`,
        [String(uid), String(role)],
      );
      return Number(result.affectedRows) || 0;
    },
  };
}

/**
 * Load the whole role/permission graph into memory.
 *
 * Called at boot (`warmAdminRbac`) and on demand when the cache expires. Never
 * throws: a load failure marks the cache degraded and leaves the literal
 * fallback in charge.
 *
 * @returns {Promise<{degraded: boolean, roles: number, permissions: number}>}
 */
async function refreshRbacCache() {
  const store = storeOverride || defaultStore();
  const startedAt = Date.now();
  try {
    const [roles, permissions] = await Promise.all([store.listRoles(), store.listRolePermissions()]);
    const rolesByName = new Map();
    for (const role of roles) rolesByName.set(role.name, { rank: role.rank, isSystem: role.isSystem });
    const rolePermissions = new Map();
    for (const row of permissions) {
      const parsed = { resource: row.resource, action: row.action };
      if (!parsed.resource || !parsed.action) continue;
      const set = rolePermissions.get(row.role) || new Set();
      for (const key of expandGrant(parsed.resource, parsed.action)) set.add(key);
      rolePermissions.set(row.role, set);
    }
    cache = { roles: rolesByName, rolePermissions, loadedAt: Date.now(), degraded: false, loadMs: Date.now() - startedAt };
    warnedDegraded = false;
    return { degraded: false, roles: rolesByName.size, permissions: permissions.length };
  } catch (error) {
    cache = { roles: new Map(), rolePermissions: new Map(), loadedAt: Date.now(), degraded: true, error: String(error?.code || error?.message || error) };
    if (!warnedDegraded) {
      warnedDegraded = true;
      console.warn('[AdminRBAC] admin.rbac.store_unavailable', JSON.stringify({
        reason: cache.error,
        fallback: 'security/auth.js frozen literal (pre-028 behaviour)',
      }));
    }
    return { degraded: true, roles: 0, permissions: 0 };
  }
}

/** @type {Promise<object>|null} in-flight background refresh, to coalesce callers */
let refreshInFlight = null;

/**
 * Refresh the cache off the request path. Coalesces concurrent callers onto one
 * query so a burst of requests after expiry costs one round trip, not N.
 * @returns {void}
 */
function scheduleRefresh() {
  if (refreshInFlight) return;
  refreshInFlight = refreshRbacCache().finally(() => { refreshInFlight = null; });
}

/** @returns {boolean} whether the cache currently serves database truth */
function isCacheFresh() {
  return Boolean(cache) && !cache.degraded && (Date.now() - cache.loadedAt) < CACHE_TTL_MS;
}

/**
 * Permission set for a role, served synchronously.
 * @param {string} roleName
 * @returns {{set: Set<string>, source: 'database'|'literal'}}
 */
function permissionsForRole(roleName) {
  const role = String(roleName || '').toUpperCase();
  if (!isCacheFresh()) {
    // Expired or never-warmed cache. Serve whatever database truth we last saw —
    // stale authority is still authority, and falling back to the literal while a
    // perfectly good snapshot exists would silently discard a persisted grant.
    // Kick off a refresh in the background so the next request sees fresh data.
    if (cache && !cache.degraded) {
      scheduleRefresh();
      const stale = cache.rolePermissions.get(role);
      if (stale) return { set: stale, source: 'database' };
      if (cache.roles.has(role)) return { set: new Set(), source: 'database' };
    }
    return { set: legacyPermissionSet(role), source: 'literal' };
  }
  const set = cache.rolePermissions.get(role);
  if (set) return { set, source: 'database' };
  // A role present in admin_roles with no permission rows is a deliberate
  // zero-authority role, not a fallback case.
  if (cache.roles.has(role)) return { set: new Set(), source: 'database' };
  return { set: legacyPermissionSet(role), source: 'literal' };
}

/**
 * Additional permissions granted directly to a uid (unexpired rows only).
 * Cached for CACHE_TTL_MS; misses resolve to the empty set and are refreshed
 * asynchronously so the request path is never blocked on the database.
 *
 * @param {string} uid
 * @returns {Set<string>}
 */
function permissionsForUserGrants(uid) {
  const key = String(uid || '');
  if (!key) return new Set();
  const cached = userGrantCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.set;
  if (cached) userGrantCache.delete(key);

  // One query per uid, not one per caller. A single request resolves the authority set
  // several times (`enforceApiPolicy`, `requirePermission`, and any handler that asks) —
  // before this guard each of those misses issued its own `admin_user_roles` read, which
  // a query-budget test measured as a per-request N+1 on the authority graph. Sharing the
  // in-flight promise collapses them into one round trip without making any caller wait
  // longer than it already did.
  const store = storeOverride || defaultStore();
  const inFlight = userGrantInFlight.get(key);
  const refresh = inFlight || Promise.resolve()
    .then(() => store.listUserGrants(key))
    .then(rows => {
      const set = new Set();
      for (const row of rows) {
        if (!row.resource || !row.action) continue;
        for (const expanded of expandGrant(row.resource, row.action)) set.add(expanded);
      }
      userGrantCache.set(key, { set, expiresAt: Date.now() + CACHE_TTL_MS });
      return set;
    })
    .catch(() => {
      // A failed grant read caches the empty set for one TTL: the role bundle still
      // carries baseline authority, and retrying on every request during an outage would
      // turn a degraded database into a queue of failing queries.
      const set = new Set();
      userGrantCache.set(key, { set, expiresAt: Date.now() + CACHE_TTL_MS });
      return set;
    })
    .finally(() => { userGrantInFlight.delete(key); });

  userGrantInFlight.set(key, refresh);
  return cached?.set || new Set();
}

/**
 * The store the administration module writes through.
 *
 * Deliberately not cached: a write-path store must not be a snapshot, and the
 * injected test store has to be visible to this call. Read-path caching happens in
 * `refreshRbacCache`, not here.
 *
 * @returns {object} the injected store, or the live MariaDB store
 */
function __storeForAdministration() {
  return storeOverride || defaultStore();
}

/**
 * Load one caller's explicit grants into the cache and return them.
 *
 * The request path resolves grants lazily (a cache miss schedules a load and serves
 * the last known value) because blocking an authorisation decision on a query is
 * unacceptable. That laziness has exactly one visible consequence: the *first*
 * request after a grant would still use the old authority. This function closes
 * that gap for the write path, where we are already awaiting the database, so
 * "granting takes effect immediately" is true for the very next request.
 *
 * @param {string} uid
 * @returns {Promise<Set<string>>}
 */
async function preloadUserGrants(uid) {
  const key = String(uid || '');
  if (!key) return new Set();
  const store = storeOverride || defaultStore();
  const rows = await store.listUserGrants(key);
  const set = new Set();
  for (const row of rows) {
    if (!row.resource || !row.action) continue;
    for (const expanded of expandGrant(row.resource, row.action)) set.add(expanded);
  }
  userGrantCache.set(key, { set, expiresAt: Date.now() + CACHE_TTL_MS });
  return set;
}

/**
 * Full resolved authority for a caller.
 *
 * @param {{uid?: string, claims?: {role?: string}, role?: string}|null} user
 * @returns {Set<string>} canonical and legacy-alias keys, plus `'*'` for a wildcard holder
 */
function resolvePermissionSet(user) {
  const roleName = String(user?.claims?.role || user?.role || '').toUpperCase();
  const { set: roleSet } = permissionsForRole(roleName);
  const grants = permissionsForUserGrants(user?.uid);
  const out = new Set(roleSet);
  for (const key of grants) out.add(key);
  if (out.has('*:*') || out.has('*')) {
    out.add('*');
  }
  return out;
}

/**
 * Does a caller's set satisfy a required permission, honouring the hierarchy?
 *
 * Accepts both `resource:action` and the legacy dotted spelling, and an array of
 * alternatives (any-of), matching `requirePermission`'s existing contract.
 *
 * @param {Set<string>} permissionSet
 * @param {string|string[]} required
 * @returns {boolean}
 */
function satisfies(permissionSet, required) {
  if (permissionSet.has('*') || permissionSet.has('*:*')) return true;
  const candidates = Array.isArray(required) ? required : [required];
  return candidates.some(candidate => {
    const raw = String(candidate || '').trim();
    if (!raw) return false;
    if (permissionSet.has(raw)) return true;
    const parsed = parsePermission(raw);
    if (!parsed) return false;
    return permissionSet.has(canonicalKey(parsed.resource, parsed.action));
  });
}

/**
 * Diagnostic snapshot for the capabilities endpoint and the config census.
 * @returns {{degraded: boolean, roles: number, cachedAt: string|null, source: string}}
 */
function describeResolution() {
  return {
    degraded: Boolean(cache?.degraded) || !cache,
    roles: cache?.roles?.size || 0,
    cachedAt: cache?.loadedAt ? new Date(cache.loadedAt).toISOString() : null,
    source: cache && !cache.degraded ? 'database' : 'literal-fallback',
  };
}

/**
 * Warm the cache at boot. Safe to call repeatedly.
 * @returns {Promise<{degraded: boolean, roles: number, permissions: number}>}
 */
async function warmAdminRbac() {
  return refreshRbacCache();
}

/**
 * Permission catalogue for a role, as stored (not expanded), for the admin UI.
 * @param {string} roleName
 * @returns {Promise<Array<{resource: string, action: string}>>}
 */
async function listStoredRolePermissions(roleName) {
  const store = storeOverride || defaultStore();
  const rows = await store.listRolePermissions();
  return rows
    .filter(row => String(row.role).toUpperCase() === String(roleName).toUpperCase())
    .map(row => ({ resource: row.resource, action: row.action }))
    .sort((a, b) => `${a.resource}:${a.action}`.localeCompare(`${b.resource}:${b.action}`));
}

module.exports = {
  ACTION_IMPLIES,
  LEGACY_ALIASES,
  parsePermission,
  canonicalKey,
  expandGrant,
  legacyPermissionSet,
  satisfy: satisfies,
  satisfies,
  resolvePermissionSet,
  permissionsForRole,
  permissionsForUserGrants,
  preloadUserGrants,
  refreshRbacCache,
  scheduleRefresh,
  warmAdminRbac,
  invalidateRbacCache,
  describeResolution,
  listStoredRolePermissions,
  setRbacStoreForTests,
  __storeForAdministration,
};
