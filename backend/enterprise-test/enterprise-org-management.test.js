'use strict';

// Organization management coverage: workspace rename/archive/restore,
// workspace member administration, team lifecycle and team membership,
// and server-side audit filtering. All authorization is asserted through
// the real HTTP surface with the real policy layer.

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { InMemoryTenantRegistry } = require('../enterprise/tenantRegistry');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

const tokens = {
  owner: { uid: 'org-owner-1', email: 'owner@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  admin: { uid: 'org-admin-1', email: 'admin@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  member: { uid: 'org-member-1', email: 'member@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  viewer: { uid: 'org-viewer-1', email: 'viewer@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  outsider: { uid: 'org-outsider-1', email: 'outsider@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
};

function bearer(name) { return `Bearer ${name}`; }

let registry;

function installService() {
  registry = new InMemoryTenantRegistry();
  app.set('tenantService', new TenantService({
    registry,
    serviceAccountStore: new InMemoryServiceAccountStore(),
    supportGrantStore: new InMemorySupportGrantStore(),
  }));
}

async function resolveContext(name, tenantId = '', workspaceId = '') {
  const req = request(app).get('/api/enterprise/context').set('Authorization', bearer(name));
  if (tenantId) req.set('X-Tenant-Id', tenantId);
  if (workspaceId) req.set('X-Workspace-Id', workspaceId);
  const response = await req;
  assert.equal(response.status, 200);
  return { tenantId: response.body.context.tenantId, workspaceId: response.body.context.workspaceId };
}

async function buildOrg() {
  // Owner personal tenant becomes the org; grant admin/member/viewer memberships.
  const { tenantId, workspaceId } = await resolveContext('owner');
  await registry.grantMembership({ tenantId, principalId: tokens.admin.uid, roles: ['TENANT_ADMIN'] });
  await registry.grantMembership({ tenantId, principalId: tokens.member.uid, roles: ['MEMBER'] });
  await registry.grantMembership({ tenantId, principalId: tokens.viewer.uid, roles: ['VIEWER'] });
  return { tenantId, workspaceId };
}

test.beforeEach(() => {
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return tokens[token];
  });
  installService();
});

test('workspace rename: owner renames, response and list reflect the change, viewer is denied', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/workspaces')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Old Name Ops' });
  assert.equal(created.status, 201);
  const workspaceId = created.body.workspace.id;

  const renamed = await request(app).patch(`/api/enterprise/workspaces/${workspaceId}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Europe Operations' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.workspace.name, 'Europe Operations');

  const denied = await request(app).patch(`/api/enterprise/workspaces/${workspaceId}`)
    .set('Authorization', bearer('viewer')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Hacked' });
  assert.equal(denied.status, 403);

  const list = await request(app).get('/api/enterprise/workspaces')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.ok(list.body.workspaces.some(ws => ws.name === 'Europe Operations'));
});

test('workspace archive/restore lifecycle with default-workspace protection', async () => {
  const { tenantId, workspaceId: defaultWorkspaceId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/workspaces')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Sunset Division' });
  const workspaceId = created.body.workspace.id;

  // The default workspace can never be archived.
  const defaultAttempt = await request(app).post(`/api/enterprise/workspaces/${defaultWorkspaceId}/archive`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(defaultAttempt.status, 409);
  assert.equal(defaultAttempt.body.error.code, 'WORKSPACE_DEFAULT_PROTECTED');

  const archived = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/archive`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.workspace.lifecycleState, 'ARCHIVED');

  // Archived workspaces disappear from the standard list…
  const standardList = await request(app).get('/api/enterprise/workspaces')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.ok(!standardList.body.workspaces.some(ws => ws.id === workspaceId));

  // …but remain visible to administrators asking for archived entries.
  const adminList = await request(app).get('/api/enterprise/workspaces?includeArchived=1')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  const archivedEntry = adminList.body.workspaces.find(ws => ws.id === workspaceId);
  assert.equal(archivedEntry?.lifecycleState, 'ARCHIVED');

  // A member without tenant.workspaces.manage never sees archived entries even when asking.
  const memberList = await request(app).get('/api/enterprise/workspaces?includeArchived=1')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(memberList.status, 200);
  assert.ok(!memberList.body.workspaces.some(ws => ws.id === workspaceId));

  const restored = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/restore`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.workspace.lifecycleState, 'ACTIVE');

  // Restoring an active workspace is a truthful no-op conflict, not silent success.
  const noop = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/restore`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(noop.status, 409);
});

test('archive/restore is denied for members and for cross-tenant actors', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/workspaces')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Team Space' });
  const workspaceId = created.body.workspace.id;

  const memberDenied = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/archive`)
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(memberDenied.status, 403);

  // The outsider resolves their own personal tenant and cannot reach this workspace id.
  await resolveContext('outsider');
  const crossTenant = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/archive`)
    .set('Authorization', bearer('outsider'));
  assert.ok([403, 404].includes(crossTenant.status));
});

test('workspace member administration: add, list, primary-workspace guard, remove', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/workspaces')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Analytics' });
  const workspaceId = created.body.workspace.id;

  const added = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.member.uid });
  assert.equal(added.status, 201);
  assert.equal(added.body.member.principalId, tokens.member.uid);

  const list = await request(app).get(`/api/enterprise/workspaces/${workspaceId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(list.status, 200);
  assert.ok(list.body.members.some(member => member.principalId === tokens.member.uid));

  // The member can now resolve context inside the added workspace.
  const resolved = await resolveContext('member', tenantId, workspaceId);
  assert.equal(resolved.workspaceId, workspaceId);

  // A membership's primary workspace cannot be silently removed.
  const membership = await registry.getMembership(tenantId, tokens.member.uid);
  const primaryGuard = await request(app).delete(`/api/enterprise/workspaces/${membership.workspaceId}/members/${tokens.member.uid}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(primaryGuard.status, 409);
  assert.equal(primaryGuard.body.error.code, 'WORKSPACE_PRIMARY_MEMBERSHIP');

  const removed = await request(app).delete(`/api/enterprise/workspaces/${workspaceId}/members/${tokens.member.uid}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(removed.status, 204);

  const afterRemove = await request(app).get(`/api/enterprise/workspaces/${workspaceId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.ok(!afterRemove.body.members.some(member => member.principalId === tokens.member.uid));
});

test('workspace member add rejects unknown and suspended tenant principals', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/workspaces')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Restricted' });
  const workspaceId = created.body.workspace.id;

  const unknown = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: 'not-a-tenant-member' });
  assert.equal(unknown.status, 404);

  await registry.updateTenantMembership({ tenantId, principalId: tokens.member.uid, status: 'SUSPENDED' });
  const suspended = await request(app).post(`/api/enterprise/workspaces/${workspaceId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.member.uid });
  assert.equal(suspended.status, 409);
});

test('team lifecycle: create, rename, archive; archived teams leave the roster', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Search Pod' });
  assert.equal(created.status, 201);
  const teamId = created.body.team.id;

  const renamed = await request(app).patch(`/api/enterprise/teams/${teamId}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Executive Search Pod' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.team.name, 'Executive Search Pod');

  const viewerDenied = await request(app).patch(`/api/enterprise/teams/${teamId}`)
    .set('Authorization', bearer('viewer')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Nope' });
  assert.equal(viewerDenied.status, 403);

  const archived = await request(app).post(`/api/enterprise/teams/${teamId}/archive`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.team.status, 'ARCHIVED');

  const list = await request(app).get('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.ok(!list.body.teams.some(team => team.id === teamId));

  // Operations on the archived team read as not-found, never as another tenant's data.
  const gone = await request(app).patch(`/api/enterprise/teams/${teamId}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Zombie' });
  assert.equal(gone.status, 404);
});

test('team membership: assign, list, remove; only active tenant members may join', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Talent Ops' });
  const teamId = created.body.team.id;

  const added = await request(app).post(`/api/enterprise/teams/${teamId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.member.uid });
  assert.equal(added.status, 201);

  const list = await request(app).get(`/api/enterprise/teams/${teamId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(list.status, 200);
  assert.ok(list.body.members.some(member => member.principalId === tokens.member.uid));

  const unknown = await request(app).post(`/api/enterprise/teams/${teamId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: 'someone-else-entirely' });
  assert.equal(unknown.status, 404);

  const viewerDenied = await request(app).post(`/api/enterprise/teams/${teamId}/members`)
    .set('Authorization', bearer('viewer')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.viewer.uid });
  assert.equal(viewerDenied.status, 403);

  const removed = await request(app).delete(`/api/enterprise/teams/${teamId}/members/${tokens.member.uid}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(removed.status, 204);

  const afterRemove = await request(app).get(`/api/enterprise/teams/${teamId}/members`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.ok(!afterRemove.body.members.some(member => member.principalId === tokens.member.uid));
});

test('team ids are tenant scoped: another tenant cannot read or mutate them', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Private Pod' });
  const teamId = created.body.team.id;

  await resolveContext('outsider');
  for (const attempt of [
    request(app).patch(`/api/enterprise/teams/${teamId}`).set('Authorization', bearer('outsider')).send({ name: 'Stolen' }),
    request(app).post(`/api/enterprise/teams/${teamId}/archive`).set('Authorization', bearer('outsider')),
    request(app).get(`/api/enterprise/teams/${teamId}/members`).set('Authorization', bearer('outsider')),
  ]) {
    const response = await attempt;
    assert.ok([403, 404].includes(response.status), `cross-tenant team access must fail, got ${response.status}`);
  }
});

test('tenant admin can create workspaces and teams through tenant.workspaces.manage', async () => {
  const { tenantId } = await buildOrg();
  const workspace = await request(app).post('/api/enterprise/workspaces')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Admin Provisioned' });
  assert.equal(workspace.status, 201);

  const team = await request(app).post('/api/enterprise/teams')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Admin Team' });
  assert.equal(team.status, 201);
});

test('server-side audit filters narrow by outcome, action, actor, and time window', async () => {
  const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
  const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');
  const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
  const { freezeContext } = require('../enterprise/tenantContext');

  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = new FirestoreEnterpriseRepository({
    db, admin,
    encryptionProvider: new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) }),
  });
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const context = freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(), subjectId: 'auditor-1', identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] },
    roles: ['TENANT_OWNER'], permissions: ['*'], workspaceScope: 'TENANT',
  });

  const base = Date.parse('2026-08-01T00:00:00.000Z');
  const rows = [
    { action: 'TEAM_CREATED', outcome: 'SUCCESS', offsetMinutes: 0 },
    { action: 'TEAM_ARCHIVED', outcome: 'SUCCESS', offsetMinutes: 10 },
    { action: 'WORKSPACE_MEMBER_ADDED', outcome: 'SUCCESS', offsetMinutes: 20 },
    { action: 'WORKSPACE_ARCHIVED', outcome: 'DENIED', offsetMinutes: 30 },
    { action: 'RESOURCE_CREATED', outcome: 'FAILURE', offsetMinutes: 40 },
  ];
  for (const row of rows) {
    await repository.appendAuditEvent(context, repository.auditEventDocument(context, {
      action: row.action, category: 'test.filters', outcome: row.outcome,
      occurredAt: new Date(base + row.offsetMinutes * 60_000).toISOString(),
    }));
  }

  const denied = await repository.listAuditEvents(context, { outcome: 'DENIED' });
  assert.equal(denied.length, 1);
  assert.equal(denied[0].action, 'WORKSPACE_ARCHIVED');

  const teamEvents = await repository.listAuditEvents(context, { action: 'TEAM' });
  assert.deepEqual(teamEvents.map(event => event.action).sort(), ['TEAM_ARCHIVED', 'TEAM_CREATED']);

  const actorEvents = await repository.listAuditEvents(context, { actor: 'auditor-1' });
  assert.equal(actorEvents.length, rows.length);
  assert.equal((await repository.listAuditEvents(context, { actor: 'someone-else' })).length, 0);

  const windowed = await repository.listAuditEvents(context, {
    since: new Date(base + 5 * 60_000).toISOString(),
    until: new Date(base + 25 * 60_000).toISOString(),
  });
  assert.deepEqual(windowed.map(event => event.action).sort(), ['TEAM_ARCHIVED', 'WORKSPACE_MEMBER_ADDED']);
});

test('security policy enforcement: requireMfaForAdmins blocks admin context without a verified second factor', async () => {
  const { tenantId } = await buildOrg();
  const configuration = await registry.getTenantConfiguration(tenantId);
  await registry.updateTenantConfiguration({
    tenantId,
    expectedRevision: configuration.revision,
    input: { securityPolicy: { requireMfaForAdmins: true, supportAccessRequiresApproval: true } },
  });

  // Owner without a second factor claim is refused.
  const denied = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'TENANT_MFA_REQUIRED');

  // A non-admin member is unaffected by the admin MFA policy.
  const memberOk = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(memberOk.status, 200);

  // The same owner with a verified MFA claim resolves normally.
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    if (token === 'owner') return { ...tokens.owner, firebase: { sign_in_second_factor: 'totp' } };
    return tokens[token];
  });
  const allowed = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(allowed.status, 200);
});

test('identity policy enforcement: sessions older than sessionMaxMinutes must re-authenticate', async () => {
  const { tenantId } = await buildOrg();
  const configuration = await registry.getTenantConfiguration(tenantId);
  await registry.updateTenantConfiguration({
    tenantId,
    expectedRevision: configuration.revision,
    input: { identityPolicy: { ssoMode: 'NONE', scimEnabled: false, sessionMaxMinutes: 15 } },
  });

  // A session authenticated 16 minutes ago exceeds the 15-minute cap.
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    if (token === 'owner') return { ...tokens.owner, auth_time: Math.floor(Date.now() / 1000) - 16 * 60 };
    return tokens[token];
  });
  const expired = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, 'TENANT_SESSION_REAUTH_REQUIRED');

  // A fresh sign-in resolves normally.
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return { ...tokens[token], auth_time: Math.floor(Date.now() / 1000) };
  });
  const fresh = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(fresh.status, 200);
});
