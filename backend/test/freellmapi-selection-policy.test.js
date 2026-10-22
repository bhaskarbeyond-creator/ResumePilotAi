'use strict';
process.env.FREELMAPI_METRICS_DB = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { eligible, rankCandidates } = require('../freellmapi/services/selectionPolicy');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { ModelDiscoveryService } = require('../freellmapi/services/modelDiscovery');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const { publicAiSettings } = require('../services/aiAdmin');
const candidate = (model, capabilities = {}) => ({ provider: 'llamacpp', model, metadata: { capabilities } });
test('capability gates reject unknown tools/vision/JSON and incompatible context/output', () => {
  assert.equal(eligible({}, { tools: true }), false);
  assert.equal(eligible({}, { vision: true }), false);
  assert.equal(eligible({}, { json: true }), false);
  assert.equal(eligible({}, { contextTokens: 9000 }), false);
  assert.equal(eligible({ contextWindow: 1000 }, { contextTokens: 1001 }), false);
  assert.equal(eligible({ outputLimit: 10 }, { outputTokens: 11 }), false);
  assert.equal(eligible({ capabilities: { tools: true } }, { tools: true }), true);
});
test('speed prefers measured latency, quality prefers documented capability fit without fabricated quality', () => {
  const fast = candidate('fast');
  const fit = candidate('fit', { tools: true, json: true, vision: true });
  const observedAt = Date.now() - 1000;
  const observationFor = c => ({ ok: true, status: 200, createdAt: observedAt, latencyMs: c.model === 'fast' ? 100 : 9000 });
  assert.equal(rankCandidates([fit, fast], { mode: 'speed', observationFor })[0].model, 'fast');
  const quality = rankCandidates([fast, fit], { mode: 'quality', observationFor });
  assert.equal(quality[0].model, 'fit');
  assert.equal(quality[0].routingDecision.qualityEvidence, 'unknown');
});
test('unknown/stale observations remain unknown and ranking is deterministic', () => {
  const list = [candidate('a'), candidate('b')];
  const options = { mode: 'balanced', observationFor: () => ({ createdAt: 1, latencyMs: 1, ok: true, status: 200 }) };
  assert.deepEqual(rankCandidates(list, options).map(c => c.model), ['a', 'b']);
  assert.equal(rankCandidates(list, options)[0].routingDecision.observedLatencyMs, null);
});
test('admin validates every selection mode and permits a registered local primary', () => {
  for (const selectionMode of ['auto', 'quality', 'speed', 'balanced', 'manual']) assert.equal(publicAiSettings({ selectionMode }).selectionMode, selectionMode);
  assert.throws(() => publicAiSettings({ selectionMode: 'magic' }), { code: 'AI_SELECTION_MODE_INVALID' });
  assert.equal(publicAiSettings({ provider: 'llamacpp' }).provider, 'llamacpp');
});
for (const selectionMode of ['auto', 'quality', 'speed', 'balanced']) {
  test(`${selectionMode}: discovery feeds executed model, requirements exclude an incapable first choice`, async () => {
    const router = new FreeLlmRouter();
    router.modelDiscovery = new ModelDiscoveryService();
    router.cooldownManager = new CooldownManager();
    let actualModel;
    const fetchImpl = async (url, options) => {
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'incompatible' }, { id: 'upstream-new', supports_json: true, context_length: 8192 }] }));
      actualModel = JSON.parse(options.body).model;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    };
    const result = await router.routeCompletion({ prompt: 'fixture', jsonMode: true, maxTokens: 100, bypassCache: true, fetchImpl,
      platformConfig: { selectionMode, primary: 'llamacpp', providers: { llamacpp: { model: 'retired', enabled: true } } } });
    assert.equal(actualModel, 'upstream-new');
    assert.equal(result.model, actualModel);
    assert.equal(result.routingDecision.mode, selectionMode);
  });
}
test('manual pin refuses removed models and never crosses providers', async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = { getOrDiscover: async () => [{ id: 'replacement' }] };
  const result = await router.buildCandidateList({ platformConfig: { selectionMode: 'manual', primary: 'llamacpp', enableFallback: true,
    providers: { llamacpp: { enabled: true, model: 'removed' }, ollama: { enabled: true, model: 'replacement' } } } });
  assert.deepEqual(result, []);
});
test('balanced fallback excludes incompatible models, records actual fallback, and honors 429 cooldown', async () => {
  const router = new FreeLlmRouter();
  router.cooldownManager = new CooldownManager();
  router.modelDiscovery = new ModelDiscoveryService();
  const executed = [];
  const fetchImpl = async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }));
    const model = JSON.parse(options.body).model;
    executed.push(model);
    if (model === 'a') return new Response('{"error":{"message":"rate limited"}}', { status: 429 });
    return new Response('{"choices":[{"message":{"content":"done"}}]}');
  };
  const platformConfig = { selectionMode: 'balanced', primary: 'llamacpp', providers: { llamacpp: { enabled: true, model: 'auto' } } };
  const result = await router.routeCompletion({ prompt: 'fixture', maxTokens: 100, bypassCache: true, platformConfig, fetchImpl });
  assert.deepEqual(executed, ['a', 'b']);
  assert.equal(result.model, 'b');
  assert.equal(result.fallbacksAttempted[0].model, 'a');
  assert.equal(router.cooldownManager.isOnCooldown('llamacpp', 'a').onCooldown, true);
});

test('discovery expansion cannot escape tenant model allowlists or denylists', async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = { getOrDiscover: async () => [{ id: 'new-disallowed' }, { id: 'allowed' }, { id: 'retired' }] };
  const result = await router.buildCandidateList({ platformConfig: { selectionMode: 'balanced', primary: 'groq', providers: {} },
    tenantContext: { tenantId: 'tenant-A', customProviderKeys: { groq: 'tenant-fixture-key' }, primaryModel: 'allowed',
      allowedModels: ['allowed', 'retired'], restrictedModels: ['retired'] } });
  assert.deepEqual(result.map(candidate => candidate.model), ['allowed']);
});
test('a tenant manual pin is not replaced by an unrelated platform primary or its model', async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = { getOrDiscover: async () => [{ id: 'tenant-pin' }, { id: 'platform-pin' }] };
  const result = await router.buildCandidateList({ platformConfig: { selectionMode: 'manual', primary: 'llamacpp', providers: { groq: { model: 'platform-pin' } } },
    tenantContext: { tenantId: 'tenant-A', customProviderKeys: { groq: 'tenant-fixture-key' }, primaryModel: 'tenant-pin' } });
  assert.equal(result.length, 1);
  assert.equal(result[0].provider, 'groq');
  assert.equal(result[0].model, 'tenant-pin');
});

test('intelligent discovery survives an expired first credential without borrowing its catalog', async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = { getOrDiscover: async ({ apiKey }) => {
    if (apiKey === 'expired-fixture-key') throw new Error('revoked');
    return [{ id: 'second-credential-model', capabilities: { tools: true } }];
  } };
  const candidates = await router.buildCandidateList({ platformConfig: { selectionMode: 'balanced', primary: 'kilo', providers: {
    kilo: { enabled: true, key: ['expired-fixture-key', 'valid-fixture-key'], model: 'auto' },
  } }, requirements: { tools: true } });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].model, 'second-credential-model');
  assert.deepEqual(candidates[0].keys, ['valid-fixture-key']);
});
test('a discovered capability cannot authorize a different credential; manual destinations stay pinned', async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = { getOrDiscover: async ({ apiKey }) => [{ id: 'pinned', capabilities: { tools: apiKey === 'tools-fixture-key' } }] };
  const platformConfig = { selectionMode: 'manual', primary: 'groq', providers: {
    groq: { enabled: true, key: ['plain-fixture-key', 'tools-fixture-key'], model: 'pinned' },
  } };
  const candidates = await router.buildCandidateList({ platformConfig, requirements: { tools: true } });
  assert.deepEqual(candidates.map(candidate => candidate.keys), [['tools-fixture-key']]);
  const ordinary = await router.buildCandidateList({ platformConfig });
  assert.equal(ordinary.length, 2);
  assert.ok(ordinary.every(candidate => candidate.model === 'pinned' && candidate.provider === 'groq'));
});
for (const streaming of [false, true]) {
  test(`credential-specific candidates do not bench the destination before remaining keys (${streaming ? 'stream' : 'completion'})`, async () => {
    const router = new FreeLlmRouter();
    let cooled = 0;
    router.cooldownManager = { isOnCooldown: () => ({ onCooldown: false }), setCooldown: () => { cooled++; }, clearCooldown() {} };
    router.modelDiscovery = { getOrDiscover: async () => [{ id: 'pinned' }] };
    const options = { prompt: 'synthetic credential test', bypassCache: true, platformConfig: { selectionMode: 'manual', primary: 'groq', providers: {
      groq: { key: ['rejected-fixture-key', 'working-fixture-key'], model: 'pinned' },
    } }, fetchImpl: async (_url, request) => {
      if (request.headers.Authorization.includes('rejected-fixture-key')) return new Response('{}', { status: 401 });
      assert.equal(cooled, 0, 'no provider cooldown while another eligible key remains');
      return streaming ? new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
        : Response.json({ choices: [{ message: { content: 'ok' } }] });
    } };
    if (streaming) {
      const events = [];
      for await (const event of router.routeStream(options)) events.push(event);
      assert.ok(events.some(event => event.type === 'text' && event.text === 'ok'));
    } else {
      const result = await router.routeCompletion(options);
      assert.equal(result.content, 'ok');
      assert.equal(result.keysAttempted, 2);
    }
    assert.equal(cooled, 0);
  });
}
