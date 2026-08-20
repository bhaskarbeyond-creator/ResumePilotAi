'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { InMemoryTenantRegistry } = require('../enterprise/tenantRegistry');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantService } = require('../enterprise/tenantService');
const { enterpriseFeatureEnabled } = require('../routes/enterprise');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

const tokens = {
  alice: { uid: 'alice-enterprise', email: 'alice@example.com', email_verified: true, role: 'USER' },
  bob: { uid: 'bob-enterprise', email: 'bob@example.com', email_verified: true, role: 'USER' },
  admin: { uid: 'admin-enterprise', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) },
  support: { uid: 'support-enterprise', email: 'support@example.com', email_verified: true, role: 'SUPPORT', auth_time: Math.floor(Date.now() / 1000) },
  unverified: { uid: 'unverified-enterprise', email: 'unverified@example.com', email_verified: false, role: 'USER' },
};

function bearer(name) {
  return `Bearer ${name}`;
}

function installService({ serviceAccountStore = null, supportGrantStore = null } = {}) {
  const registry = new InMemoryTenantRegistry();
  app.set('tenantService', new TenantService({ registry, serviceAccountStore, supportGrantStore }));
  return registry;
}

test('enterprise routes are dark by default until an explicit server-side enablement', () => {
  assert.equal(enterpriseFeatureEnabled({}), false);
  assert.equal(enterpriseFeatureEnabled({ ENTERPRISE_TENANCY_ENABLED: 'true' }), true);
  assert.equal(enterpriseFeatureEnabled({ ENTERPRISE_TENANCY_ENABLED: 'FALSE' }), false);
});

test('authenticated rollout status is explicit without resolving or creating tenant data', async () => {
  const response = await request(app).get('/api/enterprise/status').set('Authorization', bearer('alice'));
  assert.equal(response.status, 200);
  assert.equal(response.body.enabled, true);
  assert.equal(response.body.apiVersion, 'tenant-foundation-v1');
});

test.beforeEach(() => {
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return tokens[token];
  });
  installService();
});

test('enterprise context provisions a personal tenant only through authenticated server context resolution', async () => {
  const response = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  assert.equal(response.status, 200);
  assert.match(response.body.context.tenantId, /^[0-9a-f-]{36}$/i);
  assert.equal(response.body.tenant.lifecycleState, 'ACTIVE');
  assert.equal(response.body.workspace.name, 'Personal');
  assert.equal(response.headers['x-tenant-context'], response.body.context.tenantId);

  const list = await request(app).get('/api/enterprise/tenants').set('Authorization', bearer('alice'));
  assert.equal(list.status, 200);
  assert.equal(list.body.tenants.length, 1);
  assert.equal(list.body.tenants[0].personalTenant, true);
});

test('a caller cannot spoof another tenant through x-tenant-id', async () => {
  const alice = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const denied = await request(app)
    .get('/api/enterprise/context')
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', alice.body.context.tenantId);
  assert.equal(denied.status, 404);
  assert.equal(denied.body.error.code, 'TENANT_MEMBERSHIP_NOT_FOUND');
});

test('tenant configuration is revisioned, server-authorized, and rejects stale updates', async () => {
  const context = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const loaded = await request(app).get('/api/enterprise/configuration').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.configuration.revision, 1);
  const saved = await request(app).patch('/api/enterprise/configuration').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId).send({ expectedRevision: 1, configuration: { aiPolicy: { allowedProviders: ['openai'] }, retentionPolicy: { aiMemoryEnabled: false, retentionDays: 90 }, identityPolicy: { ssoMode: 'OIDC', scimEnabled: true, sessionMaxMinutes: 240 } } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.configuration.revision, 2);
  assert.deepEqual(saved.body.configuration.aiPolicy.allowedProviders, ['openai']);
  assert.equal(saved.body.configuration.identityPolicy.ssoMode, 'OIDC');
  assert.equal(saved.body.configuration.identityPolicy.scimEnabled, true);
  const stale = await request(app).patch('/api/enterprise/configuration').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId).send({ expectedRevision: 1, configuration: {} });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'TENANT_CONFIGURATION_CONFLICT');
});

test('tenant teams are workspace-scoped and management is permission-gated', async () => {
  const context = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const created = await request(app).post('/api/enterprise/teams').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId).send({ name: 'Career Reviewers' });
  assert.equal(created.status, 201);
  assert.equal(created.body.team.workspaceId, context.body.workspace.id);
  const listed = await request(app).get('/api/enterprise/teams').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.teams.length, 1);
  const members = await request(app).get('/api/enterprise/memberships').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId);
  assert.equal(members.status, 200);
  assert.equal(members.body.memberships.length, 1);
});

test('service accounts issue one-time API keys and M2M context cannot be spoofed across tenants', async () => {
  installService({ serviceAccountStore: new InMemoryServiceAccountStore() });
  const context = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const created = await request(app)
    .post('/api/enterprise/service-accounts')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', context.body.context.tenantId)
    .send({ displayName: 'CI integration', scopes: ['resource.read', 'ai.use'] });
  assert.equal(created.status, 201);
  assert.match(created.body.apiKey, /^rpa_/);
  assert.equal(created.body.serviceAccount.tenantId, context.body.context.tenantId);

  const m2m = await request(app)
    .get('/api/enterprise/m2m/context')
    .set('X-API-Key', created.body.apiKey)
    .set('X-Tenant-Id', context.body.context.tenantId);
  assert.equal(m2m.status, 200);
  assert.equal(m2m.body.actor.type, 'service');
  assert.equal(m2m.body.context.tenantId, context.body.context.tenantId);
  assert.equal(m2m.body.context.permissions.includes('resource.read'), true);

  const forged = await request(app)
    .get('/api/enterprise/m2m/context')
    .set('X-API-Key', `${created.body.apiKey}x`)
    .set('X-Tenant-Id', context.body.context.tenantId);
  assert.equal(forged.status, 401);
  const wrongTenant = await request(app)
    .get('/api/enterprise/m2m/context')
    .set('X-API-Key', created.body.apiKey)
    .set('X-Tenant-Id', '11111111-1111-4111-8111-111111111111');
  assert.equal(wrongTenant.status, 404);
});

test('support access is explicit, time-limited, workspace-bound and cannot become a tenant backdoor', async () => {
  installService({ supportGrantStore: new InMemorySupportGrantStore() });
  const provisioned = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('admin')).send({ displayName: 'Support Tenant', slug: 'support-tenant' });
  assert.equal(provisioned.status, 201);
  const grant = await request(app)
    .post('/api/enterprise/support-grants')
    .set('Authorization', bearer('admin'))
    .send({ tenantId: provisioned.body.tenant.id, workspaceId: provisioned.body.workspace.id, supportSubjectId: tokens.support.uid, reason: 'Investigate tenant audit event with approved ticket INC-1001', expiresInMinutes: 15, scopes: ['tenant.audit.read'] });
  assert.equal(grant.status, 201);
  const allowed = await request(app)
    .get('/api/enterprise/support/context')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', provisioned.body.tenant.id)
    .set('X-Workspace-Id', provisioned.body.workspace.id);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.actor.type, 'support');
  assert.equal(allowed.body.context.permissions.includes('tenant.audit.read'), true);
  const revoked = await request(app)
    .post(`/api/enterprise/support-grants/${grant.body.grant.id}/revoke`)
    .set('Authorization', bearer('admin'));
  assert.equal(revoked.status, 204);
  const afterRevoke = await request(app)
    .get('/api/enterprise/support/context')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', provisioned.body.tenant.id)
    .set('X-Workspace-Id', provisioned.body.workspace.id);
  assert.equal(afterRevoke.status, 403);
  const wrongSupport = await request(app)
    .get('/api/enterprise/support/context')
    .set('Authorization', bearer('alice'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', provisioned.body.tenant.id)
    .set('X-Workspace-Id', provisioned.body.workspace.id);
  assert.equal(wrongSupport.status, 403);
  const wrongWorkspace = await request(app)
    .get('/api/enterprise/support/context')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', provisioned.body.tenant.id)
    .set('X-Workspace-Id', '11111111-1111-4111-8111-111111111111');
  assert.equal(wrongWorkspace.status, 403);
});

test('tenant owners can suspend their active tenant and future context resolution fails closed', async () => {
  const context = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const suspended = await request(app).post('/api/enterprise/lifecycle/suspend').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId);
  assert.equal(suspended.status, 200);
  assert.equal(suspended.body.tenant.lifecycleState, 'SUSPENDED');
  const denied = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice')).set('X-Tenant-Id', context.body.context.tenantId);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'TENANT_INACTIVE');
  const nonAdmin = await request(app).post(`/api/enterprise/tenants/${context.body.context.tenantId}/reactivate`).set('Authorization', bearer('alice'));
  assert.equal(nonAdmin.status, 403);
  const reactivated = await request(app).post(`/api/enterprise/tenants/${context.body.context.tenantId}/reactivate`).set('Authorization', bearer('admin'));
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.tenant.lifecycleState, 'ACTIVE');
});

test('tenant owners can grant an explicit multi-organization membership without tenant spoofing', async () => {
  const provisioned = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('admin')).send({ displayName: 'Contoso Careers', slug: 'contoso-careers' });
  assert.equal(provisioned.status, 201);
  const granted = await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('admin'))
    .set('X-Tenant-Id', provisioned.body.tenant.id)
    .send({ principalId: tokens.alice.uid, workspaceId: provisioned.body.workspace.id, roles: ['MEMBER'] });
  assert.equal(granted.status, 201);
  assert.equal(granted.body.membership.principalId, tokens.alice.uid);
  const alice = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice')).set('X-Tenant-Id', provisioned.body.tenant.id);
  assert.equal(alice.status, 200);
  assert.equal(alice.body.context.roles.includes('MEMBER'), true);
});

test('legacy APIs reject tenant headers rather than silently mixing UID and tenant contexts', async () => {
  const response = await request(app)
    .post('/api/generate-summary')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', '11111111-1111-4111-8111-111111111111')
    .send({ occupation: 'Engineer' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'TENANT_CONTEXT_UNSUPPORTED_FOR_LEGACY_ROUTE');
});

test('tenant AI route rejects client-controlled scope and fails closed without an RLS-backed usage ledger', async () => {
  const forged = await request(app).post('/api/enterprise/ai/generate-content').set('Authorization', bearer('alice')).send({ operation: 'generate-summary', payload: { tenantId: '11111111-1111-4111-8111-111111111111' } });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error.code, 'CLIENT_AI_CONTEXT_REJECTED');
  const unavailable = await request(app).post('/api/enterprise/ai/generate-content').set('Authorization', bearer('alice')).send({ operation: 'generate-summary', payload: { occupation: 'Engineer' } });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error.code, 'TENANT_AI_METERING_UNAVAILABLE');
});

test('RLS-backed resource routes fail closed when no approved PostgreSQL data plane is configured', async () => {
  const response = await request(app).get('/api/enterprise/resources').set('Authorization', bearer('alice'));
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'TENANT_DATA_PLANE_UNAVAILABLE');
});

test('enterprise foundation requires verified identity and tenant provisioning requires platform permission', async () => {
  const unverified = await request(app).get('/api/enterprise/context').set('Authorization', bearer('unverified'));
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');

  const userProvision = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('alice')).send({ displayName: 'Northwind', slug: 'northwind' });
  assert.equal(userProvision.status, 403);

  const provisioned = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('admin')).send({ displayName: 'Northwind Careers', slug: 'northwind-careers', isolationTier: 'ENTERPRISE' });
  assert.equal(provisioned.status, 201);
  assert.equal(provisioned.body.tenant.isolationTier, 'ENTERPRISE');
  assert.match(provisioned.body.tenant.id, /^[0-9a-f-]{36}$/i);
});
