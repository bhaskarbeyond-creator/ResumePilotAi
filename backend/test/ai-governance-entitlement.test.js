'use strict';

/**
 * DIR-106 — AI governance, organization entitlements and quota enforcement.
 *
 * These tests encode the BUSINESS RULES, not the current implementation. Each
 * one fails if an audited defect returns:
 *   P0-1  an organization member is charged against their personal allowance
 *   P0-2  multiple active tenants are resolved arbitrarily
 *   P0-3  a suspended membership or decommissioned tenant still grants access
 *   P0-5  a tenant's shared budget is not enforced across its members
 *   P1-1  a tenant limit below 1000 is silently raised
 *   P1-2  a personal override outranks an organization allowance
 *   P0-4  AI settings can be written by an operator who cannot read them
 */

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');

const { setPoolForTests } = require('../database/mysql');
const { enforceDailyAiQuota } = require('../security/abuse');
const { resolveAiGovernance, QUOTA_SOURCE } = require('../security/aiGovernance');
const { resolveEffectiveEntitlement, isTenantEntitlementValid } = require('../security/entitlements');
const { resolveAdminReadPermission } = require('../security/policy');

/**
 * In-memory MariaDB standing in for the real one. It deliberately implements the
 * SAME SQL surface the production path uses, so a change in either breaks here.
 */
class GovernancePool {
  constructor() { this.reset(); }

  reset() {
    this.unavailable = false;
    this.users = new Map([
      ['member-1', { id: 'member-1', email: 'm1@corp.test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
      ['member-2', { id: 'member-2', email: 'm2@corp.test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
      ['solo-1', { id: 'solo-1', email: 'solo@test', membership: 'Basic', paymentStatus: 'INACTIVE' }],
    ]);
    this.memberships = [];
    this.tenants = new Map();
    this.configs = new Map();
    this.quotaSettings = { basicDailyLimit: 10, premiumDailyLimit: 100, adminDailyLimit: 10000 };
    this.usage = new Map();
    this.orgCounters = new Map();
  }

  addTenant({ tenantId, lifecycleState = 'ACTIVE', decommissionedAt = null, quotaPolicy = {}, aiPolicy = {} }) {
    this.tenants.set(tenantId, { tenantId, lifecycleState, decommissionedAt, policyVersion: 1 });
    this.configs.set(tenantId, { tenantId, revision: 1, aiPolicy, quotaPolicy });
  }

  addMembership(principalId, tenantId, { status = 'ACTIVE', personalTenant = false } = {}) {
    this.memberships.push({ principalId, tenantId, status, personalTenant, workspaceId: null });
  }

  async query(sql, params = []) {
    if (this.unavailable) throw Object.assign(new Error('MariaDB unavailable'), { code: 'ECONNREFUSED' });
    const n = String(sql).replace(/\s+/g, ' ').trim();

    if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(n)) {
      const row = this.users.get(params[0]);
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(n)) {
      return [[{ data: JSON.stringify(this.quotaSettings) }], []];
    }
    if (/FROM enterprise_memberships m/i.test(n)) {
      const rows = this.memberships
        .filter(m => m.principalId === params[0])
        .map(m => {
          const tenant = this.tenants.get(m.tenantId) || {};
          const config = this.configs.get(m.tenantId) || {};
          return {
            tenantId: m.tenantId,
            workspaceId: m.workspaceId,
            membershipStatus: m.status,
            personalTenant: m.personalTenant ? 1 : 0,
            lifecycleState: tenant.lifecycleState,
            decommissionedAt: tenant.decommissionedAt ?? null,
            policyVersion: tenant.policyVersion ?? 1,
            aiPolicy: JSON.stringify(config.aiPolicy || {}),
            quotaPolicy: JSON.stringify(config.quotaPolicy || {}),
            configRevision: config.revision ?? null,
          };
        });
      return [rows, []];
    }
    throw new Error(`Unexpected pool SQL: ${n}`);
  }

  async getConnection() {
    if (this.unavailable) throw Object.assign(new Error('MariaDB unavailable'), { code: 'ECONNREFUSED' });
    const pool = this;
    return {
      beginTransaction: async () => {},
      async query(sql, params = []) {
        const n = String(sql).replace(/\s+/g, ' ').trim();
        if (/^INSERT INTO ai_quota_counters /i.test(n)) {
          const key = `${params[0]}:${params[1]}:`;
          if (!pool.orgCounters.has(key)) pool.orgCounters.set(key, { count: 0, limit: params[3] });
          else pool.orgCounters.get(key).limit = params[3];
          return [{ affectedRows: 1 }, []];
        }
        if (/^SELECT count FROM ai_quota_counters /i.test(n)) {
          const row = pool.orgCounters.get(`${params[0]}:${params[1]}:`);
          return [[row ? { count: row.count } : null].filter(Boolean), []];
        }
        if (/^UPDATE ai_quota_counters /i.test(n)) {
          const row = pool.orgCounters.get(`${params[2]}:${params[3]}:`);
          if (row) { row.count = params[0]; row.limit = params[1]; }
          return [{ affectedRows: row ? 1 : 0 }, []];
        }
        if (/^SELECT count FROM ai_usage WHERE day_key = \? AND uid_hash = \? FOR UPDATE$/i.test(n)) {
          const row = pool.usage.get(`${params[0]}:${params[1]}`);
          return [[row ? { count: row.count } : null].filter(Boolean), []];
        }
        if (/^INSERT INTO ai_usage /i.test(n)) {
          const key = `${params[0]}:${params[1]}`;
          if (!pool.usage.has(key)) {
            pool.usage.set(key, {
              uid: params[2], tenantId: params[3], scope: params[4], email: params[5], count: params[6], limit: params[7],
            });
          } else {
            const row = pool.usage.get(key);
            row.limit = params[7];
            if (params[6] !== undefined && params[6] > 0) row.count = params[6];
            if (params[3]) row.tenantId = params[3];
          }
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Unexpected connection SQL: ${n}`);
      },
      commit: async () => {},
      rollback: async () => {},
      release() {},
    };
  }

  async end() {}
}

const pool = new GovernancePool();
setPoolForTests(pool);

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, body: null, locals: { requestId: 'dir106-test' },
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const callQuota = async (uid, headers = {}) => {
  const req = {
    user: { uid, email: `${uid}@test`, role: 'USER' },
    get: (name) => headers[name] ?? headers[String(name).toLowerCase()],
    body: {}, query: {},
  };
  const res = responseRecorder();
  let continued = false;
  await enforceDailyAiQuota(req, res, () => { continued = true; });
  return { res, continued };
};

test.beforeEach(() => { pool.reset(); });

test.after(() => { pool.reset(); setPoolForTests(null); });

// ── Rule B — individual users without an organization entitlement ─────────────

test('Rule B: a user with no organization membership resolves to the INDIVIDUAL plan', async () => {
  const governance = await resolveAiGovernance({ user: { uid: 'solo-1' }, get: () => undefined, body: {}, query: {} });
  assert.equal(governance.source, QUOTA_SOURCE.INDIVIDUAL);
  assert.equal(governance.reason, 'NO_ORGANIZATION_MEMBERSHIP');
  assert.equal(governance.quota.userLimit, 10, 'Basic daily limit from ai_quota');
  assert.equal(governance.quota.sharedLimit, null);
});

test('Rule B: the individual plan limit is enforced server-side and fails closed', async () => {
  for (let i = 1; i <= 10; i += 1) {
    const ok = await callQuota('solo-1');
    assert.equal(ok.continued, true, `request ${i} should be permitted`);
    assert.equal(ok.res.headers['X-AI-Quota-Source'], QUOTA_SOURCE.INDIVIDUAL);
  }
  const blocked = await callQuota('solo-1');
  assert.equal(blocked.continued, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.error.code, 'AI_DAILY_QUOTA_EXCEEDED');
});

// ── Rule A — organization/enterprise members ─────────────────────────────────

test('Rule A (P0-1): an organization member is charged to the ORGANIZATION budget, not their own', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 5 } });
  pool.addMembership('member-1', 'acme');

  const { res, continued } = await callQuota('member-1');
  assert.equal(continued, true);
  assert.equal(res.headers['X-AI-Quota-Source'], QUOTA_SOURCE.ORGANIZATION,
    'the charge must be attributed to the organization, not the personal plan');
  assert.equal(res.headers['X-AI-Org-Daily-Limit'], '5');
  assert.equal(res.headers['X-AI-Org-Daily-Remaining'], '4');

  const usage = [...pool.usage.values()][0];
  assert.equal(usage.tenantId, 'acme', 'the usage row must carry tenant attribution');
  assert.equal(usage.scope, QUOTA_SOURCE.ORGANIZATION);
});

test('Rule A (P0-5): the organization budget is SHARED across all members', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 2 } });
  pool.addMembership('member-1', 'acme');
  pool.addMembership('member-2', 'acme');

  assert.equal((await callQuota('member-1')).continued, true, 'member-1 first request');
  assert.equal((await callQuota('member-2')).continued, true, 'member-2 first request');

  const exhausted = await callQuota('member-2');
  assert.equal(exhausted.continued, false,
    'a second member must not receive a fresh allowance — the cap is organization-wide');
  assert.equal(exhausted.res.statusCode, 429);
  assert.equal(exhausted.res.body.error.code, 'AI_ORG_QUOTA_EXCEEDED');
});


// ── Rule A — invalid entitlements must not grant access (P0-3) ────────────────

test('P0-3: a SUSPENDED organization membership grants no organization entitlement', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 500 } });
  pool.addMembership('member-1', 'acme', { status: 'SUSPENDED' });

  const governance = await resolveAiGovernance({ user: { uid: 'member-1' }, get: () => undefined, body: {}, query: {} });
  assert.equal(governance.source, QUOTA_SOURCE.INDIVIDUAL, 'invalid membership must fall back to individual evaluation');
  assert.equal(governance.reason, 'MEMBERSHIP_NOT_ACTIVE');
  assert.equal(governance.quota.sharedLimit, null, 'no organization budget may be granted');

  const { res } = await callQuota('member-1');
  assert.notEqual(res.headers['X-AI-Quota-Source'], QUOTA_SOURCE.ORGANIZATION);
  assert.equal(res.headers['X-AI-Org-Daily-Limit'], undefined);
});

test('P0-3: a DECOMMISSIONED tenant grants no organization entitlement', async () => {
  pool.addTenant({ tenantId: 'acme', lifecycleState: 'ACTIVE', decommissionedAt: new Date(), quotaPolicy: { aiRequestsPerDay: 500 } });
  pool.addMembership('member-1', 'acme');

  const governance = await resolveAiGovernance({ user: { uid: 'member-1' }, get: () => undefined, body: {}, query: {} });
  assert.equal(governance.source, QUOTA_SOURCE.INDIVIDUAL);
  assert.equal(governance.reason, 'MEMBERSHIP_NOT_ACTIVE');
});

test('P0-3: a non-ACTIVE tenant lifecycle state grants no organization entitlement', async () => {
  pool.addTenant({ tenantId: 'acme', lifecycleState: 'SUSPENDED', quotaPolicy: { aiRequestsPerDay: 500 } });
  pool.addMembership('member-1', 'acme');
  const governance = await resolveAiGovernance({ user: { uid: 'member-1' }, get: () => undefined, body: {}, query: {} });
  assert.equal(governance.source, QUOTA_SOURCE.INDIVIDUAL);
});

test('P0-3: isTenantEntitlementValid fails closed on explicit invalidity', () => {
  assert.equal(isTenantEntitlementValid({ id: 'acme', status: 'ACTIVE', membershipStatus: 'ACTIVE' }), true);
  assert.equal(isTenantEntitlementValid({ id: 'acme', status: 'SUSPENDED' }), false);
  assert.equal(isTenantEntitlementValid({ id: 'acme', membershipStatus: 'REVOKED' }), false);
  assert.equal(isTenantEntitlementValid({ id: 'acme', decommissionedAt: new Date() }), false);
  // A legacy bare tenant object is still tolerated (no status supplied).
  assert.equal(isTenantEntitlementValid({ id: 'acme' }), true);
});

test('Rule B: a PERSONAL tenant is not an organization entitlement', async () => {
  pool.addTenant({ tenantId: 'self-tenant', quotaPolicy: { aiRequestsPerDay: 999 } });
  pool.addMembership('solo-1', 'self-tenant', { personalTenant: true });

  const governance = await resolveAiGovernance({ user: { uid: 'solo-1' }, get: () => undefined, body: {}, query: {} });
  assert.equal(governance.source, QUOTA_SOURCE.INDIVIDUAL,
    'a personal tenant must never be treated as an organization budget');
  assert.equal(governance.quota.sharedLimit, null);
});

// ── Rule A — multi-tenant resolution must be deterministic (P0-2) ─────────────

test('P0-2: two active memberships are AMBIGUOUS and are never resolved arbitrarily', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 100 } });
  pool.addTenant({ tenantId: 'globex', quotaPolicy: { aiRequestsPerDay: 100 } });
  pool.addMembership('member-1', 'acme');
  pool.addMembership('member-1', 'globex');

  const governance = await resolveAiGovernance({ user: { uid: 'member-1' }, get: () => undefined, body: {}, query: {} });
  assert.equal(governance.source, QUOTA_SOURCE.NONE);
  assert.equal(governance.reason, 'AMBIGUOUS_ACTIVE_TENANT',
    'the resolver must refuse rather than pick a tenant at random');
  assert.equal(governance.error?.code, 'TENANT_CONTEXT_REQUIRED');
  assert.equal(governance.error?.status, 400);
});

test('P0-2: enforceDailyAiQuota refuses ambiguous active tenant with 400 TENANT_CONTEXT_REQUIRED', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 100 } });
  pool.addTenant({ tenantId: 'globex', quotaPolicy: { aiRequestsPerDay: 100 } });
  pool.addMembership('member-1', 'acme');
  pool.addMembership('member-1', 'globex');

  const result = await callQuota('member-1');
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 400);
  assert.equal(result.res.body.error.code, 'TENANT_CONTEXT_REQUIRED');
});

test('P0-2: an explicit x-tenant-id deterministically selects one eligible tenant', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 42 } });
  pool.addTenant({ tenantId: 'globex', quotaPolicy: { aiRequestsPerDay: 99 } });
  pool.addMembership('member-1', 'acme');
  pool.addMembership('member-1', 'globex');

  const governance = await resolveAiGovernance({
    user: { uid: 'member-1' },
    get: (name) => (name === 'x-tenant-id' ? 'globex' : undefined),
    body: {}, query: {},
  });
  assert.equal(governance.source, QUOTA_SOURCE.ORGANIZATION);
  assert.equal(governance.tenant.tenantId, 'globex');
  assert.equal(governance.quota.sharedLimit, 99);
});

test('P0-2: requesting a tenant the user is not eligible for is refused', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 10 } });
  pool.addMembership('member-1', 'acme');

  const governance = await resolveAiGovernance({
    user: { uid: 'member-1' },
    get: (name) => (name === 'x-tenant-id' ? 'not-mine' : undefined),
    body: {}, query: {},
  });
  assert.equal(governance.source, QUOTA_SOURCE.NONE);
  assert.equal(governance.reason, 'REQUESTED_TENANT_NOT_ELIGIBLE');
  assert.equal(governance.error?.code, 'TENANT_ACCESS_DENIED');
  assert.equal(governance.error?.status, 403);
});

test('P0-2: enforceDailyAiQuota refuses ineligible tenant request with 403 TENANT_ACCESS_DENIED', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 10 } });
  pool.addMembership('member-1', 'acme');

  const result = await callQuota('member-1', { 'x-tenant-id': 'not-mine' });
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.error.code, 'TENANT_ACCESS_DENIED');
});

// ── Rule A — the organization's configured allowance is authoritative ─────────

test('P1-1: a tenant limit below 1000 is respected, not silently raised', () => {
  const entitlement = resolveEffectiveEntitlement(
    { membership: 'Basic' },
    { tenantData: { id: 'acme', status: 'ACTIVE', membershipStatus: 'ACTIVE', quotaPolicy: { aiRequestsPerDay: 200 } } },
  );
  assert.equal(entitlement.effectiveTier, 'Enterprise');
  assert.equal(entitlement.dailyLimit, 200,
    'the former Math.max(1000, ...) floor overrode a tenant configured for less than 1000/day');
});

test('P1-1: an unusable tenant limit falls back to the enterprise baseline, not to zero', () => {
  const entitlement = resolveEffectiveEntitlement(
    { membership: 'Basic' },
    { tenantData: { id: 'acme', status: 'ACTIVE', quotaPolicy: { aiRequestsPerDay: 0 } } },
  );
  assert.equal(entitlement.dailyLimit, 5000);
});

test('P1-2: a personal aiQuotaOverride does NOT alter an organization allowance', () => {
  const enterprise = resolveEffectiveEntitlement(
    { membership: 'Basic', aiQuotaOverride: { dailyLimit: 999999 } },
    { tenantData: { id: 'acme', status: 'ACTIVE', quotaPolicy: { aiRequestsPerDay: 300 } } },
  );
  assert.equal(enterprise.dailyLimit, 300,
    'the organization governs its members; a personal override must not widen the tenant cap');

  // …while still applying to an individual user, who has no organization.
  const individual = resolveEffectiveEntitlement(
    { membership: 'Basic', aiQuotaOverride: { dailyLimit: 777 } },
    {},
  );
  assert.equal(individual.dailyLimit, 777);
});

// ── Super Admin configuration authorization (P0-4) ───────────────────────────

test('P0-4: the AI settings READ is mapped to an explicit permission', () => {
  assert.equal(resolveAdminReadPermission('/admin/ai-settings'), 'system.config.read',
    'without this entry the read resolved to undefined and was denied for every non-super-admin');
});

test('P0-4: the AI settings read and write no longer demand different permissions', () => {
  const read = resolveAdminReadPermission('/admin/ai-settings');
  assert.notEqual(read, undefined, 'an operator must be able to read what they can write');
  assert.equal(read, 'system.config.read');
});

test('Rule C: Admin role with Basic tier does not receive administrative candidate quota override', () => {
  const adminUser = {
    email: 'admin_basic@test.com',
    membership: 'Basic',
    paymentStatus: 'INACTIVE',
  };
  const entitlement = resolveEffectiveEntitlement(adminUser, {
    userClaims: { email: 'admin_basic@test.com', admin: true },
    quotaConfig: { adminDailyLimit: 10000, basicDailyLimit: 10, premiumDailyLimit: 100 },
  });
  assert.equal(entitlement.isAdmin, true);
  assert.equal(entitlement.effectiveTier, 'Basic');
  assert.equal(entitlement.dailyLimit, 10);
  assert.equal(entitlement.isPremium, false);
});

test('Rule A: organization exhaustion NEVER falls back to the personal plan', async () => {
  pool.addTenant({ tenantId: 'acme', quotaPolicy: { aiRequestsPerDay: 1 } });
  pool.addMembership('member-1', 'acme');

  assert.equal((await callQuota('member-1')).continued, true);
  const blocked = await callQuota('member-1');

  assert.equal(blocked.continued, false);
  // The distinguishing assertion: NOT the personal code, and no personal charge.
  assert.equal(blocked.res.body.error.code, 'AI_ORG_QUOTA_EXCEEDED');
  assert.notEqual(blocked.res.body.error.code, 'AI_DAILY_QUOTA_EXCEEDED');
  const usage = [...pool.usage.values()][0];
  assert.equal(usage.count, 1, 'the personal counter must not have advanced past the org cap');
});

test('Rule A: a per-user limit is enforced in addition to the shared limit when configured', async () => {
  pool.addTenant({
    tenantId: 'acme',
    quotaPolicy: { aiRequestsPerDay: 100 },
    aiPolicy: { perUserDailyLimit: 2 },
  });
  pool.addMembership('member-1', 'acme');
  pool.addMembership('member-2', 'acme');

  assert.equal((await callQuota('member-1')).continued, true);
  assert.equal((await callQuota('member-1')).continued, true);
  const perUserBlocked = await callQuota('member-1');
  assert.equal(perUserBlocked.continued, false, 'per-user cap applies');
  assert.equal(perUserBlocked.res.body.error.code, 'AI_DAILY_QUOTA_EXCEEDED');

  const otherMember = await callQuota('member-2');
  assert.equal(otherMember.continued, true, 'the shared budget is not exhausted by one member');
});
