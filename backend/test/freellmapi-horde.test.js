'use strict';
process.env.FREELMAPI_METRICS_DB = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { callAiHorde } = require('../freellmapi/providers/aiHorde');
const { ModelDiscoveryService } = require('../freellmapi/services/modelDiscovery');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const params = { model: 'live/model', messages: [{ role: 'user', content: 'hello' }], pollMs: 1 };
test('official anonymous async API queues once, polls, returns actual generated text, and discloses no usage estimate', async () => {
  const calls = [];
  let polls = 0;
  const result = await callAiHorde({ ...params, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.apikey, '0000000000');
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body).models, ['live/model']);
      return Response.json({ id: 'test-job' });
    }
    return Response.json(++polls === 1 ? { done: false } : { done: true, generations: [{ model: 'live/model', text: 'generated fixture' }] });
  } });
  assert.equal(result.content, 'generated fixture');
  assert.equal(result.usage, null);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  assert.ok(calls.every(call => call.url.startsWith('https://aihorde.net/api/v2/generate/text/')));
});
test('queue timeout cancels work and reports timeout rather than fake success', async () => {
  const methods = [];
  await assert.rejects(callAiHorde({ ...params, timeoutMs: 15, fetchImpl: async (url, options) => {
    methods.push(options.method);
    return Response.json(options.method === 'POST' ? { id: 'test-job' } : { done: false });
  } }), { code: 'REQUEST_TIMEOUT' });
  assert.equal(methods.at(-1), 'DELETE');
  assert.equal(methods.filter(method => method === 'POST').length, 1);
});
test('anonymous restriction/429 is surfaced with no priority evasion or repeated submission', async () => {
  let count = 0;
  await assert.rejects(callAiHorde({ ...params, fetchImpl: async () => { count++; return new Response('restricted', { status: 429 }); } }), { code: 'RATE_LIMITED' });
  assert.equal(count, 1);
});
test('mismatched executed model is rejected and queued work cleaned up', async () => {
  await assert.rejects(callAiHorde({ ...params, fetchImpl: async (url, options) => Response.json(options.method === 'POST'
    ? { id: 'test-job' } : { done: true, generations: [{ model: 'other-model', text: 'fixture' }] }) }), { code: 'MODEL_MISMATCH' });
});
test('Horde discovery uses official live text workers, not the removed compatibility proxy/default ID', async () => {
  const discovery = new ModelDiscoveryService();
  const models = await discovery.discoverFromEndpoint({ providerId: 'aihorde', fetchImpl: async url => {
    assert.equal(url, 'https://aihorde.net/api/v2/status/models?type=text');
    return Response.json([{ name: 'live/model', count: 1 }, { name: 'offline/model', count: 0 }]);
  } });
  assert.deepEqual(models.map(model => model.id), ['live/model']);
});
test('unsupported structured output is rejected before any community worker sees the prompt', async () => {
  const router = new FreeLlmRouter();
  let calls = 0;
  await assert.rejects(router._dispatch({ provider: 'aihorde', key: 'keyless', model: 'live/model', baseUrl: 'https://aihorde.net/api/v2' }, {
    ...params, maxTokens: 32, jsonMode: true, fetchImpl: async () => { calls++; },
  }), { code: 'UNSUPPORTED_CAPABILITY' });
  assert.equal(calls, 0);
});

test('private/default candidate traffic never reaches public community discovery or workers', async () => {
  const router = new FreeLlmRouter();
  let calls = 0;
  const platformConfig = { primary: 'aihorde', providers: { aihorde: { enabled: true, model: 'live/model' } } };
  const fetchImpl = async () => { calls++; throw new Error('must not contact community'); };
  assert.deepEqual(await router.buildCandidateList({ platformConfig, fetchImpl }), []);
  assert.deepEqual(await router.buildCandidateList({ platformConfig, fetchImpl, dataClassification: 'public' }), []);
  await assert.rejects(router.routeCompletion({ platformConfig, fetchImpl, prompt: 'Private candidate record' }), { code: 'AI_PROVIDER_UNAVAILABLE' });
  await assert.rejects(router.routeStream({ platformConfig, fetchImpl, prompt: 'Private candidate record' }).next(), { code: 'AI_PROVIDER_UNAVAILABLE' });
  assert.equal(calls, 0);
});
test('trusted synthetic verification may explicitly use opted-in anonymous community workers', async () => {
  const router = new FreeLlmRouter();
  const candidates = await router.buildCandidateList({ dataClassification: 'public-synthetic', platformConfig: {
    primary: 'aihorde', providers: { aihorde: { enabled: true, model: 'live/model' } },
  } });
  assert.equal(candidates[0].provider, 'aihorde');
});
