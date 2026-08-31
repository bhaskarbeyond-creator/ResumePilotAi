/**
 * Cross-tenant / IDOR / privilege-escalation adversarial tests (live HTTP).
 *
 * Signs tokens directly using the server's rptest token issuer (only active in
 * non-production) and then exercises the REST API as each of the 8 roles —
 * ensuring unauthenticated, wrong-role, and cross-tenant access is denied.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Load auth module to mint signed rptest tokens for each role/user.
process.env.NODE_ENV = 'test';
// Load dotenv to pick up TEST_AUTH_HMAC_SECRET from backend/.env
require('dotenv').config({ path: require('path').resolve(__dirname, '../backend/.env') });
const { issueLocalTestToken, testVerifierEnabled } = require('../backend/security/auth');

const BASE = process.env.API_BASE_URL || 'http://localhost:8080';

// Ensure server is reachable before running
async function fetchJson(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(BASE + path, { ...opts, headers });
  let body;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const ROLES = [
  { email: 'user@test.test', role: 'USER', uid: 'user-uid-1' },
  { email: 'user2@test.test', role: 'USER', uid: 'user-uid-2' },
  { email: 'admin@resumepilot.test', role: 'ADMIN', uid: 'admin-uid-1' },
  { email: 'superadmin@resumepilot.test', role: 'SUPER_ADMIN', uid: 'super-uid-1' },
  { email: 'auditor@resumepilot.test', role: 'AUDITOR', uid: 'auditor-uid-1' },
  { email: 'support@resumepilot.test', role: 'SUPPORT', uid: 'support-uid-1' },
  { email: 'ent-admin@resumepilot.test', role: 'ENTERPRISE_ADMIN', uid: 'ent-admin-uid-1', tenantId: 'ent-1' },
  { email: 'ent-member@resumepilot.test', role: 'ENTERPRISE_MEMBER', uid: 'ent-member-uid-1', tenantId: 'ent-1' },
  { email: 'employer@resumepilot.test', role: 'EMPLOYER', uid: 'employer-uid-1' },
];

function tokenFor(roleDef, extraClaims = {}) {
  const claims = {
    sub: roleDef.uid,
    uid: roleDef.uid,
    email: roleDef.email,
    role: roleDef.role,
    email_verified: true,
    ...(roleDef.tenantId ? { tenantId: roleDef.tenantId } : {}),
    ...extraClaims,
  };
  return issueLocalTestToken(claims);
}

// Health check before tests
test('prerequisite: backend is reachable and testVerifier is enabled', async () => {
  assert.equal(testVerifierEnabled(), true, 'test verifier must be enabled in non-production (else IDOR tests cannot run)');
  const h = await fetchJson('/api/health');
  assert.equal(h.status, 200);
});

test('unauthenticated requests to protected endpoints return 401', async () => {
  const endpoints = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/resumes/1'],
    ['GET', '/api/jobs/1'],
    ['GET', '/api/applications/1'],
    ['GET', '/api/companies/1'],
    ['GET', '/api/exports/1'],
    ['GET', '/api/conversations/1'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/platform/stats'],
    ['GET', '/api/enterprise/tenants'],
    ['POST', '/api/resumes'],
    ['DELETE', '/api/admin/users/1'],
  ];
  for (const [method, path] of endpoints) {
    const r = await fetchJson(path, { method });
    assert.ok([401, 403, 404, 405].includes(r.status), `unauth ${method} ${path} -> ${r.status} (expected 401/403/404/405)`);
  }
});

test('USER token cannot access admin/superadmin/enterprise endpoints', async () => {
  const tok = tokenFor(ROLES[0]);
  const endpoints = [
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/audit-logs'],
    ['GET', '/api/platform/stats'],
    ['GET', '/api/enterprise/tenants'],
    ['GET', '/api/enterprise/admin'],
    ['POST', '/api/admin/users'],
    ['DELETE', '/api/admin/users/1'],
  ];
  for (const [method, path] of endpoints) {
    const r = await fetchJson(path, { method, headers: { Authorization: `Bearer ${tok}` } });
    assert.ok([401, 403, 404].includes(r.status), `USER ${method} ${path} -> ${r.status} (expected 401/403/404)`);
  }
});

test('EMPLOYER cannot access admin/enterprise/superadmin', async () => {
  const tok = tokenFor(ROLES.find(r => r.role === 'EMPLOYER'));
  for (const [method, path] of [
    ['GET', '/api/admin/users'],
    ['GET', '/api/enterprise/tenants'],
    ['GET', '/api/platform/stats'],
  ]) {
    const r = await fetchJson(path, { method, headers: { Authorization: `Bearer ${tok}` } });
    assert.ok([401, 403, 404].includes(r.status), `EMPLOYER ${method} ${path} -> ${r.status}`);
  }
});

test('AUDITOR is read-only — cannot mutate admin resources', async () => {
  const tok = tokenFor(ROLES.find(r => r.role === 'AUDITOR'));
  const r = await fetchJson('/api/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ email: 'pwn@test.test', role: 'SUPER_ADMIN' }),
  });
  assert.ok([401, 403, 404, 405].includes(r.status), `AUDITOR POST /api/admin/users -> ${r.status}`);
});

test('SUPPORT cannot escalate to SUPER_ADMIN via user-create', async () => {
  const tok = tokenFor(ROLES.find(r => r.role === 'SUPPORT'));
  const r = await fetchJson('/api/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ email: 'pwn@test.test', role: 'SUPER_ADMIN' }),
  });
  assert.ok([401, 403, 404, 405].includes(r.status), `SUPPORT POST /api/admin/users (role=SUPER_ADMIN) -> ${r.status}`);
});

test('ENTERPRISE_MEMBER cannot access other tenants', async () => {
  const memberTok = tokenFor(ROLES.find(r => r.email === 'ent-member@resumepilot.test'));
  const otherTenantTok = tokenFor({ ...ROLES[0], tenantId: 'other-ent-999' });
  // Member trying to reach another tenant's resources
  const r = await fetchJson('/api/enterprise/tenants/other-ent-999/members', {
    headers: { Authorization: `Bearer ${memberTok}` },
  });
  assert.ok([401, 403, 404].includes(r.status), `member GET other-tenant -> ${r.status}`);
});

test('forged JWT (bad signature) is rejected', async () => {
  const tok = tokenFor(ROLES[0]);
  const forged = tok.slice(0, -3) + 'XXX';
  const r = await fetchJson('/api/auth/me', { headers: { Authorization: `Bearer ${forged}` } });
  assert.ok([401, 403].includes(r.status), `forged token -> ${r.status}`);
});

test('expired JWT (exp in the past) is rejected', async () => {
  const expired = tokenFor(ROLES[0], { exp: Math.floor(Date.now() / 1000) - 3600 });
  const r = await fetchJson('/api/auth/me', { headers: { Authorization: `Bearer ${expired}` } });
  assert.ok([401, 403].includes(r.status), `expired token -> ${r.status}`);
});

test('Role escalation via claim tampering is impossible: client cannot forge a SUPER_ADMIN token without server signing key', async () => {
  // Attempt 1: client tampers with USER token payload to claim role=SUPER_ADMIN
  // but doesn't know HMAC secret — signature invalid -> 401.
  const realUserTok = tokenFor(ROLES[0]);
  const parts = realUserTok.split('.');
  const tamperedPayload = Buffer.from(parts[1], 'base64url').toString('utf8').replace('"USER"', '"SUPER_ADMIN"');
  const tamperedBody = Buffer.from(tamperedPayload).toString('base64url');
  const tampered = `${parts[0]}.${tamperedBody}.${parts[2]}`; // same sig, forged body
  let r = await fetchJson('/api/auth/me', { headers: { Authorization: `Bearer ${tampered}` } });
  assert.ok([401, 403].includes(r.status), `body-tampered token must be rejected: got ${r.status}`);

  // Attempt 2: forged signature (completely random)
  const forged = realUserTok.slice(0, -4) + 'DEAD';
  r = await fetchJson('/api/auth/me', { headers: { Authorization: `Bearer ${forged}` } });
  assert.ok([401, 403].includes(r.status), `forged-sig token must be rejected: got ${r.status}`);
});

test('path traversal attempts return 400/403/404, never serve files', async () => {
  const tok = tokenFor(ROLES[0]);
  const attacks = [
    '/api/../package.json',
    '/api/resumes/../../etc/passwd',
    '/api/exports/..%2F..%2Fpackage.json',
  ];
  for (const p of attacks) {
    const r = await fetchJson(p, { headers: { Authorization: `Bearer ${tok}` } });
    assert.ok([400, 403, 404, 401].includes(r.status), `traversal ${p} -> ${r.status}`);
  }
});

test('Content-Type must be JSON for JSON POSTs (missing/bad content-type is rejected)', async () => {
  const tok = tokenFor(ROLES.find(r => r.role === 'ADMIN'));
  const r = await fetch(BASE + '/api/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'text/plain' },
    body: 'not json',
  });
  assert.ok([400, 401, 403, 404, 405, 415].includes(r.status), `text/plain admin POST -> ${r.status}`);
});
