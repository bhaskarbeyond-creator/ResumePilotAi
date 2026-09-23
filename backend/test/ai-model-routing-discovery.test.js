'use strict';

/**
 * AI Model Routing — Discovery & Future-Model Compatibility
 * =================================================================
 * Proves the capability-discovery layer is provider-agnostic:
 *  - provider metadata (OpenAI-compatible + Gemini-native) normalizes into
 *    the tristate capability model without fabrication (unknown stays unknown);
 *  - a brand-new model published by a future/registered provider participates
 *    end-to-end through the GENERIC discovery → eligibility → execution path
 *    (no hardcoded model names or rankings in the selector);
 *  - credential failures scope to the tenant (401/403 → discovery-only models
 *    excluded for THAT tenant only); the global catalog stays shared public
 *    metadata (cache isolation audit);
 *  - transient failures (429/network/timeout/malformed) preserve last-known-good;
 *  - refresh is deduped and rate-limited (no discovery storms);
 *  - selection never blocks on network (synchronous cached reads).
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAiModelRouter,
  DiscoveryService,
  LruMap,
  getAdapter,
  registerProviderAdapter,
  openAiCompatibleAdapter,
  listAdapterIds,
  normalizeModelRecord,
} = require('../services/aiRouting');

// Synthetic FUTURE provider: registered dynamically through the public adapter
// extension point. The central engine has no knowledge of it anywhere.
const FUTURE_ID = 'futurecorp';
if (!getAdapter(FUTURE_ID)) {
  registerProviderAdapter(openAiCompatibleAdapter({
    id: FUTURE_ID,
    name: 'FutureCorp (synthetic future provider)',
    defaultModel: null,
    baseUrl: 'https://api.futurecorp.example/v1',
  }));
}
const FUTURE_ADAPTER = getAdapter(FUTURE_ID);

function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  };
}

async function warmDiscovery(discovery, { providerId, key, tenantId, fetchImpl }) {
  return discovery.scheduleRefresh({
    providerId,
    providerConfig: { key },
    tenantId,
    adapter: getAdapter(providerId),
    fetchImpl,
  });
}

// ---------------------------------------------------------------------------
test('1. OpenAI-compatible discovery normalizes metadata into the capability model without fabrication', async () => {
  const discovery = new DiscoveryService();
  let calledUrl = null;
  const fetchMock = async (url) => {
    calledUrl = String(url);
    return jsonResponse({
      data: [
        {
          id: 'acme-pro-1',
          created: 2027,
          object: 'model',
          owned_by: 'acme',
          context_length: 200000,
          max_output_tokens: 16384,
          cost_per_mtok: { input: 5, output: 15 },
          capabilities: { vision: true, function_calling: true },
          extra_new_field_2027: { something: 'opaque' },
        },
        { id: 'acme-plain-2', created: 2027 }, // zero metadata beyond id
        { id: 'acme-no-input-limit-3', created: 2027, max_output_tokens: 4096 },
      ],
    });
  };

  const result = await warmDiscovery(discovery, { providerId: FUTURE_ID, key: 'k1', tenantId: 'tenant-x', fetchImpl: fetchMock });
  assert.equal(result.source, 'live');
  assert.equal(result.credential, 'verified');

  const state = discovery.getCachedState(FUTURE_ID, 'tenant-x');
  assert.ok(state.catalog && state.catalog.authoritative, 'catalog stored and authoritative');
  assert.equal(state.catalog.models.size, 3);

  const pro = state.catalog.models.get('acme-pro-1');
  assert.ok(pro, 'metadata-rich model normalized');
  assert.equal(pro.maxInputTokens, 200000, 'context_length mapped to capacity');
  assert.equal(pro.maxOutputTokens, 16384, 'max_output_tokens mapped');
  assert.equal(pro.capabilities.structuredOutput, 'unknown', 'function_calling must NOT be equated to structured output');
  assert.equal(pro.capabilities.streaming, 'unknown', 'streaming not published → unknown, not fabricated');
  assert.equal(pro.capabilities.reasoning, 'unknown', 'reasoning not published → unknown');

  const plain = state.catalog.models.get('acme-plain-2');
  assert.ok(plain, 'zero-metadata model still listed');
  assert.equal(plain.maxInputTokens, null, 'missing capacity stays null (unknown), never invented');
  assert.equal(plain.capabilities.structuredOutput, 'unknown');
  assert.equal(plain.modalities, null, 'no modality data → null (unknown), not assumed');

  const noLimit = state.catalog.models.get('acme-no-input-limit-3');
  assert.equal(noLimit.maxInputTokens, null);
  assert.equal(noLimit.maxOutputTokens, 4096, 'partial metadata preserved');

  // Tenant access recorded with the exact model set the credential saw.
  assert.equal(state.tenantAccess.credentialOk, 'verified');
  assert.deepEqual([...state.tenantAccess.modelIds].sort(), ['acme-no-input-limit-3', 'acme-plain-2', 'acme-pro-1']);

  // Schema evolution: a totally new top-level field must not break normalization.
  const evolved = normalizeModelRecord({
    provider: 'acme', modelId: 'acme-evolved', raw: { totallyNewCapabilityField: { mode: 'ultra' } },
  });
  assert.equal(evolved.modelId, 'acme-evolved');
  assert.equal(evolved.capabilities.capabilities.streaming, 'unknown', 'unknown new schema → unknown, never a crash or a guess');
  assert.ok(calledUrl.includes('futurecorp'), 'discovery hit the adapter endpoint');
});

// ---------------------------------------------------------------------------
test('2. Brand-new model from a registered future provider participates end-to-end via the generic path', async () => {
  const now = { value: 1_760_000_000_000 };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  const chatCalls = [];
  const fetchMock = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/models')) {
      return jsonResponse({
        data: [
          { id: 'brand-new-model-2027', created: 2027, context_length: 1000000, max_output_tokens: 65536 },
          { id: 'legacy-model-2019', created: 2019, context_length: 4096 },
        ],
      });
    }
    if (u.includes('/chat/completions')) {
      const body = JSON.parse(options.body);
      chatCalls.push({ url: u, model: body.model });
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ ok: true, model: body.model }) } }] });
    }
    throw new Error(`unexpected URL ${u}`);
  };

  // Step 1: discovery for the tenant (the same call the first request fires).
  await warmDiscovery(router.discovery, { providerId: FUTURE_ID, key: 'fc-key-001', tenantId: 't-future', fetchImpl: fetchMock });

  const configuration = {
    primary: FUTURE_ID,
    enableFallback: true,
    temperature: 0.2,
    maxTokens: 1024,
    tenantId: 't-future',
    discoveryEnabled: true,
    providers: { [FUTURE_ID]: { enabled: true, key: 'fc-key-001', model: null } }, // NO configured model
  };

  // Step 2: selection + execution must find and use the brand-new model.
  const result = await router.route({
    prompt: 'Prove you are the newly discovered model',
    configuration,
    operation: 'generate-summary',
    fetchImpl: fetchMock,
  });

  assert.equal(result.provider, FUTURE_ID);
  assert.equal(result.model, 'brand-new-model-2027', 'newly published model selected through the generic path');
  assert.equal(chatCalls.length, 1, 'exactly one provider call');
  assert.equal(chatCalls[0].model, 'brand-new-model-2027', 'execution used the discovered model id verbatim');
  assert.equal(result.routing.candidatesConsidered, 2);
  assert.equal(result.routing.candidatesRejected, 0);
  assert.ok(String(result.routing.rationale).includes('rank:discovered-model'), 'rationale is explainable');

  // Step 3: deterministic re-run — same decision, zero extra provider discovery traffic.
  const second = await router.route({
    prompt: 'Again',
    configuration,
    operation: 'generate-summary',
    fetchImpl: fetchMock,
  });
  assert.equal(second.model, 'brand-new-model-2027');
  assert.equal(chatCalls.length, 2, 'only chat calls — discovery was cache-served (no storm)');

  // Step 4: telemetry captured the safe decision facts for the tenant.
  const entries = router.telemetry.query({ tenantId: 't-future' });
  assert.equal(entries.length, 2);
  assert.ok(entries.every(e => e.outcome === 'success'));
  assert.ok(entries.every(e => e.selectedModel === 'brand-new-model-2027'));
  assert.ok(entries.every(e => e.decisionId && e.candidatesConsidered === 2));
});

// ---------------------------------------------------------------------------
test('3. Gemini-native discovery and request shapes work through the same engine', async () => {
  const now = { value: 1_760_000_000_000 };
  const router = createAiModelRouter({ now: () => now.value, autoDiscovery: true });
  const calls = [];

  const fetchMock = async (url, options = {}) => {
    const u = String(url);
    if (u.includes(':generateContent')) { // must match before the /v1beta/models prefix
      calls.push({ url: u, headers: options.headers, body: JSON.parse(options.body) });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }] });
    }
    if (u.includes('/v1beta/models')) {
      return jsonResponse({
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
          { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedActions: ['generateContent', 'countTokens'] },
        ],
      });
    }
    throw new Error(`unexpected gemini URL ${u}`);
  };

  await warmDiscovery(router.discovery, { providerId: 'gemini', key: 'gemini-key', tenantId: 't-gemini', fetchImpl: fetchMock });
  const state = router.discovery.getCachedState('gemini', 't-gemini');
  assert.ok(state.catalog.models.has('gemini-2.5-flash'), 'native name → id normalization (models/ prefix stripped)');
  assert.ok(state.catalog.models.has('gemini-2.5-pro'));

  const result = await router.route({
    prompt: 'hello gemini',
    configuration: {
      primary: 'gemini',
      enableFallback: false,
      temperature: 0.3,
      maxTokens: 512,
      tenantId: 't-gemini',
      discoveryEnabled: true,
      providers: { gemini: { enabled: true, key: 'gemini-key', model: 'gemini-2.5-flash' } },
    },
    operation: 'generate-summary',
    fetchImpl: fetchMock,
  });
  assert.equal(result.model, 'gemini-2.5-flash');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('gemini-2.5-flash:generateContent'));
  assert.ok(calls[0].url.includes('key=gemini-key'), 'tenant key passed per gemini-native convention (URL)');
  assert.ok(Array.isArray(calls[0].body.contents), 'native contents/parts body');
  assert.equal(calls[0].body.generationConfig.maxOutputTokens, 512);
  assert.equal(calls[0].body.generationConfig.temperature, 0.3);
});

// ---------------------------------------------------------------------------
test('4. Discovery 401/403 marks credentials rejected for THAT tenant only (cache isolation)', async () => {
  const now = { value: 1_760_000_000_000 };
  const discovery = new DiscoveryService({ now: () => now.value });

  const goodCatalog = () => jsonResponse({
    data: [{ id: 'public-model', created: 2026, context_length: 128000 }],
  });

  // Tenant A has a working credential; tenant B's credential is rejected.
  await warmDiscovery(discovery, { providerId: FUTURE_ID, key: 'key-a', tenantId: 'tenant-a', fetchImpl: async () => goodCatalog() });
  await warmDiscovery(discovery, { providerId: FUTURE_ID, key: 'key-b', tenantId: 'tenant-b', fetchImpl: async () => jsonResponse({ error: { message: 'bad key' } }, 403) });

  // The catalog entry is GLOBAL: one shared, credential-free model list.
  const entryA = discovery.catalogs.get(FUTURE_ID);
  assert.equal(entryA.models.size, 1);
  assert.equal(discovery.catalogs.size, 1, 'exactly one shared catalog entry per provider (public metadata, not per-tenant copies)');

  const accessA = discovery.tenantAccess.get('tenant-a|futurecorp');
  const accessB = discovery.tenantAccess.get('tenant-b|futurecorp');
  assert.equal(accessA.credentialOk, 'verified');
  assert.equal(accessB.credentialOk, 'rejected', '403 → tenant-scoped credential rejection');
  assert.deepEqual([...accessA.modelIds], ['public-model']);
  assert.equal(accessB.modelIds, null, 'rejected tenant sees zero discovered models');

  // The rejected tenant cannot execute the discovered model; the good tenant can.
  const router = createAiModelRouter({ now: () => now.value, discovery, autoDiscovery: true });
  const fetchMock = async () => jsonResponse({ choices: [{ message: { content: 'ok' } }] });
  const baseConfig = {
    primary: FUTURE_ID, enableFallback: true, temperature: 0.2, maxTokens: 512,
    discoveryEnabled: true, providers: { [FUTURE_ID]: { enabled: true, key: 'key', model: null } },
  };

  const resA = await router.route({ prompt: 'a', configuration: { ...baseConfig, tenantId: 'tenant-a' }, operation: 'generate-summary', fetchImpl: fetchMock });
  assert.equal(resA.model, 'public-model', 'verified tenant uses the discovered model');

  await assert.rejects(
    () => router.route({ prompt: 'b', configuration: { ...baseConfig, tenantId: 'tenant-b' }, operation: 'generate-summary', fetchImpl: fetchMock }),
    (err) => {
      assert.equal(err.code, 'AI_PROVIDER_UNAVAILABLE', 'rejected tenant has NO candidates — no cross-tenant credential use');
      assert.equal(err.status, 503);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
test('5. Transient discovery failures (429 / network / malformed / 400) preserve last-known-good', async () => {
  const now = { value: 1_760_000_000_000 };
  const discovery = new DiscoveryService({ now: () => now.value });
  const good = async () => jsonResponse({
    data: [
      { id: 'stable-model-a', created: 2026, context_length: 64000 },
      { id: 'stable-model-b', created: 2026 },
    ],
  });

  await warmDiscovery(discovery, { providerId: FUTURE_ID, key: 'k', tenantId: 't1', fetchImpl: good });
  const before = discovery.getCachedState(FUTURE_ID, 't1');
  assert.equal(before.catalog.models.size, 2);
  const fetchedAt = before.catalog.fetchedAt;

  // Force past the min refresh interval (access TTL 15min; advance 16min).
  for (const [label, failingFetch] of [
    ['429', async () => jsonResponse({ error: { message: 'slow down' } }, 429)],
    ['network', async () => { throw Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }); }],
    ['malformed', async () => jsonResponse({ data: 'not-an-array' })],
    ['400', async () => jsonResponse({ error: { message: 'bad' } }, 400)],
  ]) {
    now.value += 16 * 60 * 1000;
    const result = await warmDiscovery(discovery, { providerId: FUTURE_ID, key: 'k', tenantId: 't1', fetchImpl: failingFetch });
    assert.notEqual(result.source, 'live', `${label}: refresh did not replace state`);
    const state = discovery.getCachedState(FUTURE_ID, 't1');
    assert.equal(state.catalog.models.size, 2, `${label}: last-known-good models retained`);
    assert.equal(state.catalog.fetchedAt, fetchedAt, `${label}: staleness timestamp unchanged (data not refreshed)`);
  }

  // A successful refresh eventually replaces the catalog.
  now.value += 16 * 60 * 1000;
  await warmDiscovery(discovery, { providerId: FUTURE_ID, key: 'k', tenantId: 't1', fetchImpl: async () => jsonResponse({ data: [{ id: 'stable-model-a', created: 2026, context_length: 64000 }] }) });
  const after = discovery.getCachedState(FUTURE_ID, 't1');
  assert.equal(after.catalog.models.size, 1);
  assert.notEqual(after.catalog.fetchedAt, fetchedAt);
});

// ---------------------------------------------------------------------------
test('6. Discovery refresh is deduped and rate-limited; getCachedState is synchronous (selection never blocks on network)', async () => {
  const now = { value: 1_760_000_000_000 };
  const discovery = new DiscoveryService({ now: () => now.value });
  let fetches = 0;
  const slowFetch = async () => {
    fetches += 1;
    await new Promise((r) => setTimeout(r, 20));
    return jsonResponse({ data: [{ id: 'm1', created: 2026 }] });
  };

  // Fire three "first requests" back-to-back — only one real fetch.
  const p1 = discovery.scheduleRefresh({ providerId: FUTURE_ID, providerConfig: { key: 'k' }, tenantId: 't', adapter: FUTURE_ADAPTER, fetchImpl: slowFetch });
  const p2 = discovery.scheduleRefresh({ providerId: FUTURE_ID, providerConfig: { key: 'k' }, tenantId: 't', adapter: FUTURE_ADAPTER, fetchImpl: slowFetch });
  const p3 = discovery.scheduleRefresh({ providerId: FUTURE_ID, providerConfig: { key: 'k' }, tenantId: 't', adapter: FUTURE_ADAPTER, fetchImpl: slowFetch });
  await Promise.all([p1, p2, p3]);
  assert.equal(fetches, 1, 'deduped in-flight refresh');

  // Within the access TTL further refreshes are served from cache.
  now.value += 10 * 1000;
  const cached = await discovery.scheduleRefresh({ providerId: FUTURE_ID, providerConfig: { key: 'k' }, tenantId: 't', adapter: FUTURE_ADAPTER, fetchImpl: slowFetch });
  assert.equal(cached.source, 'cached');
  assert.equal(fetches, 1, 'no re-fetch while state is fresh');

  // Different tenant pairs refresh independently.
  await discovery.scheduleRefresh({ providerId: FUTURE_ID, providerConfig: { key: 'k' }, tenantId: 'other', adapter: FUTURE_ADAPTER, fetchImpl: slowFetch });
  assert.equal(fetches, 2, 'per-tenant refresh is independent');

  // getCachedState is synchronous and cache-backed.
  const t0 = process.hrtime.bigint();
  const state = discovery.getCachedState(FUTURE_ID, 't');
  const syncUs = Number(process.hrtime.bigint() - t0) / 1000;
  assert.ok(state && state.catalog && state.catalog.models.has('m1'));
  assert.ok(syncUs < 100, `getCachedState is O(1) sync (${syncUs.toFixed(1)}µs)`);
  assert.deepEqual(discovery.getCachedState('unknown-provider', 'unknown-tenant'), { catalog: null, tenantAccess: null });
});

// ---------------------------------------------------------------------------
test('7. Discovery timeouts are bounded and produce safe errors (never fabricated models)', async () => {
  const now = { value: 1_760_000_000_000 };
  const discovery = new DiscoveryService({ now: () => now.value });
  // Simulates a hung provider: never resolves, but honors abort like real fetch does.
  const hangingFetch = (url, options = {}) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(options.signal.reason || new Error('aborted')));
  });
  const started = Date.now();
  const result = await discovery.scheduleRefresh({
    providerId: FUTURE_ID, providerConfig: { key: 'k' }, tenantId: 't', adapter: FUTURE_ADAPTER,
    fetchImpl: hangingFetch, timeoutMs: 500,
  });
  assert.notEqual(result.source, 'live', 'timeout never yields live data');
  assert.ok(Date.now() - started < 3000, `bounded by the discovery timeout (took ${Date.now() - started}ms)`);
  assert.equal(discovery.getCachedState(FUTURE_ID, 't').catalog, null, 'no invented catalog after timeout');

  // Malformed model ids (injection-shaped) are dropped at normalization, not stored.
  await warmDiscovery(discovery, {
    providerId: FUTURE_ID, key: 'k', tenantId: 't2',
    fetchImpl: async () => jsonResponse({
      data: [
        { id: 'good-model', created: 2026 },
        { id: '42', created: 2026 }, // numeric but syntactically safe
        { id: '../../etc/passwd', created: 2026 },
        { id: '/etc/passwd', created: 2026 },
        { id: 'a'.repeat(300), created: 2026 },
        { id: 'evil"header: inject', created: 2026 },
      ],
    }),
  });
  const cached = discovery.getCachedState(FUTURE_ID, 't2');
  assert.deepEqual(
    [...cached.catalog.models.keys()].sort(),
    ['42', 'good-model'],
    'traversal/injection/oversized ids dropped at the trust boundary; safe opaque ids accepted',
  );
});

// ---------------------------------------------------------------------------
test('8. Provider adapter registry is the ONLY provider-specific extension point (no provider names in the selection core)', async () => {
  const ids = listAdapterIds();
  assert.ok(ids.includes(FUTURE_ID), 'future provider registered dynamically');
  assert.ok(ids.includes('openai') && ids.includes('gemini') && ids.includes('nvidia'));

  // The central selector/orchestrator must not hardcode provider brand names.
  const fs = require('fs');
  const path = require('path');
  for (const file of ['modelSelector.js', 'orchestrator.js', 'requirementProfiles.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'aiRouting', file), 'utf8');
    const brandPattern = /['"`](openai|anthropic|gemini|groq|nvidia|openrouter|deepseek)['"`]/i;
    assert.ok(!brandPattern.test(source), `${file} must stay provider-agnostic (no brand string literals)`);
  }
});

// ---------------------------------------------------------------------------
test('9. Credential-rejected state persists safely (no secret material in discovery state)', async () => {
  const discovery = new DiscoveryService();
  const secretKey = 'sk-super-secret-1234567890abcd';
  await warmDiscovery(discovery, {
    providerId: FUTURE_ID, key: secretKey, tenantId: 't',
    fetchImpl: async (url, options) => {
      assert.equal(options.headers['Authorization'], `Bearer ${secretKey}`, 'tenant credential used for authenticated discovery');
      return jsonResponse({ error: { message: `Invalid key ${secretKey}` } }, 401);
    },
  });
  const entry = discovery.tenantAccess.get('t|futurecorp');
  assert.equal(entry.credentialOk, 'rejected');
  const snapshotJson = JSON.stringify(discovery.stats());
  assert.ok(!snapshotJson.includes('sk-super-secret'), 'observability snapshot contains no secret material');
  assert.ok(!String(entry.lastError).includes('sk-super-secret'), 'stored lastError is a safe classification, not the provider message');
});

// ---------------------------------------------------------------------------
test('10. Bounded catalog size (LRU eviction) keeps memory predictable', () => {
  const map = new LruMap(10);
  for (let i = 0; i < 25; i += 1) map.set(`k${i}`, i);
  assert.equal(map.size, 10, 'evicts beyond capacity');
  assert.ok(map.get('k24') === 24 && map.get('k15') === 15, 'keeps the most recent');
  assert.equal(map.get('k0'), undefined, 'evicts the least recently used');
  // Access refreshes recency.
  map.get('k15');
  map.set('k25', 25);
  assert.equal(map.get('k14'), undefined, 'k14 was the oldest after touching k15');
  assert.equal(map.get('k15'), 15, 'touched entry survives');
  const discovery = new DiscoveryService();
  assert.equal(discovery.catalogs.size, 0, 'fresh service: no catalog entries');
  assert.equal(discovery.tenantAccess.size, 0, 'fresh service: no tenant access entries');
});
