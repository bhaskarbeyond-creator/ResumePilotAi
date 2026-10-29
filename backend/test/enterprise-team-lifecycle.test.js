'use strict';

/**
 * Enterprise Team Management Operations (DISC-054)
 * PATCH /api/enterprise/teams/:teamId, POST .../archive, POST .../restore
 *
 * Covers team lead validation (teamLeadUid must belong to the tenant),
 * archive/restore state transitions with CAS guards, and RBAC isolation.
 * The registry is exercised with a deterministic fake pool, and the routes
 * are exercised over HTTP with a tenant service bound to that fake pool.
 */

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const auth = require('../security/auth');
const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
const { createTenantService } = require('../enterprise/tenantService');
const app = require('../index');

auth.setTokenVerifierForTests(async token => {
  const IDENTITIES = {
    owner: {
      uid: 'p-owner', email: 'owner@etl-test.local', role: 'ENTERPRISE_OWNER', email_verified: true,
    },
    viewer: {
      uid: 'p-viewer', email: 'viewer@etl-test.local', role: 'ENTERPRISE_VIEWER', email_verified: true,
    },
    admin: {
      uid: 'adm-1', email: 'admin@etl-test.local', role: 'ADMIN', email_verified: true,
    },
  };
  const identity = IDENTITIES[token];
  if (!identity) throw new Error('Unknown test token');
  return identity;
});

function bearer(token) { return `Bearer ${token}`; }

// ---------------------------------------------------------------------------
// Fake pool for registry unit tests
// ---------------------------------------------------------------------------
function fakePool(scenario = {}) {
  const calls = [];
  const team = { id: '22222222-2222-4222-8222-222222222002', tenantId: '11111111-1111-4111-8111-111111111001', workspaceId: '33333333-3333-4333-8333-333333333003', name: 'Alpha', description: '', archived: 0, archived_at: null, restored_at: null, team_lead_uid: null };
  return {
    calls,
    team,
    async query(sql, params = []) {
      const norm = String(sql).replace(/\s+/g, ' ').trim();
      const low = norm.toLowerCase();
      calls.push({ sql: norm, params });
      if (/^select \* from enterprise_teams where id = \? and tenantid = \?$/i.test(low)) {
        return [scenario.missingTeam ? [] : [team]];
      }
      if (/from enterprise_memberships m/i.test(low)) {
        if (scenario.membershipThrows) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
        return [[scenario.membership || { status: 'ACTIVE', principalId: '44444444-4444-4444-8444-444444444004', roles: ['ENTERPRISE_MEMBER'] }]];
      }
      if (/^update enterprise_teams set archived = 1/i.test(low)) {
        team.archived = 1; team.archived_at = new Date().toISOString();
        return [{ affectedRows: 1 }];
      }
      if (/^update enterprise_teams set archived = 0/i.test(low)) {
        team.archived = 0; team.archived_at = null; team.restored_at = new Date().toISOString();
        return [{ affectedRows: 1 }];
      }
      if (/^update enterprise_teams set/i.test(low)) {
        scenario.lastUpdate = { sql: norm, params };
        let nameIdx = null, descIdx = null, leadIdx = null;
        if (/name = \?/.test(low)) nameIdx = 0;
        if (/description = \?/.test(low)) descIdx = nameIdx == null ? 0 : 1;
        if (/team_lead_uid = \?/.test(low)) {
          let base = 0;
          if (nameIdx != null) base++;
          if (descIdx != null) base++;
          leadIdx = base;
        }
        if (nameIdx != null && typeof params[nameIdx] === 'string') team.name = params[nameIdx];
        if (descIdx != null && typeof params[descIdx] === 'string') team.description = params[descIdx];
        if (leadIdx != null) team.team_lead_uid = params[leadIdx] == null ? null : String(params[leadIdx]);
        return [{ affectedRows: 1 }];
      }
      if (/^delete from enterprise_team_members where teamid = \?/i.test(low)) {
        scenario.deletedMembers = true;
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unsupported registry query: ' + norm.slice(0, 100));
    },
    async getConnection() {
      return {
        beginTransaction: async () => {},
        query: (s, p) => this.query(s, p),
        commit: async () => {},
        rollback: async () => {},
        release: async () => {},
      };
    },
  };
}

describe('Enterprise team lifecycle (registry layer)', () => {
  it('updateTeam updates name and teamLeadUid when the lead is an active tenant member', async () => {
    const pool = fakePool({ membership: { status: 'ACTIVE', principalId: '44444444-4444-4444-8444-444444444004', roles: ['ENTERPRISE_MEMBER'] } });
    const registry = new MySqlTenantRegistry({ pool });
    const updated = await registry.updateTeam({
      tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002', name: 'Alpha renamed', teamLeadUid: '44444444-4444-4444-8444-444444444004',
    });
    assert.equal(updated.id, '22222222-2222-4222-8222-222222222002');
    const updateCall = pool.calls.find(c => /^update enterprise_teams set/i.test(c.sql));
    assert.ok(updateCall, 'expected an UPDATE against enterprise_teams');
    assert.match(updateCall.sql, /team_lead_uid = \?/);
    assert.deepEqual(updateCall.params, ['Alpha renamed', '44444444-4444-4444-8444-444444444004', '22222222-2222-4222-8222-222222222002', '11111111-1111-4111-8111-111111111001']);
  });

  it('updateTeam rejects a teamLeadUid that is not a tenant member with 403', async () => {
    const pool = fakePool({
      membershipThrows: true,
    });
    const registry = new MySqlTenantRegistry({ pool });
    await assert.rejects(
      registry.updateTeam({ tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002', teamLeadUid: '55555555-5555-5555-8555-555555555005' }),
      err => err.code === 'TEAM_LEAD_NOT_MEMBER' && err.status === 403
    );
  });

  it('updateTeam rejects an inactive team lead with 403', async () => {
    const pool = fakePool({ membership: { status: 'INVITED', principalId: '44444444-4444-4444-8444-444444444004', roles: ['ENTERPRISE_MEMBER'] } });
    const registry = new MySqlTenantRegistry({ pool });
    await assert.rejects(
      registry.updateTeam({ tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002', teamLeadUid: '44444444-4444-4444-8444-444444444004' }),
      err => err.code === 'TEAM_LEAD_NOT_MEMBER' && err.status === 403
    );
  });

  it('updateTeam returns 404 for an unknown team', async () => {
    const pool = fakePool({ missingTeam: true });
    const registry = new MySqlTenantRegistry({ pool });
    await assert.rejects(
      registry.updateTeam({ tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002', name: 'X' }),
      err => err.code === 'TEAM_NOT_FOUND' && err.status === 404
    );
  });

  it('archiveTeam archives the team and revokes team-wide workspace delegation', async () => {
    const pool = fakePool({});
    const registry = new MySqlTenantRegistry({ pool });
    const archived = await registry.archiveTeam({ tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002' });
    assert.equal(archived.archived, 1);
    assert.ok(archived.archived_at);
    assert.ok(pool.calls.some(c => /delete from enterprise_team_members/i.test(c.sql)), 'team-wide delegation must be revoked');
  });

  it('archiveTeam rejects an already archived team with 409', async () => {
    const pool = fakePool({});
    pool.team.archived = 1;
    const registry = new MySqlTenantRegistry({ pool });
    await assert.rejects(
      registry.archiveTeam({ tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002' }),
      err => err.code === 'TEAM_ALREADY_ARCHIVED' && err.status === 409
    );
  });

  it('restoreTeam restores an archived team', async () => {
    const pool = fakePool({});
    pool.team.archived = 1;
    const registry = new MySqlTenantRegistry({ pool });
    const restored = await registry.restoreTeam({ tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002' });
    assert.equal(restored.archived, 0);
    assert.ok(restored.restored_at);
    assert.equal(restored.archived_at, null);
  });

  it('restoreTeam rejects a team that is not archived with 409', async () => {
    const pool = fakePool({});
    const registry = new MySqlTenantRegistry({ pool });
    await assert.rejects(
      registry.restoreTeam({ tenantId: '11111111-1111-4111-8111-111111111001', teamId: '22222222-2222-4222-8222-222222222002' }),
      err => err.code === 'TEAM_NOT_ARCHIVED' && err.status === 409
    );
  });
});

describe('Enterprise team lifecycle (service layer)', () => {
  it('updateTeam validates team lead membership through the registry', async () => {
    const pool = fakePool({ membershipThrows: true });
    const registry = new MySqlTenantRegistry({ pool });
    const service = createTenantService({
      registry,
      repository: { appendAuditEvent: async () => {} },
    });
    const context = { tenantId: '11111111-1111-4111-8111-111111111001', workspaceId: '33333333-3333-4333-8333-333333333003', workspaceScope: 'TENANT' };
    await assert.rejects(
      service.updateTeam({ context, teamId: '22222222-2222-4222-8222-222222222002', input: { teamLeadUid: '55555555-5555-5555-8555-555555555005' } }),
      err => err.code === 'TEAM_LEAD_NOT_MEMBER' && err.status === 403
    );
  });

  it('updateTeam accepts a lead uid and delegates to the registry', async () => {
    const pool = fakePool({ membership: { status: 'ACTIVE', principalId: '44444444-4444-4444-8444-444444444004', roles: ['ENTERPRISE_MEMBER'] } });
    const registry = new MySqlTenantRegistry({ pool });
    const service = createTenantService({
      registry,
      repository: { appendAuditEvent: async () => {} },
    });
    const context = { id: '11111111-1111-4111-8111-111111111001', tenantId: '11111111-1111-4111-8111-111111111001', workspaceId: '33333333-3333-4333-8333-333333333003', workspaceScope: 'TENANT', dataPlane: { id: 'dp-1', type: 'mysql', routingVersion: 1 } };
    const updated = await service.updateTeam({ context, teamId: '22222222-2222-4222-8222-222222222002', input: { name: 'Beta', teamLeadUid: '44444444-4444-4444-8444-444444444004' } });
    assert.equal(updated.name, 'Beta');
    const updateCall = pool.calls.find(c => /^update enterprise_teams set/i.test(c.sql));
    assert.ok(updateCall);
    assert.equal(updateCall.params[1], '44444444-4444-4444-8444-444444444004');
  });
});

// ---------------------------------------------------------------------------
// HTTP route layer: RBAC isolation on the mounted enterprise routes
// ---------------------------------------------------------------------------
function tenantContextView(roles, permissions) {
  return {
    tenantId: '11111111-1111-4111-8111-111111111001',
    workspaceId: '33333333-3333-4333-8333-333333333003',
    workspaceScope: 'TENANT',
    dataPlane: { id: 'dp-1', type: 'mysql', routingVersion: 1 },
    roles,
    permissions: permissions || [],
  };
}

function serviceForContext(context) {
  const pool = fakePool({ membership: { status: 'ACTIVE', principalId: '44444444-4444-4444-8444-444444444004', roles: ['ENTERPRISE_MEMBER'] } });
  const registry = new MySqlTenantRegistry({ pool });
  const service = createTenantService({
    registry,
    repository: { appendAuditEvent: async () => {} },
  });
  return Object.setPrototypeOf({
    resolveContext: async () => ({ context, tenant: { id: context.tenantId }, membership: context }),
    resolveSupportContext: async () => ({ context, tenant: { id: context.tenantId } }),
    describeRuntime: () => ({}),
    updateTeam: service.updateTeam.bind(service),
    archiveTeam: service.archiveTeam.bind(service),
    restoreTeam: service.restoreTeam.bind(service),
  }, service);
}

describe('Enterprise team lifecycle (HTTP routes)', () => {
  afterEach(() => {
    app.set('tenantService', undefined);
  });

  it('PATCH /api/enterprise/teams/:teamId requires tenant workspace-manage RBAC (owner allowed)', async () => {
    const context = tenantContextView(['ENTERPRISE_OWNER'], ['*']);
    app.set('tenantService', serviceForContext(context));
    const res = await request(app)
      .patch('/api/enterprise/teams/22222222-2222-4222-8222-222222222002')
      .set('Authorization', bearer('owner'))
      .send({ name: 'Renamed', teamLeadUid: '44444444-4444-4444-8444-444444444004' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.team.name, 'Renamed');
  });

  it('PATCH /api/enterprise/teams/:teamId rejects a viewer with 403 (RBAC isolation)', async () => {
    const context = tenantContextView(['ENTERPRISE_VIEWER'], []);
    app.set('tenantService', serviceForContext(context));
    const res = await request(app)
      .patch('/api/enterprise/teams/22222222-2222-4222-8222-222222222002')
      .set('Authorization', bearer('viewer'))
      .send({ name: 'Renamed' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'TENANT_FORBIDDEN');
  });

  it('POST /api/enterprise/teams/:teamId/archive revokes delegation and marks archived', async () => {
    const context = tenantContextView(['ENTERPRISE_OWNER'], ['*']);
    app.set('tenantService', serviceForContext(context));
    const res = await request(app)
      .post('/api/enterprise/teams/22222222-2222-4222-8222-222222222002/archive')
      .set('Authorization', bearer('owner'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.team.archived, 1);
  });

  it('POST /api/enterprise/teams/:teamId/restore clears archive state', async () => {
    const pool = fakePool({});
    pool.team.archived = 1;
    const registry = new MySqlTenantRegistry({ pool });
    const service = createTenantService({
      registry,
      repository: { appendAuditEvent: async () => {} },
    });
    const serviceWithContext = Object.setPrototypeOf({
      resolveContext: async () => ({ context: tenantContextView(['ENTERPRISE_OWNER'], ['*']), tenant: { id: '11111111-1111-4111-8111-111111111001' } }),
      resolveSupportContext: async () => ({ context: tenantContextView(['ENTERPRISE_OWNER'], ['*']), tenant: { id: '11111111-1111-4111-8111-111111111001' } }),
      describeRuntime: () => ({}),
      updateTeam: service.updateTeam.bind(service),
      archiveTeam: service.archiveTeam.bind(service),
      restoreTeam: service.restoreTeam.bind(service),
    }, service);
    app.set('tenantService', serviceWithContext);
    const res = await request(app)
      .post('/api/enterprise/teams/22222222-2222-4222-8222-222222222002/restore')
      .set('Authorization', bearer('owner'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.team.archived, 0);
    assert.ok(res.body.team.restored_at);
  });

  it('rejects unauthenticated calls with 401', async () => {
    const res = await request(app).patch('/api/enterprise/teams/22222222-2222-4222-8222-222222222002').send({ name: 'X' });
    assert.equal(res.status, 401);
  });
});
