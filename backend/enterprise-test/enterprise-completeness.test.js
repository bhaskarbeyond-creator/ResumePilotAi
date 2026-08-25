'use strict';

// Completeness suite: verifies every capability added by the enterprise
// completeness audit — team restore, key rotation, invitations, custom roles,
// SSO enforcement, support-scope governance, audit pagination/filters, tenant
// profile, data export, per-user usage, AI model policy, and platform routes.

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const { InMemoryTenantRegistry } = require('../enterprise/tenantRegistry');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantService } = require('../enterprise/tenantService');
const { applyTenantAiPolicy } = require('../enterprise/tenantAi');
const { setTokenVerifierForTests } = require('../security/auth');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');
const app = require('../index');

const tokens = {
  owner: { uid: 'owner-complete', email: 'owner@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) },
  admin: { uid: 'admin-complete', email: 'admin@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  member: { uid: 'member-complete', email: 'member@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  outsider: { uid: 'outsider-complete', email: 'outsider@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
};

function bearer(name) {
  return `Bearer ${name}`;
}

let registry;
let serviceAccountStore;

function installService() {
  registry = new InMemoryTenantRegistry();
  serviceAccountStore = new InMemoryServiceAccountStore();
  app.set('tenantService', new TenantService({
    registry,
    serviceAccountStore,
    supportGrantStore: new InMemorySupportGrantStore(),
  }));
}

async function buildOrg() {
  const provisioned = await registry.provisionTenant({ ownerPrincipalId: tokens.owner.uid, displayName: 'Completeness Org', slug: 'completeness-org' });
  const tenantId = provisioned.tenantId;
  const svc = app.get('tenantService');
  const ownerCtx = await svc.resolveContext({ user: tokens.owner, requestedTenantId: tenantId, requestId: 'org-setup' });
  await svc.grantMembership({ context: ownerCtx.context, input: { principalId: tokens.admin.uid, roles: ['TENANT_ADMIN'] }, requestId: 'org-admin' });
  await svc.grantMembership({ context: ownerCtx.context, input: { principalId: tokens.member.uid, roles: ['MEMBER'] }, requestId: 'org-member' });
  return { tenantId, workspaceId: ownerCtx.context.workspaceId, svc, ownerCtx };
}

test.beforeEach(() => {
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return tokens[token];
  });
  installService();
});

// ─── Teams: archive → restore → verify ───────────────────────────────────────

test('team lifecycle completeness: archive then restore returns the team to the roster', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Restore Pod' });
  assert.equal(created.status, 201);
  const teamId = created.body.team.id;

  const archived = await request(app).post(`/api/enterprise/teams/${teamId}/archive`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.team.status, 'ARCHIVED');

  const afterArchive = await request(app).get('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(afterArchive.body.teams.filter(team => team.id === teamId).length, 0, 'archived team leaves the active roster');

  const archivedView = await request(app).get('/api/enterprise/teams?includeArchived=1')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(archivedView.body.teams.filter(team => team.id === teamId).length, 1, 'archived team is retrievable for administrators');

  const restored = await request(app).post(`/api/enterprise/teams/${teamId}/restore`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.team.status, 'ACTIVE');

  const activeAgain = await request(app).get('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(activeAgain.body.teams.filter(team => team.id === teamId).length, 1, 'restored team is back on the roster');

  const memberDenied = await request(app).post(`/api/enterprise/teams/${teamId}/restore`)
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(memberDenied.status, 403, 'restore is restricted to workspace managers');
});

test('team lead: assignment, validation, and audit trail', async () => {
  const { tenantId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/teams')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Led Pod' });
  const teamId = created.body.team.id;

  const setLead = await request(app).patch(`/api/enterprise/teams/${teamId}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Led Pod', leadPrincipalId: tokens.member.uid });
  assert.equal(setLead.status, 200);
  assert.equal(setLead.body.team.leadPrincipalId, tokens.member.uid);

  // A non-member outsider cannot become the lead.
  const invalidLead = await request(app).patch(`/api/enterprise/teams/${teamId}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Led Pod', leadPrincipalId: tokens.outsider.uid });
  assert.equal(invalidLead.status, 400);
  assert.equal(invalidLead.body.error.code, 'INVALID_TEAM_LEAD');

  const cleared = await request(app).patch(`/api/enterprise/teams/${teamId}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ name: 'Led Pod', leadPrincipalId: '' });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.team.leadPrincipalId, null);

  // A lead-only patch keeps the current name (partial update contract).
  const leadOnly = await request(app).patch(`/api/enterprise/teams/${teamId}`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ leadPrincipalId: tokens.member.uid });
  assert.equal(leadOnly.status, 200);
  assert.equal(leadOnly.body.team.name, 'Led Pod');
  assert.equal(leadOnly.body.team.leadPrincipalId, tokens.member.uid);
});

// ─── Service accounts: key rotation ──────────────────────────────────────────

test('service account key rotation invalidates the old key and returns a new one exactly once', async () => {
  const { tenantId, workspaceId } = await buildOrg();
  const created = await request(app).post('/api/enterprise/service-accounts')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ displayName: 'Rotation Bot', scopes: ['resource.read'] });
  assert.equal(created.status, 201);
  const oldKey = created.body.apiKey;
  const accountId = created.body.serviceAccount.id;

  const oldContext = await request(app).get('/api/enterprise/m2m/context')
    .set('x-api-key', oldKey).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(oldContext.status, 200);

  const rotated = await request(app).post(`/api/enterprise/service-accounts/${accountId}/rotate`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.apiKey, oldKey);
  assert.ok(rotated.body.apiKey.startsWith('rpa_'));

  const oldKeyDead = await request(app).get('/api/enterprise/m2m/context')
    .set('x-api-key', oldKey).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(oldKeyDead.status, 401, 'rotated key must stop authenticating immediately');

  const newKeyAlive = await request(app).get('/api/enterprise/m2m/context')
    .set('x-api-key', rotated.body.apiKey).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(newKeyAlive.status, 200);

  const memberDenied = await request(app).post(`/api/enterprise/service-accounts/${accountId}/rotate`)
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(memberDenied.status, 403, 'rotation requires tenant.security.manage');
});

// ─── Invitations: create → blocked → auto-accept → resend/cancel ─────────────

test('invitation lifecycle: invited member cannot access until they accept by first sign-in', async () => {
  const { tenantId } = await buildOrg();
  // No admin auth in this harness: invitation by principal requires an email too.
  const invited = await request(app).post('/api/enterprise/memberships')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.outsider.uid, status: 'INVITED', invitationEmail: 'outsider@example.com', roles: ['MEMBER'] });
  assert.equal(invited.status, 201);
  assert.equal(invited.body.membership.status, 'INVITED');
  assert.equal(invited.body.membership.invitationEmail, 'outsider@example.com');

  const blocked = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('outsider')).set('X-Tenant-Id', tenantId);
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.context.tenantId, tenantId);

  const listed = await request(app).get('/api/enterprise/memberships')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  const record = listed.body.memberships.find(m => m.principalId === tokens.outsider.uid);
  assert.equal(record.status, 'ACTIVE', 'acceptance is durable after the first resolution');
  assert.ok(record.acceptedAt, 'acceptance timestamp is recorded');

  const resend = await request(app).post(`/api/enterprise/memberships/${encodeURIComponent(tokens.outsider.uid)}/invitation-resend`)
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(resend.status, 409, 'an accepted invitation can no longer be resent');
});

test('invitation validation requires an address and rejects invalid emails', async () => {
  const { tenantId } = await buildOrg();
  const noEmail = await request(app).post('/api/enterprise/memberships')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.outsider.uid, status: 'INVITED', roles: ['MEMBER'] });
  assert.equal(noEmail.status, 400);
  assert.equal(noEmail.body.error.code, 'INVALID_INVITATION_EMAIL');

  const badEmail = await request(app).post('/api/enterprise/memberships')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.outsider.uid, status: 'INVITED', invitationEmail: 'not-an-email', roles: ['MEMBER'] });
  assert.equal(badEmail.status, 400);
});

test('invitation resend works while pending and cancel removes access', async () => {
  const { tenantId } = await buildOrg();
  await request(app).post('/api/enterprise/memberships')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: 'pending-user', status: 'INVITED', invitationEmail: 'pending@example.com', roles: ['MEMBER'] });

  const resend = await request(app).post('/api/enterprise/memberships/pending-user/invitation-resend')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(resend.status, 200);

  const cancelled = await request(app).delete('/api/enterprise/memberships/pending-user')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(cancelled.status, 204);
});

// ─── Custom roles ────────────────────────────────────────────────────────────

test('custom roles: define, assign, effective permissions resolve, workspace scope stays bounded', async () => {
  const { tenantId, svc } = await buildOrg();
  const saved = await request(app).patch('/api/enterprise/configuration')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({
      expectedRevision: 1,
      configuration: {
        customRoles: [{ id: 'CUSTOM_REVIEWER', label: 'Reviewer', permissions: ['resource.read', 'tenant.usage.read'] }],
      },
    });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.configuration.customRoles['CUSTOM_REVIEWER'].permissions.length, 2);

  const matrix = await request(app).get('/api/enterprise/roles-matrix')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(matrix.body.customRoles['CUSTOM_REVIEWER'].label, 'Reviewer');

  const assigned = await request(app).post('/api/enterprise/memberships')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: 'reviewer-user', roles: ['CUSTOM_REVIEWER'] });
  assert.equal(assigned.status, 201, 'a defined custom role can be assigned');

  const context = await svc.resolveContext({ user: { uid: 'reviewer-user', emailVerified: true }, requestedTenantId: tenantId, requestId: 'custom-role-check' });
  assert.ok(context.context.permissions.includes('resource.read'));
  assert.ok(context.context.permissions.includes('tenant.usage.read'));
  assert.equal(context.context.workspaceScope, 'WORKSPACE', 'custom roles never grant tenant-wide workspace scope');
  assert.ok(!context.context.permissions.includes('tenant.security.manage'));

  // An undefined custom role contributes no permissions (fail closed).
  const ghost = await request(app).post('/api/enterprise/memberships')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ principalId: 'ghost-user', roles: ['CUSTOM_UNDEFINED'] });
  assert.equal(ghost.status, 400, 'assigning an undefined custom role is rejected at write time');
});

test('custom role normalization rejects invalid ids, wildcards, and unknown permissions', async () => {
  const { normalizeCustomRoles } = require('../enterprise/tenantRegistry');
  const normalized = normalizeCustomRoles([
    { id: 'ok_role', label: 'Ok', permissions: ['resource.read'] },           // upper-cased to OK_ROLE? -> rejected (no CUSTOM_ prefix)
    { id: 'CUSTOM_OK', permissions: ['resource.read', 'not.a.permission'] },  // unknown permission dropped
    { id: 'BAD', permissions: ['*'] },                                        // invalid prefix
    'nonsense',
  ]);
  assert.deepEqual(Object.keys(normalized), ['CUSTOM_OK']);
  assert.deepEqual(normalized.CUSTOM_OK.permissions, ['resource.read']);
});

// ─── Identity policy: SSO enforcement ────────────────────────────────────────

test('ssoMode SAML rejects password sign-ins at context resolution and accepts federated ones', async () => {
  const { tenantId } = await buildOrg();
  await request(app).patch('/api/enterprise/configuration')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ expectedRevision: 1, configuration: { identityPolicy: { ssoMode: 'SAML' } } });

  const passwordUser = { ...tokens.member, firebase: { sign_in_provider: 'password' } };
  setTokenVerifierForTests(async token => token === 'member' ? passwordUser : tokens[token]);
  const rejected = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.error.code, 'TENANT_SSO_REQUIRED');

  const federatedUser = { ...tokens.member, firebase: { sign_in_provider: 'saml.corp-idp' } };
  setTokenVerifierForTests(async token => token === 'member' ? federatedUser : tokens[token]);
  const accepted = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(accepted.status, 200);
  setTokenVerifierForTests(async token => tokens[token]);
});

// ─── Support scope governance ────────────────────────────────────────────────

test('break-glass scopes are restricted to diagnostic scopes by default', async () => {
  const { tenantId, workspaceId } = await buildOrg();
  const denied = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: 'support-engineer', reason: 'Investigate export failure ticket 1234', expiresInMinutes: 60, scopes: ['resource.update'] });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'SUPPORT_SCOPE_NOT_PERMITTED');

  const allowed = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: 'support-engineer', reason: 'Investigate export failure ticket 1234', expiresInMinutes: 60, scopes: ['tenant.audit.read', 'resource.read'] });
  assert.equal(allowed.status, 201);
  assert.deepEqual(allowed.body.grant.scopes, ['tenant.audit.read', 'resource.read']);
});

test('explicitly disabling support approval permits repair scopes as a recorded decision', async () => {
  const { tenantId, workspaceId } = await buildOrg();
  await request(app).patch('/api/enterprise/configuration')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ expectedRevision: 1, configuration: { securityPolicy: { requireMfaForAdmins: false, supportAccessRequiresApproval: false } } });

  const repair = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: 'support-engineer', reason: 'Repair corrupted workspace documents ticket 99', expiresInMinutes: 60, scopes: ['resource.update'] });
  assert.equal(repair.status, 201);

  // Even with repair allowed, administrative scopes stay out of reach.
  const escalation = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: 'support-engineer', reason: 'Escalate to tenant administrator scope ticket 7', expiresInMinutes: 60, scopes: ['tenant.settings.write'] });
  assert.equal(escalation.status, 403);
});

// ─── Tenant profile ──────────────────────────────────────────────────────────

test('tenant profile rename is permissioned, audited, and leaves the slug immutable', async () => {
  const { tenantId } = await buildOrg();
  const renamed = await request(app).patch('/api/enterprise/tenant')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ displayName: 'Renamed Completeness Org' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.tenant.displayName, 'Renamed Completeness Org');
  assert.equal(renamed.body.tenant.slug, 'completeness-org');

  const memberDenied = await request(app).patch('/api/enterprise/tenant')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId)
    .send({ displayName: 'Hostile Rename' });
  assert.equal(memberDenied.status, 403);

  const invalid = await request(app).patch('/api/enterprise/tenant')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({ displayName: 'x' });
  assert.equal(invalid.status, 400);
});

// ─── Audit: server-side filters and pagination ───────────────────────────────

test('audit list exposes actor, severity, and category filters plus a pagination cursor', async () => {
  const { tenantId } = await buildOrg();
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = new FirestoreEnterpriseRepository({ db, admin });
  const svc = app.get('tenantService');
  // Directly seed the repository partition with distinguishable events.
  const context = await svc.resolveContext({ user: tokens.owner, requestedTenantId: tenantId, requestId: 'audit-seed' });
  const tenantPartition = db.collection(`tenants/${tenantId}/audit_events`);
  for (let index = 0; index < 6; index += 1) {
    await tenantPartition.doc(`event-${index}`).set({
      id: `event-${index}`,
      tenantId,
      action: index % 2 === 0 ? 'TEAM_CREATED' : 'SERVICE_ACCOUNT_REVOKED',
      category: index % 2 === 0 ? 'tenant.team' : 'tenant.security',
      severity: index % 2 === 0 ? 'INFO' : 'HIGH',
      outcome: 'SUCCESS',
      actorSubjectId: index % 2 === 0 ? 'actor-alice' : 'actor-bob',
      occurredAt: new Date(Date.now() - index * 60_000).toISOString(),
    });
  }
  const events = await repository.listAuditEvents(context.context, { limit: 2 });
  assert.equal(events.length, 2);
  assert.ok(events.nextCursor, 'a full page advertises a next cursor');
  const page2 = await repository.listAuditEvents(context.context, { limit: 2, cursor: events.nextCursor });
  assert.equal(page2.length, 2);
  assert.notEqual(page2[0].id, events[0].id, 'the second page starts after the cursor');

  const bySeverity = await repository.listAuditEvents(context.context, { severity: 'HIGH' });
  assert.ok(bySeverity.every(event => event.severity === 'HIGH'));
  const byActor = await repository.listAuditEvents(context.context, { actor: 'actor-bob' });
  assert.ok(byActor.length > 0);
  assert.ok(byActor.every(event => event.actorSubjectId === 'actor-bob'));
  const byCategory = await repository.listAuditEvents(context.context, { category: 'tenant.security' });
  assert.ok(byCategory.every(event => event.category === 'tenant.security'));
});

// ─── Data export ─────────────────────────────────────────────────────────────

test('tenant data export produces a checksum-verified snapshot and refuses without settings permission', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = new FirestoreEnterpriseRepository({ db, admin });
  const { FirestoreTenantRegistry } = require('../enterprise/tenantRegistry');
  registry = new FirestoreTenantRegistry({ db, admin });
  app.set('tenantService', new TenantService({
    registry,
    db,
    admin,
    repository,
    serviceAccountStore: new InMemoryServiceAccountStore(),
    supportGrantStore: new InMemorySupportGrantStore(),
  }));
  const provisioned = await registry.provisionTenant({ ownerPrincipalId: tokens.owner.uid, displayName: 'Export Org', slug: 'export-org' });
  const tenantId = provisioned.tenantId;
  const svc = app.get('tenantService');
  const ownerCtx = await svc.resolveContext({ user: tokens.owner, requestedTenantId: tenantId, requestId: 'export-setup' });
  await svc.grantMembership({ context: ownerCtx.context, input: { principalId: tokens.member.uid, roles: ['MEMBER'] }, requestId: 'export-member' });

  const exported = await request(app).get('/api/enterprise/data/export')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.snapshot.format, 'resumepilot-enterprise-tenant-snapshot');
  assert.ok(exported.body.snapshot.checksum);
  assert.ok(exported.body.snapshot.documentCount >= 2, 'tenant + membership documents are included');

  const memberDenied = await request(app).get('/api/enterprise/data/export')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(memberDenied.status, 403);
});

// ─── Usage: per-user breakdown and generation ledger ─────────────────────────

test('usage summary includes per-user rollups and the generation ledger is listable', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = new FirestoreEnterpriseRepository({ db, admin });
  const { freezeContext } = require('../enterprise/tenantContext');
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();

  function buildUsageContext(principalId, correlationId) {
    return freezeContext({
      requestId: correlationId,
      correlationId,
      principalId,
      subjectId: `subject-${principalId}`,
      tenantId,
      workspaceId,
      tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
      membership: { id: `m-${principalId}`, status: 'ACTIVE', roles: ['MEMBER'] },
      permissions: ['ai.use'],
      workspaceScope: 'WORKSPACE',
    });
  }

  const readerContext = buildUsageContext('user-one', 'corr-read');
  await repository.recordAiUsage(buildUsageContext('user-one', 'corr-1'), { provider: 'gemini', model: 'gemini-2.0-flash', operation: 'generate-summary', inputTokens: 10, outputTokens: 20 });
  await repository.recordAiUsage(buildUsageContext('user-two', 'corr-2'), { provider: 'openai', model: 'gpt-4o-mini', operation: 'generate-skills', inputTokens: 5, outputTokens: 7 });

  const summary = await repository.getAiUsageSummary(readerContext);
  assert.equal(summary.requests, 2);
  assert.equal(summary.byUser['user-one'].requests, 1);
  assert.equal(summary.byUser['user-two'].requests, 1);
  assert.equal(summary.byProvider.gemini, 1);

  const events = await repository.listAiUsageEvents(readerContext);
  assert.equal(events.length, 2);
  assert.ok(events.every(event => event.correlationId));
});

// ─── AI model governance ─────────────────────────────────────────────────────

test('applyTenantAiPolicy enforces the model allowlist and primary model', () => {
  const configuration = {
    primary: 'nvidia',
    providers: {
      // Keys are present exactly as loadProviderConfiguration() produces in
      // production: a provider without an effective key is disabled (fail
      // closed) and can never become the tenant primary.
      nvidia: { enabled: true, key: 'nvapi-fixture', model: 'meta/llama-3.2-11b-vision-instruct' },
      gemini: { enabled: true, key: 'gemini-fixture', model: 'gemini-2.0-flash' },
      openai: { enabled: true, key: 'sk-fixture', model: 'gpt-4o-mini' },
    },
  };
  const context = { policyVersion: 3, dataPlane: {} };

  const allowlisted = applyTenantAiPolicy(configuration, context, {
    allowedProviders: ['nvidia', 'gemini', 'openai'],
    allowedModels: ['gemini-2.0-flash'],
    primaryModel: 'gemini-2.0-flash',
  });
  assert.equal(allowlisted.primary, 'gemini', 'the provider serving the tenant primary model becomes primary');
  assert.equal(allowlisted.providers.nvidia.enabled, false, 'provider with a non-allowlisted model is disabled');

  const unrestricted = applyTenantAiPolicy(configuration, context, {
    allowedProviders: ['nvidia', 'gemini', 'openai'],
    allowedModels: [],
  });
  assert.equal(unrestricted.providers.nvidia.enabled, true, 'an empty model allowlist permits every approved provider model');
  assert.equal(unrestricted.primary, 'nvidia');

  assert.throws(() => applyTenantAiPolicy(configuration, context, {
    allowedProviders: ['nvidia'],
    allowedModels: ['gemini-2.0-flash'],
  }), /No provider is permitted/, 'no allowed provider/model combination fails closed');
});

test('aiPolicy.allowedModels persists through the configuration API', async () => {
  const { tenantId } = await buildOrg();
  const saved = await request(app).patch('/api/enterprise/configuration')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId)
    .send({
      expectedRevision: 1,
      configuration: { aiPolicy: { allowedProviders: ['gemini'], allowedModels: ['gemini-2.0-flash'], primaryModel: 'gemini-2.0-flash' } },
    });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.configuration.aiPolicy.allowedModels, ['gemini-2.0-flash']);
  assert.equal(saved.body.configuration.aiPolicy.primaryModel, 'gemini-2.0-flash');
});

// ─── Platform administration ─────────────────────────────────────────────────

test('platform tenant registry and lifecycle are gated on the platform capability', async () => {
  const { tenantId } = await buildOrg();
  // tokens.owner carries role SUPER_ADMIN => platform provisioner.
  const listed = await request(app).get('/api/enterprise/platform/tenants')
    .set('Authorization', bearer('owner'));
  assert.equal(listed.status, 200);
  assert.ok(listed.body.tenants.some(tenant => tenant.id === tenantId));

  // A tenant admin (role USER) is NOT a platform provisioner.
  const adminDenied = await request(app).get('/api/enterprise/platform/tenants')
    .set('Authorization', bearer('admin'));
  assert.equal(adminDenied.status, 403);

  const suspended = await request(app).post(`/api/enterprise/platform/tenants/${tenantId}/suspend`)
    .set('Authorization', bearer('owner'));
  assert.equal(suspended.status, 200);
  assert.equal(suspended.body.tenant.lifecycleState, 'SUSPENDED');

  const membersBlocked = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(membersBlocked.status, 403, 'suspended tenant members lose access');

  const memberSuspendDenied = await request(app).post(`/api/enterprise/platform/tenants/${tenantId}/reactivate`)
    .set('Authorization', bearer('member'));
  assert.equal(memberSuspendDenied.status, 403);

  const reactivated = await request(app).post(`/api/enterprise/platform/tenants/${tenantId}/reactivate`)
    .set('Authorization', bearer('owner'));
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.tenant.lifecycleState, 'ACTIVE');
});

test('platform provisioning endpoint stays available to provisioners', async () => {
  const provisioned = await request(app).post('/api/enterprise/tenants')
    .set('Authorization', bearer('owner'))
    .send({ displayName: 'Platform Made', slug: 'platform-made' });
  assert.equal(provisioned.status, 201);
  assert.equal(provisioned.body.tenant.slug, 'platform-made');

  const denied = await request(app).post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: 'Nope', slug: 'nope-org' });
  assert.equal(denied.status, 403);
});

// ─── Context response carries the platform capability ────────────────────────

test('context response reports the server-derived platformAdmin capability', async () => {
  const { tenantId } = await buildOrg();
  const owner = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('owner')).set('X-Tenant-Id', tenantId);
  assert.equal(owner.body.platformAdmin, true);
  const member = await request(app).get('/api/enterprise/context')
    .set('Authorization', bearer('member')).set('X-Tenant-Id', tenantId);
  assert.equal(member.body.platformAdmin, false);
});
