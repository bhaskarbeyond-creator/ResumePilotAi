'use strict';

/**
 * AI Model Routing — Requirement Analysis & Explainable Selection
 * =================================================================
 * Proves the selector is a generic, explainable decision engine:
 *  - requirement profiles are operation-driven data (never model names);
 *  - eligibility hard gates run BEFORE any ranking (tenant policy, credential
 *    access, capability violations, context capacity, runtime cooldowns);
 *  - unknown capabilities are NEVER assumed supported (unknown ≠ yes, and
 *    unverified long context is a hard rejection);
 *  - ordering is deterministic and explainable (score → provider order → id);
 *  - no hardcoded model rankings anywhere: a brand-new discovered model with
 *    verified capacity beats a configured model whose capacity is insufficient;
 *  - bounded adaptation: cooldowns exclude, and the last-resort rule releases
 *    the earliest-expiring candidate so routing stays recoverable.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectModels,
  computeProviderOrder,
  deriveRequirementProfile,
  HealthStore,
  CAP,
  LONG_CONTEXT_SAFE_TOKENS,
} = require('../services/aiRouting');

const NOW = 1_760_000_000_000;

function caps({ structuredOutput = 'unknown', streaming = 'unknown', reasoning = 'unknown', maxInputTokens = null, modalities = null, pricing = null } = {}) {
  return {
    capabilities: { structuredOutput, streaming, reasoning },
    modalities,
    maxInputTokens,
    maxOutputTokens: null,
    pricing,
    extra: {},
  };
}

function catalogMap(entries) {
  // Map<providerId, { models: Map, fetchedAt, authoritative }>
  const out = new Map();
  for (const [provider, models] of Object.entries(entries)) {
    out.set(provider, {
      models: new Map(Object.entries(models).map(([id, c]) => [id, c])),
      fetchedAt: NOW,
      authoritative: true,
    });
  }
  return out;
}

function baseConfig(overrides = {}) {
  return {
    primary: 'prov-a',
    enableFallback: true,
    temperature: 0.7,
    maxTokens: 2048,
    tenantId: 'tenant-1',
    providers: {
      'prov-a': { enabled: true, key: 'ka', model: 'model-a-configured' },
      'prov-b': { enabled: true, key: 'kb', model: 'model-b-configured' },
    },
    ...overrides,
  };
}

function shortRequirement() {
  return deriveRequirementProfile({ operation: 'generate-summary', prompt: 'short prompt' });
}

// ---------------------------------------------------------------------------
test('1. Requirement profiles are operation-driven data with explicit token math', () => {
  const auto = deriveRequirementProfile({ operation: 'autocomplete', prompt: 'x'.repeat(800) });
  assert.equal(auto.structuredOutput, true);
  assert.equal(auto.latencySensitivity, 'high');
  assert.equal(auto.determinism, 'strict');
  assert.equal(auto.maxOutputTokens, 180);
  assert.equal(auto.contextTokensEstimate, 200, 'estimate is chars/4');
  assert.equal(auto.requiredTokens, Math.ceil((200 + 180) * 1.1), 'required = (context + output) with 10% headroom');
  assert.equal(auto.longContextRequired, false);

  const parse = deriveRequirementProfile({ operation: 'parse-resume', prompt: 'x'.repeat(800) });
  assert.equal(parse.determinism, 'strict');
  assert.equal(parse.maxOutputTokens, 4096);

  const turn = deriveRequirementProfile({ operation: 'live-interview-turn', prompt: 'q' });
  assert.equal(turn.latencySensitivity, 'high');

  // Unknown operations degrade to the safe generic default (no hard failure).
  const unknown = deriveRequirementProfile({ operation: 'totally-new-operation-2027', prompt: 'x'.repeat(800) });
  assert.equal(unknown.structuredOutput, false);
  assert.equal(unknown.qualityTier, 'standard');

  // Long-context detection uses the safe threshold.
  const longPrompt = deriveRequirementProfile({ operation: 'generate-summary', prompt: 'x'.repeat(80000) });
  assert.ok(longPrompt.requiredTokens > LONG_CONTEXT_SAFE_TOKENS);
  assert.equal(longPrompt.longContextRequired, true);

  // Caller override (live sessions know their transcript length better).
  const overridden = deriveRequirementProfile({ operation: 'generate-summary', prompt: 'tiny', payload: { estimatedInputTokens: 50000 } });
  assert.equal(overridden.contextTokensEstimate, 50000);
  assert.equal(overridden.longContextRequired, true);
});

// ---------------------------------------------------------------------------
test('2. Provider order: primary first; fallback disabled pins the primary; disabled providers never appear', () => {
  assert.deepEqual(computeProviderOrder(baseConfig()), ['prov-a', 'prov-b']);
  assert.deepEqual(computeProviderOrder(baseConfig({ enableFallback: false })), ['prov-a']);
  assert.deepEqual(computeProviderOrder(baseConfig({ primary: 'prov-b' })), ['prov-b', 'prov-a']);
  assert.deepEqual(computeProviderOrder(baseConfig({ providers: { 'prov-a': { enabled: false, key: 'ka' } } })), []);
  assert.deepEqual(computeProviderOrder({ providers: {} }), []);
});

// ---------------------------------------------------------------------------
test('3. Hard eligibility gates reject before ranking (each with an explainable reason)', () => {
  const req = shortRequirement(); // structuredOutput required

  // 3a. No credential → provider contributes nothing.
  let d = selectModels({
    configuration: baseConfig({ providers: { 'prov-a': { enabled: true, model: 'm' } } }),
    requirement: req, now: NOW,
  });
  assert.equal(d.selection, null);
  assert.equal(d.candidates[0].rejectionReason, 'provider-disabled');

  // 3b. Tenant model allowlist (governance data, not routing intelligence).
  d = selectModels({
    configuration: baseConfig({ tenantPolicy: { allowedModels: ['some-other-approved-model'] } }),
    requirement: req, now: NOW,
  });
  assert.equal(d.selection, null, 'no configured model is on the tenant allowlist');
  assert.ok(d.candidates.every(c => c.rejectionReason === 'tenant-model-allowlist'));

  // 3b2. Allowlist that matches exactly one model selects it.
  d = selectModels({
    configuration: baseConfig({ tenantPolicy: { allowedModels: ['model-a-configured'] } }),
    requirement: req, now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-a', model: 'model-a-configured' });

  // 3c. Tenant restricted (deny) list wins over allowlist.
  d = selectModels({
    configuration: baseConfig({ tenantPolicy: { allowedModels: ['model-a-configured', 'model-b-configured'], restrictedModels: ['model-a-configured'] } }),
    requirement: req, now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-b', model: 'model-b-configured' });
  const rejectedA = d.candidates.find(c => c.model === 'model-a-configured');
  assert.equal(rejectedA.rejectionReason, 'tenant-model-restricted');

  // 3d. Capability 'no' is a hard violation for a structured-output operation.
  d = selectModels({
    configuration: baseConfig(),
    requirement: req,
    catalog: catalogMap({ 'prov-a': { 'model-a-configured': caps({ structuredOutput: CAP.NO }) } }),
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-b', model: 'model-b-configured' }, "'no' capability rejects; fallback provider selected");
  assert.equal(d.candidates.find(c => c.provider === 'prov-a').rejectionReason, 'capability-structured-output');

  // 3e. Capability 'unknown' is NOT a violation — candidate stays eligible (unverified).
  d = selectModels({
    configuration: baseConfig({ providers: { 'prov-a': { enabled: true, key: 'ka', model: 'm-u' } } }),
    requirement: req,
    catalog: catalogMap({ 'prov-a': { 'm-u': caps({ structuredOutput: CAP.UNKNOWN }) } }),
    now: NOW,
  });
  assert.equal(d.selection.model, 'm-u', 'unknown capability stays eligible, never fabricated as supported');
  assert.ok(d.candidates[0].reasons.includes('capability-structured-output:unverified'));

  // 3f. Streaming 'no' rejects streaming operations.
  const streamReq = { ...req, streaming: true };
  d = selectModels({
    configuration: baseConfig(),
    requirement: streamReq,
    catalog: catalogMap({ 'prov-a': { 'model-a-configured': caps({ streaming: CAP.NO }) } }),
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-b', model: 'model-b-configured' });
});

// ---------------------------------------------------------------------------
test('4. Context capacity: insufficient is a violation; unverified long context is a hard rejection; verified short stays eligible', () => {
  const longReq = deriveRequirementProfile({ operation: 'generate-summary', prompt: 'x'.repeat(80000) });

  // Insufficient verified capacity.
  let d = selectModels({
    configuration: baseConfig(),
    requirement: longReq,
    catalog: catalogMap({
      'prov-a': { 'model-a-configured': caps({ maxInputTokens: 8192 }) },
      'prov-b': { 'model-b-configured': caps({ maxInputTokens: 200000 }) },
    }),
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-b', model: 'model-b-configured' }, 'only the model with verified capacity survives');
  assert.equal(d.candidates.find(c => c.provider === 'prov-a').rejectionReason, 'context-capacity');
  assert.ok(d.candidates.find(c => c.model === 'model-b-configured').reasons.includes('context-capacity:verified'));

  // Unknown capacity + long context = hard rejection (no evidence it fits).
  d = selectModels({
    configuration: baseConfig({ providers: { 'prov-a': { enabled: true, key: 'ka', model: 'm-unknown' } } }),
    requirement: longReq,
    catalog: catalogMap({ 'prov-a': { 'm-unknown': caps({ maxInputTokens: null }) } }),
    now: NOW,
  });
  assert.equal(d.selection, null);
  assert.equal(d.candidates[0].rejectionReason, 'context-capacity-unverified-long');

  // Unknown capacity + short context = eligible but unverified (normal budget).
  d = selectModels({
    configuration: baseConfig({ providers: { 'prov-a': { enabled: true, key: 'ka', model: 'm-unknown' } } }),
    requirement: shortRequirement(),
    catalog: catalogMap({ 'prov-a': { 'm-unknown': caps({ maxInputTokens: null }) } }),
    now: NOW,
  });
  assert.equal(d.selection.model, 'm-unknown');
  assert.ok(d.candidates[0].reasons.includes('context-capacity:unverified'));
});

// ---------------------------------------------------------------------------
test('5. Selection is explainable: configured intent dominates; reasons and rationale are recorded', () => {
  const d = selectModels({
    configuration: baseConfig(),
    requirement: shortRequirement(),
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-a', model: 'model-a-configured' });
  const winner = d.candidates.find(c => c.model === 'model-a-configured');
  assert.ok(winner.reasons.includes('rank:configured-model'));
  assert.ok(winner.reasons.includes('rank:primary-provider'));
  assert.ok(String(d.rationale).startsWith('selected prov-a/model-a-configured'), 'rationale is human-readable');
  assert.ok(winner.score > d.candidates.find(c => c.model === 'model-b-configured').score);
  assert.ok(d.decisionId, 'decision id present for audit correlation');
});

// ---------------------------------------------------------------------------
test('6. Determinism: identical inputs produce identical ordering across repeated runs', () => {
  const inputs = {
    configuration: baseConfig({
      providers: {
        'prov-a': { enabled: true, key: 'ka', model: 'model-a-configured' },
        'prov-b': { enabled: true, key: 'kb', model: 'model-b-configured' },
        'prov-c': { enabled: true, key: 'kc', model: 'model-c-configured' },
      },
    }),
    requirement: shortRequirement(),
    now: NOW,
  };
  const first = selectModels(inputs).order;
  for (let i = 0; i < 25; i += 1) {
    assert.deepEqual(selectModels(inputs).order, first, 'stable across 25 runs');
  }

  // Tie-break: equal scores fall back to stable model id.
  const tie = selectModels({
    configuration: {
      primary: 'prov-a', enableFallback: false, tenantId: 't', temperature: 0.7, maxTokens: 100,
      providers: { 'prov-a': { enabled: true, key: 'ka', model: null } },
    },
    requirement: shortRequirement(),
    catalog: catalogMap({ 'prov-a': { zeta: caps({}), alpha: caps({}), mid: caps({}) } }),
    tenantAccess: new Map([['prov-a', { modelIds: new Set(['zeta', 'alpha', 'mid']), credentialOk: 'verified' }]]),
    now: NOW,
  });
  assert.deepEqual(tie.order.map(o => o.model), ['alpha', 'mid', 'zeta'], 'equal scores → deterministic id ordering');
});

// ---------------------------------------------------------------------------
test('7. A brand-new discovered model with verified long-context capacity outranks a configured model that cannot fit', () => {
  const longReq = deriveRequirementProfile({ operation: 'parse-resume', prompt: 'x'.repeat(60000) });
  const d = selectModels({
    configuration: baseConfig({
      providers: {
        'prov-a': { enabled: true, key: 'ka', model: 'old-configured-small' },
        'prov-b': { enabled: true, key: 'kb', model: null },
      },
    }),
    requirement: longReq,
    catalog: catalogMap({
      'prov-a': { 'old-configured-small': caps({ maxInputTokens: 8192 }) },
      'prov-b': { 'brand-new-model-2027': caps({ maxInputTokens: 1000000, structuredOutput: CAP.YES }) },
    }),
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-b', model: 'brand-new-model-2027' }, 'eligibility first, then ranking — no hardcoded names');
  assert.ok(String(d.rationale).includes('rank:discovered-model'));
  assert.ok(String(d.rationale).includes('rank:verified-long-context'));
  assert.ok(String(d.rationale).includes('rank:verified-structured-output'));
});

// ---------------------------------------------------------------------------
test('8. Runtime health cooldowns exclude models per tenant; last-resort releases the earliest expiry', () => {
  const health = new HealthStore({ now: () => NOW });
  const req = shortRequirement();

  // Three consecutive hard failures → backoff cooldown.
  for (let i = 0; i < 3; i += 1) {
    health.record({ tenantId: 'tenant-1', provider: 'prov-a', model: 'model-a-configured', ok: false, errorClass: 'server', latencyMs: 10, nowMs: NOW });
  }
  health.record({ tenantId: 'tenant-1', provider: 'prov-b', model: 'model-b-configured', ok: false, errorClass: 'rate_limited', retryAfterMs: 120000, nowMs: NOW });

  // 8a. Cooldowns exclude; a healthy alternative (third provider) wins.
  let d = selectModels({
    configuration: baseConfig({
      providers: {
        'prov-a': { enabled: true, key: 'ka', model: 'model-a-configured' },
        'prov-b': { enabled: true, key: 'kb', model: 'model-b-configured' },
        'prov-c': { enabled: true, key: 'kc', model: 'model-c-healthy' },
      },
    }),
    requirement: req,
    health,
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-c', model: 'model-c-healthy' }, 'cooled-down models excluded; healthy alternative selected');
  assert.equal(d.lastResort, false);
  assert.equal(d.candidates.find(c => c.provider === 'prov-a').rejectionReason, 'health-failure-backoff');
  assert.equal(d.candidates.find(c => c.provider === 'prov-b').rejectionReason, 'health-rate-limited');

  // 8b. Last-resort: when EVERY candidate is in cooldown, release the earliest-expiring one.
  d = selectModels({
    configuration: baseConfig(),
    requirement: req,
    health,
    now: NOW,
  });
  // prov-a backoff = NOW + 60s (first tier); prov-b rate-limited until NOW + 120s.
  assert.equal(d.lastResort, true, 'bounded recovery path engaged');
  assert.deepEqual(d.order, [{ provider: 'prov-a', model: 'model-a-configured' }], 'earliest cooldown expiry released');
  assert.ok(String(d.rationale).includes('last-resort cooldown release'));

  // 8c. After the backoff window passes, the model is eligible again (decaying memory).
  d = selectModels({ configuration: baseConfig(), requirement: req, health, now: NOW + 61 * 1000 });
  assert.deepEqual(d.selection, { provider: 'prov-a', model: 'model-a-configured' }, 'recovery is time-bounded, not permanent');

  // 8d. Tenant isolation of cooldown state: another tenant's identical provider/model is NOT cooled down.
  d = selectModels({
    configuration: baseConfig({ tenantId: 'tenant-2' }),
    requirement: req,
    health,
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-a', model: 'model-a-configured' }, 'tenant-2 unaffected by tenant-1 failures');
});

// ---------------------------------------------------------------------------
test('9. Model-not-found blocks for the tenant until the catalog refreshes (30min), then recovers', () => {
  const health = new HealthStore({ now: () => NOW });
  health.record({ tenantId: 't', provider: 'prov-a', model: 'retired-2019', ok: false, errorClass: 'model_not_found', nowMs: NOW });

  const d1 = selectModels({
    configuration: { primary: 'prov-a', enableFallback: false, tenantId: 't', temperature: 0.7, maxTokens: 100, providers: { 'prov-a': { enabled: true, key: 'k', model: 'retired-2019' } } },
    requirement: shortRequirement(),
    health,
    now: NOW + 1000,
  });
  assert.equal(d1.selection, null);
  assert.equal(d1.candidates[0].rejectionReason, 'health-model-unavailable');

  const d2 = selectModels({
    configuration: { primary: 'prov-a', enableFallback: false, tenantId: 't', temperature: 0.7, maxTokens: 100, providers: { 'prov-a': { enabled: true, key: 'k', model: 'retired-2019' } } },
    requirement: shortRequirement(),
    health,
    now: NOW + 31 * 60 * 1000,
  });
  assert.deepEqual(d2.selection, { provider: 'prov-a', model: 'retired-2019' }, 'block expires; catalog refresh revalidates');
});

// ---------------------------------------------------------------------------
test('10. Tenant primary-model policy is the strongest selection signal (governance, not ranking of unknowns)', () => {
  const d = selectModels({
    configuration: baseConfig({
      primary: 'prov-a',
      tenantPolicy: { primaryModel: 'model-b-configured' },
    }),
    requirement: shortRequirement(),
    now: NOW,
  });
  assert.deepEqual(d.selection, { provider: 'prov-b', model: 'model-b-configured' }, 'explicit tenant policy beats default primary ordering');
  const winner = d.candidates.find(c => c.model === 'model-b-configured');
  assert.ok(winner.reasons.includes('rank:tenant-primary-model'));
});

// ---------------------------------------------------------------------------
test('11. Verified capability evidence and tenant health refine ranking without overriding eligibility', () => {
  // Two eligible discovered models on the same provider: verified structured
  // output + healthy runtime evidence should rank above an unverified, sick one.
  const health = new HealthStore({ now: () => NOW });
  for (let i = 0; i < 4; i += 1) {
    health.record({ tenantId: 't', provider: 'prov-a', model: 'sick-model', ok: false, errorClass: 'server', latencyMs: 9000, nowMs: NOW });
    health.record({ tenantId: 't', provider: 'prov-a', model: 'healthy-model', ok: true, latencyMs: 300, nowMs: NOW });
  }
  // Put 'sick-model' past its consecutive-failure cooldown so it is eligible again
  // (we are testing RANKING, not exclusion).
  const now2 = NOW + 5 * 60 * 1000;
  const d = selectModels({
    configuration: { primary: 'prov-a', enableFallback: false, tenantId: 't', temperature: 0.7, maxTokens: 100, providers: { 'prov-a': { enabled: true, key: 'k', model: null } } },
    requirement: shortRequirement(),
    catalog: catalogMap({
      'prov-a': {
        'healthy-model': caps({ structuredOutput: CAP.YES }),
        'sick-model': caps({ structuredOutput: CAP.YES }),
      },
    }),
    tenantAccess: new Map([['prov-a', { modelIds: new Set(['healthy-model', 'sick-model']), credentialOk: 'verified' }]]),
    health,
    now: now2,
  });
  assert.deepEqual(d.selection, { provider: 'prov-a', model: 'healthy-model' }, 'runtime evidence breaks the tie toward the healthy model');
  const winner = d.candidates.find(c => c.model === 'healthy-model');
  const loser = d.candidates.find(c => c.model === 'sick-model');
  assert.ok(winner.score > loser.score);
  assert.ok(winner.reasons.some(r => r.startsWith('rank:health-success-')));
  assert.ok(winner.reasons.includes('rank:verified-structured-output'));
});
