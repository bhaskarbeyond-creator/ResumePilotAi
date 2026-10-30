'use strict';

/**
 * Team lead contract regression suite.
 *
 * Defect being locked down: `enterprise_teams.team_lead_uid` (migration 030) was
 * written by the MariaDB adapter but never surfaced to callers. `getTeam` and
 * `listTeams` returned raw `SELECT *` rows, so responses carried `team_lead_uid`
 * while both enterprise frontends render `leadPrincipalId`; and `createTeam`
 * neither accepted nor persisted a lead even though the frontend sends one. The
 * in-memory registry compounded this by keying on `leadPrincipalId` while
 * TenantService handed the value over as `teamLeadUid`, so the HTTP-level
 * expectation and the SQL-level tests disagreed and the gap went unnoticed.
 *
 * These tests pin the round trip at the adapter, service and HTTP layers.
 */

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');

const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
const { createTenantService } = require('../enterprise/tenantService');
const { InMemoryTenantRegistry } = require('./helpers/inMemoryTenantRegistry');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantService } = require('../enterprise/tenantService');
const { InMemoryEnterpriseRepository } = require('./helpers/inMemoryEnterpriseRepository');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

const TENANT_ID = '11111111-1111-4111-8111-111111111001';
const TEAM_ID = '22222222-2222-4222-8222-222222222002';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333003';
const LEAD_ID = '44444444-4444-4444-8444-444444444004';
const OUTSIDER_ID = '55555555-5555-5555-8555-555555555005';

const ACTIVE_MEMBER = { status: 'ACTIVE', principalId: LEAD_ID, roles: ['ENTERPRISE_MEMBER'] };

// Deterministic pool covering the read/insert paths the lead travels through.
function fakePool(scenario = {}) {
  const calls = [];
  const team = {
    id: TEAM_ID, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, name: 'Alpha',
    description: '', archived: 0, archived_at: null, restored_at: null,
    team_lead_uid: scenario.lead === undefined ? LEAD_ID : scenario.lead,
  };
  return {
    calls,
    team,
    async query(sql, params = []) {
      const norm = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: norm, params });
      const low = norm.toLowerCase();
      if (/from enterprise_memberships m/i.test(low)) {
        if (scenario.membershipThrows) {
          throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
        }
        return [[scenario.membership || ACTIVE_MEMBER]];
      }
      if (/^select \* from enterprise_teams where id = \? and tenantid = \?$/i.test(low)) {
        return [scenario.missingTeam ? [] : [{ ...team }]];
      }
      if (/^select \* from enterprise_teams where tenantid = \?/i.test(low)) {
        return [[{ ...team }, { ...team, id: '66666666-6666-4666-8666-666666666006', name: 'Beta', team_lead_uid: null }]];
      }
      if (/^insert into enterprise_teams/i.test(low)) {
        scenario.insert = { sql: norm, params };
        return [{ affectedRows: 1, insertId: 1 }];
      }
      throw new Error('Unsupported registry query: ' + norm.slice(0, 100));
    },
    async getConnection() {
      return {
        beginTransaction: async () => {}, query: (s, p) => this.query(s, p),
        commit: async () => {}, rollback: async () => {}, release: async () => {},
      };
    },
  };
}

describe('Team lead contract — MariaDB adapter (regression)', () => {
  it('getTeam exposes the persisted team_lead_uid as leadPrincipalId', async () => {
    const registry = new MySqlTenantRegistry({ pool: fakePool() });
    const team = await registry.getTeam(TEAM_ID, TENANT_ID);
    assert.equal(team.leadPrincipalId, LEAD_ID, 'lead must be exposed under the API contract field');
    assert.equal(team.team_lead_uid, LEAD_ID, 'raw column stays available for callers that read it');
  });

  it('getTeam reports a null lead when no lead is persisted', async () => {
    const registry = new MySqlTenantRegistry({ pool: fakePool({ lead: null }) });
    const team = await registry.getTeam(TEAM_ID, TENANT_ID);
    assert.equal(team.leadPrincipalId, null);
  });

  it('listTeams exposes leadPrincipalId for every row', async () => {
    const registry = new MySqlTenantRegistry({ pool: fakePool() });
    const teams = await registry.listTeams(TENANT_ID);
    assert.equal(teams.length, 2);
    assert.equal(teams[0].leadPrincipalId, LEAD_ID);
    assert.equal(teams[1].leadPrincipalId, null, 'rows without a lead normalise to null, not undefined');
  });

  it('createTeam persists team_lead_uid and returns leadPrincipalId', async () => {
    const pool = fakePool();
    const registry = new MySqlTenantRegistry({ pool });
    const created = await registry.createTeam({ tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, name: 'Led Pod', teamLeadUid: LEAD_ID });
    const insert = pool.calls.find(call => /^insert into enterprise_teams/i.test(call.sql));
    assert.ok(insert, 'expected an INSERT against enterprise_teams');
    assert.match(insert.sql, /team_lead_uid/i, 'the lead column must be part of the insert');
    assert.equal(insert.params[insert.params.length - 1], LEAD_ID, 'lead must be bound, not dropped');
    assert.equal(created.leadPrincipalId, LEAD_ID, 'create response must carry the lead');
  });

  it('createTeam without a lead persists NULL and returns a null lead', async () => {
    const pool = fakePool();
    const registry = new MySqlTenantRegistry({ pool });
    const created = await registry.createTeam({ tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, name: 'Unled Pod' });
    const insert = pool.calls.find(call => /^insert into enterprise_teams/i.test(call.sql));
    assert.equal(insert.params[insert.params.length - 1], null);
    assert.equal(created.leadPrincipalId, null);
  });

  it('createTeam rejects a lead that is not a tenant member with 403', async () => {
    const registry = new MySqlTenantRegistry({ pool: fakePool({ membershipThrows: true }) });
    await assert.rejects(
      registry.createTeam({ tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, name: 'Bad Lead', teamLeadUid: OUTSIDER_ID }),
      err => err.code === 'TEAM_LEAD_NOT_MEMBER' && err.status === 403
    );
  });

  it('createTeam rejects an inactive lead with 403', async () => {
    const registry = new MySqlTenantRegistry({ pool: fakePool({ membership: { status: 'INVITED', principalId: LEAD_ID, roles: ['ENTERPRISE_MEMBER'] } }) });
    await assert.rejects(
      registry.createTeam({ tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, name: 'Invited Lead', teamLeadUid: LEAD_ID }),
      err => err.code === 'TEAM_LEAD_NOT_MEMBER' && err.status === 403
    );
  });
});

describe('Team lead contract — TenantService', () => {
  function serviceWith(recorder) {
    const registry = {
      createTeam: async input => { recorder.createInput = input; return { id: TEAM_ID, ...input, leadPrincipalId: input.teamLeadUid ?? null }; },
      getMembership: async (_tenantId, principalId) => {
        if (principalId !== LEAD_ID) throw Object.assign(new Error('Tenant membership was not found'), { code: 'TENANT_MEMBERSHIP_NOT_FOUND', status: 404 });
        return ACTIVE_MEMBER;
      },
    };
    return createTenantService({ registry, repository: { appendAuditEvent: async () => {} } });
  }

  it('createTeam forwards the public leadPrincipalId field to the registry as teamLeadUid', async () => {
    const recorder = {};
    const service = serviceWith(recorder);
    const context = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, workspaceScope: 'TENANT', roles: ['TENANT_OWNER'], dataPlane: { id: 'dp-lead-contract', type: 'mysql', routingVersion: 1 } };
    const team = await service.createTeam({ context, input: { name: 'Led Pod', leadPrincipalId: LEAD_ID } });
    assert.equal(recorder.createInput.teamLeadUid, LEAD_ID, 'the lead must reach the data plane');
    assert.equal(team.leadPrincipalId, LEAD_ID, 'the caller must get the lead back');
  });

  it('createTeam accepts the internal teamLeadUid alias', async () => {
    const recorder = {};
    const service = serviceWith(recorder);
    const context = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, workspaceScope: 'TENANT', roles: ['TENANT_OWNER'], dataPlane: { id: 'dp-lead-contract', type: 'mysql', routingVersion: 1 } };
    await service.createTeam({ context, input: { name: 'Led Pod', teamLeadUid: LEAD_ID } });
    assert.equal(recorder.createInput.teamLeadUid, LEAD_ID);
  });

  it('createTeam rejects a non-member lead with 403 before touching the data plane', async () => {
    const recorder = {};
    const service = serviceWith(recorder);
    const context = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, workspaceScope: 'TENANT', roles: ['TENANT_OWNER'], dataPlane: { id: 'dp-lead-contract', type: 'mysql', routingVersion: 1 } };
    await assert.rejects(
      service.createTeam({ context, input: { name: 'Bad Lead', leadPrincipalId: OUTSIDER_ID } }),
      err => err.code === 'TEAM_LEAD_NOT_MEMBER' && err.status === 403
    );
    assert.equal(recorder.createInput, undefined, 'no team may be created with an ineligible lead');
  });

  it('createTeam with no lead passes null and succeeds', async () => {
    const recorder = {};
    const service = serviceWith(recorder);
    const context = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, workspaceScope: 'TENANT', roles: ['TENANT_OWNER'], dataPlane: { id: 'dp-lead-contract', type: 'mysql', routingVersion: 1 } };
    await service.createTeam({ context, input: { name: 'Unled Pod' } });
    assert.equal(recorder.createInput.teamLeadUid, null);
  });
});

describe('Team lead contract — HTTP round trip', () => {
  const tokens = {
    owner: { uid: 'lead-contract-owner', email: 'owner@lead-contract.local', email_verified: true, role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) },
    member: { uid: 'lead-contract-member', email: 'member@lead-contract.local', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  };
  let registry;
  let tenantId;

  beforeEach(async () => {
    setTokenVerifierForTests(async token => {
      if (!tokens[token]) throw new Error('bad token');
      return tokens[token];
    });
    registry = new InMemoryTenantRegistry();
    app.set('tenantService', new TenantService({
      registry,
      repository: new InMemoryEnterpriseRepository({
        encryptionProvider: new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) }),
      }),
      serviceAccountStore: new InMemoryServiceAccountStore(),
      supportGrantStore: new InMemorySupportGrantStore(),
    }));

    const provisioned = await registry.provisionTenant({ ownerPrincipalId: tokens.owner.uid, displayName: 'Lead Contract Org', slug: 'lead-contract-org' });
    tenantId = provisioned.tenantId;
    const service = app.get('tenantService');
    const ownerCtx = await service.resolveContext({ user: tokens.owner, requestedTenantId: tenantId, requestId: 'lead-contract-setup' });
    await service.grantMembership({ context: ownerCtx.context, input: { principalId: tokens.member.uid, roles: ['MEMBER'] }, requestId: 'lead-contract-member' });
  });

  it('POST /teams persists a supplied lead and returns it under leadPrincipalId', async () => {
    const created = await request(app).post('/api/enterprise/teams')
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId)
      .send({ name: 'Created With Lead', leadPrincipalId: tokens.member.uid });
    assert.equal(created.status, 201);
    assert.equal(created.body.team.leadPrincipalId, tokens.member.uid, 'create must not silently drop the lead');
  });

  it('PATCH /teams/:teamId assigns a lead that survives the round trip', async () => {
    const created = await request(app).post('/api/enterprise/teams')
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId)
      .send({ name: 'Patch Target' });
    assert.equal(created.status, 201);
    const teamId = created.body.team.id;
    assert.equal(created.body.team.leadPrincipalId, null);

    const patched = await request(app).patch(`/api/enterprise/teams/${teamId}`)
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId)
      .send({ name: 'Patch Target', leadPrincipalId: tokens.member.uid });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.team.leadPrincipalId, tokens.member.uid);

    // A subsequent read must still report the lead (persistence, not just echo).
    const listed = await request(app).get('/api/enterprise/teams')
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId);
    const reread = listed.body.teams.find(team => team.id === teamId);
    assert.ok(reread, 'team is listed');
    assert.equal(reread.leadPrincipalId, tokens.member.uid, 'the lead must persist across reads');
  });

  it('PATCH with an empty lead clears it', async () => {
    const created = await request(app).post('/api/enterprise/teams')
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId)
      .send({ name: 'Clear Target', leadPrincipalId: tokens.member.uid });
    const teamId = created.body.team.id;

    const cleared = await request(app).patch(`/api/enterprise/teams/${teamId}`)
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId)
      .send({ name: 'Clear Target', leadPrincipalId: '' });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.team.leadPrincipalId, null);
  });

  it('a lead-only PATCH preserves the existing name (partial update contract)', async () => {
    const created = await request(app).post('/api/enterprise/teams')
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId)
      .send({ name: 'Partial Update' });
    const teamId = created.body.team.id;

    const leadOnly = await request(app).patch(`/api/enterprise/teams/${teamId}`)
      .set('Authorization', 'Bearer owner').set('X-Tenant-Id', tenantId)
      .send({ leadPrincipalId: tokens.member.uid });
    assert.equal(leadOnly.status, 200);
    assert.equal(leadOnly.body.team.name, 'Partial Update');
    assert.equal(leadOnly.body.team.leadPrincipalId, tokens.member.uid);
  });
});
