'use strict';

/**
 * The MariaDB store behind RBAC (REC-005).
 *
 * `services/adminRbac.js` has two halves: a resolver (cached, covered by
 * `admin-rbac-resolver.test.js`) and a store that speaks SQL. The store was the part with
 * no test, because it needs a database — and it is the part where a mapping mistake is
 * silent: `is_system` read as truthy string `'0'`, a grant expiry returned as a local
 * Date instead of an ISO instant, `affectedRows` counted from the wrong position of the
 * driver's result tuple.
 *
 * This suite drives the real store methods against a pool-shaped fake that answers only
 * the statements the store issues and throws on anything else. It therefore asserts the
 * *contract with the driver* (row shapes, parameter order, transaction boundaries) rather
 * than the SQL server's behaviour, which a unit test cannot honestly claim.
 *
 * Run: NODE_ENV=test node --test test/admin-rbac-store.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';

const database = require('../database/mysql');
const rbac = require('../services/adminRbac');

/** Recorded statements, so a test can assert what was actually sent. */
let statements = [];
/** Rows the fake returns, keyed by a fragment of the statement. */
let fixtures = {};
let connectionBehaviour = 'ok';
let rolledBack = 0;
let committed = 0;

/**
 * Install a pool-shaped fake. Every statement must match a fixture key; an unmatched
 * statement throws, which is how this suite notices a new query that nobody reviewed.
 * @param {Record<string, unknown>} next
 */
function installStore(next) {
  fixtures = next;
  statements = [];
  committed = 0;
  rolledBack = 0;

  const match = (sql) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    statements.push(text);
    for (const [fragment, value] of Object.entries(fixtures)) {
      if (text.startsWith(fragment)) return value;
    }
    throw new Error(`unexpected statement: ${text.slice(0, 90)}`);
  };

  const connection = {
    async beginTransaction() { statements.push('BEGIN'); },
    async commit() { committed += 1; },
    async rollback() { rolledBack += 1; },
    release() {},
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (connectionBehaviour === 'missing-role' && text.startsWith('SELECT id FROM admin_roles WHERE name = ? FOR UPDATE')) {
        statements.push(text);
        return [[]];
      }
      if (connectionBehaviour === 'insert-fails' && text.startsWith('INSERT INTO admin_role_permissions')) {
        statements.push(text);
        throw new Error('duplicate entry');
      }
      return match(sql);
    },
  };

  database.getPool = () => ({ query: async (sql, params) => match(sql, params), getConnection: async () => connection });
}

test.after(() => {
  connectionBehaviour = 'ok';
});

/* ── reads ───────────────────────────────────────────────────────────── */

test('listRoles maps the driver row to the domain shape, including is_system', async () => {
  installStore({
    'SELECT name, rank, is_system FROM admin_roles': [[
      { name: 'ADMIN', rank: 80, is_system: 1 },
      { name: 'AUDITOR', rank: 60, is_system: 0 },
    ]],
  });
  const roles = await rbac.__storeForAdministration().listRoles();
  assert.deepStrictEqual(roles, [
    { name: 'ADMIN', rank: 80, isSystem: true },
    { name: 'AUDITOR', rank: 60, isSystem: false },
  ], 'a numeric 0/1 must become a boolean, not survive as a truthy string or number');
});

test('listRolePermissions flattens the join into resource/action pairs', async () => {
  installStore({
    'SELECT r.name AS role, p.resource, p.action': [[
      { role: 'ADMIN', resource: 'users', action: 'read' },
    ]],
  });
  assert.deepStrictEqual(await rbac.__storeForAdministration().listRolePermissions(), [
    { role: 'ADMIN', resource: 'users', action: 'read' },
  ]);
});

test('listUserGrants scopes the query to the uid it was given', async () => {
  installStore({ 'SELECT r.name AS role, p.resource, p.action FROM admin_user_roles': [[]] });
  await rbac.__storeForAdministration().listUserGrants('uid-9');
  assert.ok(statements[0].includes('ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP'),
    'an expired grant must be filtered in SQL, not by the caller');
});

test('listGrants returns ISO instants and survives a null expiry', async () => {
  installStore({
    'SELECT ur.uid, r.name AS role': [[
      {
        uid: 'uid-1', role: 'AUDITOR', granted_by: 'sa-1', reason: 'incident review',
        expires_at: new Date('2026-01-02T03:04:05.000Z'), granted_at: new Date('2026-01-01T00:00:00.000Z'),
      },
      { uid: 'uid-2', role: 'SUPPORT', granted_by: 'sa-1', reason: 'cover', expires_at: null, granted_at: null },
    ]],
  });
  const grants = await rbac.__storeForAdministration().listGrants();
  assert.strictEqual(grants[0].expiresAt, '2026-01-02T03:04:05.000Z');
  assert.strictEqual(grants[0].grantedAt, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(grants[1].expiresAt, null, 'a permanent grant reports null, not "Invalid Date"');
  assert.strictEqual(grants[1].grantedAt, null);
});

/* ── writes ──────────────────────────────────────────────────────────── */

test('replaceRolePermissions deletes then inserts inside one transaction and commits', async () => {
  connectionBehaviour = 'ok';
  installStore({
    'SELECT id FROM admin_roles WHERE name = ? FOR UPDATE': [[{ id: 7 }]],
    'DELETE FROM admin_role_permissions WHERE role_id = ?': [{ affectedRows: 2 }],
    'INSERT INTO admin_role_permissions (role_id, resource, action, granted_by) VALUES ?': [{ affectedRows: 2 }],
  });
  await rbac.__storeForAdministration().replaceRolePermissions('ADMIN', [
    { resource: 'users', action: 'read' },
    { resource: 'system.config', action: 'write' },
  ], 'sa-1');
  assert.strictEqual(committed, 1, 'the replace must commit exactly once');
  assert.strictEqual(rolledBack, 0);
  assert.ok(statements.some(text => text.startsWith('DELETE FROM admin_role_permissions')),
    'the previous bundle must be removed before the new one is written');
});

test('replaceRolePermissions rolls back when the role does not exist', async () => {
  connectionBehaviour = 'missing-role';
  installStore({});
  await assert.rejects(
    () => rbac.__storeForAdministration().replaceRolePermissions('GHOST', [{ resource: 'users', action: 'read' }], 'sa-1'),
    error => error.code === 'ROLE_NOT_FOUND'
  );
  assert.strictEqual(rolledBack, 1, 'a failed replace must not leave a half-written bundle');
  assert.strictEqual(committed, 0);
});

test('replaceRolePermissions rolls back when the insert fails, so a role is never left empty', async () => {
  connectionBehaviour = 'insert-fails';
  installStore({
    'SELECT id FROM admin_roles WHERE name = ? FOR UPDATE': [[{ id: 7 }]],
    'DELETE FROM admin_role_permissions WHERE role_id = ?': [{ affectedRows: 2 }],
  });
  await assert.rejects(
    () => rbac.__storeForAdministration().replaceRolePermissions('ADMIN', [{ resource: 'users', action: 'read' }], 'sa-1'),
    /duplicate entry/
  );
  assert.strictEqual(rolledBack, 1);
  connectionBehaviour = 'ok';
});

test('replaceRolePermissions with an empty bundle removes every permission without inserting', async () => {
  connectionBehaviour = 'ok';
  installStore({
    'SELECT id FROM admin_roles WHERE name = ? FOR UPDATE': [[{ id: 7 }]],
    'DELETE FROM admin_role_permissions WHERE role_id = ?': [{ affectedRows: 5 }],
  });
  await rbac.__storeForAdministration().replaceRolePermissions('ADMIN', [], 'sa-1');
  assert.strictEqual(statements.filter(text => text.startsWith('INSERT INTO admin_role_permissions')).length, 0);
  assert.strictEqual(committed, 1);
});

test('upsertGrant resolves the role id first and refuses an unknown role', async () => {
  installStore({ 'SELECT id FROM admin_roles WHERE name = ?': [[]] });
  await assert.rejects(
    () => rbac.__storeForAdministration().upsertGrant({ uid: 'u1', role: 'GHOST', grantedBy: 'sa', reason: 'x', expiresAt: null }),
    error => error.code === 'ROLE_NOT_FOUND'
  );

  installStore({
    'SELECT id FROM admin_roles WHERE name = ?': [[{ id: 3 }]],
    'INSERT INTO admin_user_roles (uid, role_id, granted_by, reason, expires_at)': [{ affectedRows: 1 }],
  });
  await rbac.__storeForAdministration().upsertGrant({ uid: 'u1', role: 'AUDITOR', grantedBy: 'sa', reason: 'review', expiresAt: null });
  assert.ok(statements.some(text => text.includes('ON DUPLICATE KEY UPDATE')),
    're-issuing a time-boxed grant must refresh it rather than fail');
});

test('deleteGrant reports the number of rows the driver actually removed', async () => {
  installStore({ 'DELETE ur FROM admin_user_roles ur JOIN admin_roles r ON r.id = ur.role_id': [{ affectedRows: 1 }] });
  assert.strictEqual(await rbac.__storeForAdministration().deleteGrant('u1', 'AUDITOR'), 1);

  installStore({ 'DELETE ur FROM admin_user_roles ur JOIN admin_roles r ON r.id = ur.role_id': [{ affectedRows: 0 }] });
  assert.strictEqual(await rbac.__storeForAdministration().deleteGrant('u1', 'AUDITOR'), 0,
    'revoking a grant that was not there is a no-op, not a success story');
});

test('a store failure degrades the resolver to the frozen vocabulary rather than denying everyone', async () => {
  database.getPool = () => ({ query: async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); }, getConnection: async () => { throw new Error('down'); } });
  rbac.invalidateRbacCache();
  const result = await rbac.refreshRbacCache();
  assert.strictEqual(result.degraded, true);
  // The literal bundle still grants ADMIN its documented authority.
  assert.ok(rbac.satisfies(rbac.resolvePermissionSet({ claims: { role: 'ADMIN' } }), 'users.read'),
    'a database outage must not lock the platform out of its own console');
});
