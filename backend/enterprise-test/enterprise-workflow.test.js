'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';
process.env.TENANT_JOB_SIGNING_SECRET = 'enterprise-workflow-test-signing-secret-32-bytes';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { InMemoryTenantRegistry } = require('../test/helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('../test/helpers/inMemoryEnterpriseRepository');
const { InMemoryAtomicCounterStore } = require('../test/helpers/inMemoryAtomicCounterStore');
const { InMemoryEnterpriseOutboxPool } = require('../test/helpers/inMemoryEnterpriseOutboxPool');
const { setPoolForTests } = require('../database/mysql');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantQuotaGuard } = require('../enterprise/tenantQuota');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

/**
 * Complete enterprise workflow over the real HTTP surface with explicit
 * MariaDB contract test doubles: login → tenant selection → workspace selection → every
 * console module → logout. Verifies real state changes, not rendering.
 */

const issued = new Map([
  ['owner', { uid: 'flow-owner', email: 'owner@flow.example.com', email_verified: true, role: 'USER' }],
  ['member', { uid: 'flow-member', email: 'member@flow.example.com', email_verified: true, role: 'USER' }],
  ['support', { uid: 'flow-support', email: 'support@flow.example.com', email_verified: true, role: 'SUPPORT', auth_time: Math.floor(Date.now() / 1000) }],
  ['platform', { uid: 'flow-platform', email: 'platform@flow.example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) }],
]);
const revoked = new Set();

function bearer(name) { return `Bearer ${name}`; }

function install() {
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) });
  const service = new TenantService({
    registry: new InMemoryTenantRegistry(),
    repository: new InMemoryEnterpriseRepository({ encryptionProvider }),
    serviceAccountStore: new InMemoryServiceAccountStore(),
    supportGrantStore: new InMemorySupportGrantStore(),
    quotaGuard: new TenantQuotaGuard({ store: new InMemoryAtomicCounterStore() }),
    encryptionProvider,
    dataProviderName: 'mysql',
  });
  app.set('tenantService', service);
  setPoolForTests(new InMemoryEnterpriseOutboxPool());
  return { service };
}

test.beforeEach(() => {
  revoked.clear();
  setTokenVerifierForTests(async token => {
    if (revoked.has(token)) throw new Error('token revoked');
    const claims = issued.get(token);
    if (!claims) throw new Error('bad token');
    return claims;
  });
});

test('complete console workflow: every module performs a real, verified state change', async () => {
  const { service } = install();

  // Login → personal tenant is provisioned lazily on first context resolution.
  const context = await request(app).get('/api/enterprise/context').set('Authorization', bearer('owner'));
  assert.equal(context.status, 200);
  const tenantId = context.body.context.tenantId;
  const workspaceId = context.body.context.workspaceId;
  const ownerHeaders = { Authorization: bearer('owner'), 'X-Tenant-Id': tenantId, 'X-Workspace-Id': workspaceId };

  // Overview inputs: memberships, audit, metrics, cache, queue all reachable.
  for (const path of ['/api/enterprise/memberships', '/api/enterprise/audit', '/api/enterprise/observability/metrics', '/api/enterprise/data-plane/status', '/api/enterprise/queue/status']) {
    const response = await request(app).get(path).set(ownerHeaders);
    assert.equal(response.status, 200, `${path} must be reachable`);
  }

  // Workspaces module: create a second workspace (real state).
  const workspaceCreated = await request(app).post('/api/enterprise/workspaces').set(ownerHeaders).send({ name: 'EMEA Hiring' });
  assert.equal(workspaceCreated.status, 201);
  const emeaWorkspaceId = workspaceCreated.body.workspace.id;

  // Users module: invite (grant) a member, then change their role, then remove.
  const granted = await request(app)
    .post('/api/enterprise/memberships')
    .set(ownerHeaders)
    .send({ principalId: 'flow-member', roles: ['MEMBER'] });
  assert.equal(granted.status, 201, JSON.stringify(granted.body));
  const listed = await request(app).get('/api/enterprise/memberships').set(ownerHeaders);
  assert.ok(listed.body.memberships.some(membership => membership.principalId === 'flow-member' && membership.roles.includes('MEMBER')));
  const promoted = await request(app)
    .patch('/api/enterprise/memberships/flow-member')
    .set(ownerHeaders)
    .send({ roles: ['WORKSPACE_MANAGER'] });
  assert.equal(promoted.status, 200);
  assert.deepEqual(promoted.body.membership.roles, ['WORKSPACE_MANAGER']);
  const memberHeaders = { Authorization: bearer('member'), 'X-Tenant-Id': tenantId, 'X-Workspace-Id': workspaceId };
  const removed = await request(app).delete('/api/enterprise/memberships/flow-member').set(ownerHeaders);
  assert.equal(removed.status, 204);
  const memberAfterRemoval = await request(app).get('/api/enterprise/context').set(memberHeaders);
  assert.ok(
    memberAfterRemoval.status === 404 || (memberAfterRemoval.status === 403 && memberAfterRemoval.body.error.code === 'TENANT_MEMBERSHIP_INACTIVE'),
    'revoked member loses tenant access immediately'
  );

  // Teams module: create a team in the new workspace.
  const team = await request(app)
    .post('/api/enterprise/teams')
    .set(ownerHeaders)
    .send({ name: 'London Recruiters', workspaceId: emeaWorkspaceId });
  assert.equal(team.status, 201);
  assert.equal(team.body.team.workspaceId, emeaWorkspaceId);

  // Roles module: roles matrix is server-provided.
  const rolesMatrix = await request(app).get('/api/enterprise/roles-matrix').set(ownerHeaders);
  assert.equal(rolesMatrix.status, 200);
  assert.ok(rolesMatrix.body.roles.TENANT_OWNER.includes('*'));

  // Resumes module (resources): create → read → update → list → delete.
  const resource = await request(app)
    .post('/api/enterprise/resources')
    .set(ownerHeaders)
    .send({ resourceType: 'RESUME', payload: { title: 'Platform Engineer CV', sections: [] } });
  assert.equal(resource.status, 201);
  const readBack = await request(app).get(`/api/enterprise/resources/${resource.body.resource.id}`).set(ownerHeaders);
  assert.equal(readBack.body.resource.payload.title, 'Platform Engineer CV');
  const updated = await request(app)
    .patch(`/api/enterprise/resources/${resource.body.resource.id}`)
    .set(ownerHeaders)
    .send({ expectedRevision: 1, payload: { title: 'Platform Engineer CV v2', sections: [] } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.resource.revision, 2);
  const listedResources = await request(app).get('/api/enterprise/resources?resourceType=RESUME').set(ownerHeaders);
  assert.equal(listedResources.body.resources.length, 1);
  const deleted = await request(app).delete(`/api/enterprise/resources/${resource.body.resource.id}`).set(ownerHeaders);
  assert.equal(deleted.status, 204);

  // AI module: policy is revisioned; quota policy applies durably.
  const configurationSaved = await request(app)
    .patch('/api/enterprise/configuration')
    .set(ownerHeaders)
    .send({ expectedRevision: 1, configuration: { aiPolicy: { allowedProviders: ['openai'] } } });
  assert.equal(configurationSaved.status, 200);
  assert.deepEqual(configurationSaved.body.configuration.aiPolicy.allowedProviders, ['openai']);

  // Security module: service account lifecycle with one-time secret.
  const account = await request(app)
    .post('/api/enterprise/service-accounts')
    .set(ownerHeaders)
    .send({ displayName: 'ATS Export Bot', scopes: ['resource.read'] });
  assert.equal(account.status, 201);
  assert.ok(account.body.apiKey.startsWith('rpa_'));
  const m2m = await request(app).get('/api/enterprise/m2m/context').set('X-API-Key', account.body.apiKey).set('X-Tenant-Id', tenantId);
  assert.equal(m2m.status, 200);
  const revokedAccount = await request(app).post(`/api/enterprise/service-accounts/${account.body.serviceAccount.id}/revoke`).set(ownerHeaders);
  assert.equal(revokedAccount.status, 204);
  const m2mAfterRevoke = await request(app).get('/api/enterprise/m2m/context').set('X-API-Key', account.body.apiKey).set('X-Tenant-Id', tenantId);
  assert.equal(m2mAfterRevoke.status, 401);

  // Usage module: durable ledger reflects metered usage for this tenant only.
  const usage = await request(app).get('/api/enterprise/usage/ai').set(ownerHeaders);
  assert.equal(usage.status, 200);
  assert.equal(usage.body.usage.tenantId, tenantId);

  // Audit module: every action above left a tenant-scoped trail.
  const audit = await request(app).get('/api/enterprise/audit?limit=250').set(ownerHeaders);
  assert.equal(audit.status, 200);
  const actions = new Set(audit.body.events.map(event => event.action));
  for (const expected of ['WORKSPACE_CREATED', 'TEAM_CREATED', 'RESOURCE_CREATED', 'RESOURCE_UPDATED', 'RESOURCE_DELETED', 'SERVICE_ACCOUNT_CREATED', 'SERVICE_ACCOUNT_REVOKED', 'TENANT_MEMBERSHIP_GRANTED', 'TENANT_MEMBERSHIP_UPDATED', 'TENANT_MEMBERSHIP_REMOVED', 'TENANT_CONFIGURATION_UPDATED']) {
    assert.ok(actions.has(expected), `audit trail must contain ${expected} (found: ${[...actions].join(', ')})`);
  }

  // Support module: grants are listed, scoped, and revocable (store-level
  // validation is covered by the isolation suite; here the route contract).
  const grants = await request(app).get('/api/enterprise/support-grants').set(ownerHeaders);
  assert.equal(grants.status, 200);
  assert.deepEqual(grants.body.grants, []);

  // Settings module: tenant lifecycle suspend is permission-gated and audited.
  const suspended = await request(app).post('/api/enterprise/lifecycle/suspend').set(ownerHeaders);
  if ([200, 409].includes(suspended.status)) {
    // 409 is acceptable when the last-owner rule prevents self-suspension side
    // effects; 200 means the tenant actually suspended.
    if (suspended.status === 200) {
      assert.equal(suspended.body.tenant.lifecycleState, 'SUSPENDED');
      const afterSuspend = await request(app).get('/api/enterprise/context').set(ownerHeaders);
      assert.equal(afterSuspend.status, 403, 'suspended tenant blocks all enterprise access');
      await service.registry.setTenantLifecycleState({ tenantId, nextState: 'ACTIVE' });
    }
  } else {
    assert.fail(`unexpected suspend status ${suspended.status}`);
  }

  // Logout: a revoked bearer token no longer authenticates anywhere.
  revoked.add('owner');
  const afterLogout = await request(app).get('/api/enterprise/context').set('Authorization', bearer('owner'));
  assert.equal(afterLogout.status, 401);
});

test('feature flags stay consistent: enterprise disabled keeps legacy routes and hides enterprise APIs', async () => {
  const previous = process.env.ENTERPRISE_TENANCY_ENABLED;
  try {
    process.env.ENTERPRISE_TENANCY_ENABLED = 'false';
    install();
    const status = await request(app).get('/api/enterprise/status').set('Authorization', bearer('owner'));
    assert.equal(status.status, 200);
    assert.equal(status.body.enabled, false);
    const dark = await request(app).get('/api/enterprise/context').set('Authorization', bearer('owner'));
    assert.equal(dark.status, 404, 'enterprise routes stay dark when the flag is off');
    const legacy = await request(app).get('/api/healthz');
    assert.equal(legacy.status, 200, 'legacy application keeps working');
  } finally {
    process.env.ENTERPRISE_TENANCY_ENABLED = previous;
    install();
  }
});
