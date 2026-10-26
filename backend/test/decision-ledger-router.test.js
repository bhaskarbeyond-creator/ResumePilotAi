'use strict';

/**
 * PH4-ENGINE-022 C.2 — router-level decisionId drills with the real modules.
 * One UUID per routed request → wire (routingDecision + top-level) → request_log
 * attempt rows (shared id) → routing_decisions ring (one row at resolution) →
 * terminal errors (additive error.decisionId). FREELMAPI_DECISION_LEDGER is set
 * per test and always restored; the flag-OFF control proves byte-identical
 * legacy behaviour (no ids, no ring rows, request_log.decision_id NULL).
 *
 * Hermetic: :memory: metrics store, stub fetchImpl, no MariaDB, no network,
 * no timers. Zero console.*, zero waitForTimeout.
 */

process.env.FREELMAPI_METRICS_DB = ':memory:';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const { getMetricsPersistence } = require('../freellmapi/services/persistence');
const freellm = require('../freellmapi');

const LEDGER_FLAG = 'FREELMAPI_DECISION_LEDGER';
const SCOPE_FLAG = 'FREELMAPI_TENANT_SCOPED_EVIDENCE';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function withFlags({ ledger = false, scope = false }, fn) {
  return async () => {
    const previousLedger = process.env[LEDGER_FLAG];
    const previousScope = process.env[SCOPE_FLAG];
    if (ledger) process.env[LEDGER_FLAG] = '1'; else delete process.env[LEDGER_FLAG];
    if (scope) process.env[SCOPE_FLAG] = '1'; else delete process.env[SCOPE_FLAG];
    try {
      await fn();
    } finally {
      if (previousLedger === undefined) delete process.env[LEDGER_FLAG]; else process.env[LEDGER_FLAG] = previousLedger;
      if (previousScope === undefined) delete process.env[SCOPE_FLAG]; else process.env[SCOPE_FLAG] = previousScope;
    }
  };
}

function baseProviders() {
  return {
    openai: { enabled: true, key: 'fixture-platform-openai-key', model: 'gpt-fixture' },
    groq: { enabled: true, key: 'fixture-platform-groq-key', model: 'groq-fixture' },
  };
}

function makeRouter() {
  freellm.resetMetricsForTests();
  const persistence = getMetricsPersistence();
  const router = new FreeLlmRouter();
  router.cooldownManager = new CooldownManager();
  router.modelDiscovery = {
    getOrDiscover: async ({ providerId }) => [{ id: providerId === 'openai' ? 'gpt-fixture' : 'groq-fixture', capabilities: {} }],
  };
  return { router, persistence };
}

const okFetch = async () => new Response(JSON.stringify({
  choices: [{ message: { content: 'decision ledger fixture served' } }],
  usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
}));

const failingFetch500 = async () => new Response(JSON.stringify({ error: { message: 'fixture failure' } }), { status: 500 });

// One-shot fetch: groq fails, openai serves (deterministic fallback chain).
const fallbackFetch = async (url) => (String(url).includes('groq')
  ? new Response(JSON.stringify({ error: { message: 'groq fixture down' } }), { status: 500 })
  : okFetch());

function speedConfig({ providers = baseProviders() } = {}) {
  return { selectionMode: 'speed', primary: 'groq', enableFallback: true, providers };
}

// ---------------------------------------------------------------------------
// G1 — success: one id, wire attachment, one ring row, request_log join key.
// ---------------------------------------------------------------------------

test('G1: flag ON success — UUID on result + routingDecision, ONE ring row, request_log rows carry the id', withFlags({ ledger: true }, async () => {
  const { router, persistence } = makeRouter();
  const result = await router.routeCompletion({
    prompt: 'C.2 success fixture', bypassCache: true, fetchImpl: okFetch, platformConfig: speedConfig(),
  });
  assert.match(result.decisionId, UUID_V4, 'top-level decisionId is a UUIDv4');
  assert.equal(result.routingDecision.decisionId, result.decisionId, 'the wire flows it via routing_decision');

  const decisions = persistence.getRecentDecisions({ limit: 10 });
  assert.equal(decisions.length, 1, 'exactly ONE ring row per routed request');
  assert.equal(decisions[0].decisionId, result.decisionId);
  assert.equal(decisions[0].outcome, 'success');
  assert.equal(decisions[0].status, 200);
  assert.equal(decisions[0].chosenProvider, result.provider);
  assert.equal(decisions[0].chosenModel, result.model);
  assert.equal(decisions[0].scopeKey, 'platform');
  assert.equal(decisions[0].promptTokens, 11, 'provider-reported usage lands in the ring');
  assert.equal(decisions[0].completionTokens, 22);

  const requests = persistence.getRecentRequests({ limit: 10 });
  assert.ok(requests.length >= 1);
  for (const row of requests) assert.equal(row.decisionId, result.decisionId, 'every attempt row shares the request id');
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// G2 — cardinality: fallback chain, one id, outcome fallback.
// ---------------------------------------------------------------------------

test('G2: fallback chain — attempts share ONE id; the ring row says fallback and names the serving destination', withFlags({ ledger: true }, async () => {
  const { router, persistence } = makeRouter();
  const result = await router.routeCompletion({
    prompt: 'C.2 fallback cardinality fixture', bypassCache: true, fetchImpl: fallbackFetch, platformConfig: speedConfig(),
  });
  assert.match(result.decisionId, UUID_V4);
  assert.ok(result.fallbacksAttempted.length >= 1, 'groq failed first, openai served');
  const decisions = persistence.getRecentDecisions({ limit: 10 });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].outcome, 'fallback');
  assert.equal(decisions[0].chosenProvider, 'openai');
  const requests = persistence.getRecentRequests({ limit: 10 });
  assert.ok(requests.length >= 2, 'per-attempt rows are request_log business');
  for (const row of requests) assert.equal(row.decisionId, result.decisionId);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// G3 — terminal failure: id on the error, ring row failure/502.
// ---------------------------------------------------------------------------

test('G3: all-fail — the thrown error carries the id; the ring records outcome failure with the honest status', withFlags({ ledger: true }, async () => {
  const { router, persistence } = makeRouter();
  let thrown = null;
  try {
    await router.routeCompletion({
      prompt: 'C.2 terminal failure fixture', bypassCache: true, fetchImpl: failingFetch500, platformConfig: speedConfig(),
    });
  } catch (error) { thrown = error; }
  assert.ok(thrown, 'the request rejects as before');
  assert.match(thrown.decisionId, UUID_V4, 'the id rides on the terminal error (additive)');
  const decisions = persistence.getRecentDecisions({ limit: 10 });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].outcome, 'failure');
  assert.equal(decisions[0].status, 502, 'ALL_PROVIDERS_FAILED stays a 502 — the ledger never relabels');
  assert.equal(decisions[0].chosenProvider, null, 'no destination served — honestly null');
  assert.equal(decisions[0].promptTokens, null, 'F-18: unknown tokens stay NULL, never 0');
  const requests = persistence.getRecentRequests({ limit: 20 });
  assert.ok(requests.length >= 2);
  for (const row of requests) assert.equal(row.decisionId, thrown.decisionId);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// G4 — both flags ON: a scoped BYOK failure rings in the tenant scope.
// ---------------------------------------------------------------------------

test('G4: ledger+scope flags ON — a dedicated-BYOK failure rings in the tenant scope with the shared id', withFlags({ ledger: true, scope: true }, async () => {
  const { router, persistence } = makeRouter();
  let thrown = null;
  try {
    await router.routeCompletion({
      prompt: 'C.2 scoped BYOK failure fixture', bypassCache: true, fetchImpl: failingFetch500,
      tenantContext: {
        tenantId: 'tenant-d2',
        customProviderKeys: { groq: 'gsk_tenant-d2-byok-key' },
        allowedProviders: ['groq'],
        primaryModel: 'groq-fixture',
      },
      platformConfig: { selectionMode: 'speed', primary: 'groq', enableFallback: false, providers: baseProviders() },
    });
  } catch (error) { thrown = error; }
  assert.ok(thrown);
  assert.match(thrown.decisionId, UUID_V4);
  const decisions = persistence.getRecentDecisions({ limit: 10, scopeKey: 'tenant:tenant-d2' });
  assert.equal(decisions.length, 1, 'the ring row lands in the tenant scope');
  assert.equal(decisions[0].outcome, 'failure');
  assert.equal(persistence.getRecentDecisions({ limit: 10, scopeKey: 'platform' }).length, 0, 'the platform scope received nothing (F-09)');
  const scopedRequests = persistence.getRecentRequests({ limit: 10, scopeKey: 'tenant:tenant-d2' });
  assert.ok(scopedRequests.length >= 1);
  for (const row of scopedRequests) assert.equal(row.decisionId, thrown.decisionId);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// G5 — flag OFF control: byte-identical legacy behaviour.
// ---------------------------------------------------------------------------

test('G5: flag OFF — no ids anywhere, no ring rows, request_log decision ids stay NULL', withFlags({ ledger: false }, async () => {
  const { router, persistence } = makeRouter();
  const result = await router.routeCompletion({
    prompt: 'C.2 flag-off control fixture', bypassCache: true, fetchImpl: okFetch, platformConfig: speedConfig(),
  });
  assert.equal(result.decisionId, null, 'top-level id is honestly null');
  assert.ok(!('decisionId' in (result.routingDecision || {})), 'routingDecision is untouched — no id key was attached');
  assert.equal(persistence.getRecentDecisions({ limit: 10 }).length, 0, 'zero ring writes with the flag off');
  const requests = persistence.getRecentRequests({ limit: 10 });
  assert.ok(requests.length >= 1);
  for (const row of requests) assert.equal(row.decisionId, null);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// G6 — cache replay: never re-mints, never inherits, ring stays at one row.
// ---------------------------------------------------------------------------

test('G6: a cache replay keeps the ORIGINAL request out of the replay — no new id, ring stays at one row', withFlags({ ledger: true }, async () => {
  const { router, persistence } = makeRouter();
  // Legacy (non-policy) config: candidate identity is stable across calls, so
  // the prompt cache actually hits (policy-mode routingDecision embeds live
  // timing/evidence and would change the cache identity every call).
  const legacyConfig = { primary: 'groq', enableFallback: true, providers: baseProviders() };
  const first = await router.routeCompletion({
    prompt: 'C.2 cache replay fixture', fetchImpl: okFetch, platformConfig: legacyConfig, cacheScope: 'user:principal-d6',
  });
  assert.match(first.decisionId, UUID_V4);
  assert.equal(first.cached, false);
  const replay = await router.routeCompletion({
    prompt: 'C.2 cache replay fixture', fetchImpl: okFetch, platformConfig: legacyConfig, cacheScope: 'user:principal-d6',
  });
  assert.equal(replay.cached, true);
  assert.ok(!replay.decisionId, 'a replay is not a routed request: it mints no id');
  const decisions = persistence.getRecentDecisions({ limit: 10 });
  assert.equal(decisions.length, 1, 'the ring still holds exactly the original request row');
  assert.equal(decisions[0].decisionId, first.decisionId);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// G7 — stream path: the id attaches to meta; the ring row lands at finish.
// ---------------------------------------------------------------------------

test('G7: flag ON stream — meta carries the decisionId; ONE ring row at resolution', withFlags({ ledger: true }, async () => {
  const { router, persistence } = makeRouter();
  const sseFetch = async () => new Response(
    'data: {"choices":[{"delta":{"content":"streamed decision fixture"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
  const events = [];
  for await (const event of router.routeStream({
    prompt: 'C.2 stream fixture', bypassCache: true, fetchImpl: sseFetch, platformConfig: speedConfig(),
  })) events.push(event);
  const meta = events.find(event => event.type === 'meta');
  assert.ok(meta);
  assert.match(meta.decisionId, UUID_V4, 'the stream wire attaches the id to meta');
  assert.ok(events.some(event => event.type === 'finish'));
  const decisions = persistence.getRecentDecisions({ limit: 10 });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].decisionId, meta.decisionId);
  assert.equal(decisions[0].outcome, 'success');
  const requests = persistence.getRecentRequests({ limit: 10 });
  for (const row of requests) assert.equal(row.decisionId, meta.decisionId);
  freellm.resetMetricsForTests();
}));

// ---------------------------------------------------------------------------
// G8 — two routed requests: two distinct ids, two ring rows (upsert never merges).
// ---------------------------------------------------------------------------

test('G8: two routed requests produce two distinct ids and two ring rows', withFlags({ ledger: true }, async () => {
  const { router, persistence } = makeRouter();
  const first = await router.routeCompletion({ prompt: 'C.2 distinctness fixture one', bypassCache: true, fetchImpl: okFetch, platformConfig: speedConfig() });
  const second = await router.routeCompletion({ prompt: 'C.2 distinctness fixture two', bypassCache: true, fetchImpl: okFetch, platformConfig: speedConfig() });
  assert.notEqual(first.decisionId, second.decisionId);
  const decisions = persistence.getRecentDecisions({ limit: 10 });
  assert.equal(decisions.length, 2, 'one row per routed request — the upsert never merges distinct ids');
  assert.deepEqual(new Set(decisions.map(row => row.decisionId)), new Set([first.decisionId, second.decisionId]));
  freellm.resetMetricsForTests();
}));
