'use strict';

/**
 * GAP-22 regression suite: Super Admin User 360 → tenant assignment.
 *
 * The production defect: POST /api/admin/users/:uid/tenants called the strict
 * mysqlTenantRegistry.grantMembership contract without resolving the required
 * tenant-owned workspaceId, so every assignment attempt failed with a generic
 * HTTP 400 ("Workspace identifier must be a UUID").
 *
 * These tests drive the REAL HTTP surface (global requireAuth + enforceApiPolicy
 * RBAC) against an injected in-memory tenant registry wrapped in a strict
 * production-parity spy: the spy rejects any grantMembership call that arrives
 * without a UUID workspaceId exactly like mysqlTenantRegistry.assertUuid does.
 * Passing here therefore proves the route resolves the canonical workspace at
 * the correct abstraction boundary.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { setRepositoryForTests } = require('../repositories');
const { InMemoryTenantRegistry } = require('./helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('./helpers/inMemoryEnterpriseRepository');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantService } = require('../enterprise/tenantService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const tokens = {
  super: { uid: 'gap22-super', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_second_factor: 'totp' } },
  admin: { uid: 'gap22-admin', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) },
  support: { uid: 'gap22-support', email: 'support@example.com', email_verified: true, role: 'SUPPORT', auth_time: Math.floor(Date.now() / 1000) },
  auditor: { uid: 'gap22-auditor', email: 'auditor@example.com', email_verified: true, role: 'AUDITOR', auth_time: Math.floor(Date.now() / 1000) },
  user: { uid: 'gap22-user', email: 'member@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
};

setTokenVerifierForTests(async token => {
  const key = String(token || '').replace('Bearer ', '');
  if (tokens[key]) return tokens[key];
  throw new Error('invalid token');
});

setRepositoryForTests({ recordAdminAuditLog: async () => ({ ok: true }) });

const app = require('../index');

let registry;
const grantCalls = [];

function bearer(name) {
  return { Authorization: `Bearer ${name}` };
}

/**
 * Wraps the in-memory registry with the production mysqlTenantRegistry
 * workspaceId contract: grantMembership must receive a UUID workspaceId or it
 * throws INVALID_TENANT_CONTEXT 400 (exactly assertUuid's failure). Any route
 * regression that drops the workspace resolution fails this suite immediately,
 * the same way it failed in production.
 */
function installTenantService() {
  registry = new InMemoryTenantRegistry();
  grantCalls.length = 0;
  const originalGrant = registry.grantMembership.bind(registry);
  registry.grantMembership = async input => {
    grantCalls.push({ ...input });
    if (!UUID_PATTERN.test(String(input?.workspaceId || ''))) {
      throw Object.assign(new Error('Workspace identifier must be a UUID'), { code: 'INVALID_TENANT_CONTEXT', status: 400 });
    }
    return originalGrant(input);
  };
  app.set('tenantService', new TenantService({
    registry,
    repository: new InMemoryEnterpriseRepository(),
    serviceAccountStore: new InMemoryServiceAccountStore(),
    supportGrantStore: new InMemorySupportGrantStore(),
  }));
}

test.beforeEach(() => {
  installTenantService();
});

async function provisionOrg(slug) {
  return registry.provisionTenant({ ownerPrincipalId: tokens.super.uid, displayName: `Org ${slug}`, slug });
}

test('GAP-22: Super Admin tenant assignment resolves the default workspace and persists membership', async () => {
  const { tenantId, workspaceId } = await provisionOrg('acme-main');
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_MEMBER', isPrimary: true });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  assert.equal(res.body.alreadyMember, false);
  assert.ok(res.body.workspace, 'response must name the workspace that was used');
  assert.equal(res.body.workspace.id, workspaceId, 'must bind the tenant canonical default workspace');
  assert.equal(res.body.workspace.isDefault, true);
  assert.equal(res.body.workspace.resolution, 'DEFAULT');
  assert.match(res.body.message, /default workspace/i);
  assert.equal(res.body.source, 'MARIADB_TENANT_REGISTRY');

  // The strict contract received a concrete tenant-owned workspaceId.
  assert.equal(grantCalls.length, 1);
  assert.equal(grantCalls[0].workspaceId, workspaceId);

  // Membership persisted: tenant membership bound to the default workspace…
  const membership = await registry.getMembership(tenantId, tokens.user.uid);
  assert.equal(membership.status, 'ACTIVE');
  assert.equal(membership.workspaceId, workspaceId);
  assert.deepEqual(membership.roles, ['ENTERPRISE_MEMBER']);
  // …and the workspace membership row exists in the same tenant.
  const workspaceMembers = await registry.listWorkspaceMembers({ tenantId, workspaceId });
  assert.ok(workspaceMembers.some(m => m.principalId === tokens.user.uid));
});

test('GAP-22: assignment surfaces workspace context and is visible to User 360 refresh path', async () => {
  const { tenantId, workspaceId } = await provisionOrg('acme-refresh');
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_ADMIN' });
  assert.equal(res.status, 200);
  assert.equal(res.body.membership.workspaceId, workspaceId);
  // User 360 reads the same registry: listMemberships must expose the binding.
  // Shape-tolerant access mirrors the route's defensive projection (production
  // returns flattened rows; the in-memory helper nests membership/tenant).
  const memberships = await registry.listMemberships(tokens.user.uid);
  const bound = memberships.find(m => (m.tenantId || m.tenant?.id) === tenantId);
  assert.ok(bound);
  assert.equal(bound.workspaceId || bound.membership?.workspaceId, workspaceId);
});

test('GAP-22: tenant with no usable workspace fails with actionable 409, not a generic 400', async () => {
  const { tenantId, workspaceId } = await provisionOrg('acme-empty');
  // Simulate storage drift the defensive branch exists for: tenant row alive,
  // workspace rows gone (the supported flows make this unreachable, removing
  // the default workspace is blocked by WORKSPACE_DEFAULT_PROTECTED).
  registry.workspaces.delete(workspaceId);

  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_MEMBER' });

  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, 'TENANT_NO_USABLE_WORKSPACE');
  assert.match(res.body.error, /no active workspace/i);
  assert.match(res.body.error, /create or reactivate a workspace/i);
  assert.equal(grantCalls.length, 0, 'registry contract must not be called without a workspace');
  await assert.rejects(() => registry.getMembership(tenantId, tokens.user.uid), /not found/i);
});

test('GAP-22: invalid tenant id fails deterministically', async () => {
  const missing = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId: crypto.randomUUID(), role: 'ENTERPRISE_MEMBER' });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'TENANT_NOT_FOUND');

  const malformed = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId: 'not-a-uuid', role: 'ENTERPRISE_MEMBER' });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, 'INVALID_TENANT_CONTEXT');

  const empty = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ role: 'ENTERPRISE_MEMBER' });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.code, 'TENANT_ID_REQUIRED');
});

test('GAP-22: suspended tenant cannot receive members', async () => {
  const { tenantId } = await provisionOrg('acme-suspended');
  await registry.setTenantLifecycleState({ tenantId, nextState: 'SUSPENDED' });
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_MEMBER' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'TENANT_INACTIVE');
  assert.match(res.body.error, /reactivate/i);
  assert.equal(grantCalls.length, 0);
});

test('GAP-22: workspace from another tenant is rejected — cross-tenant isolation holds', async () => {
  const orgA = await provisionOrg('acme-alpha');
  const orgB = await provisionOrg('acme-beta');
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId: orgA.tenantId, workspaceId: orgB.workspaceId, role: 'ENTERPRISE_MEMBER' });
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal(res.body.code, 'WORKSPACE_NOT_FOUND');
  // No partial membership leaked into either tenant.
  await assert.rejects(() => registry.getMembership(orgA.tenantId, tokens.user.uid));
  await assert.rejects(() => registry.getMembership(orgB.tenantId, tokens.user.uid));
});

test('GAP-22: malformed explicit workspace id returns 400 INVALID_WORKSPACE_ID', async () => {
  const { tenantId } = await provisionOrg('acme-uuid');
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, workspaceId: 'workspace-123', role: 'ENTERPRISE_MEMBER' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_WORKSPACE_ID');
  assert.equal(grantCalls.length, 0);
});

test('GAP-22: explicit tenant-owned workspace is honored and validated', async () => {
  const { tenantId } = await provisionOrg('acme-explicit');
  const secondary = await registry.createWorkspace({ tenantId, name: 'Secondary Workspace' });
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, workspaceId: secondary.id, role: 'MEMBER' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.workspace.id, secondary.id);
  assert.equal(res.body.workspace.isDefault, false);
  assert.equal(res.body.workspace.resolution, 'EXPLICIT');
  const membership = await registry.getMembership(tenantId, tokens.user.uid);
  assert.equal(membership.workspaceId, secondary.id);
});

test('GAP-22: duplicate assignment is an honest idempotent update, alreadyMember is reported', async () => {
  const { tenantId, workspaceId } = await provisionOrg('acme-dupe');
  const first = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_MEMBER' });
  assert.equal(first.status, 200);
  assert.equal(first.body.alreadyMember, false);

  const second = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_ADMIN' });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.alreadyMember, true);
  assert.match(second.body.message, /already a member/i);

  // Exactly one membership row, revision bumped, role updated — no duplicates.
  const memberships = await registry.listTenantMemberships(tenantId);
  const rows = memberships.filter(m => m.principalId === tokens.user.uid);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].roles, ['ENTERPRISE_ADMIN']);
  assert.equal(rows[0].workspaceId, workspaceId);
  assert.ok(Number(rows[0].revision) >= 2);
});

test('GAP-22: RBAC — USER/SUPPORT/AUDITOR receive 403 regardless of UI visibility', async () => {
  const { tenantId } = await provisionOrg('acme-rbac');
  for (const role of ['user', 'support', 'auditor']) {
    const res = await request(app)
      .post(`/api/admin/users/${tokens.user.uid}/tenants`)
      .set(bearer(role))
      .send({ tenantId, role: 'ENTERPRISE_MEMBER' });
    assert.equal(res.status, 403, `role ${role} must be denied`);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  }
  assert.equal(grantCalls.length, 0);
  await assert.rejects(() => registry.getMembership(tenantId, tokens.user.uid));
});

test('GAP-22: unauthenticated request fails closed with 401', async () => {
  const { tenantId } = await provisionOrg('acme-anon');
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .send({ tenantId, role: 'ENTERPRISE_MEMBER' });
  assert.equal(res.status, 401);
  assert.equal(grantCalls.length, 0);
});

test('GAP-22: invalid role and invalid uid are validated before any registry work', async () => {
  const { tenantId } = await provisionOrg('acme-validate');
  const badRole = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'DEFINITELY_NOT_A_ROLE' });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.code, 'INVALID_TENANT_ROLE');

  const badUid = await request(app)
    .post('/api/admin/users/bad%20uid!!/tenants')
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_MEMBER' });
  assert.equal(badUid.status, 400);
  assert.equal(badUid.body.code, 'INVALID_USER_ID');
});

test('GAP-22: removal revokes tenant + workspace membership atomically (lifecycle)', async () => {
  const { tenantId, workspaceId } = await provisionOrg('acme-revoke');
  const assign = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId, role: 'ENTERPRISE_MEMBER' });
  assert.equal(assign.status, 200);

  const removed = await request(app)
    .delete(`/api/admin/users/${tokens.user.uid}/tenants/${tenantId}`)
    .set(bearer('super'));
  assert.equal(removed.status, 200, JSON.stringify(removed.body));

  // Production deletes the row (getMembership → 404); the in-memory helper
  // tombstones it. Either way the active-membership views must be clean.
  const membershipAfter = await registry.getMembership(tenantId, tokens.user.uid).then(m => m).catch(() => null);
  assert.ok(!membershipAfter || membershipAfter.status === 'REMOVED');
  const tenantMembers = await registry.listTenantMemberships(tenantId);
  assert.ok(!tenantMembers.some(m => m.principalId === tokens.user.uid && String(m.status).toUpperCase() === 'ACTIVE'));
  const members = await registry.listWorkspaceMembers({ tenantId, workspaceId });
  assert.ok(!members.some(m => m.principalId === tokens.user.uid), 'no orphan workspace membership');
});

test('GAP-22: tenant isolation — assigned member is invisible to other tenants', async () => {
  const orgA = await provisionOrg('acme-one');
  const orgB = await provisionOrg('acme-two');
  const res = await request(app)
    .post(`/api/admin/users/${tokens.user.uid}/tenants`)
    .set(bearer('super'))
    .send({ tenantId: orgA.tenantId, role: 'MEMBER' });
  assert.equal(res.status, 200);

  const inA = await registry.getMembership(orgA.tenantId, tokens.user.uid);
  assert.equal(inA.tenantId, orgA.tenantId);
  await assert.rejects(() => registry.getMembership(orgB.tenantId, tokens.user.uid));
  const bMembers = await registry.listTenantMemberships(orgB.tenantId);
  assert.ok(!bMembers.some(m => m.principalId === tokens.user.uid));
});

// ─── Second broken call site: platform tenant member registry ────────────────
// POST /api/admin/platform/tenants/:tenantId/members had the identical defect
// (grantMembership without workspaceId) and is repaired through the same
// canonical resolution boundary. Identity lookup is stubbed to keep the
// tenant/workspace contract, not the identity directory, under test.

function installIdentityDirectory() {
  const previous = app.get('firebaseAdmin');
  app.set('firebaseAdmin', {
    auth: () => ({
      getUser: async uid => ({ uid, email: `${uid}@example.com`, emailVerified: true, disabled: false }),
      getUserByEmail: async email => ({ uid: String(email).split('@')[0], email, emailVerified: true, disabled: false }),
    }),
  });
  return () => app.set('firebaseAdmin', previous);
}

test('GAP-22: platform member registry resolves default workspace and persists', async () => {
  const restore = installIdentityDirectory();
  try {
    const { tenantId, workspaceId } = await provisionOrg('acme-ops');
    const res = await request(app)
      .post(`/api/admin/platform/tenants/${tenantId}/members`)
      .set(bearer('super'))
      .send({ uid: 'ops-member-1', role: 'MEMBER' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.workspace.id, workspaceId);
    assert.equal(res.body.workspace.isDefault, true);
    assert.match(res.body.message, /default workspace/i);
    const membership = await registry.getMembership(tenantId, 'ops-member-1');
    assert.equal(membership.workspaceId, workspaceId);
  } finally {
    restore();
  }
});

test('GAP-22: platform member registry rejects cross-tenant workspace and empty-workspace tenants', async () => {
  const restore = installIdentityDirectory();
  try {
    const orgA = await provisionOrg('acme-ops-a');
    const orgB = await provisionOrg('acme-ops-b');
    const crossTenant = await request(app)
      .post(`/api/admin/platform/tenants/${orgA.tenantId}/members`)
      .set(bearer('super'))
      .send({ uid: 'ops-member-2', workspaceId: orgB.workspaceId });
    assert.equal(crossTenant.status, 404);
    assert.equal(crossTenant.body.code, 'WORKSPACE_NOT_FOUND');

    registry.workspaces.delete(orgB.workspaceId);
    const noWorkspace = await request(app)
      .post(`/api/admin/platform/tenants/${orgB.tenantId}/members`)
      .set(bearer('super'))
      .send({ uid: 'ops-member-3' });
    assert.equal(noWorkspace.status, 409);
    assert.equal(noWorkspace.body.code, 'TENANT_NO_USABLE_WORKSPACE');
  } finally {
    restore();
  }
});

test('GAP-22: platform member registry — SUPPORT and AUDITOR are denied, suspension blocks assignment', async () => {
  const restore = installIdentityDirectory();
  try {
    const { tenantId } = await provisionOrg('acme-ops-rbac');
    for (const role of ['support', 'auditor', 'user']) {
      const res = await request(app)
        .post(`/api/admin/platform/tenants/${tenantId}/members`)
        .set(bearer(role))
        .send({ uid: 'ops-member-4' });
      assert.equal(res.status, 403, `role ${role} must be denied`);
    }

    await registry.setTenantLifecycleState({ tenantId, nextState: 'SUSPENDED' });
    const suspended = await request(app)
      .post(`/api/admin/platform/tenants/${tenantId}/members`)
      .set(bearer('super'))
      .send({ uid: 'ops-member-5' });
    assert.equal(suspended.status, 403);
    assert.equal(suspended.body.code, 'TENANT_INACTIVE');
  } finally {
    restore();
  }
});
