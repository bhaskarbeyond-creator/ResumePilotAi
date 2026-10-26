'use strict';

/**
 * PH4-ENGINE-021 part 1.1 — tenant-scoped evidence contract (test-plan §1.1).
 *
 * Nine contract tests on SELF-CONTAINED fakes (Map-based FakeMetricsPersistence
 * + FakeCooldownStore with a fake clock): they pin the tenant-scoping contract
 * as an executable specification and — per the plan's explicit boundary — pass
 * against the frozen bb2b82b code shapes as well as the execution-phase code,
 * because they exercise the JS-object contract (optional scopeKey parameter),
 * never a schema. Real-module coverage lives beside this file:
 *   - scoped-store-rebuild.test.js   (real SQLite persistence, Phase A drills)
 *   - scoped-cooldown-manager.test.js (real CooldownManager, A.5 drills)
 *   - scoped-evidence-live.test.js   (real router with the flag on, C.1 drills)
 *
 * Zero console.*, zero waitForTimeout, zero new deps, zero network, zero DDL.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const PLATFORM = 'platform';
const scopeOf = scopeKey => String(scopeKey || '').trim() || PLATFORM;

// ---------------------------------------------------------------------------
// Fakes implementing the optional-scopeKey versions of the store interfaces.
// ---------------------------------------------------------------------------

function makeClock(start = 1_761_500_000_000) {
  const state = { now: start };
  return { now: () => state.now, advance(ms) { state.now += ms; } };
}

/** Window math mirrors the F-07 contract: recency-weighted p50 + n>=3 gate,
 *  maxSamples cap PER SCOPE. */
class FakeMetricsPersistence {
  constructor({ maxSamples = 10 } = {}) {
    this.maxSamples = maxSamples;
    this.scopes = new Map(); // scope -> Map('provider:model') -> samples[]
  }

  _rows(scope) {
    if (!this.scopes.has(scope)) this.scopes.set(scope, new Map());
    return this.scopes.get(scope);
  }

  recordRequest({ provider, model, ok, latencyMs, status, scopeKey, at }) {
    const scope = scopeOf(scopeKey);
    const key = `${provider}:${model}`;
    const rows = this._rows(scope);
    if (!rows.has(key)) rows.set(key, []);
    const samples = rows.get(key);
    // `at` is accepted like the real store's parameter — cross-store byte
    // comparisons must pin it (real-time Date.now() can straddle a millisecond
    // boundary between two writes and flake a deepEqual).
    samples.push({ ok: Boolean(ok), latencyMs: ok ? Number(latencyMs) || 0 : null, status: Number(status) || null, at: Number(at) || Date.now() });
    while (samples.length > this.maxSamples) samples.shift(); // cap applies WITHIN the scope
  }

  getRollingAggregates({ windowMs = 30 * 60_000, scopeKey } = {}) {
    const scope = scopeOf(scopeKey);
    const cutoff = Date.now() - windowMs;
    const out = [];
    for (const [key, samples] of this._rows(scope)) {
      const window = samples.filter(sample => sample.at >= cutoff);
      if (window.length === 0) continue;
      const [provider, model] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      const successes = window.filter(sample => sample.ok).length;
      const successSamples = window.filter(sample => sample.ok).map(sample => sample.latencyMs);
      out.push({
        provider,
        model,
        scopeKey: scope,
        n: window.length,
        successes,
        failures: window.length - successes,
        lastAt: window[window.length - 1].at,
        lastOk: window[window.length - 1].ok,
        lastStatus: window[window.length - 1].status,
        successSamples,
        p50: successes >= 3 ? recencyWeightedP50(successSamples) : null, // n>=3 maturity gate
      });
    }
    return out;
  }
}

/** Recency-weighted median: newer samples carry more weight; the weighted p50
 *  of [3ms(oldest), 100, 100(newest)] is 100 (S1 certification fixture). */
function recencyWeightedP50(samples) {
  if (samples.length === 0) return null;
  const ranked = samples.map((value, index) => ({ value, weight: index + 1 })); // arrival order = recency order
  ranked.sort((a, b) => a.value - b.value);
  const total = ranked.reduce((sum, entry) => sum + entry.weight, 0);
  let cumulative = 0;
  for (const entry of ranked) {
    cumulative += entry.weight;
    if (cumulative * 2 >= total) return entry.value;
  }
  return ranked[ranked.length - 1].value;
}

/** Cooldown store with the schema-proposal §2.2/§3.5 semantics: scoped rows
 *  first, platform rows apply to everyone (physics honesty), clears are
 *  scope-guarded (F-14). */
class FakeCooldownStore {
  constructor(clock) {
    this.clock = clock;
    this.rows = new Map(); // 'scope\u0000provider[:model]' -> row
  }

  _key(scope, provider, model) {
    const legacy = model ? `${provider}:${model}` : provider;
    return scope === PLATFORM ? legacy : `${scope}\u0000${legacy}`;
  }

  setCooldown(provider, model, reason, { scopeKey, credentialKind = 'platform', ttlMs = 60_000 } = {}) {
    const scope = scopeOf(scopeKey);
    this.rows.set(this._key(scope, provider, model), {
      scopeKey: scope, provider, model: model || '', reason, credentialKind,
      expiresAt: this.clock.now() + ttlMs,
    });
  }

  isOnCooldown(provider, model, { scopeKey } = {}) {
    const scope = scopeOf(scopeKey);
    const probes = scope === PLATFORM
      ? [[PLATFORM, provider, model], [PLATFORM, provider, '']]
      : [[scope, provider, model], [scope, provider, ''], [PLATFORM, provider, model], [PLATFORM, provider, '']];
    for (const [probeScope, probeProvider, probeModel] of probes) {
      const row = this.rows.get(this._key(probeScope, probeProvider, probeModel));
      if (!row) continue;
      if (row.expiresAt <= this.clock.now()) {
        this.rows.delete(this._key(probeScope, probeProvider, probeModel)); // lazy expiry
        continue;
      }
      return { onCooldown: true, remainingMs: row.expiresAt - this.clock.now(), reason: row.reason, scopeKey: row.scopeKey, credentialKind: row.credentialKind };
    }
    return { onCooldown: false, remainingMs: 0 };
  }

  clearCooldown(provider, model, { scopeKey } = {}) {
    const scope = scopeOf(scopeKey); // F-14: ONLY the requesting scope's keys
    this.rows.delete(this._key(scope, provider, model));
    this.rows.delete(this._key(scope, provider, ''));
  }

  rowsIn(scope) {
    return [...this.rows.values()].filter(row => row.scopeKey === scope);
  }
}

/** The router-side scope decision table (test-plan §1.1 test 4), pinned as a
 *  pure function contract: dedicated-BYOK -> tenant scope; platform-key ->
 *  platform scope; never cross. */
function classifyObservationScope({ isDedicatedByok, tenantContext }) {
  if (!isDedicatedByok) return PLATFORM;
  const tenantId = String(tenantContext?.tenantId || '').trim();
  if (tenantId) return `tenant:${tenantId}`;
  const principal = String(tenantContext?.principalId || '').trim();
  if (principal) return `uid:${crypto.createHash('sha256').update(principal).digest('hex').slice(0, 40)}`;
  return PLATFORM;
}

// ---------------------------------------------------------------------------
// 1 — platform path invariance.
// ---------------------------------------------------------------------------

test('1: unscoped recording and reading yields the exact legacy aggregate shape', () => {
  const store = new FakeMetricsPersistence();
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 120, status: 200 });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 30, status: 429 });
  const [row] = store.getRollingAggregates({ windowMs: 30 * 60_000 });
  for (const field of ['n', 'successes', 'failures', 'lastAt', 'lastOk', 'lastStatus', 'successSamples']) {
    assert.ok(field in row, `aggregate must carry ${field}`);
  }
  assert.equal(row.n, 2);
  assert.equal(row.successes, 1);
  assert.equal(row.failures, 1);
  assert.equal(row.lastOk, false);
  assert.equal(row.lastStatus, 429);
  assert.deepEqual(row.successSamples, [120]);
  assert.equal(row.scopeKey, PLATFORM, 'unscoped traffic lives in the platform scope');
});

// ---------------------------------------------------------------------------
// 2/3 — scope isolation, reads and writes.
// ---------------------------------------------------------------------------

test('2: tenant A observations never appear in tenant B or platform aggregates; counts per scope exact', () => {
  const store = new FakeMetricsPersistence();
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 100, status: 200, scopeKey: 'tenant:a' });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 110, status: 200, scopeKey: 'tenant:a' });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 5, status: 500, scopeKey: 'tenant:b' });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 90, status: 200 });

  const a = store.getRollingAggregates({ scopeKey: 'tenant:a' });
  const b = store.getRollingAggregates({ scopeKey: 'tenant:b' });
  const p = store.getRollingAggregates();
  assert.equal(a.length, 1); assert.equal(a[0].n, 2); assert.equal(a[0].failures, 0);
  assert.equal(b.length, 1); assert.equal(b[0].n, 1); assert.equal(b[0].successes, 0);
  assert.equal(p.length, 1); assert.equal(p[0].n, 1, 'the platform window sees only platform traffic');
  assert.deepEqual(p[0].successSamples, [90]);
});

test('3: scoped writes leave the platform window byte-identical to an unscoped control', () => {
  const scoped = new FakeMetricsPersistence();
  const control = new FakeMetricsPersistence();
  const pinned = Date.now(); // deterministic timestamps: cross-store byte comparison
  const platformInputs = [
    { provider: 'groq', model: 'm1', ok: true, latencyMs: 100, status: 200, at: pinned },
    { provider: 'groq', model: 'm1', ok: false, latencyMs: 10, status: 429, at: pinned + 1 },
    { provider: 'openrouter', model: 'm2', ok: true, latencyMs: 200, status: 200, at: pinned + 2 },
  ];
  for (const input of platformInputs) { scoped.recordRequest(input); control.recordRequest(input); }
  // Now pollute the scoped store with tenant traffic:
  for (let i = 0; i < 5; i += 1) {
    scoped.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 1, status: 500, scopeKey: 'uid:hash1', at: pinned + 3 + i });
  }
  const strip = rows => rows.map(row => ({ ...row, scopeKey: undefined })).sort((x, y) => `${x.provider}${x.model}`.localeCompare(`${y.provider}${y.model}`));
  assert.deepEqual(strip(scoped.getRollingAggregates()), strip(control.getRollingAggregates()),
    'the platform window is byte-identical regardless of scoped writes');
});

// ---------------------------------------------------------------------------
// 4 — sink-hole replacement decision table.
// ---------------------------------------------------------------------------

test('4: the scope decision table routes dedicated-BYOK to tenant scope, platform-key to platform, never cross', () => {
  assert.equal(classifyObservationScope({ isDedicatedByok: false, tenantContext: { tenantId: 'tenant:a' } }), PLATFORM,
    'platform-key tenant traffic stays a platform observation (F-09)');
  assert.equal(classifyObservationScope({ isDedicatedByok: true, tenantContext: { tenantId: 'tenant:a' } }), 'tenant:tenant:a');
  const uidScope = classifyObservationScope({ isDedicatedByok: true, tenantContext: { principalId: 'user-1' } });
  assert.equal(uidScope, `uid:${crypto.createHash('sha256').update('user-1').digest('hex').slice(0, 40)}`, 'individual BYOK uses the 40-hex uid scope');
  assert.notEqual(uidScope, classifyObservationScope({ isDedicatedByok: true, tenantContext: { principalId: 'user-2' } }), 'principals never share a scope');
  // And the retained observation: a scoped:true record lands in ITS scope.
  const store = new FakeMetricsPersistence();
  const scope = classifyObservationScope({ isDedicatedByok: true, tenantContext: { tenantId: 'tenant:a' } });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 50, status: 200, scopeKey: scope });
  assert.equal(store.getRollingAggregates({ scopeKey: scope })[0].n, 1, 'the sink-hole is replaced: the observation is RETAINED in the tenant scope');
  assert.equal(store.getRollingAggregates().length, 0, 'and the platform store received nothing');
});

// ---------------------------------------------------------------------------
// 5/6 — window math and caps per scope.
// ---------------------------------------------------------------------------

test('5: recency-weighted p50 and the n>=3 maturity gate are computed per scope', () => {
  const store = new FakeMetricsPersistence();
  // Tenant scope: the S1 certification fixture [3ms, 100, 100] -> weighted p50 100.
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 3, status: 200, scopeKey: 'tenant:a' });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 100, status: 200, scopeKey: 'tenant:a' });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 100, status: 200, scopeKey: 'tenant:a' });
  // Platform scope: immature (n=2) despite three tenant samples existing.
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 10, status: 200 });
  store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 20, status: 200 });

  const [tenantRow] = store.getRollingAggregates({ scopeKey: 'tenant:a' });
  assert.equal(tenantRow.n, 3);
  assert.equal(tenantRow.p50, 100, 'recency weighting keeps the 3ms outlier from dragging the median');
  const [platformRow] = store.getRollingAggregates();
  assert.equal(platformRow.n, 2);
  assert.equal(platformRow.p50, null, 'the maturity gate is evaluated per scope');
});

test('6: the maxSamples cap applies within a scope — A filling its window never evicts B seeds', () => {
  const store = new FakeMetricsPersistence({ maxSamples: 10 });
  for (let i = 0; i < 3; i += 1) {
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 50 + i, status: 200, scopeKey: 'tenant:b' });
  }
  for (let i = 0; i < 14; i += 1) {
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, latencyMs: 300 + i, status: 200, scopeKey: 'tenant:a' });
  }
  const [a] = store.getRollingAggregates({ scopeKey: 'tenant:a' });
  const [b] = store.getRollingAggregates({ scopeKey: 'tenant:b' });
  assert.equal(a.successSamples.length, 10, 'A is capped at its own maxSamples');
  assert.equal(a.successSamples[0], 304, 'the OLDEST A samples were evicted');
  assert.equal(b.n, 3, "B's seeds survived A's burst");
  assert.deepEqual(b.successSamples, [50, 51, 52]);
});

// ---------------------------------------------------------------------------
// 7/8/9 — cooldown scope semantics (fake clock).
// ---------------------------------------------------------------------------

test('7: tenant penalty benches the provider for that tenant only; platform credential cooldowns bench everyone', () => {
  const clock = makeClock();
  const store = new FakeCooldownStore(clock);
  store.setCooldown('groq', 'm1', 'tenant-penalty', { scopeKey: 'tenant:a', credentialKind: 'tenant-penalty' });
  assert.equal(store.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:a' }).onCooldown, true);
  assert.equal(store.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:b' }).onCooldown, false, 'tenant B is unaffected');
  assert.equal(store.isOnCooldown('groq', 'm1').onCooldown, false, 'the platform is unaffected by a tenant penalty');

  store.setCooldown('openrouter', 'm2', 'HTTP 429 across all pooled keys', { credentialKind: 'platform' });
  assert.equal(store.isOnCooldown('openrouter', 'm2').onCooldown, true);
  const tenantView = store.isOnCooldown('openrouter', 'm2', { scopeKey: 'tenant:a' });
  assert.equal(tenantView.onCooldown, true, 'physics honesty: a shared-credential bench applies to everyone');
  assert.equal(tenantView.scopeKey, PLATFORM);
});

test('8: a dedicated-BYOK failure produces a cooldown visible only to that scope; platform stores receive nothing', () => {
  const clock = makeClock();
  const cooldowns = new FakeCooldownStore(clock);
  const metrics = new FakeMetricsPersistence();
  // The routed failure, classified per the decision table:
  const scope = classifyObservationScope({ isDedicatedByok: true, tenantContext: { tenantId: 'tenant:a' } });
  cooldowns.setCooldown('groq', 'm1', 'HTTP 429 on tenant credentials', { scopeKey: scope, credentialKind: 'byok' });
  metrics.recordRequest({ provider: 'groq', model: 'm1', ok: false, latencyMs: 12, status: 429, scopeKey: scope });

  assert.equal(cooldowns.isOnCooldown('groq', 'm1', { scopeKey: scope }).onCooldown, true);
  assert.equal(cooldowns.isOnCooldown('groq', 'm1').onCooldown, false, 'F-09 sanctuary: the platform never sees the tenant bench');
  assert.equal(cooldowns.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:b' }).onCooldown, false);
  assert.equal(cooldowns.rowsIn(PLATFORM).length, 0);
  assert.equal(metrics.getRollingAggregates().length, 0, 'the platform aggregate store received nothing');
  assert.equal(metrics.getRollingAggregates({ scopeKey: scope })[0].failures, 1, 'the tenant scope retained its own evidence');
});

test('9: F-14 scope guard — a scoped last-resort release clears only the requesting scope; platform rows survive', () => {
  const clock = makeClock();
  const store = new FakeCooldownStore(clock);
  store.setCooldown('groq', 'm1', 'HTTP 429 across all pooled keys', { credentialKind: 'platform' });
  store.setCooldown('groq', 'm1', 'HTTP 429 on tenant credentials', { scopeKey: 'tenant:a', credentialKind: 'byok' });

  // The tenant's last-resort release:
  store.clearCooldown('groq', 'm1', { scopeKey: 'tenant:a' });
  const tenantView = store.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:a' });
  assert.equal(tenantView.reason, 'HTTP 429 across all pooled keys',
    "the tenant's own row is gone; what still blocks is the PLATFORM credential fact");
  assert.equal(store.isOnCooldown('groq', 'm1').onCooldown, true, 'the platform bench survives the tenant release');
  assert.equal(store.rowsIn(PLATFORM).length, 1);

  // And the reverse: a platform release never lifts the tenant row.
  store.setCooldown('groq', 'm1', 'HTTP 429 on tenant credentials', { scopeKey: 'tenant:a', credentialKind: 'byok' });
  store.clearCooldown('groq', 'm1'); // platform-scope release
  const survivor = store.isOnCooldown('groq', 'm1', { scopeKey: 'tenant:a' });
  assert.equal(survivor.onCooldown, true);
  assert.equal(survivor.scopeKey, 'tenant:a', 'only the tenant row remains — scopes never cross');
});
