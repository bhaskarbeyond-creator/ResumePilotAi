'use strict';

// F-18 (P2): token/cost accounting was zero. recordAiUsage posted
// estimatedCostMicros:0 unconditionally, and no live path persisted the
// provider-reported usage into a durable ledger — the engine normalized
// usage ({promptTokens, completionTokens}) but the request log had no token
// columns and the router dropped it before recording the attempt.
// The fix: (1) request_log persists per-attempt tokens (nullable — an
// unknown is never recorded as 0), with a guarded ALTER for pre-existing
// metrics DBs; (2) a static list-price table (USD micros per 1K tokens)
// computes cost — unknown models price at null, NEVER 0; (3) routes/ai.js
// feeds the computed cost into the tenant ledger (whose NOT NULL costMicros
// column coerces null→0 by pre-existing schema contract).

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MODEL_PRICING_MICROS_PER_1K, getModelPricing, computeCostMicros } = require('../freellmapi/providers/pricing');
const { MetricsPersistence, resetMetricsPersistenceForTests, loadSqliteModule } = require('../freellmapi/services/persistence');

const tmpDb = tag => path.join(os.tmpdir(), `f18-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

test('F-18 pricing: known models compute exact micros, unknown price is null and never 0', () => {
    // gpt-4o-mini: 150 micros/1K in, 600 micros/1K out → 1000 in + 500 out = 150 + 300.
    assert.equal(computeCostMicros('gpt-4o-mini', 1000, 500), 450);
    // llama-3.3-70b-versatile: 590/790 → 2000 in + 1000 out = 1180 + 790.
    assert.equal(computeCostMicros('llama-3.3-70b-versatile', 2000, 1000), 1970);
    // Lookup is case-insensitive and registry-curated models are covered.
    assert.deepEqual(getModelPricing('GPT-4o-Mini'), { input: 150, output: 600 });
    assert.ok(Object.keys(MODEL_PRICING_MICROS_PER_1K).length >= 10);
    // Unknown model → null, never a fabricated 0.
    assert.equal(computeCostMicros('mystery-9000', 1000, 1000), null);
    assert.equal(getModelPricing(''), null);
    assert.equal(getModelPricing(null), null);
    // Known model with unusable token counts → null (cannot compute honestly).
    assert.equal(computeCostMicros('gpt-4o', 'not-a-number', 5), null);
    assert.equal(computeCostMicros('gpt-4o', -1, 5), null);
    // Known model with genuine zero usage → a real computed 0.
    assert.equal(computeCostMicros('gpt-4o', 0, 0), 0);
});

test('F-18 sqlite ledger: attempts persist real tokens; missing usage stays null, never 0', () => {
    const file = tmpDb('sqlite');
    try {
        const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
        assert.equal(store.backend, 'sqlite', 'fixture must exercise the durable backend');
        store.recordRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile', ok: true, latencyMs: 42, status: 200, usage: { promptTokens: 10, completionTokens: 6 } });
        store.recordRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile', ok: false, latencyMs: 7, status: 429 });
        const rows = store.getRecentRequests({ limit: 10 });
        assert.equal(rows.length, 2);
        const success = rows.find(row => row.ok);
        const failure = rows.find(row => !row.ok);
        assert.equal(success.promptTokens, 10);
        assert.equal(success.completionTokens, 6);
        assert.equal(failure.promptTokens, null, 'a failed attempt has no usage — null, not 0');
        assert.equal(failure.completionTokens, null);
        store.close();
    } finally {
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(file + suffix, { force: true }); } catch { /* best-effort */ }
        }
    }
});

test('F-18 migration: a pre-existing metrics DB gains the token columns in place', () => {
    const file = tmpDb('migrate');
    try {
        // Build an OLD-schema request_log (no token columns) with a legacy row.
        const sqlite = loadSqliteModule();
        const legacy = new sqlite.DatabaseSync(file);
        legacy.exec(`
            CREATE TABLE request_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              provider TEXT,
              model TEXT,
              ok INTEGER NOT NULL,
              status INTEGER,
              latency_ms INTEGER,
              created_at INTEGER NOT NULL
            );
            INSERT INTO request_log (provider, model, ok, status, latency_ms, created_at)
            VALUES ('openai', 'gpt-4o-mini', 1, 200, 33, ${Date.now()});
        `);
        legacy.close();

        const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: file } });
        assert.equal(store.backend, 'sqlite');
        // The legacy row survives and reads back with null tokens.
        const before = store.getRecentRequests({ limit: 10 });
        assert.equal(before.length, 1);
        assert.equal(before[0].promptTokens, null);
        assert.equal(before[0].completionTokens, null);
        // New attempts persist usage into the migrated schema.
        store.recordRequest({ provider: 'groq', model: 'llama-3.1-8b-instant', ok: true, latencyMs: 12, status: 200, usage: { promptTokens: 21, completionTokens: 9 } });
        const after = store.getRecentRequests({ limit: 10 });
        assert.equal(after.length, 2);
        assert.equal(after[0].promptTokens, 21);
        assert.equal(after[0].completionTokens, 9);
        store.close();
    } finally {
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(file + suffix, { force: true }); } catch { /* best-effort */ }
        }
    }
});

test('F-18 memory ledger: the in-memory backend carries the same token fields', () => {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
    assert.equal(store.backend, 'memory');
    store.recordRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile', ok: true, latencyMs: 5, status: 200, usage: { promptTokens: 3, completionTokens: 4 } });
    store.recordRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile', ok: false, latencyMs: 5, status: 500 });
    const rows = store.getRecentRequests({ limit: 10 });
    assert.equal(rows.find(row => row.ok).promptTokens, 3);
    assert.equal(rows.find(row => row.ok).completionTokens, 4);
    assert.equal(rows.find(row => !row.ok).promptTokens, null);
    store.close();
});

test('F-18 router: a served completion records the provider-reported tokens in the durable ledger', async () => {
    const file = tmpDb('router');
    const previousDb = process.env.FREELMAPI_METRICS_DB;
    process.env.FREELMAPI_METRICS_DB = file;
    resetMetricsPersistenceForTests();
    try {
        const { FreeLlmRouter } = require('../freellmapi/services/router');
        const { CooldownManager } = require('../freellmapi/services/cooldown');
        const { getMetricsPersistence } = require('../freellmapi/services/persistence');
        const router = new FreeLlmRouter();
        router.cooldownManager = new CooldownManager();
        router.modelDiscovery = { getOrDiscover: async () => [{ id: 'gpt-4o-mini', capabilities: {} }] };
        const fetchImpl = async () => ({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => JSON.stringify({
                id: 'chatcmpl-f18',
                choices: [{ index: 0, message: { role: 'assistant', content: 'f18 usage answer' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
            }),
        });
        const result = await router.routeCompletion({
            prompt: `F-18 usage ledger probe ${Date.now()}-${Math.random()}`,
            bypassCache: true,
            platformConfig: {
                providers: { openai: { enabled: true, key: 'sk-mock-f18-usage-key', model: 'gpt-4o-mini' } },
                primary: 'openai',
                enableFallback: false,
            },
            fetchImpl,
        });
        assert.equal(result.usage.promptTokens, 7, 'the normalized usage reaches the caller');
        assert.equal(result.usage.completionTokens, 3);
        const rows = getMetricsPersistence().getRecentRequests({ limit: 5 });
        const row = rows.find(entry => entry.model === 'gpt-4o-mini' && entry.ok);
        assert.ok(row, 'the attempt must exist in the request log');
        assert.equal(row.promptTokens, 7, 'the durable ledger records the provider-reported tokens');
        assert.equal(row.completionTokens, 3);
        // And the cost is derivable from the static table — real, not zero.
        assert.equal(computeCostMicros(row.model, row.promptTokens, row.completionTokens), Math.round((7 / 1000) * 150 + (3 / 1000) * 600));
    } finally {
        if (previousDb === undefined) delete process.env.FREELMAPI_METRICS_DB;
        else process.env.FREELMAPI_METRICS_DB = previousDb;
        resetMetricsPersistenceForTests();
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.rmSync(file + suffix, { force: true }); } catch { /* best-effort */ }
        }
    }
});
