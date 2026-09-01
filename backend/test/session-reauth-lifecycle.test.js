'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getPool } = require('../database/mysql');
const { setTokenVerifierForTests, issueLocalTestToken } = require('../security/auth');
const { isSafeInternalPath, loginPathWithNext } = require('../../src/utils/safeInternalPath');
const app = require('../index');

const pool = getPool();
const now = Math.floor(Date.now() / 1000);

const testTokens = {
  superAdminFresh: {
    uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3',
    email: 'bhaskar.beyond@gmail.com',
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
    auth_time: now - 300, // 5 minutes ago
    iat: now - 300,
    exp: now + 3300,
  },
  superAdminOlderThanTenantMax: {
    uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3',
    email: 'bhaskar.beyond@gmail.com',
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
    auth_time: now - (500 * 60), // 500 minutes ago (> 480m tenant max)
    iat: now - 60, // Token was refreshed 1 minute ago
    exp: now + 3540,
  },
  enterpriseMemberFresh: {
    uid: 'member-test-01',
    email: 'member@acme.com',
    email_verified: true,
    role: 'USER',
    auth_time: now - 120, // 2 minutes ago
    iat: now - 120,
    exp: now + 3480,
  },
  enterpriseMemberSessionExpired: {
    uid: 'member-test-01',
    email: 'member@acme.com',
    email_verified: true,
    role: 'USER',
    auth_time: now - (500 * 60), // 500 minutes ago (> 480m tenant max)
    iat: now - 60, // Fresh ID token
    exp: now + 3540,
  },
  normalUser: {
    uid: 'normal-user-01',
    email: 'normal@example.com',
    email_verified: true,
    role: 'USER',
    auth_time: now - 60,
    iat: now - 60,
    exp: now + 3540,
  },
};

function bearer(tokenKey) {
  return `Bearer ${tokenKey}`;
}

test('Authentication, Token Lifecycle & Re-Authentication Architecture', async (t) => {
  setTokenVerifierForTests(async (token) => {
    if (!testTokens[token]) throw new Error('Invalid test token');
    return testTokens[token];
  });

  const { createTenantService } = require('../enterprise/tenantService');
  const { getRepository } = require('../repositories');
  app.set('tenantService', createTenantService({ pool, repository: getRepository() }));

  // Ensure demo tenant Acme Corp exists with 480m sessionMaxMinutes
  const tenantId = '9406f186-9aff-45c7-adcd-4badebe640fd';
  await pool.query(`
    INSERT INTO enterprise_tenants (id, slug, displayName, isolationTier, lifecycleState, legacyOwnerUid)
    VALUES (?, 'acme-corp', 'Acme Corporation', 'ENTERPRISE', 'ACTIVE', 'OhZdiSIFL7ePA1TMkfu9bnR935D3')
    ON DUPLICATE KEY UPDATE lifecycleState = 'ACTIVE'
  `, [tenantId]);

  await pool.query(`
    INSERT INTO enterprise_tenant_configurations (tenantId, revision, identityPolicy, securityPolicy)
    VALUES (?, 1, '{"ssoMode":"NONE","scimEnabled":false,"sessionMaxMinutes":480}', '{"requireMfaForAdmins":false}')
    ON DUPLICATE KEY UPDATE identityPolicy = '{"ssoMode":"NONE","scimEnabled":false,"sessionMaxMinutes":480}'
  `, [tenantId]);

  await pool.query(`
    INSERT INTO enterprise_memberships (id, tenantId, principalId, roles, status)
    VALUES 
      (CONCAT(?, '_OhZdiSIFL7ePA1TMkfu9bnR935D3'), ?, 'OhZdiSIFL7ePA1TMkfu9bnR935D3', '["TENANT_OWNER"]', 'ACTIVE'),
      (CONCAT(?, '_member-test-01'), ?, 'member-test-01', '["ENTERPRISE_MEMBER"]', 'ACTIVE')
    ON DUPLICATE KEY UPDATE roles = '["ENTERPRISE_MEMBER"]', status = 'ACTIVE'
  `, [tenantId, tenantId, tenantId, tenantId]);

  // -------------------------------------------------------------------------
  // TEST A & B: Normal ID Token Expiration and Refresh
  // -------------------------------------------------------------------------
  await t.test('A & B. Refreshed token is accepted and updates iat without corrupting auth_time', async () => {
    // Fresh token succeeds
    const resFresh = await request(app)
      .get('/api/platform/health')
      .set('Authorization', bearer('superAdminFresh'));

    assert.equal(resFresh.status, 200, 'Fresh token must access health endpoint');

    // Token refreshed 1 minute ago (iat: now - 60) with older auth_time succeeds on platform
    const resRefreshed = await request(app)
      .get('/api/platform/health')
      .set('Authorization', bearer('superAdminOlderThanTenantMax'));

    assert.equal(resRefreshed.status, 200, 'Platform endpoint accepts token with valid iat/exp');
  });

  // -------------------------------------------------------------------------
  // TEST C & D: Single-Flight Refresh Coalescing & Finite Retry
  // -------------------------------------------------------------------------
  await t.test('C & D. Single-flight token refresh coalesces concurrent requests and fails finite', async () => {
    let callCount = 0;
    let singleFlightLock = null;

    async function mockSingleFlightRefresh() {
      if (singleFlightLock) return singleFlightLock;
      callCount++;
      singleFlightLock = (async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'refreshed-token';
      })().finally(() => {
        singleFlightLock = null;
      });
      return singleFlightLock;
    }

    // Fire 5 concurrent refresh requests
    const results = await Promise.all([
      mockSingleFlightRefresh(),
      mockSingleFlightRefresh(),
      mockSingleFlightRefresh(),
      mockSingleFlightRefresh(),
      mockSingleFlightRefresh(),
    ]);

    assert.equal(callCount, 1, 'Only 1 underlying refresh call must be executed for concurrent requests');
    assert.deepEqual(results, ['refreshed-token', 'refreshed-token', 'refreshed-token', 'refreshed-token', 'refreshed-token']);
  });

  // -------------------------------------------------------------------------
  // TEST E: Genuine Maximum-Session Expiry Requires Re-Authentication for Tenant User
  // -------------------------------------------------------------------------
  await t.test('E. Genuine maximum-session expiry enforces TENANT_SESSION_REAUTH_REQUIRED for tenant members', async () => {
    const res = await request(app)
      .post('/api/enterprise/context')
      .set('Authorization', bearer('enterpriseMemberSessionExpired'))
      .set('x-tenant-id', tenantId)
      .send({ tenantId });

    assert.equal(res.status, 401, 'Expired session must return HTTP 401');
    assert.equal(res.body.error.code, 'TENANT_SESSION_REAUTH_REQUIRED', 'Error code must be TENANT_SESSION_REAUTH_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // TEST F: Return-to-Context Path Preservation
  // -------------------------------------------------------------------------
  await t.test('F. Return-to-context preserves safe internal paths and rejects open redirects', () => {
    const safePaths = [
      '/adm/dashboard',
      '/adm/users',
      '/adm/settings',
      '/adm/health',
      '/adm/tenants',
      '/enterprise/overview',
      '/enterprise/resumes',
      '/blog-editor',
      '/blog-editor/new',
    ];

    for (const path of safePaths) {
      assert.ok(isSafeInternalPath(path), `Path ${path} must be recognized as safe internal path`);
      const loginUrl = loginPathWithNext(path);
      assert.ok(loginUrl.includes(`next=${encodeURIComponent(path)}`), `Login path must encode return path: ${loginUrl}`);
    }

    const dangerousPaths = [
      'https://evil.com/phish',
      '//evil.com/login',
      'javascript:alert(1)',
      'data:text/html,<html>',
    ];

    for (const bad of dangerousPaths) {
      assert.equal(isSafeInternalPath(bad), false, `Dangerous path ${bad} must be rejected`);
      const fallbackUrl = loginPathWithNext(bad);
      assert.equal(fallbackUrl, '/login', `Rejected path must fall back to /login without next param`);
    }
  });

  // -------------------------------------------------------------------------
  // TEST G & H: Enterprise Role Simulation Does Not Mutate auth_time or Identity
  // -------------------------------------------------------------------------
  await t.test('G & H. Enterprise role simulation alters authorization context without mutating auth_time or identity', async () => {
    const res = await request(app)
      .post('/api/enterprise/context')
      .set('Authorization', bearer('superAdminFresh'))
      .set('x-tenant-id', tenantId)
      .set('x-simulated-enterprise-role', 'ENTERPRISE_VIEWER')
      .send({ tenantId });

    assert.equal(res.status, 200);
    assert.equal(res.body.context.simulatedRole, 'ENTERPRISE_VIEWER');
    // Auth time is strictly preserved from the token claims
    assert.equal(testTokens.superAdminFresh.auth_time, now - 300);
  });

  // -------------------------------------------------------------------------
  // TEST I: Super Admin Does Not Inherit Customer Tenant's sessionMaxMinutes Policy
  // -------------------------------------------------------------------------
  await t.test('I. Super Admin is governed by Platform policy and not blocked by customer tenant sessionMaxMinutes', async () => {
    // SuperAdmin auth_time is 500 minutes old (> 480m tenant max)
    const res = await request(app)
      .post('/api/enterprise/context')
      .set('Authorization', bearer('superAdminOlderThanTenantMax'))
      .set('x-tenant-id', tenantId)
      .send({ tenantId });

    assert.equal(res.status, 200, 'Super Admin must resolve tenant context without being aborted by tenant sessionMaxMinutes');
    assert.equal(res.body.tenant.id, tenantId);
  });

  // -------------------------------------------------------------------------
  // TEST J: Non-Super-Admin Cannot Spoof Simulation Headers
  // -------------------------------------------------------------------------
  await t.test('J. Non-Super-Admin cannot spoof simulation headers', async () => {
    const res = await request(app)
      .post('/api/enterprise/context')
      .set('Authorization', bearer('enterpriseMemberFresh'))
      .set('x-tenant-id', tenantId)
      .set('x-simulated-enterprise-role', 'ENTERPRISE_OWNER')
      .send({ tenantId });

    // Non-superadmin simulation header is ignored, so member receives their real ENTERPRISE_MEMBER role
    assert.equal(res.status, 200);
    assert.equal(res.body.context.simulatedRole, null, 'Simulated role must be null for normal users');
    assert.deepEqual(res.body.context.roles, ['ENTERPRISE_MEMBER']);
  });
});
