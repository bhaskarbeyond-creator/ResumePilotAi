'use strict';

/**
 * F-08: Tenant BYOK credentials are read by the inference path.
 * =====================================================================
 * Contract (developer-review/engine-findings.md F-08):
 *  - `aiPolicy.customProviderKeys` is write-only in production: the MySQL
 *    registry stores tenant keys exclusively in the encrypted
 *    `enterprise_tenant_credentials` table and drops inline keys on read.
 *  - `loadTenantByokKeys` closes the loop: for the tenant's allowed providers
 *    it reads the stored credentials (10s per-tenant cache, never logs key
 *    material) and the AI routes merge them into the policy before
 *    `applyTenantAiPolicy`, giving the resolution order
 *    tenant BYOK -> platform admin config -> environment default.
 *  - If the credential store IS supported but unreadable, the loader fails
 *    CLOSED (503 TENANT_BYOK_UNAVAILABLE) instead of silently burning
 *    platform keys on a tenant that promised its own.
 *  - End-to-end proof through the real Express app: a tenant whose ONLY key
 *    lives in the credential store is served with that key — the platform
 *    key for the same provider is rejected by the stub, so a 200 is only
 *    possible if the tenant key was used.
 *
 * Hermetic: in-memory rate limits, in-memory tenant registry (extended with
 * the credential-store contract), recorded fetch. No MariaDB required.
 */

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { InMemoryTenantRegistry } = require('./helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('./helpers/inMemoryEnterpriseRepository');
const { TenantService } = require('../enterprise/tenantService');
const { TenantQuotaGuard } = require('../enterprise/tenantQuota');
// F-27: production createTenantService always attaches a quota guard; the
// double mirrors that shape so unconditional quota consumption (fail-closed
// on a missing guard) exercises the real path. In-memory, per-test store.
const { InMemoryAtomicCounterStore } = require('./helpers/inMemoryAtomicCounterStore');
const { loadTenantByokKeys, clearTenantByokCache } = require('../enterprise/tenantAi');
const { setTokenVerifierForTests } = require('../security/auth');
const {
  clearProviderConfigurationCache,
  resetSharedAiRouterForTests,
} = require('../services/aiRuntime');
const { resetRepositoryCacheForTests } = require('../repositories');
const { installAiRouteContract } = require('./helpers/aiRouteContract');
const app = require('../index');

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------
const PLATFORM_GROQ_KEY = 'platform-groq-key-fixture-f08';
const PLATFORM_OPENAI_KEY = 'platform-openai-key-fixture-f08';
const TENANT_GROQ_KEY = 'gsk_TenantStoreOnly_f08_999';
const ALL_SECRETS = [PLATFORM_GROQ_KEY, PLATFORM_OPENAI_KEY, TENANT_GROQ_KEY];

const tokens = {
  alice: { uid: 'alice-f08', email: 'alice@byok.test', email_verified: true, role: 'USER' },
  admin: { uid: 'admin-f08', email: 'admin@byok.test', email_verified: true, role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) },
};
const bearer = (name) => `Bearer ${name}`;

const aiContract = installAiRouteContract({
  settings: {
    ai_providers: {
      openai: { apiKey: PLATFORM_OPENAI_KEY, model: 'gpt-4o-mini' },
      groq: { apiKey: PLATFORM_GROQ_KEY, model: 'llama-3.3-70b-versatile' },
    },
    public_config: {
      ai: { provider: 'groq', temperature: 0.3, maxTokens: 2000, enableFallback: false },
    },
  },
});

let activeRegistry = null;

function installTestTenantService() {
  activeRegistry = new InMemoryTenantRegistry();
  const repository = new InMemoryEnterpriseRepository();
  const service = new TenantService({ registry: activeRegistry, repository, quotaGuard: new TenantQuotaGuard({ store: new InMemoryAtomicCounterStore() }) });
  app.set('tenantService', service);
  aiContract.bindTenantRegistry(activeRegistry);
  return { registry: activeRegistry, service };
}

async function provisionTenant({ slug, principalId, aiPolicy }) {
  const res = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName: slug, slug });
  assert.equal(res.status, 201, `provision ${slug}: ${JSON.stringify(res.body)}`);
  const tenantId = res.body.tenant.id;
  const workspaceId = res.body.workspace.id;
  await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('admin'))
    .set('X-Tenant-Id', tenantId)
    .send({ principalId, workspaceId, roles: ['MEMBER'] });
  await activeRegistry.updateTenantConfiguration({ tenantId, input: { aiPolicy }, expectedRevision: 1 });
  return { tenantId, workspaceId };
}

function installFetchRecorder({ failKeys = [] } = {}) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const u = String(url);
    const headers = options.headers || {};
    const rawAuth = headers['Authorization'] || headers['authorization'] || null;
    const auth = rawAuth ? String(rawAuth).replace(/^Bearer\s+/, '') : null;
    const bodyStr = options.body ? String(options.body) : '';
    const marker = (bodyStr.match(/F08-MARKER-[A-Z0-9-]+/) || [null])[0];
    calls.push({ url: u, auth, bodyStr, marker });
    if (auth && failKeys.includes(auth)) {
      return {
        ok: false, status: 401, headers: { get: () => null },
        json: async () => ({ error: { message: 'invalid api key' } }),
        text: async () => 'invalid api key',
      };
    }
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: `Maintained deployment runbooks. ${marker || ''}`.trim(),
              sourceExcerpts: ['Maintained deployment runbooks', String(marker || '')],
            }),
          },
        }],
      }),
      text: async () => 'ok',
    };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

test.beforeEach(() => {
  resetRepositoryCacheForTests();
  aiContract.reinstallOverrides();
  aiContract.resetAdmission();
  clearProviderConfigurationCache();
  resetSharedAiRouterForTests();
  clearTenantByokCache();
  setTokenVerifierForTests(async (token) => {
    const user = tokens[token];
    if (!user) throw new Error('bad token');
    return user;
  });
  installTestTenantService();
});

test.afterEach(() => {
  resetRepositoryCacheForTests();
  clearProviderConfigurationCache();
  resetSharedAiRouterForTests();
  clearTenantByokCache();
});

// ---------------------------------------------------------------------------
// Part A — loader semantics (pure units against registry fakes).
// ---------------------------------------------------------------------------

function fakeRegistry({ byProvider = {}, failWith = null, reads = { count: 0 } } = {}) {
  return {
    reads,
    async getTenantCredentials({ tenantId, providerId }) {
      reads.count += 1;
      if (failWith) throw failWith;
      return byProvider[`${tenantId}:${providerId}`] ?? null;
    },
    async listTenantCredentialProviders({ tenantId }) {
      if (failWith) throw failWith;
      return Object.keys(byProvider)
        .filter(k => k.startsWith(`${tenantId}:`))
        .map(k => ({ providerId: k.slice(tenantId.length + 1) }));
    },
  };
}

const TENANT_A = '00000000-0000-4000-8000-0000000000a1';

test('A1: returns stored keys for allowed providers; skips providers with no stored credential', async () => {
  const registry = fakeRegistry({
    byProvider: { [`${TENANT_A}:groq`]: { apiKey: TENANT_GROQ_KEY } },
  });
  const keys = await loadTenantByokKeys({ registry, tenantId: TENANT_A, allowedProviders: ['groq', 'openai'] });
  assert.deepEqual(keys, { groq: TENANT_GROQ_KEY });
  assert.equal(registry.reads.count, 2, 'one store read per allowed provider');
});

test('A2: string credentials and case-insensitive provider ids are normalized', async () => {
  const registry = fakeRegistry({ byProvider: { [`${TENANT_A}:groq`]: 'raw-string-key' } });
  const keys = await loadTenantByokKeys({ registry, tenantId: TENANT_A, allowedProviders: ['GROQ'] });
  assert.deepEqual(keys, { groq: 'raw-string-key' });
});

test('A3: results are cached per tenant for the TTL, then re-read', async () => {
  const registry = fakeRegistry({ byProvider: { [`${TENANT_A}:groq`]: { apiKey: TENANT_GROQ_KEY } } });
  const t0 = 1_000_000;
  await loadTenantByokKeys({ registry, tenantId: TENANT_A, allowedProviders: ['groq'], ttlMs: 10_000, now: t0 });
  assert.equal(registry.reads.count, 1);
  await loadTenantByokKeys({ registry, tenantId: TENANT_A, allowedProviders: ['groq'], ttlMs: 10_000, now: t0 + 9_999 });
  assert.equal(registry.reads.count, 1, 'within TTL: served from cache, no store read');
  await loadTenantByokKeys({ registry, tenantId: TENANT_A, allowedProviders: ['groq'], ttlMs: 10_000, now: t0 + 10_001 });
  assert.equal(registry.reads.count, 2, 'after TTL expiry: re-read from store');
});

test('A4: unreadable credential store fails CLOSED with 503 and is not negatively cached', async () => {
  const encryptionDown = Object.assign(new Error('Enterprise encryption is not configured'), {
    code: 'ENTERPRISE_ENCRYPTION_UNAVAILABLE', status: 503,
  });
  const registry = fakeRegistry({ failWith: encryptionDown });
  await assert.rejects(
    () => loadTenantByokKeys({ registry, tenantId: TENANT_A, allowedProviders: ['groq'] }),
    (err) => {
      assert.equal(err.code, 'TENANT_BYOK_UNAVAILABLE');
      assert.equal(err.status, 503);
      assert.ok(!err.message.includes(TENANT_GROQ_KEY), 'error message never carries key material');
      return true;
    }
  );
  // Store recovers -> next call succeeds (failure was not cached).
  const healed = fakeRegistry({ byProvider: { [`${TENANT_A}:groq`]: { apiKey: TENANT_GROQ_KEY } } });
  const keys = await loadTenantByokKeys({ registry: healed, tenantId: TENANT_A, allowedProviders: ['groq'] });
  assert.deepEqual(keys, { groq: TENANT_GROQ_KEY });
});

test('A5: registry without credential-store capability yields {} (BYOK not deployed)', async () => {
  const keys = await loadTenantByokKeys({ registry: {}, tenantId: TENANT_A, allowedProviders: ['groq'] });
  assert.deepEqual(keys, {});
  const noTenant = await loadTenantByokKeys({ registry: fakeRegistry({}), tenantId: '', allowedProviders: ['groq'] });
  assert.deepEqual(noTenant, {});
});

test('A6: without allowedProviders the loader enumerates stored providers', async () => {
  const registry = fakeRegistry({
    byProvider: {
      [`${TENANT_A}:groq`]: { apiKey: TENANT_GROQ_KEY },
      [`${TENANT_A}:openai`]: { apiKey: 'sk-tenant-openai-f08' },
    },
  });
  const keys = await loadTenantByokKeys({ registry, tenantId: TENANT_A });
  assert.deepEqual(keys, { groq: TENANT_GROQ_KEY, openai: 'sk-tenant-openai-f08' });
});

// ---------------------------------------------------------------------------
// Part B — end-to-end through the real app: the STORED tenant key is served.
// ---------------------------------------------------------------------------

test('B1: tenant key stored ONLY in the credential store wins over the platform key', async () => {
  const { tenantId } = await provisionTenant({
    slug: 'byok-store-only',
    principalId: tokens.alice.uid,
    // NOTE: no customProviderKeys on the policy — the MySQL registry drops
    // those on read in production, so the store is the only source.
    aiPolicy: { allowedProviders: ['groq'] },
  });
  await activeRegistry.setTenantCredentials({
    tenantId, providerId: 'groq', credentials: { apiKey: TENANT_GROQ_KEY },
  });

  // The stub REJECTS the platform key: a 200 is only possible if the request
  // carried the tenant's stored key.
  const recorder = installFetchRecorder({ failKeys: [PLATFORM_GROQ_KEY] });
  try {
    const res = await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantId)
      .send({
        operation: 'generate-summary',
        payload: { jobTitle: 'Staff Engineer', sourceFacts: 'Maintained deployment runbooks. F08-MARKER-B1' },
      });

    assert.equal(res.status, 200, `response: ${JSON.stringify(res.body)}`);
    const b1Calls = recorder.calls.filter(c => c.marker === 'F08-MARKER-B1');
    assert.equal(b1Calls.length, 1, 'exactly one provider call');
    assert.ok(b1Calls[0].url.includes('groq.com'), 'called groq (the allowed provider)');
    assert.equal(b1Calls[0].auth, TENANT_GROQ_KEY, 'provider call carried the STORED tenant key');

    // No secret leaks into the response.
    const serialized = JSON.stringify(res.body) + JSON.stringify(res.headers);
    for (const secret of ALL_SECRETS) {
      assert.ok(!serialized.includes(secret), 'no credential leaks into the API response');
    }
  } finally {
    recorder.restore();
  }
});

test('B2: platform (non-tenant) requests keep using platform credentials', async () => {
  const recorder = installFetchRecorder({ failKeys: [TENANT_GROQ_KEY] });
  try {
    const res = await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('alice'))
      .send({
        operation: 'generate-summary',
        payload: { jobTitle: 'Staff Engineer', sourceFacts: 'Maintained deployment runbooks. F08-MARKER-B2' },
      });
    assert.equal(res.status, 200, `response: ${JSON.stringify(res.body)}`);
    const b2Calls = recorder.calls.filter(c => c.marker === 'F08-MARKER-B2');
    assert.equal(b2Calls.length, 1);
    assert.equal(b2Calls[0].auth, PLATFORM_GROQ_KEY, 'control: platform request uses the platform key');
  } finally {
    recorder.restore();
  }
});
