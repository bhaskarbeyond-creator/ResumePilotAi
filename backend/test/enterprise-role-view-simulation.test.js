'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { getPool } = require('../database/mysql');
const app = require('../index');

const tokens = {
  superAdmin: {
    uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3',
    email: 'bhaskar.beyond@gmail.com',
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
    permissions: ['*'],
    auth_time: Math.floor(Date.now() / 1000)
  },
  normalUser: {
    uid: 'normal-user-123',
    email: 'normal.user@example.com',
    email_verified: true,
    role: 'USER',
    superAdmin: false,
    permissions: [],
    auth_time: Math.floor(Date.now() / 1000)
  }
};

function bearer(userType) {
  return `Bearer ${userType}`;
}

test('Enterprise Role View & Simulation Security Architecture', async (t) => {
  setTokenVerifierForTests(async (token) => {
    if (!tokens[token]) throw new Error('Invalid test token');
    return tokens[token];
  });

  const pool = getPool();
  const { createTenantService } = require('../enterprise/tenantService');
  const { getRepository } = require('../repositories');
  app.set('tenantService', createTenantService({ pool, repository: getRepository() }));

  let [tenants] = await pool.query('SELECT id, slug, displayName FROM enterprise_tenants WHERE lifecycleState = "ACTIVE" LIMIT 2');
  if (tenants.length < 2) {
    const tenant1Id = '9406f186-9aff-45c7-adcd-4badebe640fd';
    const tenant2Id = 'df0adba6-f39c-4f69-b123-5d58c2aaf263';
    await pool.query(`
      INSERT INTO enterprise_tenants (id, slug, displayName, isolationTier, lifecycleState, legacyOwnerUid)
      VALUES 
        (?, 'acme-corp', 'Acme Corporation', 'ENTERPRISE', 'ACTIVE', 'OhZdiSIFL7ePA1TMkfu9bnR935D3'),
        (?, 'global-tech', 'Global Tech Industries', 'STANDARD', 'ACTIVE', 'OhZdiSIFL7ePA1TMkfu9bnR935D3')
      ON DUPLICATE KEY UPDATE lifecycleState = 'ACTIVE'
    `, [tenant1Id, tenant2Id]);

    await pool.query(`
      INSERT INTO enterprise_workspaces (id, tenantId, name, lifecycleState, isDefault)
      VALUES 
        ('4b7d68fc-dc68-4835-8f08-7479e3400294', ?, 'Default Workspace', 'ACTIVE', TRUE),
        ('d3731679-5831-4e0d-baba-b4cc55d94828', ?, 'Global Workspace', 'ACTIVE', TRUE)
      ON DUPLICATE KEY UPDATE lifecycleState = 'ACTIVE'
    `, [tenant1Id, tenant2Id]);

    await pool.query(`
      INSERT INTO enterprise_memberships (id, tenantId, principalId, roles, status)
      VALUES 
        (CONCAT(?, '_OhZdiSIFL7ePA1TMkfu9bnR935D3'), ?, 'OhZdiSIFL7ePA1TMkfu9bnR935D3', '["TENANT_OWNER"]', 'ACTIVE'),
        (CONCAT(?, '_OhZdiSIFL7ePA1TMkfu9bnR935D3'), ?, 'OhZdiSIFL7ePA1TMkfu9bnR935D3', '["TENANT_OWNER"]', 'ACTIVE')
      ON DUPLICATE KEY UPDATE status = 'ACTIVE'
    `, [tenant1Id, tenant1Id, tenant2Id, tenant2Id]);

    [tenants] = await pool.query('SELECT id, slug, displayName FROM enterprise_tenants WHERE lifecycleState = "ACTIVE" LIMIT 2');
  }
  assert.ok(tenants.length >= 2, 'Must have at least 2 active tenants in MariaDB for isolation testing');

  const tenantA = tenants[0];
  const tenantB = tenants[1];

  await t.test('1. role-view-audit accepts all 5 Enterprise roles when caller is Super Admin', async () => {
    const rolesToTest = [
      'ENTERPRISE_OWNER',
      'ENTERPRISE_ADMIN',
      'ENTERPRISE_MANAGER',
      'ENTERPRISE_MEMBER',
      'ENTERPRISE_VIEWER'
    ];

    for (const role of rolesToTest) {
      const res = await request(app)
        .post('/api/platform/role-view-audit')
        .set('Authorization', bearer('superAdmin'))
        .send({ targetRole: role, tenantId: tenantA.id });

      assert.equal(res.status, 200, `Expected 200 for ${role}, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.success, true);
      assert.equal(res.body.realRole, 'SUPER_ADMIN');
      assert.equal(res.body.viewRole, role);
      assert.equal(res.body.isEnterprise, true);
      assert.equal(res.body.tenant.id, tenantA.id);
    }
  });

  await t.test('2. role-view-audit strictly requires a valid tenant UUID for Enterprise roles', async () => {
    // Missing tenantId
    const resNoTenant = await request(app)
      .post('/api/platform/role-view-audit')
      .set('Authorization', bearer('superAdmin'))
      .send({ targetRole: 'ENTERPRISE_ADMIN' });
    assert.equal(resNoTenant.status, 400);
    assert.equal(resNoTenant.body.error.code, 'INVALID_TENANT_ID');

    // Invalid non-existent tenant UUID
    const resFakeTenant = await request(app)
      .post('/api/platform/role-view-audit')
      .set('Authorization', bearer('superAdmin'))
      .send({ targetRole: 'ENTERPRISE_ADMIN', tenantId: '00000000-0000-4000-8000-000000000000' });
    assert.equal(resFakeTenant.status, 404);
    assert.equal(resFakeTenant.body.error.code, 'TENANT_NOT_FOUND');
  });

  await t.test('3. Non-SuperAdmin cannot invoke role-view-audit', async () => {
    const res = await request(app)
      .post('/api/platform/role-view-audit')
      .set('Authorization', bearer('normalUser'))
      .send({ targetRole: 'ENTERPRISE_ADMIN', tenantId: tenantA.id });
    assert.equal(res.status, 403);
  });

  await t.test('4. Enterprise context simulation: Viewer has strictly scoped permissions', async () => {
    const res = await request(app)
      .post('/api/enterprise/context')
      .set('Authorization', bearer('superAdmin'))
      .set('x-tenant-id', tenantA.id)
      .set('x-simulated-enterprise-role', 'ENTERPRISE_VIEWER')
      .send({ tenantId: tenantA.id });

    assert.equal(res.status, 200);
    assert.equal(res.body.context.simulatedRole, 'ENTERPRISE_VIEWER');
    assert.ok(res.body.context.roles.includes('ENTERPRISE_VIEWER'));
    // Viewer must NOT have '*' or 'tenant.settings.write'
    assert.ok(!res.body.context.permissions.includes('*'), 'Viewer must not have * permission');
    assert.ok(!res.body.context.permissions.includes('tenant.settings.write'), 'Viewer must not have tenant.settings.write');
    assert.ok(res.body.context.permissions.includes('workspace.read'), 'Viewer must have workspace.read');
    assert.equal(res.body.platformAdmin, false, 'Viewer platformAdmin capability must be false');
  });

  await t.test('5. Non-SuperAdmin cannot spoof simulated enterprise role', async () => {
    const res = await request(app)
      .post('/api/enterprise/context')
      .set('Authorization', bearer('normalUser'))
      .set('x-tenant-id', tenantA.id)
      .set('x-simulated-enterprise-role', 'ENTERPRISE_OWNER')
      .send({ tenantId: tenantA.id });

    // Normal user does not have membership in tenantA and is not superadmin, so fails closed
    assert.ok([403, 404].includes(res.status), `Expected 403 or 404 for unauthorized user, got ${res.status}`);
  });

  await t.test('6. Server authorization: Simulated Viewer cannot perform mutation actions', async () => {
    // Attempt to create a workspace while simulating ENTERPRISE_VIEWER
    const res = await request(app)
      .post('/api/enterprise/workspaces')
      .set('Authorization', bearer('superAdmin'))
      .set('x-tenant-id', tenantA.id)
      .set('x-simulated-enterprise-role', 'ENTERPRISE_VIEWER')
      .send({ name: 'Unauthorized Workspace' });

    assert.equal(res.status, 403, 'Simulated Viewer must be blocked by requireTenantPermission from creating workspaces');
    assert.equal(res.body.error.code, 'TENANT_FORBIDDEN');
  });

  await t.test('7. Server authorization: Simulated Manager cannot inspect tenant audit logs', async () => {
    // Attempt to view audit logs while simulating WORKSPACE_MANAGER
    const res = await request(app)
      .get('/api/enterprise/audit')
      .set('Authorization', bearer('superAdmin'))
      .set('x-tenant-id', tenantA.id)
      .set('x-simulated-enterprise-role', 'WORKSPACE_MANAGER');

    assert.equal(res.status, 403, 'Simulated Manager must be blocked by requireTenantPermission from reading audit logs');
    assert.equal(res.body.error.code, 'TENANT_FORBIDDEN');
  });

  await t.test('8. Multi-tenant isolation: Tenant A cannot access Tenant B workspace', async () => {
    const [wsB] = await pool.query('SELECT id FROM enterprise_workspaces WHERE tenantId = ? LIMIT 1', [tenantB.id]);
    assert.ok(wsB.length > 0, 'Tenant B workspace must exist');

    // Attempt to modify workspace belonging to Tenant B while scoped to Tenant A as OWNER
    const res = await request(app)
      .patch(`/api/enterprise/workspaces/${wsB[0].id}`)
      .set('Authorization', bearer('superAdmin'))
      .set('x-tenant-id', tenantA.id)
      .set('x-simulated-enterprise-role', 'ENTERPRISE_OWNER')
      .send({ name: 'Cross Tenant Breach' });

    assert.equal(res.status, 404, `Cross-tenant workspace request must fail closed with 404, got ${res.status}`);
  });
});
