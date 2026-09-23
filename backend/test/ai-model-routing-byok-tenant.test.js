'use strict';

/**
 * AI Model Routing — BYOK Credential Correctness & Multi-Tenant Isolation
 * =======================================================================
 * End-to-end (HTTP) proof through the real Express app + tenant service:
 *  - every provider call (discovery-free fast path, execution, retry,
 *    fallback) carries the CORRECT TENANT's BYOK credential for that
 *    tenant/provider — concurrency included;
 *  - Tenant A's failure can NEVER consume Tenant B's key or provider
 *    (no cross-tenant fallback, ever);
 *  - tenant policy (allowedProviders) strictly bounds which providers a
 *    tenant may use, including on the fallback path;
 *  - a user-controlled X-Tenant-Id naming another tenant fails closed;
 *  - credentials never appear in API responses, response headers, routing
 *    telemetry, or health snapshots;
 *  - platform (non-tenant) requests use platform credentials (control).
 *
 * The rate-limit store is injected in-memory (the codebase's documented
 * test hook) so this suite is hermetic: no MariaDB required.
 */

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { InMemoryTenantRegistry } = require('./helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('./helpers/inMemoryEnterpriseRepository');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const {
  clearProviderConfigurationCache,
  resetSharedAiRouterForTests,
  getSharedAiRouter,
} = require('../services/aiRuntime');
const { resetRepositoryCacheForTests } = require('../repositories');
const { installAiRouteContract } = require('./helpers/aiRouteContract');
const app = require('../index');

// ---------------------------------------------------------------------------
// Platform AI (what a non-tenant request uses).
// ---------------------------------------------------------------------------
const PLATFORM_OPENAI_KEY = 'platform-openai-key-fixture-9x';
const PLATFORM_GROQ_KEY = 'platform-groq-key-fixture-8y';
const PLATFORM_AI_PUBLIC = {
  ai: { provider: 'openai', temperature: 0.3, maxTokens: 2000, enableFallback: true },
};
const PLATFORM_AI_SECRETS = {
  openai: { apiKey: PLATFORM_OPENAI_KEY, model: 'gpt-4o-mini' },
  groq: { apiKey: PLATFORM_GROQ_KEY, model: 'llama-3.3-70b-versatile' },
};

// Tenant BYOK credentials (the strings under test — must never leak).
const KEY_A_OPENAI = 'sk-contoso-openai-byok-11111111';
const KEY_A_GROQ = 'gsk_ContosoGroqByok111';
const KEY_B_GROQ = 'gsk_MayoGroqByok222';
const KEY_C_OPENAI = 'sk-precise-openai-byok-33333333';
const ALL_SECRETS = [PLATFORM_OPENAI_KEY, PLATFORM_GROQ_KEY, KEY_A_OPENAI, KEY_A_GROQ, KEY_B_GROQ, KEY_C_OPENAI];

const tokens = {
  alice: { uid: 'alice-candidate', email: 'alice@contoso.com', email_verified: true, role: 'USER' },
  bob: { uid: 'bob-candidate', email: 'bob@mayo.com', email_verified: true, role: 'USER' },
  carol: { uid: 'carol-candidate', email: 'carol@precise.com', email_verified: true, role: 'USER' },
  admin: { uid: 'admin-enterprise', email: 'admin@enterprise.com', email_verified: true, role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) },
};
const bearer = (name) => `Bearer ${name}`;

// Hermetic pool/repository/admission contract (mocks the MariaDB-backed
// daily AI quota ledger + provider settings) — the codebase's documented
// test harness for AI route tests without a database.
const aiContract = installAiRouteContract({
  settings: {
    ai_providers: PLATFORM_AI_SECRETS,
    public_config: PLATFORM_AI_PUBLIC,
  },
});

let activeRegistry = null;

function installTestTenantService() {
  activeRegistry = new InMemoryTenantRegistry();
  const repository = new InMemoryEnterpriseRepository();
  const service = new TenantService({ registry: activeRegistry, repository });
  app.set('tenantService', service);
  return { registry: activeRegistry, repository, service };
}

async function provisionTenant({ slug, displayName, principalId, aiPolicy }) {
  const res = await request(app)
    .post('/api/enterprise/tenants')
    .set('Authorization', bearer('admin'))
    .send({ displayName, slug });
  assert.equal(res.status, 201, `provision ${slug}: ${JSON.stringify(res.body)}`);
  const tenantId = res.body.tenant.id;
  const workspaceId = res.body.workspace.id;
  await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('admin'))
    .set('X-Tenant-Id', tenantId)
    .send({ principalId, workspaceId, roles: ['MEMBER'] });
  await activeRegistry.updateTenantConfiguration({
    tenantId,
    input: { aiPolicy },
    expectedRevision: 1,
  });
  return { tenantId, workspaceId };
}

function summaryPayload(marker, jobTitle = 'Staff Engineer') {
  return { jobTitle, sourceFacts: `Maintained deployment runbooks. ${marker}` };
}

/**
 * Records every provider HTTP call with url/auth/prompt-marker. The success
 * payload is source-derived (summary quotes the source facts) so the app's
 * grounding validation passes and we exercise the real 200 path.
 */
function installFetchRecorder({
  failKeys = [],
  okContent = (marker) => ({
    summary: `Maintained deployment runbooks. ${marker}`,
    sourceExcerpts: [`Maintained deployment runbooks`, String(marker)],
  }),
} = {}) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const u = String(url);
    const headers = options.headers || {};
    const rawAuth = headers['Authorization'] || headers['authorization'] || (u.includes('key=') ? `key=${u.split('key=')[1]}` : null);
    const auth = rawAuth ? String(rawAuth).replace(/^Bearer\s+/, '').replace(/^key=/, '') : null;
    const bodyStr = options.body ? String(options.body) : '';
    const marker = (bodyStr.match(/RUNBOOK-MARKER-[A-Z0-9-]+/) || [null])[0];
    calls.push({ url: u, auth, bodyStr, marker });
    const provider = u.includes('openai.com') ? 'openai' : (u.includes('groq.com') ? 'groq' : 'other');
    if (auth && failKeys.includes(auth)) {
      return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({ error: { message: `${provider} down for this key` } }), text: async () => 'down' };
    }
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content: JSON.stringify(okContent(marker)) } }] }),
      text: async () => 'ok',
    };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

test.beforeEach(() => {
  // Re-assert the test repository override: resetRepositoryCacheForTests()
  // (afterEach) clears it, and without it loadProviderConfiguration's
  // settings read would fall through to the real repository/pool.
  resetRepositoryCacheForTests();
  aiContract.reinstallOverrides();
  aiContract.resetAdmission();
  clearProviderConfigurationCache();
  resetSharedAiRouterForTests();
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
});

// ---------------------------------------------------------------------------
test('1. Concurrent Tenant A vs Tenant B: every call carries its own tenant\'s BYOK credential', async () => {
  const { tenantId: tenantA } = await provisionTenant({
    slug: 'byok-contoso', displayName: 'Contoso Cloud', principalId: tokens.alice.uid,
    aiPolicy: { allowedProviders: ['openai', 'groq'], customProviderKeys: { openai: KEY_A_OPENAI, groq: KEY_A_GROQ } },
  });
  const { tenantId: tenantB } = await provisionTenant({
    slug: 'byok-mayo', displayName: 'Mayo Clinic', principalId: tokens.bob.uid,
    aiPolicy: { allowedProviders: ['groq'], customProviderKeys: { groq: KEY_B_GROQ } },
  });

  const recorder = installFetchRecorder({});
  try {
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/generate-content')
        .set('Authorization', bearer('alice'))
        .set('X-Tenant-Id', tenantA)
        .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-A1') }),
      request(app)
        .post('/api/generate-content')
        .set('Authorization', bearer('bob'))
        .set('X-Tenant-Id', tenantB)
        .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-B1') }),
    ]);

    assert.equal(resA.status, 200, `A: ${JSON.stringify(resA.body)}`);
    assert.equal(resB.status, 200, `B: ${JSON.stringify(resB.body)}`);
    assert.equal(resA.headers['x-ai-provider'], 'openai', 'A primary = openai (platform primary, BYOK key)');
    assert.equal(resB.headers['x-ai-provider'], 'groq', 'B primary = groq (its only allowed provider)');

    const aCalls = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-A1');
    const bCalls = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-B1');
    assert.equal(aCalls.length, 1);
    assert.equal(bCalls.length, 1);
    assert.ok(aCalls[0].url.includes('openai.com'), 'A called openai');
    assert.equal(aCalls[0].auth, KEY_A_OPENAI, 'A used its own openai BYOK key — not the platform key');
    assert.ok(bCalls[0].url.includes('groq.com'), 'B called groq');
    assert.equal(bCalls[0].auth, KEY_B_GROQ, 'B used its own groq BYOK key');

    // No tenant ever consumed a platform credential.
    for (const c of recorder.calls) {
      assert.notEqual(c.auth, PLATFORM_OPENAI_KEY, 'platform openai key never used by a tenant');
      assert.notEqual(c.auth, PLATFORM_GROQ_KEY, 'platform groq key never used by a tenant');
    }
    // And no credential crossed tenant boundaries.
    for (const c of aCalls) assert.ok([KEY_A_OPENAI, KEY_A_GROQ].includes(c.auth), 'A calls only carry A credentials');
    for (const c of bCalls) assert.ok([KEY_B_GROQ].includes(c.auth), 'B calls only carry B credentials');
  } finally {
    recorder.restore();
  }
});

// ---------------------------------------------------------------------------
test('2. Tenant A failure NEVER falls back to Tenant B credential/provider (same-tenant only)', async () => {
  const { tenantId: tenantA } = await provisionTenant({
    slug: 'byok-contoso-2', displayName: 'Contoso Cloud Two', principalId: tokens.alice.uid,
    aiPolicy: { allowedProviders: ['openai', 'groq'], customProviderKeys: { openai: KEY_A_OPENAI, groq: KEY_A_GROQ } },
  });
  const { tenantId: tenantB } = await provisionTenant({
    slug: 'byok-mayo-2', displayName: 'Mayo Clinic Two', principalId: tokens.bob.uid,
    aiPolicy: { allowedProviders: ['groq'], customProviderKeys: { groq: KEY_B_GROQ } },
  });

  // A's openai key fails on the provider side; groq works for both tenants.
  const recorder = installFetchRecorder({ failKeys: [KEY_A_OPENAI] });
  try {
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/generate-content')
        .set('Authorization', bearer('alice'))
        .set('X-Tenant-Id', tenantA)
        .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-A2') }),
      request(app)
        .post('/api/generate-content')
        .set('Authorization', bearer('bob'))
        .set('X-Tenant-Id', tenantB)
        .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-B2') }),
    ]);

    assert.equal(resA.status, 200, `A recovered on its own groq: ${JSON.stringify(resA.body)}`);
    assert.equal(resA.headers['x-ai-provider'], 'groq', 'A fell back to its own groq BYOK credential');
    assert.equal(resB.status, 200);
    assert.equal(resB.headers['x-ai-provider'], 'groq');

    const aCalls = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-A2');
    const bCalls = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-B2');
    assert.deepEqual(
      aCalls.map(c => c.auth),
      [KEY_A_OPENAI, KEY_A_GROQ],
      'A: openai attempted once (its key), then groq (its key) — never B credentials',
    );
    assert.ok(aCalls[0].url.includes('openai.com') && aCalls[1].url.includes('groq.com'));
    assert.deepEqual(bCalls.map(c => c.auth), [KEY_B_GROQ], 'B ran independently on its own key');

    // Tenant-scoped health: A's failed openai attempt is recorded under A only.
    const router = getSharedAiRouter();
    const aSnapshot = router.health.tenantSnapshot(tenantA);
    assert.ok(aSnapshot.some(e => e.provider === 'openai'), 'A\'s failed openai attempt is recorded under tenant A');
    const bSnapshot = router.health.tenantSnapshot(tenantB);
    assert.ok(!bSnapshot.some(e => e.provider === 'openai'), 'no openai health state recorded under tenant B');
  } finally {
    recorder.restore();
  }
});

// ---------------------------------------------------------------------------
test('3. Tenant policy bounds the fallback path: a disallowed provider is never used to "save" a failing request', async () => {
  const { tenantId: tenantC } = await provisionTenant({
    slug: 'byok-precise', displayName: 'Precise Labs', principalId: tokens.carol.uid,
    aiPolicy: { allowedProviders: ['openai'], customProviderKeys: { openai: KEY_C_OPENAI } },
  });

  const recorder = installFetchRecorder({ failKeys: [KEY_C_OPENAI] });
  try {
    const resC = await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('carol'))
      .set('X-Tenant-Id', tenantC)
      .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-C1') });

    // openai is the ONLY allowed provider and it failed → the request must
    // degrade to the explicit AI-unavailable state, and groq (allowed for
    // other tenants) must NEVER be consumed for C.
    assert.equal(resC.status, 200, 'source-preserving fallback, not a crash');
    assert.equal(resC.headers['x-ai-provider'], 'fallback', 'no real provider served C');
    assert.equal(resC.body.aiUnavailable, true, 'client-visible explicit unavailable flag');
    const cCalls = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-C1');
    assert.ok(cCalls.length >= 1, 'the request was attempted');
    assert.ok(cCalls.every(c => c.url.includes('openai.com')), 'C only ever touched its allowed provider');
    assert.ok(cCalls.every(c => c.auth === KEY_C_OPENAI));
  } finally {
    recorder.restore();
  }
});

// ---------------------------------------------------------------------------
test('4. User-controlled X-Tenant-Id naming another tenant fails closed (no credential selection by payload)', async () => {
  const { tenantId: tenantA } = await provisionTenant({
    slug: 'byok-contoso-4', displayName: 'Contoso Four', principalId: tokens.alice.uid,
    aiPolicy: { allowedProviders: ['openai'], customProviderKeys: { openai: KEY_A_OPENAI } },
  });
  const { tenantId: tenantB } = await provisionTenant({
    slug: 'byok-mayo-4', displayName: 'Mayo Four', principalId: tokens.bob.uid,
    aiPolicy: { allowedProviders: ['groq'], customProviderKeys: { groq: KEY_B_GROQ } },
  });

  const recorder = installFetchRecorder({});
  try {
    // Alice (member of A) claims to be in B. Both the production (MySQL) and
    // in-memory registries fail closed with TENANT_MEMBERSHIP_NOT_FOUND (404)
    // for non-members — denying access without leaking tenant existence.
    const res = await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantB)
      .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-X1') });
    assert.equal(res.status, 404, `expected fail-closed 404, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(res.body.error.code, 'TENANT_MEMBERSHIP_NOT_FOUND');

    // Payload-embedded tenant hints are ignored as authority (context comes from auth+membership).
    const res2 = await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantA)
      .send({ operation: 'generate-summary', tenantId: tenantB, payload: summaryPayload('RUNBOOK-MARKER-X2') });
    assert.equal(res2.status, 200, 'body tenantId does not override the authenticated header tenant');
    const x2 = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-X2');
    assert.equal(x2.length, 1);
    assert.equal(x2[0].auth, KEY_A_OPENAI, 'credential selected from the AUTHENTICATED tenant, not the payload');

    const x1 = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-X1');
    assert.equal(x1.length, 0, 'denied request never reached a provider');
  } finally {
    recorder.restore();
  }
});

// ---------------------------------------------------------------------------
test('5. Credentials never appear in responses, headers, routing telemetry, or health snapshots', async () => {
  const { tenantId: tenantA } = await provisionTenant({
    slug: 'byok-contoso-5', displayName: 'Contoso Five', principalId: tokens.alice.uid,
    aiPolicy: { allowedProviders: ['openai', 'groq'], customProviderKeys: { openai: KEY_A_OPENAI, groq: KEY_A_GROQ } },
  });

  const recorder = installFetchRecorder({ failKeys: [KEY_A_OPENAI] });
  try {
    const res = await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantA)
      .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-S1') });
    assert.equal(res.status, 200);

    const surface = JSON.stringify({ body: res.body, headers: res.headers });
    for (const secret of ALL_SECRETS) {
      assert.ok(!surface.includes(secret), `secret leaked into response surface: ${secret.slice(0, 8)}...`);
    }

    // Routing telemetry (tenant-scoped) must be secret-free.
    const router = getSharedAiRouter();
    const entries = router.telemetry.query({ tenantId: tenantA, limit: 50 });
    assert.ok(entries.length >= 1, 'telemetry recorded for the tenant');
    for (const entry of entries) {
      const text = JSON.stringify(entry);
      for (const secret of ALL_SECRETS) assert.ok(!text.includes(secret), `secret leaked into telemetry`);
    }
    // Platform-scope query must not return tenant entries (isolation of the query itself).
    assert.equal(router.telemetry.query({}).filter(e => e.tenantId === tenantA).length, 0);

    // Health snapshots are tenant-scoped and secret-free.
    const snapshot = JSON.stringify(router.health.tenantSnapshot(tenantA));
    for (const secret of ALL_SECRETS) assert.ok(!snapshot.includes(secret), 'secret leaked into health snapshot');
  } finally {
    recorder.restore();
  }
});

// ---------------------------------------------------------------------------
test('6. Platform (non-tenant) request uses platform credentials — control case', async () => {
  const recorder = installFetchRecorder({});
  try {
    const res = await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('alice'))
      .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-P1') });
    assert.equal(res.status, 200);
    const pCalls = recorder.calls.filter(c => c.marker === 'RUNBOOK-MARKER-P1');
    assert.equal(pCalls.length, 1);
    assert.ok(pCalls[0].url.includes('openai.com'));
    assert.equal(pCalls[0].auth, PLATFORM_OPENAI_KEY, 'platform request uses the platform key, not any tenant BYOK key');
  } finally {
    recorder.restore();
  }
});

// ---------------------------------------------------------------------------
test('7. Tenant-scoped routing state does not leak across tenants (telemetry + health isolation)', async () => {
  const { tenantId: tenantA } = await provisionTenant({
    slug: 'byok-contoso-7', displayName: 'Contoso Seven', principalId: tokens.alice.uid,
    aiPolicy: { allowedProviders: ['openai'], customProviderKeys: { openai: KEY_A_OPENAI } },
  });
  const { tenantId: tenantB } = await provisionTenant({
    slug: 'byok-mayo-7', displayName: 'Mayo Seven', principalId: tokens.bob.uid,
    aiPolicy: { allowedProviders: ['groq'], customProviderKeys: { groq: KEY_B_GROQ } },
  });

  const recorder = installFetchRecorder({ failKeys: [KEY_A_OPENAI] });
  try {
    await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('alice'))
      .set('X-Tenant-Id', tenantA)
      .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-I1') });
    await request(app)
      .post('/api/generate-content')
      .set('Authorization', bearer('bob'))
      .set('X-Tenant-Id', tenantB)
      .send({ operation: 'generate-summary', payload: summaryPayload('RUNBOOK-MARKER-I2') });

    const router = getSharedAiRouter();
    const aEntries = router.telemetry.query({ tenantId: tenantA });
    const bEntries = router.telemetry.query({ tenantId: tenantB });
    assert.ok(aEntries.length >= 1 && bEntries.length >= 1);
    assert.ok(aEntries.every(e => e.tenantId === tenantA), 'A query returns only A entries');
    assert.ok(bEntries.every(e => e.tenantId === tenantB), 'B query returns only B entries');

    // A had a failing openai attempt; B must have no openai health state at all.
    const aHealth = router.health.tenantSnapshot(tenantA);
    const bHealth = router.health.tenantSnapshot(tenantB);
    assert.ok(aHealth.some(e => e.provider === 'openai'), 'A has openai health state');
    assert.ok(!bHealth.some(e => e.provider === 'openai'), 'B has no openai health state');
  } finally {
    recorder.restore();
  }
});
