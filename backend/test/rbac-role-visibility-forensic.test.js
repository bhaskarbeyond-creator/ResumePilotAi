'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'super_admin') {
    return { uid: 'sa-01', email: 'super@platform.local', email_verified: true, emailVerified: true, role: 'SUPER_ADMIN', auth_time: now, firebase: { sign_in_second_factor: 'totp' } };
  }
  if (token === 'admin') {
    return { uid: 'adm-01', email: 'admin@platform.local', email_verified: true, emailVerified: true, role: 'ADMIN', auth_time: now, firebase: { sign_in_second_factor: 'totp' } };
  }
  if (token === 'auditor') {
    return { uid: 'aud-01', email: 'auditor@platform.local', email_verified: true, emailVerified: true, role: 'AUDITOR', auth_time: now };
  }
  if (token === 'support') {
    return { uid: 'sup-01', email: 'support@platform.local', email_verified: true, emailVerified: true, role: 'SUPPORT', auth_time: now };
  }
  if (token === 'user') {
    return { uid: 'usr-01', email: 'user@platform.local', email_verified: true, emailVerified: true, role: 'USER', auth_time: now };
  }
  if (token === 'ent_owner') {
    return { uid: 'ent-owner-01', email: 'owner@tenant-alpha.com', email_verified: true, emailVerified: true, role: 'ENTERPRISE_OWNER', tenantId: 'tenant-alpha', auth_time: now };
  }
  if (token === 'ent_admin') {
    return { uid: 'ent-adm-01', email: 'admin@tenant-alpha.com', email_verified: true, emailVerified: true, role: 'ENTERPRISE_ADMIN', tenantId: 'tenant-alpha', auth_time: now };
  }
  if (token === 'ent_viewer') {
    return { uid: 'ent-view-01', email: 'viewer@tenant-alpha.com', email_verified: true, emailVerified: true, role: 'ENTERPRISE_VIEWER', tenantId: 'tenant-alpha', auth_time: now };
  }
  throw new Error('Invalid test bearer token');
});

const bearer = roleToken => ({ Authorization: `Bearer ${roleToken}` });

test('RBAC Forensic: Super Admin has authoritative access to all platform and system configuration endpoints', async () => {
  const saAuth = bearer('super_admin');

  // 1. Settings read
  const settingsRes = await request(app).get('/api/admin/settings').set(saAuth);
  assert.equal(settingsRes.status, 200);
  assert.equal(settingsRes.body.success, true);
  assert.ok(settingsRes.body.settings);

  // 2. Health & Operational status (elevated with host diagnostics)
  const healthRes = await request(app).get('/api/platform/operational-status').set(saAuth);
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.body.elevated, true);

  // 3. Operators list
  const opsRes = await request(app).get('/api/platform/operators').set(saAuth);
  assert.equal(opsRes.status, 200);
  assert.ok(Array.isArray(opsRes.body.operators));

  // 4. Global search
  const searchRes = await request(app).get('/api/platform/search?q=test').set(saAuth);
  assert.equal(searchRes.status, 200);
  assert.ok(Array.isArray(searchRes.body.users));
  assert.ok(Array.isArray(searchRes.body.tenants));
  assert.ok(Array.isArray(searchRes.body.orders));
  assert.ok(Array.isArray(searchRes.body.tickets));
});

test('RBAC Forensic: Auditor is strictly limited to Audit, Security, and Read-Only domains; System Configuration and Operators are blocked', async () => {
  const auditorAuth = bearer('auditor');

  // 1. Audit logs & operational status - ALLOWED
  const auditRes = await request(app).get('/api/platform/operational-status').set(auditorAuth);
  assert.equal(auditRes.status, 200);
  assert.equal(auditRes.body.elevated, false); // Host diagnostics omitted

  // 2. Security events - ALLOWED
  const secRes = await request(app).get('/api/platform/security-events').set(auditorAuth);
  assert.equal(secRes.status, 200);

  // 3. System Configuration read - REJECTED (Auditor does not have system.config.read)
  const settingsRes = await request(app).get('/api/admin/settings').set(auditorAuth);
  assert.equal(settingsRes.status, 403);

  // 4. Platform Operators read - REJECTED (Super Admin only)
  const opsRes = await request(app).get('/api/platform/operators').set(auditorAuth);
  assert.equal(opsRes.status, 403);

  // 5. Platform Operators mutation - REJECTED
  const opsMutRes = await request(app).post('/api/platform/operators').set(auditorAuth).send({ uid: 'target-uid', role: 'ADMIN' });
  assert.equal(opsMutRes.status, 403);

  // 6. Scoped Search: gets users/tenants/orders, tickets omitted (no tickets.manage)
  const searchRes = await request(app).get('/api/platform/search?q=test').set(auditorAuth);
  assert.equal(searchRes.status, 200);
  assert.ok(Array.isArray(searchRes.body.users));
  assert.ok(Array.isArray(searchRes.body.tenants));
  assert.ok(Array.isArray(searchRes.body.orders));
  assert.deepEqual(searchRes.body.tickets, []); // Zero tickets leaked to auditor
});

test('RBAC Forensic: Support role is strictly limited to Help Desk and User directory; Settings, Audit and Operators are blocked', async () => {
  const supportAuth = bearer('support');

  // 1. Settings read - REJECTED
  const settingsRes = await request(app).get('/api/admin/settings').set(supportAuth);
  assert.equal(settingsRes.status, 403);

  // 2. Operators - REJECTED
  const opsRes = await request(app).get('/api/platform/operators').set(supportAuth);
  assert.equal(opsRes.status, 403);

  // 3. Security events - REJECTED (Support lacks security.read)
  const secRes = await request(app).get('/api/platform/security-events').set(supportAuth);
  assert.equal(secRes.status, 403);

  // 4. Scoped Search: gets users/tenants/tickets, orders omitted (no payments.read)
  const searchRes = await request(app).get('/api/platform/search?q=test').set(supportAuth);
  assert.equal(searchRes.status, 200);
  assert.ok(Array.isArray(searchRes.body.users));
  assert.ok(Array.isArray(searchRes.body.tenants));
  assert.ok(Array.isArray(searchRes.body.tickets));
  assert.deepEqual(searchRes.body.orders, []); // Zero payment orders leaked to support
});

test('RBAC Forensic: Plain USER role is completely rejected on all administrative routes', async () => {
  const userAuth = bearer('user');

  // 1. Settings
  const settingsRes = await request(app).get('/api/admin/settings').set(userAuth);
  assert.equal(settingsRes.status, 403);

  // 2. Platform overview
  const overviewRes = await request(app).get('/api/platform/overview').set(userAuth);
  assert.equal(overviewRes.status, 403);

  // 3. Platform search
  const searchRes = await request(app).get('/api/platform/search?q=test').set(userAuth);
  assert.equal(searchRes.status, 403);

  // 4. Operators
  const opsRes = await request(app).get('/api/platform/operators').set(userAuth);
  assert.equal(opsRes.status, 403);
});

test('RBAC Forensic: Enterprise roles are strictly scoped and blocked from platform-wide system configuration', async () => {
  const entOwnerAuth = bearer('ent_owner');
  const entAdminAuth = bearer('ent_admin');
  const entViewerAuth = bearer('ent_viewer');

  for (const auth of [entOwnerAuth, entAdminAuth, entViewerAuth]) {
    const settingsRes = await request(app).get('/api/admin/settings').set(auth);
    assert.equal(settingsRes.status, 403);

    const opsRes = await request(app).get('/api/platform/operators').set(auth);
    assert.equal(opsRes.status, 403);

    const dbRes = await request(app).get('/api/admin/database-settings').set(auth);
    assert.equal(dbRes.status, 403);
  }
});

test('RBAC Forensic: Unauthenticated requests are rejected fail-closed with 401', async () => {
  const res1 = await request(app).get('/api/admin/settings');
  assert.equal(res1.status, 401);

  const res2 = await request(app).get('/api/platform/operational-status');
  assert.equal(res2.status, 401);

  const res3 = await request(app).get('/api/platform/search?q=test');
  assert.equal(res3.status, 401);
});

test('RBAC Forensic: Sensitive Credentials Redaction Contract (Zero Plaintext Secrets Leaked)', async () => {
  const saAuth = bearer('super_admin');
  const res = await request(app).get('/api/admin/settings').set(saAuth);
  assert.equal(res.status, 200);

  const json = JSON.stringify(res.body);
  assert.doesNotMatch(json, /AIzaSy[A-Za-z0-9_-]{20,}/); // No raw Firebase/Google API keys
  assert.doesNotMatch(json, /nvapi-[A-Za-z0-9_-]{20,}/); // No raw NVIDIA API keys
  assert.doesNotMatch(json, /sk_live_[A-Za-z0-9_-]{20,}/); // No raw Stripe live secret keys
  assert.doesNotMatch(json, /rzp_live_[A-Za-z0-9_-]{10,}/); // No raw Razorpay live secret keys
});

test.after(() => {
  setTimeout(() => process.exit(0), 100);
});
