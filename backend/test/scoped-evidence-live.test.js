'use strict';

/**
 * PH4-ENGINE-021 C.1 — router-level scoped-evidence drills with the real
 * modules (flag ON) plus the flag-OFF control. Test-plan part-2 items 4/5
 * shapes at unit level: two-tenant divergence (F-21 closure) and cross-tenant
 * cooldown with the physics-honesty leg. Hermetic: :memory: metrics store,
 * stub fetchImpl, no MariaDB, no network, no timers.
 *
 * FREELMAPI_TENANT_SCOPED_EVIDENCE is set per test and always restored — the
 * flag defaults to '0' and the flag-OFF control (L5) proves the sink-hole
 * stays byte-identical.
 */

process.env.FREELMAPI_METRICS_DB = ':memory:';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const { getMetricsPersistence } = require('../freellmapi/services/persistence');
const freellm = require('../freellmapi');

const FLAG = 'FREELMAPI_TENANT_SCOPED_EVIDENCE';
const NOW = Date.now();

function withFlag(on, fn) {
  return async () => {
    const previous = process.env[FLAG];
    if (on) process.env[FLAG] = '1'; else delete process.env[FLAG];
    try {
      await fn();
    } finally {
      if (previous === undefined) delete process.env[FLAG]; else process.env[FLAG] = previous;
    }
  };
}

function baseProviders() {
  return {
    openai: { enabled: true, key: 'fixture-platform-openai-key', model: 'gpt-fixture' },
    groq: { enabled: true, key: 'fixture-platform-groq-key', model: 'groq-fixture' },
  };
}

function makeRouter({ attach = true } = {}) {
  freellm.resetMetricsForTests();
  const persistence = getMetricsPersistence();
  const router = new FreeLlmRouter();
  router.cooldownManager = new CooldownManager();
  if (attach) router.cooldownManager.attachPersistence(persistence);
  router.modelDiscovery = {
    getOrDiscover: async ({ providerId }) => [{ id: providerId === 'openai' ? 'gpt-fixture' : 'groq-fixture', capabilities: {} }],
  };
  return { router, persistence };
}

const failingFetch429 = async () => new Response(JSON.stringify({ error: { message: 'rate limited fixture' } }), {
  status: 429,
  headers: { 'Retry-After': '60', 'Content-Type': 'application/json' },
});

const okFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'scoped fixture served' } }] }));

function byokContext(tenantId) {
  return {
    tenantId,
    customProviderKeys: { groq: `gsk_tenant-${tenantId}-byok-key` },
    allowedProviders: ['groq'],
    primaryModel: 'groq-fixture',
  };
}

// ---------------------------------------------------------------------------
// L1 — the sink-hole is replaced: a scoped BYOK failure trains its OWN scope.
// ---------------------------------------------------------------------------

test('L1: flag ON — dedicated-BYOK failure records tenant-scoped metrics + tenant-scoped cooldown; platform stores stay empty', withFlag(true, async () => {
  const { router, persistence } = makeRouter();
  await assert.rejects(() => router.routeCompletion({
    prompt: 'C.1 scoped BYOK failure fixture',
    bypassCache: true,
    fetchImpl: failingFetch429,
    tenantContext: byokContext('tenant-a'),
    platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseProviders() },
  }));

  assert.equal(persistence.getRollingAggregates({ windowMs: 30 * 60_000 }).length, 0, 'the platform rank received nothing (F-09 sanctuary intact)');
  const scoped = persistence.getRollingAggregates({ windowMs: 30 * 60_000, scopeKey: 'tenant:tenant-a' });
  assert.equal(scoped.length, 1, 'the tenant scope retained its own evidence');
  assert.equal(scoped[0].provider, 'groq');
  assert.equal(scoped[0].failures, 1);
  assert.equal(scoped[0].scopeKey, 'tenant:tenant-a');

  const platformView = router.cooldownManager.isOnCooldown('groq', 'groq-fixture');
  assert.equal(platformView.onCooldown, false, 'no platform bench from tenant credentials');
  const tenantView = router.cooldownManager.isOnCooldown('groq', 'groq-fixture', { scopeKey: 'tenant:tenant-a' });
  assert.equal(tenantView.onCooldown, true);
  assert.equal(tenantView.scopeKey, 'tenant:tenant-a');
  assert.equal(tenantView.credentialKind, 'byok');
  assert.equal(persistence.loadCooldowns({ scopeKey: 'platform' }).length, 0);
  assert.equal(persistence.loadCooldowns({ scopeKey: 'tenant:tenant-a' }).length, 1, 'the scoped bench is durable in its own scope');
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// L2 — F-21 closure at the router level: tenant A's rank flips on A's OWN
//      evidence while tenant B's selection is untouched.
// ---------------------------------------------------------------------------

test('L2: flag ON — two-tenant divergence: A flips on A-scoped evidence, B keeps the default order, platform stays empty', withFlag(true, async () => {
  const { router, persistence } = makeRouter();
  const scopeA = 'tenant:tenant-a';
  // A's scoped window: openai is consistently ~3000ms (plus one stale 4ms blip),
  // groq is consistently ~800ms — the same fixture that flips the platform
  // speed-mode rank in F-07, now seeded in A's scope only.
  persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 240_000, scopeKey: scopeA });
  persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 180_000, scopeKey: scopeA });
  persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 120_000, scopeKey: scopeA });
  persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 60_000, scopeKey: scopeA });
  persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 4, at: NOW - 1000, scopeKey: scopeA });
  for (let i = 0; i < 5; i += 1) {
    persistence.recordRequest({ provider: 'groq', model: 'groq-fixture', ok: true, status: 200, latencyMs: 800 + i * 5, at: NOW - i * 20_000, scopeKey: scopeA });
  }

  const served = [];
  const fetchImpl = async (_url, options) => {
    served.push(String(JSON.parse(options.body || '{}').model));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'scoped divergence served' } }] }));
  };
  const twoProviderByok = tenantId => ({
    tenantId,
    customProviderKeys: { groq: `gsk_tenant-${tenantId}-groq`, openai: `sk_tenant-${tenantId}-openai` },
    allowedProviders: ['groq', 'openai'],
  });
  const platformConfig = { selectionMode: 'speed', primary: 'openai', providers: baseProviders() };

  // Tenant A: its OWN matured window must flip the rank away from the primary.
  const resultA = await router.routeCompletion({
    prompt: 'C.1 tenant A divergence fixture', bypassCache: true, fetchImpl,
    tenantContext: twoProviderByok('tenant-a'), platformConfig,
  });
  assert.equal(resultA.provider, 'groq', "A's selection flipped on A's scoped evidence");

  // Tenant B: no scoped evidence — the default (primary-first) order holds.
  const resultB = await router.routeCompletion({
    prompt: 'C.1 tenant B divergence fixture', bypassCache: true, fetchImpl,
    tenantContext: twoProviderByok('tenant-b'), platformConfig,
  });
  assert.equal(resultB.provider, 'openai', "B's selection is untouched by A's evidence");

  assert.equal(persistence.getRollingAggregates({ windowMs: 30 * 60_000 }).length, 0, 'BYOK traffic never trains the platform rank — under the flag too');
  assert.ok(served.includes('groq-fixture') && served.includes('gpt-fixture'));
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// L3 — cross-tenant cooldown + the physics-honesty leg.
// ---------------------------------------------------------------------------

test('L3: flag ON — A bursting into 429s benches A only; B is served; a PLATFORM bench still applies to everyone', withFlag(true, async () => {
  const { router, persistence } = makeRouter();
  // Tenant A bursts its BYOK key into a 429:
  await assert.rejects(() => router.routeCompletion({
    prompt: 'C.1 cross-tenant cooldown fixture A', bypassCache: true, fetchImpl: failingFetch429,
    tenantContext: byokContext('tenant-a'),
    platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseProviders() },
  }));
  // Tenant B, same provider+model, its OWN credentials: served normally.
  const resultB = await router.routeCompletion({
    prompt: 'C.1 cross-tenant cooldown fixture B', bypassCache: true, fetchImpl: okFetch,
    tenantContext: byokContext('tenant-b'),
    platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseProviders() },
  });
  assert.equal(resultB.provider, 'groq', 'B is unaffected by A\'s credential bench');

  // Physics-honesty leg: a PLATFORM-credential 429 (platform-key tenant
  // traffic, F-09) benches the destination for EVERYONE, scoped callers included.
  await assert.rejects(() => router.routeCompletion({
    prompt: 'C.1 platform credential bench fixture', bypassCache: true, fetchImpl: failingFetch429,
    tenantContext: { tenantId: 'tenant-c', customProviderKeys: {}, allowedProviders: ['groq'] },
    platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseProviders() },
  }));
  const platformRow = router.cooldownManager.isOnCooldown('groq', 'groq-fixture');
  assert.equal(platformRow.onCooldown, true, 'the platform bench exists');
  const scopedView = router.cooldownManager.isOnCooldown('groq', 'groq-fixture', { scopeKey: 'tenant:tenant-b' });
  assert.equal(scopedView.onCooldown, true, 'a shared-credential bench is a fact about the provider for everyone');
  assert.equal(scopedView.scopeKey, 'platform');
  assert.equal(persistence.loadCooldowns({ scopeKey: 'platform' }).length, 1);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// L4 — F-14 scoped release: a tenant's last-resort release never lifts the
//      platform row; the deviation stays visible as routingDecision.lastResort.
// ---------------------------------------------------------------------------

test('L4: flag ON — scoped last-resort release clears the tenant row only; the platform bench survives', withFlag(true, async () => {
  const { router } = makeRouter();
  // A platform bench AND a tenant bench on the same destination:
  router.cooldownManager.setCooldown('groq', 'groq-fixture', 'HTTP 429 across all pooled keys');
  router.cooldownManager.setCooldown('groq', 'groq-fixture', 'HTTP 429 on tenant credentials', null, { scopeKey: 'tenant:tenant-a', credentialKind: 'byok' });

  const candidates = await router.buildCandidateList({
    tenantContext: byokContext('tenant-a'),
    platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: true, providers: baseProviders() },
    fetchImpl: okFetch,
  });
  const released = candidates.find(candidate => candidate.routingDecision?.lastResort === true);
  assert.ok(released, 'the tenant-scope bench was released last-resort and the candidate is routed');
  assert.equal(released.provider, 'groq');
  // The platform row must have survived the tenant's release:
  assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-fixture').onCooldown, true, 'F-14 scope guard: platform bench intact');
  assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-fixture', { scopeKey: 'tenant:tenant-b' }).onCooldown, true, 'other tenants still fall through to the platform bench');
  const tenantView = router.cooldownManager.isOnCooldown('groq', 'groq-fixture', { scopeKey: 'tenant:tenant-a' });
  assert.equal(tenantView.scopeKey, 'platform', "A's own row is gone; only the platform credential fact remains visible to A");
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// L5 — flag-OFF control: the legacy sink-hole is byte-identical.
// ---------------------------------------------------------------------------

test('L5: flag OFF — dedicated-BYOK failure produces zero metrics and zero cooldowns anywhere (legacy sink-hole)', withFlag(false, async () => {
  const { router, persistence } = makeRouter();
  await assert.rejects(() => router.routeCompletion({
    prompt: 'C.1 flag-off control fixture',
    bypassCache: true,
    fetchImpl: failingFetch429,
    tenantContext: byokContext('tenant-a'),
    platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseProviders() },
  }));
  assert.equal(persistence.getRollingAggregates({ windowMs: 30 * 60_000 }).length, 0);
  assert.equal(persistence.getRollingAggregates({ windowMs: 30 * 60_000, scopeKey: 'tenant:tenant-a' }).length, 0);
  assert.equal(persistence.loadCooldowns().length, 0);
  assert.deepEqual(router.cooldownManager.getStatus(), []);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// L6 — F-09 invariant under the flag: platform-key tenant traffic stays a
//      platform observation (metrics + cooldowns, no tenant scope).
// ---------------------------------------------------------------------------

test('L6: flag ON — platform-key tenant traffic still trains the platform scope exactly as before', withFlag(true, async () => {
  const { router, persistence } = makeRouter();
  await assert.rejects(() => router.routeCompletion({
    prompt: 'C.1 platform-key tenant fixture',
    bypassCache: true,
    fetchImpl: failingFetch429,
    tenantContext: { tenantId: 'tenant-a', customProviderKeys: {}, allowedProviders: ['groq'] },
    platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseProviders() },
  }));
  const platform = persistence.getRollingAggregates({ windowMs: 30 * 60_000 });
  assert.equal(platform.length, 1);
  assert.equal(platform[0].failures, 1);
  assert.equal(platform[0].scopeKey, 'platform');
  assert.equal(persistence.getRollingAggregates({ windowMs: 30 * 60_000, scopeKey: 'tenant:tenant-a' }).length, 0, 'no tenant scope was invented for platform-key traffic');
  assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-fixture').onCooldown, true, 'the platform bench is set as before');
  assert.equal(persistence.loadCooldowns({ scopeKey: 'platform' }).length, 1);
  freellm.resetMetricsForTests();
}));
