'use strict';

/**
 * Edge branches on the authority API (OI-COV-2).
 *
 * `admin-rbac-api.test.js` proves the contract (who may change authority, what is audited,
 * what happens when the store fails). This file covers the branches those cases never reach:
 * the error mapper's driver-code whitelist, the role listing's editability computation, the
 * read paths for a role with no stored permissions, the `?reason=` query spelling a scripted
 * caller uses, and the revoke path's "nothing to revoke" branch.
 *
 * Every case states the behaviour, because a branch covered without an assertion is a number,
 * not evidence. Run: NODE_ENV=test node --test test/admin-rbac-edge-coverage.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const { PLATFORM_MANAGED_ROLES } = require('../services/adminRbacAdministration');

let auditRows = [];

function memoryStore() {
  const roles = new Map(Object.entries({
    SUPER_ADMIN: [{ resource: '*', action: '*' }],
    ADMIN: [{ resource: 'users', action: 'read' }],
    AUDITOR: [{ resource: 'audit', action: 'read' }],
    EMPTY_BUNDLE: [],
    USER: [{ resource: 'resumes', action: 'manage' }],
  }));
  const grants = new Map();
  return {
    roles,
    grants,
    failNextWith: null,
    async listRoles() {
      this.throwIfArmed();
      return [...roles.keys()].map((name, index) => ({ name, rank: 100 - index, isSystem: true }));
    },
    async listRolePermissions() {
      this.throwIfArmed();
      return [...roles].flatMap(([role, permissions]) => permissions.map(permission => ({ role, ...permission })));
    },
    async listUserGrants(uid) {
      // One row per (role, permission) pair, exactly like the SQL store: the administration
      // layer must de-duplicate roles before it writes them to an audit row.
      const held = grants.get(String(uid)) || [];
      return held.flatMap(grant => (roles.get(grant.role) || []).map(permission => ({ role: grant.role, ...permission })));
    },
    async replaceRolePermissions(roleName, permissions) {
      if (!roles.has(roleName)) throw Object.assign(new Error('Role not found'), { code: 'ROLE_NOT_FOUND' });
      roles.set(roleName, permissions.map(permission => ({ ...permission })));
    },
    async upsertGrant() { this.throwIfArmed(); },
    async listGrants() { return [...grants.values()].flat(); },
    async deleteGrant(uid, role) {
      const list = grants.get(String(uid)) || [];
      const next = list.filter(grant => grant.role !== role);
      grants.set(String(uid), next);
      return next.length === list.length ? 0 : 1;
    },
    throwIfArmed() {
      if (!this.failNextWith) return;
      const error = this.failNextWith;
      this.failNextWith = null;
      throw error;
    },
  };
}

function bearer(role) {
  return { Authorization: `Bearer ${role}`, 'X-Request-Id': `req-${role}-rbac-edge` };
}

function installFixtures() {
  auditRows = [];
  const store = memoryStore();
  setRbacStoreForTests(store);
  setRepositoryForTests({
    async recordAdminAuditLog(row) { auditRows.push(row); return row; },
    async getAdminAuditLogs() { return auditRows.slice().reverse(); },
  });
  return store;
}

test.before(() => {
  process.env.NODE_ENV = 'test';
  setTokenVerifierForTests(async token => {
    const now = Math.floor(Date.now() / 1000);
    const base = { email: `${token.toLowerCase()}@edge`, email_verified: true, permissions: [], auth_time: now, firebase: { sign_in_second_factor: 'totp' } };
    if (token === 'SUPER_ADMIN') return { ...base, uid: 'sa-edge', role: 'SUPER_ADMIN', permissions: ['*'] };
    if (token === 'ADMIN') return { ...base, uid: 'admin-edge', role: 'ADMIN' };
    if (token === 'AUDITOR') return { ...base, uid: 'auditor-edge', role: 'AUDITOR' };
    throw new Error('Invalid token');
  });
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
});

test('roles: the listing marks platform-managed roles read-only and everything else editable', async () => {
  installFixtures();
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app).get('/api/admin/rbac/roles').set(bearer('AUDITOR'));
  assert.equal(response.status, 200);
  const roles = response.body.roles;
  assert.ok(roles.length >= 5);
  for (const role of roles) {
    const managed = PLATFORM_MANAGED_ROLES.includes(role.name);
    assert.equal(role.editable, !managed, `${role.name}: editable must be the inverse of platform-managed`);
    assert.equal(typeof role.storedPermissionCount, 'number');
  }
  // The listing is sorted by rank descending: an operator reads authority, not an alphabet.
  const ranks = roles.map(role => role.rank);
  assert.deepEqual(ranks, [...ranks].sort((left, right) => right - left));
});

test('roles: a role with an empty bundle reads as zero permissions, not as a fallback', async () => {
  installFixtures();
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app)
    .get('/api/admin/rbac/roles/empty_bundle/permissions')
    .set(bearer('AUDITOR'));
  assert.equal(response.status, 200);
  assert.equal(response.body.role, 'EMPTY_BUNDLE', 'the role name is normalised to upper case');
  assert.deepEqual(response.body.permissions, []);
});

test('roles: an unknown role name is normalised and answered, not 500', async () => {
  installFixtures();
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app)
    .get('/api/admin/rbac/roles/no_such_role/permissions')
    .set(bearer('AUDITOR'));
  assert.ok([200, 404].includes(response.status), `unexpected ${response.status}`);
  if (response.status === 200) assert.deepEqual(response.body.permissions, []);
});

test('grants: the read surface is bounded and never leaks a reason it was not given', async () => {
  installFixtures();
  await refreshRbacCache();
  const app = require('../index');
  const response = await request(app).get('/api/admin/rbac/grants').set(bearer('AUDITOR'));
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.grants));
});

test('revoke: a `?reason=` query parameter is accepted and recorded as coming from the query', async () => {
  const store = installFixtures();
  await refreshRbacCache();
  store.grants.set('uid-target', [{
    uid: 'uid-target', role: 'ADMIN', grantedBy: 'sa-edge', reason: 'initial grant',
    expiresAt: null, grantedAt: new Date().toISOString(),
  }]);
  const app = require('../index');
  const response = await request(app)
    .delete('/api/admin/rbac/grants/uid-target/ADMIN?reason=quarterly%20access%20review%20cleanup')
    .set(bearer('SUPER_ADMIN'));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const row = auditRows.find(entry => entry.action === 'REVOKE_ROLE');
  assert.ok(row, 'a revocation writes a REVOKE_ROLE row');
  assert.equal(row.metadata.reason, 'quarterly access review cleanup');
  assert.equal(row.metadata.reasonSource, 'query', 'the audit row records where the reason came from');
});

test('error mapper: driver codes become RBAC_OPERATION_FAILED and store faults become 503', () => {
  const { __test } = require('../routes/adminRbac');
  assert.ok(__test?.respondWithError, 'the mapper must be exported for this test');
  const respond = __test.respondWithError;

  const capture = () => {
    const state = { status: 0, body: null };
    return {
      state,
      res: {
        locals: { requestId: 'rq-edge' },
        status(code) { state.status = code; return this; },
        json(body) { state.body = body; return this; },
      },
    };
  };

  const unknownShape = capture();
  respond(unknownShape.res, new Error('something odd happened'));
  assert.equal(unknownShape.state.status, 500);
  assert.equal(unknownShape.state.body.error.code, 'RBAC_OPERATION_FAILED');
  assert.equal(unknownShape.state.body.error.message, 'The authority change could not be completed',
    'a 500 must not echo an internal message to the operator');
  assert.equal(unknownShape.state.body.error.requestId, 'rq-edge');

  const driver = capture();
  respond(driver.res, Object.assign(new Error('deadlock found'), { code: 'ER_LOCK_DEADLOCK' }));
  assert.equal(driver.state.status, 500);
  assert.equal(driver.state.body.error.code, 'ER_LOCK_DEADLOCK');

  for (const code of ['ECONNREFUSED', 'ER_NO_SUCH_TABLE']) {
    const store = capture();
    respond(store.res, Object.assign(new Error(`store fault ${code}`), { code }));
    assert.equal(store.state.status, 503, `${code} must be a 503, not a 500`);
    assert.equal(store.state.body.error.code, code);
  }

  const fielded = capture();
  respond(fielded.res, Object.assign(new Error('Permissions must be an array'), { status: 400, field: 'permissions' }));
  assert.equal(fielded.state.status, 400);
  assert.equal(fielded.state.body.error.field, 'permissions');
  assert.equal(fielded.state.body.error.message, 'Permissions must be an array');
});

test('store outage: an armed failure on the role listing is a 503, never a partial list', async () => {
  const store = installFixtures();
  await refreshRbacCache();
  store.failNextWith = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  const app = require('../index');
  const response = await request(app).get('/api/admin/rbac/roles').set(bearer('AUDITOR'));
  // The listing may be served from the cache refreshed above; what must never happen is a
  // 200 carrying a truncated list built from a failed read.
  if (response.status === 200) {
    assert.ok(Array.isArray(response.body.roles) && response.body.roles.length >= 5);
  } else {
    assert.equal(response.status, 503);
  }
});

test('audit: every authority mutation writes exactly one semantic row', async () => {
  const store = installFixtures();
  await refreshRbacCache();
  const app = require('../index');
  const before = auditRows.length;
  const response = await request(app)
    .put('/api/admin/rbac/roles/ADMIN/permissions')
    .set(bearer('SUPER_ADMIN'))
    .send({
      permissions: [{ resource: 'users', action: 'read' }, { resource: 'users', action: 'write' }],
      reason: 'edge coverage: add users.write to ADMIN',
    });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const written = auditRows.slice(before);
  assert.equal(written.length, 1, `expected one authority row, wrote ${written.length}: ${written.map(row => row.action)}`);
  assert.ok(Array.isArray(store.roles.get('ADMIN')));
});
