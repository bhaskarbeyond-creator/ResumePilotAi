'use strict';
process.env.FREELMAPI_METRICS_DB = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ModelDiscoveryService } = require('../freellmapi/services/modelDiscovery');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const response = models => ({ ok: true, text: async () => JSON.stringify({ data: models }) });
const params = { providerId: 'ovh', apiKey: 'keyless' };

test('catalog coalesces concurrent refreshes and records freshness without fabricated context', async () => {
  const service = new ModelDiscoveryService();
  let calls = 0;
  const fetchImpl = async () => { calls++; return response([{ id: 'chat-a' }]); };
  const results = await Promise.all(Array.from({ length: 10 }, () => service.getOrDiscover({ ...params, fetchImpl, forceRefresh: true })));
  assert.equal(calls, 1);
  assert.equal(results[0][0].catalogStatus, 'fresh');
  assert.equal(results[0][0].contextWindow, undefined);
  assert.ok(results[0][0].lastSuccessfulRefresh);
});

test('upstream addition, rename and removal reconcile instead of accumulating stale IDs', async () => {
  const service = new ModelDiscoveryService();
  let models = [{ id: 'a', name: 'Before' }];
  const fetchImpl = async () => response(models);
  const refresh = () => service.getOrDiscover({ ...params, fetchImpl, forceRefresh: true });
  assert.equal((await refresh())[0].name, 'Before');
  models = [{ id: 'a', name: 'After' }, { id: 'b' }];
  assert.deepEqual((await refresh()).map(m => m.name), ['After', 'b']);
  models = [{ id: 'b' }];
  assert.deepEqual((await refresh()).map(m => m.id), ['b']);
  models = [];
  assert.deepEqual(await refresh(), []);
});

test('malformed refresh preserves bounded stale catalog and backs off repeated manual probes', async () => {
  const service = new ModelDiscoveryService();
  await service.getOrDiscover({ ...params, fetchImpl: async () => response([{ id: 'a' }]) });
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, text: async () => '{broken' }; };
  const stale = await service.getOrDiscover({ ...params, fetchImpl, forceRefresh: true });
  assert.equal(stale[0].catalogStatus, 'stale');
  assert.equal(stale[0].catalogRefreshFailed, true);
  await service.getOrDiscover({ ...params, fetchImpl, forceRefresh: true });
  assert.equal(calls, 1);
  const entry = [...service.cache.values()][0];
  entry.refreshedAt = Date.now() - service.maxStaleMs - 1;
  await assert.rejects(service.getOrDiscover({ ...params, fetchImpl }), /temporarily unavailable/);
});

test('failed initial discovery backs off and cannot report registry hints as live', async () => {
  const service = new ModelDiscoveryService();
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('private upstream diagnostic'); };
  for (let i = 0; i < 2; i++) await assert.rejects(service.getOrDiscover({ ...params, fetchImpl }), /unavailable/);
  assert.equal(calls, 1);
});

test('credential identities cannot collide by suffix and do not expose raw credentials', () => {
  const service = new ModelDiscoveryService();
  const a = service._makeCacheKey('groq', 'secret-A-same-end', 'https://api.example/v1');
  const b = service._makeCacheKey('groq', 'secret-B-same-end', 'https://api.example/v1');
  assert.notEqual(a, b);
  assert.ok(!a.includes('same-end'));
});

test('auto selection consults discovery before registry default and respects empty catalogs', async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = { getOrDiscover: async () => [{ id: 'new-upstream-model' }] };
  assert.equal(await router.resolveModelForCandidate('ovh', 'keyless', null, 'auto'), 'new-upstream-model');
  router.modelDiscovery = { getOrDiscover: async () => [] };
  assert.equal(await router.resolveModelForCandidate('ovh', 'keyless', null, 'auto'), null);
  assert.equal(await router.resolveModelForCandidate('ovh', 'keyless', null, 'pinned'), 'pinned');
});

test('all cooled-down providers stay excluded; invalid keys cannot re-enter via fallback', async () => {
  const router = new FreeLlmRouter();
  router.cooldownManager = { isOnCooldown: () => ({ onCooldown: true }) };
  const candidates = await router.buildCandidateList({ platformConfig: { providers: {
    ovh: { enabled: true, model: 'pinned' }, groq: { key: 'bad', model: 'pinned' },
  } } });
  assert.deepEqual(candidates, []);
});

test('discovery errors never echo provider response bodies', async () => {
  const service = new ModelDiscoveryService();
  await assert.rejects(service.discoverFromEndpoint({ ...params, fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'sensitive-provider-content' }) }), error => !error.message.includes('sensitive'));
});

test('llama.cpp uses discovered model and the shared keyless inference adapter', async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = new ModelDiscoveryService();
  router.cooldownManager = { isOnCooldown: () => ({ onCooldown: false }), clearCooldown() {} };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.headers.Authorization, undefined);
    if (url.endsWith('/models')) return response([{ id: 'locally-installed-model' }]);
    assert.equal(JSON.parse(options.body).model, 'locally-installed-model');
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'local result' }, finish_reason: 'stop' }] }) };
  };
  const result = await router.routeCompletion({ prompt: 'minimal fixture', platformConfig: { providers: { llamacpp: { enabled: true } } }, fetchImpl, bypassCache: true });
  assert.equal(result.provider, 'llamacpp');
  assert.equal(result.model, 'locally-installed-model');
  assert.equal(result.content, 'local result');
  assert.equal(requests.length, 2);
});

test('local providers are opt-in and environment endpoints are used only when enabled', async () => {
  const { loadFreeLlmPlatformConfig } = require('../services/freellmConfig');
  const repository = { getSetting: async () => null };
  const disabled = await loadFreeLlmPlatformConfig({ repository, environment: {}, bypassCache: true });
  assert.equal(disabled.providers.llamacpp, undefined);
  assert.equal(disabled.providers.ollama, undefined);
  const enabled = await loadFreeLlmPlatformConfig({ repository, environment: { LLAMACPP_ENABLED: 'true', LLAMACPP_BASE_URL: 'http://127.0.0.1:9911/v1' }, bypassCache: true });
  assert.equal(enabled.providers.llamacpp.key, 'keyless');
  assert.equal(enabled.providers.llamacpp.baseUrl, 'http://127.0.0.1:9911/v1');
});

test('platform mesh enforces tenant destination restrictions including explicit deny-all', async () => {
  const router = new FreeLlmRouter();
  const platformConfig = { providers: { ovh: { model: 'pinned' } } };
  assert.deepEqual(await router.buildCandidateList({ tenantContext: { allowedProviders: [] }, platformConfig }), []);
  assert.deepEqual(await router.buildCandidateList({ tenantContext: { allowedProviders: ['groq'] }, platformConfig }), []);
});

test('cached completion cannot bypass changed tenant destination policy', async () => {
  const router = new FreeLlmRouter();
  const { LruPromptCache } = require('../freellmapi/services/cache');
  router.promptCache = new LruPromptCache();
  router.cooldownManager = { isOnCooldown: () => ({ onCooldown: false }), clearCooldown() {} };
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }; };
  const options = { prompt: 'fixture', model: 'pinned', platformConfig: { providers: { ovh: { model: 'pinned' } } }, fetchImpl };
  await router.routeCompletion({ ...options, tenantContext: { tenantId: 'a' } });
  assert.equal((await router.routeCompletion({ ...options, tenantContext: { tenantId: 'a' } })).cached, true);
  assert.equal((await router.routeCompletion({ ...options, tenantContext: { tenantId: 'b' } })).cached, false);
  await assert.rejects(router.routeCompletion({ ...options, tenantContext: { tenantId: 'a', allowedProviders: [] } }), { code: 'AI_PROVIDER_UNAVAILABLE' });
  assert.equal(calls, 2);
});

test('ranking ignores unmeasured registry scores and expired or other-model observations', () => {
  const router = new FreeLlmRouter();
  const candidate = { provider: 'ovh', model: 'model-a' };
  const score = recent => router._computeDynamicRankScore(candidate, {}, new Map(), new Map([['ovh', recent]]));
  assert.equal(router._computeDynamicRankScore(candidate, {}, new Map(), new Map()), 0);
  assert.equal(score({ model: 'model-a', ok: true, status: 200, latencyMs: 10, createdAt: Date.now() - 31 * 60_000 }), 0);
  assert.equal(score({ model: 'different-model', ok: true, status: 200, latencyMs: 10, createdAt: Date.now() }), 0);
  assert.ok(score({ model: 'model-a', ok: true, status: 200, latencyMs: 500, createdAt: Date.now() }) > 0);
  assert.ok(score({ model: 'model-a', ok: false, status: 429, createdAt: Date.now() }) < 0);
});

test('upstream deprecated and explicitly inactive models are ineligible for new auto selection', async () => {
  const service = new ModelDiscoveryService();
  const models = await service.getOrDiscover({ ...params, fetchImpl: async () => response([
    { id: 'old', deprecated: true }, { id: 'offline', active: false }, { id: 'current' }, { id: 'models/' },
  ]) });
  assert.deepEqual(models.map(model => model.id), ['current']);
});

test('Pollinations is no longer eligible as an anonymous provider', async () => {
  const { getProviderMeta } = require('../freellmapi/providers/registry');
  assert.equal(getProviderMeta('pollinations').keyless, false);
  const router = new FreeLlmRouter();
  assert.deepEqual(await router.buildCandidateList({ platformConfig: { providers: { pollinations: { enabled: true } } } }), []);
});
