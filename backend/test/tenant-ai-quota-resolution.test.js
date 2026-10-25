'use strict';

// F-27 (P3): quota default disagreement. generate-content used `|| 1`
// defaults (unconfigured tenant → 1 request/minute; explicit 0 "block" →
// 1 "allow"), generate-interview used 60/1000 behind `if (quotaGuard)`
// (installations without a guard got unlimited generation), and routes/ai.js
// repeated the conditional. This spec pins the single shared resolver:
// documented defaults 60/min + 1000/day, explicit 0 = block (429), invalid
// input = fallback, and unconditional fail-closed consumption (503) when
// quota coordination is missing.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TENANT_AI_QUOTA_DEFAULTS,
    resolveTenantAiQuota,
    consumeTenantAiQuota,
} = require('../enterprise/tenantAi');
const { TenantService } = require('../enterprise/tenantService');

const context = Object.freeze({ tenantId: 't-f27', workspaceId: null, principalId: 'user-f27', correlationId: 'corr-f27' });

function spyService() {
    const calls = [];
    return {
        calls,
        async consumeTenantQuota(args) { calls.push(args); return { ok: true }; },
    };
}

test('F-27: one documented default set for every tenant AI route', () => {
    assert.deepEqual(TENANT_AI_QUOTA_DEFAULTS, { aiRequestsPerMinute: 60, aiRequestsPerDay: 1000 });
    assert.deepEqual(resolveTenantAiQuota({}), { aiRequestsPerMinute: 60, aiRequestsPerDay: 1000 });
    assert.deepEqual(resolveTenantAiQuota(undefined), { aiRequestsPerMinute: 60, aiRequestsPerDay: 1000 });
    assert.deepEqual(resolveTenantAiQuota(null), { aiRequestsPerMinute: 60, aiRequestsPerDay: 1000 });
    // The old content-route default was `|| 1` — a minute allowance of ONE.
    // The resolver never reproduces that disagreement.
    assert.notEqual(resolveTenantAiQuota({}).aiRequestsPerMinute, 1);
});

test('F-27: explicit finite limits are preserved; invalid values fall back', () => {
    assert.deepEqual(resolveTenantAiQuota({ aiRequestsPerMinute: 50, aiRequestsPerDay: 7 }),
        { aiRequestsPerMinute: 50, aiRequestsPerDay: 7 });
    assert.deepEqual(resolveTenantAiQuota({ aiRequestsPerMinute: '30' }),
        { aiRequestsPerMinute: 30, aiRequestsPerDay: 1000 }, 'numeric strings coerce');
    for (const bad of [NaN, 'abc', -5, 1.5, Infinity, {}, []]) {
        assert.deepEqual(resolveTenantAiQuota({ aiRequestsPerMinute: bad, aiRequestsPerDay: bad }),
            { aiRequestsPerMinute: 60, aiRequestsPerDay: 1000 }, `invalid ${JSON.stringify(bad)} falls back`);
    }
});

test('F-27: explicit 0 means BLOCKED, never fallback — 429 before any consumption', async () => {
    const service = spyService();
    // Old bug: an explicit 0 ran through `Number(raw || 1)` — the intended
    // block became an allowance of 1.
    const explicitZero = 0;
    assert.equal(Number(explicitZero || 1), 1, 'documents the old fallback inversion');

    await assert.rejects(
        consumeTenantAiQuota({ service, context, quotaPolicy: { aiRequestsPerMinute: 0 } }),
        err => err.code === 'TENANT_QUOTA_BLOCKED' && err.status === 429 && err.limit === 0
    );
    assert.equal(service.calls.length, 0, 'blocked before touching the counter store');

    const dayService = spyService();
    await assert.rejects(
        consumeTenantAiQuota({ service: dayService, context, quotaPolicy: { aiRequestsPerDay: 0 } }),
        err => err.code === 'TENANT_QUOTA_BLOCKED' && err.status === 429
    );
    assert.equal(dayService.calls.length, 1, 'minute window consumed, then the day block fires');
    assert.equal(dayService.calls[0].metric, 'ai-minute');
});

test('F-27: consumption is unconditional and fail-closed when coordination is missing', async () => {
    // Real service shape WITHOUT a quotaGuard (the test-double shape that used
    // to slip through `if (quotaGuard)` into unlimited generation).
    const guardless = new TenantService({});
    await assert.rejects(
        consumeTenantAiQuota({ service: guardless, context, quotaPolicy: {} }),
        err => err.code === 'TENANT_QUOTA_UNAVAILABLE' && err.status === 503
    );
    // A service object that cannot meter at all fails closed the same way.
    await assert.rejects(
        consumeTenantAiQuota({ service: {}, context, quotaPolicy: {} }),
        err => err.code === 'TENANT_QUOTA_UNAVAILABLE' && err.status === 503
    );
});

test('F-27: happy path consumes minute then day with the resolved limits and windows', async () => {
    const service = spyService();
    const limits = await consumeTenantAiQuota({ service, context, quotaPolicy: { aiRequestsPerMinute: 5 } });
    assert.deepEqual(limits, { aiRequestsPerMinute: 5, aiRequestsPerDay: 1000 });
    assert.deepEqual(service.calls, [
        { context, metric: 'ai-minute', limit: 5, windowMs: 60_000 },
        { context, metric: 'ai-day', limit: 1000, windowMs: 24 * 60 * 60_000 },
    ]);
});
