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
