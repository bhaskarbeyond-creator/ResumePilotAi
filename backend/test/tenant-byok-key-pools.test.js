'use strict';

/**
 * PH4-ENGINE-021 C.5 — tenant key-pools through the existing 027
 * enterprise_tenant_credentials path, WITHOUT touching mysql.js.
 *
 * The decrypted credential envelope may carry a pool: {apiKeys:[...]} (F-08
 * loader passthrough, new) or a comma/newline-delimited string (which
 * normalizeKeyPool already split before this phase). Two honest pool shapes
 * reach dispatch, and BOTH are pinned here:
 *   - policy configs (selectionMode): applySelectionPolicy splits the pool
 *     into credential-specific single-key candidates (pre-existing design —
 *     failover happens across the candidate list, and a per-key failure with
 *     a remaining credential never benches the destination);
 *   - non-policy configs: the candidate keeps the whole pool and C.5 makes
 *     the router try the tenant's OWN keys sequentially (previously only
 *     keys[0] was ever attempted — single-key BYOK stays byte-identical [0]).
 * Scoped benches (C.1, flag on) fire only after the WHOLE pool failed or on
 * 429. Hermetic: :memory: metrics, registry fakes, stub fetchImpl. No
 * MariaDB, no network, no timers. Zero console.*, zero waitForTimeout.
 */

process.env.FREELMAPI_METRICS_DB = ':memory:';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FreeLlmRouter, normalizeKeyPool } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const { loadTenantByokKeys, clearTenantByokCache } = require('../enterprise/tenantAi');
const freellm = require('../freellmapi');

const SCOPE_FLAG = 'FREELMAPI_TENANT_SCOPED_EVIDENCE';

function makeRouter() {
  freellm.resetMetricsForTests();
  const router = new FreeLlmRouter();
  router.cooldownManager = new CooldownManager();
  router.modelDiscovery = {
    getOrDiscover: async () => [{ id: 'groq-fixture', capabilities: {} }],
  };
  return router;
}

const policyConfig = {
  selectionMode: 'speed',
  primary: 'groq',
  enableFallback: false,
  providers: { groq: { enabled: true, key: 'fixture-platform-key', model: 'groq-fixture' } },
};
const nonPolicyConfig = {
  primary: 'groq',
  enableFallback: false,
  providers: { groq: { enabled: true, key: 'fixture-platform-key', model: 'groq-fixture' } },
};

function byokContext(customProviderKeys) {
  return { tenantId: 'tenant-pools', customProviderKeys, allowedProviders: ['groq'], primaryModel: 'groq-fixture' };
}

function withScopeFlag(on, fn) {
  return async () => {
    const previous = process.env[SCOPE_FLAG];
    if (on) process.env[SCOPE_FLAG] = '1'; else delete process.env[SCOPE_FLAG];
    try {
      await fn();
    } finally {
      if (previous === undefined) delete process.env[SCOPE_FLAG]; else process.env[SCOPE_FLAG] = previous;
      freellm.resetMetricsForTests();
    }
  };
}

// ---------------------------------------------------------------------------
// P1 — pool shapes reach dispatch intact (both honest shapes).
// ---------------------------------------------------------------------------

test('P1: policy config — a delimited pool splits into credential-specific single-key candidates, deduped, in order', async () => {
  const router = makeRouter();
  const candidates = await router.buildCandidateList({
    tenantContext: byokContext({ groq: 'gsk_pool-key-1, gsk_pool-key-2\ngsk_pool-key-3,gsk_pool-key-1' }),
    platformConfig: policyConfig,
    fetchImpl: async () => new Response('{}'),
  });
  assert.equal(candidates.length, 3, 'one candidate per distinct credential (pre-existing policy split)');
  assert.deepEqual(candidates.map(c => c.keys), [['gsk_pool-key-1'], ['gsk_pool-key-2'], ['gsk_pool-key-3']]);
  assert.ok(candidates.every(c => c.isDedicatedByok === true));
});

test('P1b: non-policy config — the candidate keeps the WHOLE pool for sequential dispatch', async () => {
  const router = makeRouter();
  const candidates = await router.buildCandidateList({
    tenantContext: byokContext({ groq: 'gsk_pool-key-1,gsk_pool-key-2,gsk_pool-key-3' }),
    platformConfig: nonPolicyConfig,
    fetchImpl: async () => new Response('{}'),
  });
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].keys, ['gsk_pool-key-1', 'gsk_pool-key-2', 'gsk_pool-key-3']);
  assert.equal(candidates[0].key, 'gsk_pool-key-1');
  assert.equal(candidates[0].isDedicatedByok, true);
});

test('P2: an array envelope ({apiKeys:[...]}) passes through the F-08 loader untouched', async () => {
  clearTenantByokCache();
  const registry = {
    async getTenantCredentials({ tenantId, providerId }) {
      assert.equal(tenantId, 'tenant-pools');
      return providerId === 'groq' ? { apiKeys: [' gsk_a ', 'gsk_b', '', 'gsk_a'] } : null;
    },
    async listTenantCredentialProviders() { return [{ providerId: 'groq' }]; },
  };
  const keys = await loadTenantByokKeys({ registry, tenantId: 'tenant-pools', allowedProviders: ['groq'] });
  assert.deepEqual(keys.groq, ['gsk_a', 'gsk_b', 'gsk_a'], 'trimmed, empties dropped, order preserved — dedupe happens in normalizeKeyPool, not the loader');

  const router = makeRouter();
  const candidates = await router.buildCandidateList({
    tenantContext: byokContext(keys),
    platformConfig: nonPolicyConfig,
    fetchImpl: async () => new Response('{}'),
  });
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].keys, ['gsk_a', 'gsk_b']);
  clearTenantByokCache();
});

// ---------------------------------------------------------------------------
// P3 — sequential dispatch across the tenant's own pool (both shapes).
// ---------------------------------------------------------------------------

const poolFetch = attempted => async (_url, request) => {
  const auth = String(request.headers?.Authorization || '');
  attempted.push(auth);
  if (auth.includes('gsk_dead-key')) {
    return new Response(JSON.stringify({ error: { message: 'invalid key fixture' } }), { status: 401 });
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: 'pool served' } }] }));
};

test('P3: non-policy — the pool is tried sequentially within the candidate (keys[0] rejected, keys[1] serves)', async () => {
  const router = makeRouter();
  const attempted = [];
  const result = await router.routeCompletion({
    prompt: 'C.5 non-policy pool failover fixture', bypassCache: true, fetchImpl: poolFetch(attempted),
    tenantContext: byokContext({ groq: 'gsk_dead-key,gsk_live-key' }),
    platformConfig: nonPolicyConfig,
  });
  assert.equal(result.content, 'pool served');
  assert.equal(result.keysAttempted, 2, 'both tenant keys were attempted, in pool order');
  assert.deepEqual(attempted, ['Bearer gsk_dead-key', 'Bearer gsk_live-key']);
  assert.equal(router.cooldownManager.getStatus().length, 0, 'a served request benches nothing');
});

test('P3b: policy — failover runs across the split single-key candidates', async () => {
  const router = makeRouter();
  const attempted = [];
  const result = await router.routeCompletion({
    prompt: 'C.5 policy pool failover fixture', bypassCache: true, fetchImpl: poolFetch(attempted),
    tenantContext: byokContext({ groq: 'gsk_dead-key,gsk_live-key' }),
    platformConfig: policyConfig,
  });
  assert.equal(result.content, 'pool served');
  assert.equal(result.keysAttempted, 2);
  assert.deepEqual(attempted, ['Bearer gsk_dead-key', 'Bearer gsk_live-key']);
});

// ---------------------------------------------------------------------------
// P4 — exhausted pools: scoped bench (flag on) only after the WHOLE pool
//      failed; flag off keeps the byte-identical no-bench sanctuary.
// ---------------------------------------------------------------------------

const failingFetch500 = async () => new Response(JSON.stringify({ error: { message: 'fixture down' } }), { status: 500 });

test('P4: non-policy exhausted pool — single-candidate sanctuary throws the provider error and benches the tenant scope only', withScopeFlag(true, async () => {
  const router = makeRouter();
  let thrown = null;
  try {
    await router.routeCompletion({
      prompt: 'C.5 exhausted non-policy pool fixture', bypassCache: true, fetchImpl: failingFetch500,
      tenantContext: byokContext({ groq: 'gsk_k1,gsk_k2,gsk_k3' }),
      platformConfig: nonPolicyConfig,
    });
  } catch (error) { thrown = error; }
  assert.ok(thrown, 'the single-candidate sanctuary still throws the last provider error');
  assert.equal(thrown.status, 500);
  const tenantView = router.cooldownManager.isOnCooldown('groq', 'groq-fixture', { scopeKey: 'tenant:tenant-pools' });
  assert.equal(tenantView.onCooldown, true, 'the WHOLE pool failed: the tenant scope benches');
  assert.equal(tenantView.reason, 'Tenant provider unavailable');
  assert.equal(tenantView.credentialKind, 'byok');
  assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-fixture').onCooldown, false, 'platform untouched (F-09)');
}));

test('P4-policy: policy exhausted pool — split candidates exhaust into ALL_PROVIDERS_FAILED and still bench the tenant scope only', withScopeFlag(true, async () => {
  const router = makeRouter();
  let thrown = null;
  try {
    await router.routeCompletion({
      prompt: 'C.5 exhausted policy pool fixture', bypassCache: true, fetchImpl: failingFetch500,
      tenantContext: byokContext({ groq: 'gsk_k1,gsk_k2,gsk_k3' }),
      platformConfig: policyConfig,
    });
  } catch (error) { thrown = error; }
  assert.ok(thrown);
  assert.equal(thrown.code, 'ALL_PROVIDERS_FAILED', 'a split pool is a multi-candidate cascade — the honest 502');
  assert.equal(thrown.status, 502);
  const tenantView = router.cooldownManager.isOnCooldown('groq', 'groq-fixture', { scopeKey: 'tenant:tenant-pools' });
  assert.equal(tenantView.onCooldown, true, 'the last credential failure benches the tenant scope');
  assert.equal(router.cooldownManager.isOnCooldown('groq', 'groq-fixture').onCooldown, false);
}));

test('P4b: flag OFF — an exhausted BYOK pool benches nothing anywhere (byte-identical legacy sanctuary)', withScopeFlag(false, async () => {
  const router = makeRouter();
  await assert.rejects(() => router.routeCompletion({
    prompt: 'C.5 flag-off pool fixture', bypassCache: true, fetchImpl: failingFetch500,
    tenantContext: byokContext({ groq: 'gsk_k1,gsk_k2' }),
    platformConfig: nonPolicyConfig,
  }));
  assert.deepEqual(router.cooldownManager.getStatus(), [], 'no benches in any scope');
}));

test('P4c: a per-key failure with a remaining credential never benches (credential-specific rule holds for pools)', withScopeFlag(true, async () => {
  const router = makeRouter();
  let cooled = 0;
  const realSet = router.cooldownManager.setCooldown.bind(router.cooldownManager);
  router.cooldownManager.setCooldown = (...args) => { cooled += 1; return realSet(...args); };
  const attempted = [];
  const guardedFetch = async (url, request) => {
    const response = await poolFetch(attempted)(url, request);
    if (attempted.length === 2) assert.equal(cooled, 0, 'no bench while another tenant credential remains');
    return response;
  };
  const result = await router.routeCompletion({
    prompt: 'C.5 partial pool failure fixture', bypassCache: true, fetchImpl: guardedFetch,
    tenantContext: byokContext({ groq: 'gsk_dead-key,gsk_live-key' }),
    platformConfig: nonPolicyConfig,
  });
  assert.equal(result.content, 'pool served');
  assert.equal(cooled, 0);
}));

// ---------------------------------------------------------------------------
// P5 — loader shape honesty (single-key envelopes unchanged).
// ---------------------------------------------------------------------------

test('P5: single-key loader shapes pass through byte-identically; empty pools yield no entry', async () => {
  clearTenantByokCache();
  const byProvider = {
    'tenant-pools:groq': 'raw-string-key',
    'tenant-pools:openai': { apiKey: 'sk-object-key' },
    'tenant-pools:gemini': { apiKeys: [] },
    'tenant-pools:mistral': { apiKeys: ['  ', ''] },
  };
  const registry = {
    async getTenantCredentials({ tenantId, providerId }) { return byProvider[`${tenantId}:${providerId}`] ?? null; },
    async listTenantCredentialProviders({ tenantId }) {
      return Object.keys(byProvider).filter(k => k.startsWith(`${tenantId}:`)).map(k => ({ providerId: k.split(':')[1] }));
    },
  };
  const keys = await loadTenantByokKeys({ registry, tenantId: 'tenant-pools' });
  assert.equal(keys.groq, 'raw-string-key', 'legacy string envelope unchanged');
  assert.equal(keys.openai, 'sk-object-key', 'legacy {apiKey} envelope unchanged');
  assert.ok(!('gemini' in keys), 'an empty pool yields no entry (never an empty-array candidate)');
  assert.ok(!('mistral' in keys), 'a whitespace-only pool yields no entry');
  clearTenantByokCache();
});

// ---------------------------------------------------------------------------
// P6 — normalizeKeyPool contract pin (shared with the platform path).
// ---------------------------------------------------------------------------

test('P6: normalizeKeyPool dedupes, trims and splits — the platform contract the tenant path reuses', () => {
  assert.deepEqual(normalizeKeyPool({ key: 'a, b\na ,c' }), ['a', 'b', 'c']);
  assert.deepEqual(normalizeKeyPool({ key: ['x', 'y,x', ' z '] }), ['x', 'y', 'z']);
  assert.deepEqual(normalizeKeyPool({ key: 'none' }), [], 'the keyless sentinels stay excluded');
  assert.deepEqual(normalizeKeyPool({}), []);
});
