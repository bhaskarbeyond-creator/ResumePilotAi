'use strict';

// F-12 (P2): the live engine discarded the 429 `Retry-After` header —
// classifyError dropped response headers and setCooldown always used its
// 60s × 2^n base (capped at 300s). A provider asking for 3600s was retried
// after 60s, guaranteeing repeated 429s. The aiRouting engine already
// honoured it ("never wait less than Retry-After"); this brings the live
// engine to parity.
//
// Fix contract:
//  - parseRetryAfterMs handles delta-seconds AND HTTP-date, rejects garbage
//    and past dates;
//  - classifyError(…, headers) attaches retryAfterMs on rate-limit
//    classification; the adapter stamps it on the thrown error;
//  - CooldownManager.setCooldown(provider, model, reason, retryAfterMs)
//    never waits LESS than the request, clamped to MAX_COOLDOWN_MS;
//  - the router failover loops carry the strongest Retry-After seen across
//    the key pool into setCooldown.

process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRetryAfterMs, classifyError } = require('../freellmapi/providers/openaiCompat');
const { CooldownManager } = require('../freellmapi/services/cooldown');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const freellm = require('../freellmapi');

test('F-12: parseRetryAfterMs — delta-seconds, HTTP-date, garbage and past dates', () => {
    assert.equal(parseRetryAfterMs('90'), 90_000);
    assert.equal(parseRetryAfterMs('0'), null, 'a zero wait is not a backoff request');
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs(''), null);
    assert.equal(parseRetryAfterMs('garbage'), null);

    const future = new Date(Date.now() + 120_000).toUTCString();
    const parsed = parseRetryAfterMs(future);
    assert.ok(parsed > 110_000 && parsed <= 120_000, `HTTP-date ~2min in the future parses to ms, got ${parsed}`);

    const past = new Date(Date.now() - 60_000).toUTCString();
    assert.equal(parseRetryAfterMs(past), null, 'a past HTTP-date is not a backoff request');
});

test('F-12: classifyError carries the header value only for rate limits', () => {
    const headers = { get: name => (String(name).toLowerCase() === 'retry-after' ? '120' : null) };
    assert.equal(classifyError(429, 'slow down', '', headers).retryAfterMs, 120_000);
    assert.equal(classifyError(429, 'slow down', '').retryAfterMs, null, 'no headers → null, never NaN');
    assert.equal(classifyError(500, 'boom', '', headers).retryAfterMs, undefined, 'only the 429 branch parses it');
    assert.equal(classifyError(429, 'slow down', '', headers).code, 'RATE_LIMIT_EXCEEDED');
});

test('F-12: setCooldown never waits less than Retry-After and clamps to MAX_COOLDOWN_MS', () => {
    const respected = new CooldownManager().setCooldown('groq', 'm', 'fixture', 120_000);
    assert.equal(respected.durationMs, 120_000, 'a 120s request replaces the 60s base');

    const clamped = new CooldownManager().setCooldown('groq', 'm', 'fixture', 3_600_000);
    assert.equal(clamped.durationMs, 300_000, 'a 3600s request clamps to the 300s ceiling');

    const floor = new CooldownManager().setCooldown('groq', 'm', 'fixture', 5_000);
    assert.equal(floor.durationMs, 60_000, 'a tiny request never SHORTENS the base cooldown');

    const legacy = new CooldownManager().setCooldown('groq', 'm', 'fixture');
    assert.equal(legacy.durationMs, 60_000, '3-arg calls keep the historical behaviour');

    // Strike escalation still applies on top: 2nd immediate failure → 120s base,
    // and a 90s Retry-After must not reduce it.
    const escalating = new CooldownManager();
    escalating.setCooldown('groq', 'm', 'fixture');
    const second = escalating.setCooldown('groq', 'm', 'fixture', 90_000);
    assert.equal(second.strikeCount, 2);
    assert.equal(second.durationMs, 120_000, 'max(escalated base, retry-after) wins');
});

const headers429 = (retryAfter) => new Response(
    JSON.stringify({ error: { message: 'rate limited fixture' } }),
    { status: 429, headers: { 'Retry-After': retryAfter, 'Content-Type': 'application/json' } },
);

function makeRouter() {
    const router = new FreeLlmRouter();
    router.cooldownManager = new CooldownManager();
    router.modelDiscovery = {
        getOrDiscover: async () => [{ id: 'groq-fixture', capabilities: {} }],
    };
    return router;
}

const PLATFORM_CONFIG = {
    selectionMode: 'speed',
    primary: 'groq',
    enableFallback: false,
    providers: { groq: { enabled: true, key: 'fixture-groq-key-123', model: 'groq-fixture' } },
};

test('F-12: router e2e — a 429 with Retry-After: 120 benches the provider for ~120s, not 60s', async () => {
    freellm.resetMetricsForTests();
    const router = makeRouter();
    await assert.rejects(() => router.routeCompletion({
        prompt: 'F-12 retry-after fixture',
        bypassCache: true,
        fetchImpl: async () => headers429('120'),
        platformConfig: PLATFORM_CONFIG,
    }));
    const state = router.cooldownManager.isOnCooldown('groq', 'groq-fixture');
    assert.equal(state.onCooldown, true);
    assert.ok(state.remainingMs > 60_000, `the header, not the 60s base, drives the bench (remaining=${state.remainingMs})`);
    assert.ok(state.remainingMs <= 120_000);
    freellm.resetMetricsForTests();
});

test('F-12: router e2e — a pathological Retry-After: 3600 is clamped to the 300s ceiling', async () => {
    freellm.resetMetricsForTests();
    const router = makeRouter();
    await assert.rejects(() => router.routeCompletion({
        prompt: 'F-12 clamp fixture',
        bypassCache: true,
        fetchImpl: async () => headers429('3600'),
        platformConfig: PLATFORM_CONFIG,
    }));
    const state = router.cooldownManager.isOnCooldown('groq', 'groq-fixture');
    assert.equal(state.onCooldown, true);
    assert.ok(state.remainingMs <= 300_000, `clamped to MAX_COOLDOWN_MS (remaining=${state.remainingMs})`);
    assert.ok(state.remainingMs > 290_000);
    freellm.resetMetricsForTests();
});
