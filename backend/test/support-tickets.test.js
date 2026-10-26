'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('support ticket RBAC and ownership source contracts', () => {
  it('grants tickets.manage to SUPPORT and ADMIN, not AUDITOR', () => {
    // Asserted against the resolved bundle rather than by regexing a source file: the
    // literals moved to `security/permissionVocabulary.js` in REC-004, and a test that
    // greps one file goes green or red based on *where* the data lives rather than on what
    // the role may do. Resolving is also stronger — it proves the grant survives the
    // hierarchy expansion and the alias mapping a handler actually sees.
    // `permissionsForRole` returns `{ set, source }` — the set plus where it came from,
    // which is what the resolver and the census both need.
    const { permissionsForRole, satisfies } = require('../services/adminRbac');
    const support = permissionsForRole('SUPPORT').set;
    const admin = permissionsForRole('ADMIN').set;
    const auditor = permissionsForRole('AUDITOR').set;

    assert.equal(satisfies(support, 'tickets.manage'), true);
    assert.equal(satisfies(admin, 'tickets.manage'), true);
    assert.equal(satisfies(auditor, 'tickets.manage'), false, 'an auditor reads the trail; it does not answer tickets');
    assert.equal(satisfies(support, 'system.config.read'), false, 'support must not hold platform configuration');
    assert.equal(satisfies(support, 'security.read'), false);
  });

  it('keeps user ticket routes off the admin write gate and staffs admin routes with tickets.manage', () => {
    const routes = read('routes/support.js');
    assert.match(routes, /userRouter\.post\('\/tickets'/);
    assert.match(routes, /userRouter\.get\('\/tickets'/);
    assert.match(routes, /adminRouter\.use\(requirePermission\('tickets\.manage'\)\)/);
    assert.doesNotMatch(routes, /userRouter\.use\(requirePermission/);
    const index = read('index.js');
    assert.match(index, /app\.use\('\/api\/support', supportUserRouter\)/);
    assert.match(index, /app\.use\('\/api\/admin\/support', supportAdminRouter\)/);
    assert.match(index, /req\.path === '\/support' \|\| req\.path\.startsWith\('\/support\/'\)/);
    assert.match(index, /requirePermission\('tickets\.manage'\)/);
  });

  it('scopes consumer reads to the owner uid and lets staff bypass that filter', () => {
    const service = read('services/supportTickets.js');
    assert.match(service, /if \(!rows\.length \|\| \(!staff && rows\[0\]\.user_id !== uid\)\)/);
    assert.match(service, /FROM support_tickets WHERE user_id = \?/);
    assert.match(service, /staff = false/);
  });

  it('does not reuse contact_messages for the help desk', () => {
    const migration = read('database/migrations/015_support_tickets.sql');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS support_tickets/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS support_ticket_messages/);
    assert.match(migration, /REFERENCES users\(id\)/);
    assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS contact_messages/);
    const deletion = read('services/accountDeletion.js');
    assert.match(deletion, /DELETE FROM support_tickets WHERE user_id = \?/);
  });
});
