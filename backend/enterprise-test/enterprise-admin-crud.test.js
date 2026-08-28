'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { InMemoryTenantRegistry } = require('../test/helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('../test/helpers/inMemoryEnterpriseRepository');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

const tokens = {
  alice: { uid: 'alice-admin-crud', email: 'alice@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  admin: { uid: 'platform-admin-crud', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) },
};

function bearer(name) {
  return `Bearer ${name}`;
}

function installService() {
  const registry = new InMemoryTenantRegistry();
  const serviceAccountStore = new InMemoryServiceAccountStore();
  const supportGrantStore = new InMemorySupportGrantStore();
  app.set('tenantService', new TenantService({ registry, repository: new InMemoryEnterpriseRepository(), serviceAccountStore, supportGrantStore }));
  return { registry, serviceAccountStore, supportGrantStore };
}

async function resolveTenant(name) {
  const response = await request(app).get('/api/enterprise/context').set('Authorization', bearer(name));
  assert.equal(response.status, 200);
  return { tenantId: response.body.context.tenantId, workspaceId: response.body.context.workspaceId, tenantHeader: response.headers['x-tenant-context'] };
}

test.beforeEach(() => {
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return tokens[token];
  });
  installService();
});

test('tenant owner can create and list a new workspace', async () => {
  const { tenantId, tenantHeader } = await resolveTenant('alice');
  const created = await request(app)
    .post('/api/enterprise/workspaces')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .send({ name: 'Europe Operations' });
  assert.equal(created.status, 201);
  assert.equal(created.body.workspace.name, 'Europe Operations');
  assert.equal(created.body.workspace.tenantId, tenantId);

  const list = await request(app)
    .get('/api/enterprise/workspaces')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader);
  assert.equal(list.status, 200);
  assert.ok(list.body.workspaces.some(ws => ws.name === 'Europe Operations'));
});

test('service account create, list, and revoke lifecycle is tenant scoped', async () => {
  const { tenantHeader } = await resolveTenant('alice');
  const created = await request(app)
    .post('/api/enterprise/service-accounts')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .send({ displayName: 'Workday HR Integration M2M', scopes: ['resource.read', 'ai.use'] });
  assert.equal(created.status, 201);
  assert.match(created.body.apiKey, /^rpa_/);
  const accountId = created.body.serviceAccount.id;

  const list = await request(app)
    .get('/api/enterprise/service-accounts')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader);
  assert.equal(list.status, 200);
  const listed = list.body.serviceAccounts.find(account => account.id === accountId);
  assert.ok(listed);
  assert.deepEqual(listed.scopes, ['resource.read', 'ai.use']);

  const revoked = await request(app)
    .post(`/api/enterprise/service-accounts/${accountId}/revoke`)
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader);
  assert.equal(revoked.status, 204);

  const after = await request(app)
    .get('/api/enterprise/service-accounts')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader);
  assert.ok(!after.body.serviceAccounts.some(account => account.id === accountId));

  const doubleRevoke = await request(app)
    .post(`/api/enterprise/service-accounts/${accountId}/revoke`)
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader);
  assert.equal(doubleRevoke.status, 404);
});

test('service account and workspace operations cannot cross tenant boundaries', async () => {
  const alice = await resolveTenant('alice');
  // A different principal using Alice's tenant header has no membership.
  const denied = await request(app)
    .get('/api/enterprise/service-accounts')
    .set('Authorization', bearer('admin'))
    .set('X-Tenant-Id', alice.tenantHeader);
  assert.equal(denied.status, 404);
});

test('support grants can be created, listed, and revoked by a tenant owner within the active tenant', async () => {
  const { workspaceId, tenantHeader } = await resolveTenant('alice');
  const created = await request(app)
    .post('/api/enterprise/support-grants')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: tokens.admin.uid, reason: 'Diagnose ATS integration mapping for this tenant', expiresInMinutes: 30, scopes: ['tenant.audit.read'] });
  assert.equal(created.status, 201);
  const grantId = created.body.grant.id;
  assert.equal(created.body.grant.workspaceId, workspaceId);

  const list = await request(app)
    .get('/api/enterprise/support-grants')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .set('X-Workspace-Id', workspaceId);
  assert.equal(list.status, 200);
  assert.ok(list.body.grants.some(grant => grant.id === grantId));

  const revoked = await request(app)
    .post(`/api/enterprise/support-grants/${grantId}/revoke`)
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .set('X-Workspace-Id', workspaceId);
  assert.equal(revoked.status, 204);
});

test('tenant owner can update roles and remove a member, but not the last owner', async () => {
  const { tenantHeader } = await resolveTenant('alice');
  const granted = await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .send({ principalId: 'member-1', roles: ['MEMBER'] });
  assert.equal(granted.status, 201);

  const updated = await request(app)
    .patch('/api/enterprise/memberships/member-1')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .send({ roles: ['TENANT_ADMIN'] });
  assert.equal(updated.status, 200);
  assert.ok(updated.body.membership.roles.includes('TENANT_ADMIN'));

  const removed = await request(app)
    .delete('/api/enterprise/memberships/member-1')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader);
  assert.equal(removed.status, 204);

  // Alice is the sole owner; she cannot remove or demote herself.
  const selfRemove = await request(app)
    .delete('/api/enterprise/memberships/alice-admin-crud')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader);
  assert.equal(selfRemove.status, 409);

  const selfDemote = await request(app)
    .patch('/api/enterprise/memberships/alice-admin-crud')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantHeader)
    .send({ roles: ['MEMBER'] });
  assert.equal(selfDemote.status, 409);
});
