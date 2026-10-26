'use strict';

/**
 * REC-005 / INV-3 — platform authority is configuration, not code.
 *
 * These tests cover four separate promises, and they are kept in one file because
 * they only mean anything together:
 *
 *  1. **Behaviour preservation.** Migration 028 seeds `admin_roles` from the
 *     frozen literal in `security/permissionVocabulary.js`. If the seed and the
 *     literal ever disagree, the migration would silently change someone's
 *     authority on deploy. The seed is *parsed out of the SQL file* rather than
 *     restated in JavaScript, so the test fails when the two drift, not when the
 *     test's copy of the answer drifts.
 *  2. **Action hierarchy.** `manage ⊃ write ⊃ read` must hold in the resolver and
 *     on the request path, because the route policy asks for `read` on reads and
 *     `write` on writes of the very same resource.
 *  3. **Fail-closed degradation.** When the store is unavailable or a role is
 *     unknown, resolution falls back to the pre-028 literal (never to a superset)
 *     or to the empty set — never to wildcard.
 *  4. **Zero required-but-unassigned permissions.** Every permission string the
 *     backend asks for must be held, after hierarchy expansion, by at least one
 *     non-wildcard bundle — or be declared SUPER_ADMIN-exclusive with a reason.
 *
 * Fixtures are injected through `setRbacStoreForTests`, which refuses to run
 * outside `NODE_ENV=test`; no database is required.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminRbac = require('../services/adminRbac');
const { PERMISSIONS } = require('../security/permissionVocabulary');
const auth = require('../security/auth');

const MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '028_admin_rbac.sql');

/* ── migration parsing ───────────────────────────────────────────────── */

/**
 * Parse the behaviour-preserving section (§A) of migration 028 into the
 * `{role: [[resource, action], …]}` model it would insert.
 *
 * Intentionally strict: it throws on anything it cannot read, so a future edit to
 * the migration's shape fails this test loudly instead of silently parsing to an
 * empty model and "passing".
 *
 * @returns {Map<string, Array<[string, string]>>}
 */
function parseSeedSection() {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');
  const [seedSection] = sql.split('§B REC-005 remediation grants');
  assert.ok(seedSection, 'migration 028 must keep its §A/§B section markers');

  const model = new Map(['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT', 'ENTERPRISE_ADMIN', 'ENTERPRISE_MEMBER', 'EMPLOYER', 'USER']
    .map(role => [role, []]));

  // The wildcard grant is written as `SELECT id, '*', '*' … WHERE name = 'SUPER_ADMIN'`.
  const wildcard = /SELECT id, '\*', '\*', 'migration:028'\s+FROM admin_roles WHERE name = '([A-Z_]+)'/g;
  for (const match of seedSection.matchAll(wildcard)) {
    assert.ok(model.has(match[1]), `unexpected role in seed: ${match[1]}`);
    model.get(match[1]).push(['*', '*']);
  }

  // Role bundles are `SELECT r.id, p.resource, p.action … WHERE r.name = 'X'`.
  for (const block of seedSection.matchAll(/INSERT IGNORE INTO admin_role_permissions[\s\S]*?WHERE r\.name = '([A-Z_]+)';/g)) {
    const role = block[1];
    assert.ok(model.has(role), `unexpected role in seed: ${role}`);
    const pairs = [
      ...block[0].matchAll(/SELECT '([^']+)' AS resource, '([^']+)' AS action/g),
      ...block[0].matchAll(/UNION ALL SELECT '([^']+)', '([^']+)'/g),
    ];
    assert.ok(pairs.length > 0, `seed block for ${role} contributed no permissions`);
    for (const [, resource, action] of pairs) model.get(role).push([resource, action]);
  }
  return model;
}

/**
 * Parse the §B intentional-grant section into `{role: [[resource, action], …]}`.
 * @returns {Array<[string, string, string]>} `[role, resource, action]` triples
 */
function parseRemediationGrants() {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');
  const section = sql.split('§B REC-005 remediation grants')[1] || '';
  const triples = [];
  for (const block of section.matchAll(/SELECT r\.id, '([^']+)', '([^']+)', 'migration:028:rec-005'[\s\S]*?WHERE r\.name IN \(([^)]+)\);/g)) {
    const roles = block[3].split(',').map(value => value.trim().replace(/'/g, ''));
    // `IN ('ADMIN', 'SUPPORT')` — either spelling is accepted.
    for (const quoted of block[3].matchAll(/'([A-Z_]+)'/g)) roles.push(quoted[1]);
    for (const role of new Set(roles.filter(role => /^[A-Z_]+$/.test(role)))) triples.push([role, block[1], block[2]]);
  }
  return triples;
}

/**
 * Expand `[[resource, action], …]` through the resolver's hierarchy into the set
 * of keys a holder would actually carry.
 * @param {Array<[string, string]>} pairs
 * @returns {string[]} sorted keys
 */
function expandAll(pairs) {
  const out = new Set();
  for (const [resource, action] of pairs) {
    for (const key of adminRbac.expandGrant(resource, action)) out.add(key);
  }
  return [...out].sort();
}

/* ── fixtures ────────────────────────────────────────────────────────── */

/**
 * Build an injectable store from a parsed migration model.
 * @param {Map<string, Array<[string, string]>>} model
 * @param {Record<string, Array<[string, string]>>} [userGrants]
 */
function storeFrom(model, userGrants = {}) {
  return {
    async listRoles() {
      return [...model.keys()].map(name => ({ name, rank: 0, isSystem: true }));
    },
    async listRolePermissions() {
      const rows = [];
      for (const [role, pairs] of model) {
        for (const [resource, action] of pairs) rows.push({ role, resource, action });
      }
      return rows;
    },
    async listUserGrants(uid) {
      return (userGrants[uid] || []).map(([resource, action]) => ({ resource, action }));
    },
  };
}

/** Load a store, warm the cache, and assert the load was not degraded. */
async function useStore(store) {
  adminRbac.setRbacStoreForTests(store);
  const result = await adminRbac.refreshRbacCache();
  assert.equal(result.degraded, false, 'store load must succeed for this test to mean anything');
  return result;
}

test.afterEach(() => {
  adminRbac.setRbacStoreForTests(null);
  adminRbac.invalidateRbacCache();
});

/* ── 1. behaviour preservation ───────────────────────────────────────── */

test('REC-005: migration 028 §A seeds exactly the pre-028 literal for every role', () => {
  const model = parseSeedSection();
  assert.deepEqual([...model.keys()].sort(), Object.keys(PERMISSIONS).sort(),
    'every role in the vocabulary must be seeded, so that once the table is populated no role resolves through the code literal');

  for (const [role, literal] of Object.entries(PERMISSIONS)) {
    const seeded = expandAll(model.get(role));
    // Decomposed with the resolver's own parser, so aliases such as
    // `blog_management` are compared the way the resolver reads them rather than
    // the way a naive split would.
    const expected = expandAll(literal.map(permission => {
      const parsed = adminRbac.parsePermission(permission);
      assert.ok(parsed, `the literal contains a permission the resolver cannot parse: ${permission}`);
      return [parsed.resource, parsed.action];
    }));
    assert.deepEqual(seeded, expected, `seeded authority for ${role} must equal the literal it replaces`);
  }
});

test('REC-005: §B remediation grants are exactly the declared delta and nothing else', () => {
  const triples = parseRemediationGrants().map(triple => triple.join(':')).sort();
  // If you add a grant to §B, you add it here and to DECISION-LOG.md. The point of
  // the assertion is that authority cannot grow without a written reason.
  assert.deepEqual(triples, ['ADMIN:messages:read', 'SUPPORT:messages:read']);
});

/* ── 2. action hierarchy ─────────────────────────────────────────────── */

test('REC-005: manage implies write implies read on the same resource', async () => {
  await useStore(storeFrom(new Map([['CUSTOM', [['reports', 'manage']]]])));

  const set = adminRbac.resolvePermissionSet({ uid: 'u1', claims: { role: 'CUSTOM' } });
  assert.equal(adminRbac.satisfies(set, 'reports.manage'), true);
  assert.equal(adminRbac.satisfies(set, 'reports.write'), true);
  assert.equal(adminRbac.satisfies(set, 'reports.read'), true);
  assert.equal(adminRbac.satisfies(set, 'reports:read'), true, 'canonical and legacy spellings must both work');

  // The implication is one-directional: a reader is not a writer.
  await useStore(storeFrom(new Map([['READER', [['reports', 'read']]]])));
  const reader = adminRbac.resolvePermissionSet({ uid: 'u2', claims: { role: 'READER' } });
  assert.equal(adminRbac.satisfies(reader, 'reports.read'), true);
  assert.equal(adminRbac.satisfies(reader, 'reports.write'), false);
  assert.equal(adminRbac.satisfies(reader, 'reports.manage'), false);
});

test('REC-005: hierarchy applies on the request path, so ADMIN can read settings it can write', async () => {
  await useStore(storeFrom(parseSeedSection()));

  // ADMIN holds system.config:write but not system.config:read in the literal.
  // Before REC-005 that made every unlisted admin GET a 403 for ADMIN.
  const admin = { uid: 'admin-1', emailVerified: true, claims: { role: 'ADMIN' } };
  assert.equal(adminRbac.satisfies(auth.permissionsFor(admin), 'system.config.read'), true);

  let calls = 0;
  const middleware = auth.requirePermission('system.config.read');
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    json() { return this; },
  };
  middleware({ user: admin }, res, () => { calls += 1; });
  assert.equal(calls, 1, 'ADMIN must pass a system.config.read gate');
  assert.equal(res.statusCode, null);

  // ...and a read-only role still cannot write.
  const auditor = { uid: 'auditor-1', claims: { role: 'AUDITOR' } };
  let denied = 0;
  const deniedRes = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  auth.requirePermission('system.config.write')({ user: auditor }, deniedRes, () => { denied += 1; });
  assert.equal(denied, 0);
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(deniedRes.body.error.code, 'FORBIDDEN');
});

/* ── 3. degradation is fail-closed ───────────────────────────────────── */

test('REC-005: an unavailable store degrades to the literal, never to a superset', async () => {
  adminRbac.setRbacStoreForTests({
    async listRoles() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async listRolePermissions() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
    async listUserGrants() { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); },
  });
  const result = await adminRbac.refreshRbacCache();
  assert.equal(result.degraded, true);

  const admin = auth.permissionsFor({ uid: 'admin-1', claims: { role: 'ADMIN' } });
  const literal = adminRbac.legacyPermissionSet('ADMIN');
  assert.deepEqual([...admin].sort(), [...literal].sort(), 'degraded resolution must equal pre-028 authority exactly');
  assert.equal(admin.has('*'), false, 'a degraded store must never hand out the wildcard');

  const unknown = auth.permissionsFor({ uid: 'x', claims: { role: 'NOT_A_ROLE' } });
  assert.equal(unknown.size, 0, 'an unknown role resolves to no authority');
});

test('REC-005: a role with no stored permissions is deliberately zero-authority, not a fallback case', async () => {
  await useStore(storeFrom(new Map([['ADMIN', [['users', 'read']]], ['NEW_ROLE', []]])));
  const set = adminRbac.resolvePermissionSet({ uid: 'n1', claims: { role: 'NEW_ROLE' } });
  assert.equal(set.size, 0);
  assert.equal(adminRbac.satisfies(set, 'users.read'), false);
});

test('REC-005: token-asserted permissions are not authority (RCA-009 negative test)', async () => {
  await useStore(storeFrom(parseSeedSection()));
  const forged = auth.permissionsFor({
    uid: 'forged-1',
    claims: { role: 'SUPPORT', permissions: ['*', 'secrets.manage', 'users.delete'] },
  });
  assert.equal(forged.has('*'), false, 'a wildcard in a token claim must not confer authority');
  assert.equal(adminRbac.satisfies(forged, 'secrets.manage'), false);
  assert.equal(adminRbac.satisfies(forged, 'users.delete'), false);
  assert.equal(auth.isSuperAdmin({ claims: { role: 'SUPPORT', permissions: ['*'] } }), false);
});

/* ── 4. grants, wildcard, and the census ─────────────────────────────── */

test('REC-005: a persisted per-user grant unions with the role bundle', async () => {
  await useStore(storeFrom(new Map([['ADMIN', [['users', 'read']]]]), {
    'uid-granted': [['audit', 'read']],
  }));

  const before = adminRbac.resolvePermissionSet({ uid: 'uid-granted', claims: { role: 'ADMIN' } });
  // The grant load is asynchronous by design (it must never block a request), so
  // the first call schedules the load and the next one observes it.
  await new Promise(resolve => setImmediate(resolve));
  const after = adminRbac.resolvePermissionSet({ uid: 'uid-granted', claims: { role: 'ADMIN' } });

  assert.equal(adminRbac.satisfies(before, 'users.read'), true);
  assert.equal(adminRbac.satisfies(after, 'audit.read'), true, 'audit:read must arrive from admin_user_roles');
  assert.equal(adminRbac.satisfies(after, 'users.read'), true, 'the role bundle must survive the union');
});

test('REC-005: the wildcard role satisfies every permission and nothing less', async () => {
  await useStore(storeFrom(parseSeedSection()));
  const sa = auth.permissionsFor({ uid: 'sa-1', claims: { role: 'SUPER_ADMIN' } });
  assert.equal(sa.has('*'), true);
  for (const permission of ['secrets.manage', 'system.config.manage', 'users.delete', 'anything.at.all']) {
    assert.equal(adminRbac.satisfies(sa, permission), true, `SUPER_ADMIN must satisfy ${permission}`);
  }
  const admin = auth.permissionsFor({ uid: 'a-1', claims: { role: 'ADMIN' } });
  assert.equal(admin.has('*'), false, 'ADMIN is not a wildcard holder');
});

/**
 * Permissions that exist in source but are declared SUPER_ADMIN-exclusive, with
 * the reason. Anything not listed here must be held by a non-wildcard bundle.
 * @type {Record<string, string>}
 */
const SUPER_ADMIN_EXCLUSIVE = Object.freeze({
  'secrets.manage': 'Gates the Firebase service-account private key (security/policy.js:55,112,119). Handing it to ADMIN would allow minting identity tokens for the whole platform.',
});

/**
 * Strings that are not route permissions at all.
 * @type {Record<string, string>}
 */
const NOT_A_ROUTE_PERMISSION = Object.freeze({
  'tenant.support.access': 'Alternate spelling of a role membership test in enterprise/tenantService.js:72 (`[SUPPORT, ADMIN, SUPER_ADMIN].includes(role) || has(tenant.support.access)`); the role branch already admits the roles that need it.',
});

/**
 * Collect the permission *requirement groups* the backend enforces.
 *
 * A group is one any-of decision: `requirePermission(['a','b'])` is satisfied by
 * either key, so testing its members individually would report a false gap for
 * every alternative that happens to be redundant. Recording groups is what makes
 * this census match the authorisation the code actually performs.
 *
 * Sources, all of them line-addressable:
 *  - `requirePermission('x')` / `requirePermission(['x','y'])` — route gates;
 *  - `return 'x'` / `return ['x','y']` inside `security/policy.js` — the read and
 *    mutation resolvers that gate every admin path without an inline check;
 *  - every `permissions.has('x')` on a line — inline handler checks, grouped per
 *    line because those conditions are written on one line.
 *
 * @returns {Array<{file: string, line: number, permissions: string[]}>}
 */
function permissionRequirementGroups() {
  const backendRoot = path.join(__dirname, '..');
  const groups = [];
  const looksLikePermission = value => /^[a-z][\w.]*\.[a-z*]+$/.test(value);

  const scan = file => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const call of line.matchAll(/requirePermission\(\s*(\[[^\]]*\]|'[^']*')/g)) {
        const permissions = [...call[1].matchAll(/'([^']+)'/g)].map(match => match[1]).filter(looksLikePermission);
        if (permissions.length) groups.push({ file, line: index + 1, permissions });
      }
      if (file.endsWith('policy.js')) {
        const returned = line.match(/^\s*return (?:'([^']+)'|\[([^\]]+)\]);/);
        if (returned) {
          const permissions = (returned[1] ? [returned[1]] : [...returned[2].matchAll(/'([^']+)'/g)].map(match => match[1])).filter(looksLikePermission);
          if (permissions.length) groups.push({ file, line: index + 1, permissions });
        }
      }
      if (/\.has\(/.test(line) && !line.includes('requirePermission')) {
        const permissions = [...line.matchAll(/\.has\('([^']+)'\)/g)].map(match => match[1]).filter(looksLikePermission);
        if (permissions.length) groups.push({ file, line: index + 1, permissions });
      }
    });
  };

  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'test' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) scan(full);
    }
  };
  walk(backendRoot);
  assert.ok(groups.length > 40, `the census must find the route table, not an empty set of files (found ${groups.length})`);
  return groups;
}

test('REC-005/INV-3: no requirement group is unreachable by every non-wildcard role', async () => {
  const model = parseSeedSection();
  for (const [role, resource, action] of parseRemediationGrants()) model.get(role).push([resource, action]);
  await useStore(storeFrom(model));

  const roles = Object.keys(PERMISSIONS).filter(role => role !== 'SUPER_ADMIN');
  const resolved = new Map(roles.map(role => [role, adminRbac.resolvePermissionSet({ uid: `${role}-census`, claims: { role } })]));

  /**
   * @param {Array<{file: string, line: number, permissions: string[]}>} groups
   * @returns {string[]} human-readable orphans
   */
  const findOrphans = groups => groups.filter(group => {
    const reachable = group.permissions
      .filter(permission => !SUPER_ADMIN_EXCLUSIVE[permission] && !NOT_A_ROUTE_PERMISSION[permission])
      .some(permission => roles.some(role => adminRbac.satisfies(resolved.get(role), permission)));
    const onlyDeclared = group.permissions.every(permission => SUPER_ADMIN_EXCLUSIVE[permission] || NOT_A_ROUTE_PERMISSION[permission]);
    return !reachable && !onlyDeclared;
  }).map(group => `${path.relative(path.join(__dirname, '..'), group.file)}:${group.line} [${group.permissions.join(', ')}]`);

  // Negative control: the detector must flag a requirement nobody holds. Without
  // this, a bug that made every comparison return true would leave the census
  // green while proving nothing.
  assert.equal(findOrphans([{ file: 'fixture.js', line: 1, permissions: ['nonexistent.permission'] }]).length, 1,
    'the orphan detector must flag an unheld requirement');

  assert.deepEqual(findOrphans(permissionRequirementGroups()), [],
    'every permission a route requires must be held by at least one non-wildcard bundle, or be declared SUPER_ADMIN-exclusive with a reason');
});

test('REC-005: the eight permissions appendix A.2 called unassigned are all closed, and each is closed deliberately', async () => {
  const model = parseSeedSection();
  for (const [role, resource, action] of parseRemediationGrants()) model.get(role).push([resource, action]);
  await useStore(storeFrom(model));

  const resolved = role => adminRbac.resolvePermissionSet({ uid: `${role}-eight`, claims: { role } });
  const admin = resolved('ADMIN');
  const auditor = resolved('AUDITOR');
  const support = resolved('SUPPORT');

  // 1. system.config.read — the default read permission for every unlisted admin
  //    path. Closed for ADMIN by the action hierarchy, not by a new grant.
  assert.equal(adminRbac.satisfies(admin, 'system.config.read'), true, 'ADMIN reads settings via system.config:write');
  assert.equal(adminRbac.satisfies(auditor, 'system.config.read'), false,
    'AUDITOR still cannot read unlisted admin paths — that is REC-006 route mapping, not a bundle gap');

  // 2. system.config.manage — appears only inside any-of lists (index.js:4646-4650)
  //    next to permissions ADMIN already holds, so no grant is required.
  assert.equal(adminRbac.satisfies(admin, 'system.config.write'), true, 'ADMIN satisfies the coupons any-of list');
  assert.equal(adminRbac.satisfies(admin, 'system.config.manage'), false, 'ADMIN was never granted the manage action');

  // 3. payments.write — implied by payments:manage.
  assert.equal(adminRbac.satisfies(admin, 'payments.write'), true, 'payments:manage implies payments.write');
  assert.equal(adminRbac.satisfies(auditor, 'payments.write'), false, 'AUDITOR is read-only');

  // 4. secrets.manage — deliberately SUPER_ADMIN-exclusive.
  assert.equal(adminRbac.satisfies(admin, 'secrets.manage'), false, 'the service-account key stays SUPER_ADMIN-exclusive');

  // 5. messages.read — the one real gap, closed by §B.
  assert.equal(adminRbac.satisfies(support, 'messages.read'), true, 'SUPPORT owns the contact-form queue');
  assert.equal(adminRbac.satisfies(admin, 'messages.read'), true, 'ADMIN sees contact messages in the console');
  assert.equal(adminRbac.satisfies(auditor, 'messages.read'), false, 'AUDITOR is compliance, not customer correspondence');

  // 6./7. users.export and users.security.manage — both appear only as alternatives
  //       to a permission the role already holds.
  assert.equal(adminRbac.satisfies(admin, 'users.read'), true, 'closes the any-of at routes/adminUsers.js:1181');
  assert.equal(adminRbac.satisfies(admin, 'users.update'), true, 'closes the any-of at routes/adminUsers.js:1075,1113,1135,1155');

  // 8. tenant.support.access — an alternative to a role membership test, verified
  //    against the source rather than asserted from memory.
  const tenantService = fs.readFileSync(path.join(__dirname, '..', 'enterprise', 'tenantService.js'), 'utf8');
  const eligible = tenantService.match(/return \[([^\]]+)\]\.includes\(role\)/);
  assert.ok(eligible, 'tenantService must still express support-access eligibility as a role list');
  assert.deepEqual([...eligible[1].matchAll(/'([^']+)'/g)].map(match => match[1]), ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
    'every eligible role must exist in the RBAC vocabulary, and SUPPORT/ADMIN must be among them');
});

test('REC-005: describeResolution reports the authority source, and cache invalidation is immediate', async () => {
  await useStore(storeFrom(new Map([['ADMIN', [['users', 'read']]]])));
  const healthy = adminRbac.describeResolution();
  assert.equal(healthy.source, 'database');
  assert.equal(healthy.degraded, false);

  adminRbac.invalidateRbacCache();
  const cold = adminRbac.describeResolution();
  assert.equal(cold.source, 'literal-fallback');
  assert.equal(adminRbac.satisfies(auth.permissionsFor({ claims: { role: 'ADMIN' } }), 'users.update'), true,
    'a cold cache must still resolve pre-028 authority for ADMIN');
});
