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
    const auth = read('security/auth.js');
    const support = auth.match(/\n  SUPPORT:\s*\[([\s\S]*?)\]/)?.[1] || '';
    const auditor = auth.match(/\n  AUDITOR:\s*\[([\s\S]*?)\]/)?.[1] || '';
    const admin = auth.match(/\n  ADMIN:\s*\[([\s\S]*?)\]/)?.[1] || '';
    assert.match(support, /tickets\.manage/);
    assert.match(admin, /tickets\.manage/);
    assert.doesNotMatch(auditor, /tickets\.manage/);
    assert.doesNotMatch(support, /system\.config\.read/);
    assert.doesNotMatch(support, /security\.read/);
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
