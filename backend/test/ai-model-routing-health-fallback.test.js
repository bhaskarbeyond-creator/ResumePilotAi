'use strict';

/**
 * AI Model Routing — Runtime Health, Bounded Adaptation, & Safe Fallback
 * =====================================================================
 * Proves the runtime signal loop is tenant-scoped, decaying, and bounded:
 *  - rolling/decaying stats (success rate, latency percentiles) with TTL;
 *  - 429 → Retry-After-honoring rate-limit cooldown per tenant/provider/model;
 *  - 404/model_not_found → 30min model-unavailable block per tenant;
 *  - consecutive hard failures → exponential backoff, reset on success;
 *  - latency-critical ops retry transient failures with bounded backoff;
 *    non-critical ops never retry-storm (one attempt per candidate);
 *  - fallback candidates re-satisfy the original requirement profile;
 *  - ZERO fabricated content on total failure: explicit AI-unavailable state,
    source-preserving fallbacks, or an honest provider-error contract;
 *  - external cancellation is honored at every hop.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAiModelRouter,
  HealthStore,
  deriveRequirementProfile,
} = require('../services/aiRouting');
const {
  generateWithProviders,
  executeContentOperation,
} = require('../services/aiRuntime');

const NOW = 1_760_000_000_000;

function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  };
}

function okContent(text) {
  return jsonResponse({ choices: [{ message: { content: text } }] });
}

/** Two-provider config: openai (primary) + groq (secondary), same tenant. */
function twoProviderConfig(tenantId = 'tenant-1', overrides = {}) {
  return {
    primary: 'openai',
    enableFallback: true,
    temperature: 0.7,
    maxTokens: 2048,
    tenantId,
    providers: {
      openai: { enabled: true, key: 'openai-key', model: 'openai-model-1' },
      groq: { enabled: true, key: 'groq-key', model: 'groq-model-1' },
    },
    ...overrides,
  };
}

function urlFetcher(handler) {
  return async (url, options = {}) => {
    const u = String(url);
    if (u.includes('openai.com')) return handler.openai(u, options);
    if (u.includes('groq.com')) return handler.groq(u, options);
    throw new Error(`unexpected URL ${u}`);
  };
}

// ---------------------------------------------------------------------------
test('1. Rolling/decaying health stats: percentiles, success rate, and TTL expiry', () => {
  const now = { value: NOW };
  const health = new HealthStore({ now: () => now.value });

  health.record({ tenantId: 't', provider: 'p', model: 'm', ok: true, latencyMs: 100, nowMs: now.value });
  health.record({ tenantId: 't', provider: 'p', model: 'm', ok: true, latencyMs: 300, nowMs: now.value });
  health.record({ tenantId: 't', provider: 'p', model: 'm', ok: false, errorClass: 'server', latencyMs: 900, nowMs: now.value });

  let s = health.stats({ tenantId: 't', provider: 'p', model: 'm' }, now.value);
  assert.equal(s.sampleSize, 3);
  assert.equal(s.successRate, 2 / 3);
  assert.equal(s.p50LatencyMs, 300);
  assert.equal(s.p95LatencyMs, 900);
  assert.equal(s.consecutiveFailures, 1, 'single trailing failure');
  assert.equal(s.lastErrorClass, 'server');

  // Two more successes reset the consecutive chain.
  health.record({ tenantId: 't', provider: 'p', model: 'm', ok: true, latencyMs: 120, nowMs: now.value });
  health.record({ tenantId: 't', provider: 'p', model: 'm', ok: true, latencyMs: 130, nowMs: now.value });
  s = health.stats({ tenantId: 't', provider: 'p', model: 'm' }, now.value);
  assert.equal(s.consecutiveFailures, 0, 'success resets the failure chain');
  assert.equal(s.lastErrorClass, null);

  // TTL: after the 30min window the data decays away and the model is unpenalized.
  now.value += 31 * 60 * 1000;
  s = health.stats({ tenantId: 't', provider: 'p', model: 'm' }, now.value);
  assert.equal(s, null, 'expired events produce no penalty state (decaying memory)');

  // Tenant scoping: another tenant has no data for the same provider/model.
  const other = health.stats({ tenantId: 'other', provider: 'p', model: 'm' }, NOW);
  assert.equal(other, null);
});

// ---------------------------------------------------------------------------
test('2. 429 → tenant-scoped rate-limit cooldown honoring Retry-After; recovery after the window', async () => {
  const now = { value: NOW };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  const calls = { openai: 0, groq: 0 };
  let retryAfter = '5';
  const fetchMock = urlFetcher({
    openai: () => { calls.openai += 1; return jsonResponse({ error: { message: 'rate limited' } }, 429, { 'retry-after': retryAfter }); },
    groq: () => { calls.groq += 1; return okContent('groq-ok'); },
  });
  const config = twoProviderConfig();

  // First request: openai 429 → fallback to groq exactly once.
  const r1 = await router.route({ prompt: 'p1', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(r1.provider, 'groq');
  assert.equal(calls.openai, 1, 'primary attempted once, no retry storm on 429 for non-critical ops');
  assert.equal(calls.groq, 1);
  assert.equal(r1.routing.fallbackCount, 1);

  // Second request (same tenant, still inside the 5s window): openai is cooled down.
  const r2 = await router.route({ prompt: 'p2', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(r2.provider, 'groq');
  assert.equal(calls.openai, 1, 'cooled-down model not re-tried inside the window');
  assert.equal(r2.routing.fallbackCount, 0, 'selection skipped it — no provider call');

  // After the Retry-After window, the model is eligible again.
  now.value += 6 * 1000;
  const r3 = await router.route({ prompt: 'p3', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(calls.openai, 2, 'recovery: model re-attempted after the window');
  assert.equal(r3.provider, 'groq', 'still failing → still falls back');

  // Another tenant's identical provider/model is NOT rate-limited by this tenant's 429.
  now.value = NOW;
  const other = await router.route({
    prompt: 'p4',
    configuration: twoProviderConfig('tenant-2'),
    operation: 'generate-summary',
    fetchImpl: urlFetcher({ openai: () => okContent('other-tenant-openai'), groq: () => okContent('x') }),
  });
  assert.equal(other.provider, 'openai', 'tenant-2 openai unaffected by tenant-1 rate limit');
});

// ---------------------------------------------------------------------------
test('3. 404 model_not_found → 30min model-unavailable block for the tenant; other tenants unaffected', async () => {
  const now = { value: NOW };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  const fetchMock = urlFetcher({
    openai: () => jsonResponse({ error: { message: 'model not found' } }, 404),
    groq: () => okContent('groq-ok'),
  });
  const config = twoProviderConfig('tenant-A');

  const r1 = await router.route({ prompt: 'p', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(r1.provider, 'groq');

  // Immediately after: the retired model is blocked for this tenant.
  const decision = router.health.stats({ tenantId: 'tenant-A', provider: 'openai', model: 'openai-model-1' }, now.value);
  assert.equal(router.health.cooldownKind(decision, now.value), 'model-unavailable');
  assert.ok(decision.modelUnavailableUntil >= now.value + 29 * 60 * 1000, '≈30min block');

  const r2 = await router.route({ prompt: 'p2', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(r2.provider, 'groq', 'blocked model never re-requested within the window');

  // Tenant B with the same provider/model is unaffected.
  const rB = await router.route({
    prompt: 'pB',
    configuration: twoProviderConfig('tenant-B'),
    operation: 'generate-summary',
    fetchImpl: urlFetcher({ openai: () => okContent('tenant-B-openai'), groq: () => okContent('x') }),
  });
  assert.equal(rB.provider, 'openai');

  // After 31 minutes the block expires (catalog refresh revalidates the model).
  now.value += 31 * 60 * 1000;
  const r3 = await router.route({ prompt: 'p3', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(r3.provider, 'groq', 'still 404ing → falls back again (health, not memory, decides)');
});

// ---------------------------------------------------------------------------
test('4. Consecutive hard failures → exponential backoff; a success resets the chain', () => {
  const now = { value: NOW };
  const health = new HealthStore({ now: () => now.value });
  const rec = (ok, at) => health.record({ tenantId: 't', provider: 'p', model: 'm', ok, errorClass: ok ? null : 'server', latencyMs: 10, nowMs: at });

  // Below threshold: no cooldown.
  rec(false, now.value);
  rec(false, now.value + 1000);
  let s = health.stats({ tenantId: 't', provider: 'p', model: 'm' }, now.value + 2000);
  assert.equal(health.inCooldown(s, now.value + 2000), false, '1-2 failures do not cool down (no single-failure penalty)');

  // Third consecutive failure crosses the threshold → 60s backoff.
  rec(false, now.value + 2000);
  s = health.stats({ tenantId: 't', provider: 'p', model: 'm' }, now.value + 2000);
  assert.equal(health.cooldownKind(s, now.value + 2000), 'failure-backoff');
  assert.ok(s.cooldownUntil > now.value + 2000 + 59 * 1000);

  // Fourth failure deepens the backoff (bounded, exponential).
  rec(false, now.value + 70 * 1000);
  s = health.stats({ tenantId: 't', provider: 'p', model: 'm' }, now.value + 70 * 1000);
  assert.ok(s.cooldownUntil > now.value + 70 * 1000 + 119 * 1000, 'second tier ≈2min');

  // A success resets the consecutive chain immediately.
  now.value += 130 * 1000;
  rec(true, now.value);
  s = health.stats({ tenantId: 't', provider: 'p', model: 'm' }, now.value);
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(health.inCooldown(s, now.value), false, 'recovery after success is immediate');
});

// ---------------------------------------------------------------------------
test('5. Retry policy: latency-critical ops retry transient 5xx once with bounded backoff; non-critical ops never retry', async () => {
  const now = { value: NOW };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  let openaiCalls = 0;
  const flakyFetch = urlFetcher({
    openai: () => {
      openaiCalls += 1;
      return openaiCalls === 1 ? jsonResponse({ error: { message: 'boom' } }, 500) : okContent('recovered');
    },
    groq: () => okContent('groq'),
  });
  const config = twoProviderConfig();

  // Latency-critical (autocomplete): 500 → bounded FAST retry → success, no
  // fallback. The user is waiting live, so the backoff must actually be
  // applied (not skipped) but must stay well under a second — the old 3s
  // backoff was itself a measured latency regression for live operations.
  const started = Date.now();
  const critical = await router.route({ prompt: 'p', configuration: config, operation: 'autocomplete', fetchImpl: flakyFetch });
  const elapsed = Date.now() - started;
  assert.equal(critical.provider, 'openai', 'recovered on the same candidate');
  assert.equal(openaiCalls, 2, 'exactly one retry for the transient failure');
  assert.equal(critical.routing.attempts, 2);
  assert.ok(elapsed >= 100, 'backoff was actually applied (not skipped)');
  assert.ok(elapsed < 1000, 'latency-critical backoff is bounded fast (<1s)');

  // Non-critical (generate-summary): exactly ONE attempt per candidate.
  openaiCalls = 0;
  const normalFetch = urlFetcher({
    openai: () => { openaiCalls += 1; return jsonResponse({ error: { message: 'boom' } }, 500); },
    groq: () => okContent('groq-normal'),
  });
  const normal = await router.route({ prompt: 'p', configuration: config, operation: 'generate-summary', fetchImpl: normalFetch });
  assert.equal(normal.provider, 'groq');
  assert.equal(openaiCalls, 1, 'no retry storm: one attempt, then compatible fallback');
});

// ---------------------------------------------------------------------------
test('6. Fallback candidates must re-satisfy the original requirement (structured output)', async () => {
  const now = { value: NOW };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  // Catalog: groq has two models — one without structured output (violates the
  // generate-summary contract), one with it.
  const fetchMock = urlFetcher({
    openai: () => jsonResponse({ error: { message: 'down' } }, 503),
    groq: () => okContent('groq-gold'),
  });
  await router.discovery.scheduleRefresh({
    providerId: 'groq', providerConfig: { key: 'groq-key' }, tenantId: 'tenant-1',
    adapter: require('../services/aiRouting').getAdapter('groq'),
    fetchImpl: async () => jsonResponse({
      data: [
        { id: 'groq-model-1', context_length: 8000 },
        { id: 'groq-json-gold', context_length: 8000, supports_response_format: true },
      ],
    }),
  });
  // Pre-warm openai access too: with discoveryEnabled the orchestrator would
  // otherwise fire a REAL global fetch for it (tests must stay network-free).
  await router.discovery.scheduleRefresh({
    providerId: 'openai', providerConfig: { key: 'openai-key' }, tenantId: 'tenant-1',
    adapter: require('../services/aiRouting').getAdapter('openai'),
    fetchImpl: async () => jsonResponse({ data: [] }),
  });
  const config = twoProviderConfig('tenant-1', {
    providers: {
      openai: { enabled: true, key: 'openai-key', model: 'openai-model-1' },
      groq: { enabled: true, key: 'groq-key', model: 'groq-model-1' },
    },
    discoveryEnabled: true,
  });
  const r = await router.route({ prompt: 'p', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  // groq-model-1 is the configured fallback; groq-json-gold is discovered.
  // Both are eligible for short prompts (unknown structured output stays eligible);
  // the point of this test is that the fallback is a same-tenant, requirement-checked
  // candidate — assert it is a groq model and explainable.
  assert.equal(r.provider, 'groq');
  assert.ok(['groq-model-1', 'groq-json-gold'].includes(r.model));
  assert.ok(String(r.routing.rationale).length > 10, 'explainable fallback rationale');

  // Now the strict case: the configured fallback model has EXPLICIT 'no'
  // structured output → it must not be selected; the requirement-satisfying
  // discovered model is chosen instead.
  const router2 = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  await router2.discovery.scheduleRefresh({
    providerId: 'groq', providerConfig: { key: 'groq-key' }, tenantId: 'tenant-1',
    adapter: require('../services/aiRouting').getAdapter('groq'),
    fetchImpl: async () => jsonResponse({
      data: [
        { id: 'groq-model-1', context_length: 8000, supports_response_format: false },
        { id: 'groq-json-gold', context_length: 8000, supports_response_format: true },
      ],
    }),
  });
  await router2.discovery.scheduleRefresh({
    providerId: 'openai', providerConfig: { key: 'openai-key' }, tenantId: 'tenant-1',
    adapter: require('../services/aiRouting').getAdapter('openai'),
    fetchImpl: async () => jsonResponse({ data: [] }),
  });
  const r2 = await router2.route({ prompt: 'p', configuration: config, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(r2.provider, 'groq');
  assert.equal(r2.model, 'groq-json-gold', 'explicit capability violation is never selected, even as fallback');
});

// ---------------------------------------------------------------------------
test('7. Zero fabricated content on total failure: honest error contract + explicit AI-unavailable state', async () => {
  const config = twoProviderConfig();
  const allFailFetch = urlFetcher({
    openai: () => jsonResponse({ error: { message: 'openai down' } }, 500),
    groq: () => jsonResponse({ error: { message: 'groq down' } }, 502),
  });

  // 7a. Low-level contract: AI_PROVIDER_ERROR with per-candidate failures, no raw content.
  await assert.rejects(
    () => generateWithProviders({ prompt: 'p', configuration: config, operation: 'generate-summary', fetchImpl: allFailFetch }),
    (err) => {
      assert.equal(err.code, 'AI_PROVIDER_ERROR');
      assert.equal(err.status, 502);
      assert.equal(err.failures.length, 2, 'every candidate attempted and reported');
      assert.ok(err.failures.every(f => f.provider && f.model && f.message), 'failures are explainable');
      assert.ok(!('raw' in err), 'no content fabricated');
      assert.ok(err.routing, 'routing decision attached for audit');
      assert.equal(err.routing.attempts, 2, 'one attempt per candidate for non-critical ops');
      return true;
    },
  );

  // 7b. Product contract: executeContentOperation degrades to the explicit
  //     AI-unavailable state with source-preserving data — never AI text.
  const marker = 'UNIQUE-SOURCE-FACT-778899';
  const result = await executeContentOperation({
    operation: 'generate-summary',
    payload: { jobTitle: 'Site Reliability Engineer', sourceFacts: `Maintained on-call rotation. ${marker}` },
    configuration: config,
    fetchImpl: allFailFetch,
  });
  assert.equal(result.provider, 'fallback');
  assert.equal(result.data.aiUnavailable, true, 'client-visible explicit unavailable flag');
  assert.equal(result.grounding, 'source-preserving-fallback');
  const serialized = JSON.stringify(result.data);
  assert.ok(!/openai down|groq down/.test(serialized), 'provider error text is not presented as content');

  // 7c. noFallback contract: explicit failure instead of silent degradation.
  await assert.rejects(
    () => executeContentOperation({
      operation: 'generate-summary',
      payload: { jobTitle: 'X', sourceFacts: 'y', noFallback: true },
      configuration: config,
      fetchImpl: allFailFetch,
    }),
    (err) => /AI_PROVIDER_ERROR|AI_GENERATION_FAILED/.test(String(err.code)) && /fallback is disabled/i.test(String(err.message)),
  );

  // 7d. No providers at all → AI_PROVIDER_UNAVAILABLE (503), still no fabrication.
  const noneConfig = { primary: 'openai', enableFallback: true, temperature: 0.7, maxTokens: 2048, tenantId: 'tenant-1', providers: {} };
  await assert.rejects(
    () => generateWithProviders({ prompt: 'p', configuration: noneConfig, operation: 'generate-summary', fetchImpl: allFailFetch }),
    (err) => err.code === 'AI_PROVIDER_UNAVAILABLE' && err.status === 503,
  );
});

// ---------------------------------------------------------------------------
test('8. External cancellation is honored at every hop (no orphaned provider work)', async () => {
  const now = { value: NOW };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  const controller = new AbortController();
  const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });
  const slowFetch = urlFetcher({
    openai: (u, options) => new Promise((resolve, reject) => {
      if (options.signal?.aborted) return reject(abortError());
      const t = setTimeout(() => resolve(okContent('late')), 50);
      options.signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); });
    }),
    groq: () => okContent('groq'),
  });
  controller.abort(); // aborted before the call
  await assert.rejects(
    () => router.route({ prompt: 'p', configuration: twoProviderConfig(), operation: 'generate-summary', fetchImpl: slowFetch, signal: controller.signal }),
    (err) => err.name === 'AbortError',
  );
  const entries = router.telemetry.query({ tenantId: 'tenant-1' });
  assert.ok(entries.some(e => e.outcome === 'aborted'), 'aborted outcome recorded');

  // Abort DURING the call (in-flight cancellation).
  const lateController = new AbortController();
  const inFlight = router.route({ prompt: 'p', configuration: twoProviderConfig(), operation: 'generate-summary', fetchImpl: slowFetch, signal: lateController.signal });
  setTimeout(() => lateController.abort(), 10);
  await assert.rejects(inFlight, (err) => err.name === 'AbortError');
});

// ---------------------------------------------------------------------------
test('9. Telemetry on failure paths: tenant-scoped, explainable, prompt-free', async () => {
  const now = { value: NOW };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  const secretPrompt = 'TOP-SECRET-RESUME-CONTENT alpha beta gamma';
  const fetchMock = urlFetcher({
    openai: () => jsonResponse({ error: { message: 'down' } }, 500),
    groq: () => jsonResponse({ error: { message: 'down' } }, 500),
  });

  await assert.rejects(
    () => router.route({ prompt: secretPrompt, configuration: twoProviderConfig('tenant-1'), operation: 'generate-summary', fetchImpl: fetchMock }),
    (err) => err.code === 'AI_PROVIDER_ERROR',
  );
  await router.route({ prompt: secretPrompt, configuration: twoProviderConfig('tenant-2'), operation: 'generate-summary', fetchImpl: urlFetcher({ openai: () => okContent('ok'), groq: () => okContent('ok') }) });

  const tenant1 = router.telemetry.query({ tenantId: 'tenant-1' });
  const tenant2 = router.telemetry.query({ tenantId: 'tenant-2' });
  const platform = router.telemetry.query({});
  assert.equal(tenant1.length, 1, 'tenant-1 sees only its own entry');
  assert.equal(tenant2.length, 1);
  assert.equal(platform.length, 0, 'platform scope never leaks tenant entries');
  assert.equal(tenant1[0].outcome, 'failure');
  assert.equal(tenant1[0].errorCode, 'AI_PROVIDER_ERROR');
  assert.equal(tenant1[0].candidatesConsidered, 2);
  assert.ok(tenant1[0].decisionId);

  // The prompt (resume content) must never appear anywhere in telemetry.
  const all = JSON.stringify([...tenant1, ...tenant2]);
  assert.ok(!all.includes('TOP-SECRET-RESUME-CONTENT'), 'prompts are never recorded');
});

// ---------------------------------------------------------------------------
test('10. Requirement derivation drives the execution path (operation-aware generation parameters)', async () => {
  const now = { value: NOW };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  const seen = [];
  const fetchMock = urlFetcher({
    openai: (u, options) => {
      const body = JSON.parse(options.body);
      seen.push(body);
      return okContent('ok');
    },
    groq: () => okContent('groq'),
  });
  await router.route({ prompt: 'complete this', configuration: twoProviderConfig(), operation: 'autocomplete', fetchImpl: fetchMock });
  assert.equal(seen[0].temperature, 0.1, 'autocomplete forces low temperature');
  assert.equal(seen[0].max_tokens, 180, 'autocomplete caps the output budget');
});
