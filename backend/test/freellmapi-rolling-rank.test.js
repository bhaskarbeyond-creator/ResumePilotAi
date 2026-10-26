'use strict';

// F-07 (P1): ranking used a SINGLE last observation per destination — one
// lucky fast sample (or one blip failure) rerouted the next 30 minutes of
// traffic (audit probe A.9: speed mode served the 3s provider because its
// last recorded latency was a stale 4ms). The fix uses windowed rolling
// aggregates: recency-weighted p50 over the last N successes (n >= 3 before
// latency influences the score), windowed success rate for reliability, and
// the last observation kept ONLY as a circuit-breaker input.

process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rankCandidates, weightedP50LatencyMs } = require('../freellmapi/services/selectionPolicy');
const { MetricsPersistence } = require('../freellmapi/services/persistence');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const freellm = require('../freellmapi');

const candidate = (provider, model) => ({ provider, model, metadata: { capabilities: {} } });
const NOW = Date.now();

test('F-07 weighted p50: recency weights pull the median toward current behaviour', () => {
    assert.equal(weightedP50LatencyMs([], {}), null);
    assert.equal(weightedP50LatencyMs([{ latencyMs: 250, createdAt: NOW }], { now: NOW }), 250);

    // Unweighted median would be 1000; the fresh 100ms sample carries weight 1
    // while each 10-minute-old sample carries ~0.5 — the weighted p50 is 100.
    const samples = [
        { latencyMs: 1000, createdAt: NOW - 10 * 60_000 },
        { latencyMs: 1000, createdAt: NOW - 10 * 60_000 },
        { latencyMs: 100, createdAt: NOW },
    ];
    assert.equal(weightedP50LatencyMs(samples, { now: NOW }), 100);

    // Equal ages → ordinary median.
    const flat = [100, 200, 300].map(latencyMs => ({ latencyMs, createdAt: NOW }));
    assert.equal(weightedP50LatencyMs(flat, { now: NOW }), 200);
});

test('F-07 ranking: one lucky 4ms blip no longer beats a consistently fast destination', () => {
    const blip = {
        n: 5, successes: 5, failures: 0, lastAt: NOW, lastOk: true, lastStatus: 200,
        successSamples: [
            { latencyMs: 4, createdAt: NOW },
            { latencyMs: 3000, createdAt: NOW - 60_000 },
            { latencyMs: 3000, createdAt: NOW - 120_000 },
            { latencyMs: 3000, createdAt: NOW - 180_000 },
            { latencyMs: 3000, createdAt: NOW - 240_000 },
        ],
    };
    const stable = {
        n: 5, successes: 5, failures: 0, lastAt: NOW, lastOk: true, lastStatus: 200,
        successSamples: [800, 820, 780, 810, 790].map(latencyMs => ({ latencyMs, createdAt: NOW - 30_000 })),
    };
    const aggregates = { blip, stable };
    const ranked = rankCandidates(
        [candidate('slow-blip', 'blip-model'), candidate('steady', 'stable-model')],
        { mode: 'speed', primary: 'slow-blip', observationFor: c => aggregates[c.model === 'blip-model' ? 'blip' : 'stable'] },
    );
    assert.equal(ranked[0].provider, 'steady', 'weighted p50 (~3000ms) must lose to a stable ~800ms peer');
    assert.ok(ranked[0].routingDecision.observedLatencyMs > 500, 'the reported latency evidence is the windowed p50, not the blip');
    assert.equal(ranked[0].routingDecision.observationCount, 5);
});

test('F-07 ranking: fewer than 3 observations give no boost — the last row is only a circuit breaker', () => {
    const freshFew = {
        n: 2, successes: 2, failures: 0, lastAt: NOW, lastOk: true, lastStatus: 200,
        successSamples: [{ latencyMs: 10, createdAt: NOW }, { latencyMs: 12, createdAt: NOW - 1000 }],
    };
    const ranked = rankCandidates(
        [candidate('a', 'few-obs'), candidate('b', 'no-obs')],
        { mode: 'speed', primary: 'b', observationFor: c => (c.model === 'few-obs' ? freshFew : null) },
    );
    assert.equal(ranked[0].provider, 'b', 'n<3 successes must not outrank the unobserved primary');
    assert.equal(ranked[1].routingDecision.observedLatencyMs, null, 'latency evidence requires n >= 3');
    assert.equal(ranked[1].routingDecision.observationCount, 2);

    // One fresh FAILURE still demotes immediately (circuit breaker preserved).
    const singleFailure = { n: 1, successes: 0, failures: 1, lastAt: NOW, lastOk: false, lastStatus: 500, successSamples: [] };
    const demoted = rankCandidates(
        [candidate('a', 'just-failed'), candidate('b', 'no-obs')],
        { mode: 'balanced', primary: 'a', observationFor: c => (c.model === 'just-failed' ? singleFailure : null) },
    );
    assert.equal(demoted[0].provider, 'b', 'a fresh failure demotes even with primary preference and n<3');
});

test('F-07 ranking: one blip failure among many successes does not reroute traffic', () => {
    const mostlyGood = {
        n: 10, successes: 9, failures: 1, lastAt: NOW, lastOk: false, lastStatus: 500,
        successSamples: Array.from({ length: 9 }, (_, i) => ({ latencyMs: 500 + i * 10, createdAt: NOW - i * 30_000 })),
    };
    const halfBad = {
        n: 10, successes: 5, failures: 5, lastAt: NOW, lastOk: true, lastStatus: 200,
        successSamples: Array.from({ length: 5 }, (_, i) => ({ latencyMs: 520 + i * 10, createdAt: NOW - i * 30_000 })),
    };
    const aggregates = { mostlyGood, halfBad };
    const ranked = rankCandidates(
        [candidate('flaky', 'half-bad'), candidate('solid', 'mostly-good')],
        { mode: 'balanced', primary: 'flaky', observationFor: c => aggregates[c.model === 'mostly-good' ? 'mostlyGood' : 'halfBad'] },
    );
    assert.equal(ranked[0].provider, 'solid', '90% windowed success must beat 50% despite the fresh last failure');
});

test('F-07 persistence: getRollingAggregates windows, aggregates and caps samples', () => {
    const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
    const at = NOW;
    store.recordRequest({ provider: 'groq', model: 'm1', ok: true, status: 200, latencyMs: 100, at: at - 45 * 60_000 }); // outside window
    for (let i = 0; i < 12; i += 1) {
        store.recordRequest({ provider: 'groq', model: 'm1', ok: true, status: 200, latencyMs: 200 + i, at: at - i * 1000 });
    }
    store.recordRequest({ provider: 'groq', model: 'm1', ok: false, status: 500, latencyMs: 5, at });
    store.recordRequest({ provider: 'openai', model: 'm2', ok: true, status: 200, latencyMs: 900, at: at - 5000 });

    const aggregates = store.getRollingAggregates({ windowMs: 30 * 60_000, now: at });
    const groq = aggregates.find(a => a.provider === 'groq' && a.model === 'm1');
    const openai = aggregates.find(a => a.provider === 'openai' && a.model === 'm2');
    assert.ok(groq && openai);
    assert.equal(groq.n, 13, 'the row outside the 30-minute window is excluded');
    assert.equal(groq.successes, 12);
    assert.equal(groq.failures, 1);
    assert.equal(groq.lastOk, false, 'newest row drives the circuit-breaker fields');
    assert.equal(groq.lastStatus, 500);
    assert.equal(groq.successSamples.length, 10, 'samples are capped');
    assert.ok(groq.successSamples[0].createdAt >= groq.successSamples[9].createdAt, 'samples are newest-first');
    assert.equal(openai.n, 1);
    store.close?.();
});

test('F-07 router: speed mode end-to-end prefers the windowed-p50 winner over a stale lucky sample', async () => {
    freellm.resetMetricsForTests();
    const persistence = require('../freellmapi/services/persistence').getMetricsPersistence();
    // openai: one stale 4ms sample followed by consistent ~3000ms reality.
    persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 240_000 });
    persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 180_000 });
    persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 120_000 });
    persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 3000, at: NOW - 60_000 });
    persistence.recordRequest({ provider: 'openai', model: 'gpt-fixture', ok: true, status: 200, latencyMs: 4, at: NOW - 1000 });
    // groq: consistently ~800ms.
    for (let i = 0; i < 5; i += 1) {
        persistence.recordRequest({ provider: 'groq', model: 'groq-fixture', ok: true, status: 200, latencyMs: 800 + i * 5, at: NOW - i * 20_000 });
    }

    const router = new FreeLlmRouter();
    router.cooldownManager = new CooldownManager();
    router.modelDiscovery = {
        getOrDiscover: async ({ providerId }) => [{ id: providerId === 'openai' ? 'gpt-fixture' : 'groq-fixture', capabilities: {} }],
    };
    const served = [];
    const fetchImpl = async (_url, options) => {
        served.push(String(JSON.parse(options.body || '{}').model));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'windowed speed served' } }] }));
    };
    const result = await router.routeCompletion({
        prompt: 'rolling aggregate end-to-end fixture',
        bypassCache: true,
        fetchImpl,
        platformConfig: {
            selectionMode: 'speed',
            primary: 'openai', // the lucky-blip provider must NOT win on its stale 4ms last row
            providers: {
                openai: { enabled: true, key: 'fixture-openai-key-123', model: 'gpt-fixture' },
                groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-fixture' },
            },
        },
    });
    assert.equal(result.provider, 'groq');
    assert.deepEqual(served, ['groq-fixture']);
    freellm.resetMetricsForTests();
});
