'use strict';

// F-22 (P2): routing state was not observable. RoutingTelemetry (a 500-entry,
// tenant-keyed ring, redacted at record time) and HealthStore.tenantSnapshot
// existed in-process but had NO HTTP surface — operators could only see
// SQLite aggregates. This spec pins the new super-admin read
// GET /api/admin/ai/routing-telemetry: tenant scoping (one scope per query,
// never cross-tenant enumeration), platform-scope default, limit/sinceMs
// handling, authorization, decisionId visibility (F-17 correlation), and the
// redaction boundary (prompts/keys never leave the ring).

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';
delete process.env.FREELMAPI_API_KEYS;

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

// Proven boot harness: the contract stands in for MariaDB before index loads.
require('./helpers/routesIntegrationContract').installRoutesIntegrationContract();

setTokenVerifierForTests(async token => {
    const now = Math.floor(Date.now() / 1000);
    if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
    if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
    if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
    throw new Error('invalid token');
});

const app = require('../index');
const { getSharedAiRouter, resetSharedAiRouterForTests } = require('../services/aiRuntime');

const bearer = token => ({ Authorization: `Bearer ${token}` });
const ROUTE = '/api/admin/ai/routing-telemetry';

test.beforeEach(() => {
    // Same singleton the route reads; .reset() clears telemetry/health/discovery.
    resetSharedAiRouterForTests();
});

test('F-22: super-admin reads tenant-scoped telemetry entries, stats and health snapshot', async () => {
    const router = getSharedAiRouter();
    router.telemetry.record({ tenantId: 't-alpha', ts: 1000, operation: 'chat', selectedProvider: 'openai', selectedModel: 'm1', outcome: 'failure', errorClass: 'RATE_LIMITED', decisionId: 'dec-1' });
    router.telemetry.record({ tenantId: 't-alpha', ts: 2000, operation: 'chat', selectedProvider: 'groq', selectedModel: 'm2', outcome: 'success', fallbackCount: 1, decisionId: 'dec-2' });
    router.telemetry.record({ tenantId: 't-beta', ts: 1500, operation: 'chat', selectedProvider: 'anthropic', selectedModel: 'm3', outcome: 'success' });
    router.health.record({ tenantId: 't-alpha', provider: 'openai', model: 'm1', ok: false, latencyMs: 40, errorClass: 'RATE_LIMITED' });
    router.health.record({ tenantId: 't-alpha', provider: 'groq', model: 'm2', ok: true, latencyMs: 25 });

    const response = await request(app).get(`${ROUTE}?tenantId=t-alpha`).set(bearer('super-admin'));
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.scope, 't-alpha');

    const entries = response.body.telemetry.entries;
    assert.equal(entries.length, 2, 'only the queried scope is returned');
    assert.ok(entries.every(e => e.tenantId === 't-alpha'));
    assert.equal(entries[0].ts, 2000, 'newest first');
    assert.equal(entries[1].decisionId, 'dec-1');

    const stats = response.body.telemetry.stats;
    assert.equal(stats.total, 2);
    assert.equal(stats.byOutcome.success, 1);
    assert.equal(stats.byOutcome.failure, 1);

    const health = response.body.health;
    assert.ok(Array.isArray(health) && health.length >= 2);
    const keys = health.map(h => `${h.provider}/${h.model}`).sort();
    assert.deepEqual(keys, ['groq/m2', 'openai/m1']);

    // Cross-tenant isolation on the wire: t-beta's routing history is absent.
    assert.ok(!response.text.includes('t-beta'));
    assert.ok(!response.text.includes('anthropic'));
});

test('F-22: omitted tenantId reads the platform scope only — never an enumeration of tenants', async () => {
    const router = getSharedAiRouter();
    router.telemetry.record({ ts: 1000, operation: 'chat', selectedProvider: 'openai', selectedModel: 'p1', outcome: 'success' });
    router.telemetry.record({ tenantId: 't-alpha', ts: 2000, operation: 'chat', selectedProvider: 'groq', selectedModel: 'p2', outcome: 'success' });
    router.health.record({ provider: 'openai', model: 'p1', ok: true, latencyMs: 10 });
    router.health.record({ tenantId: 't-alpha', provider: 'groq', model: 'p2', ok: true, latencyMs: 10 });

    const response = await request(app).get(ROUTE).set(bearer('super-admin'));
    assert.equal(response.status, 200);
    assert.equal(response.body.scope, 'platform');
    assert.equal(response.body.telemetry.entries.length, 1);
    assert.equal(response.body.telemetry.entries[0].tenantId, 'platform');
    assert.ok(!response.text.includes('t-alpha'), 'tenant-scoped rows are invisible from the platform scope');
    assert.deepEqual(response.body.health.map(h => `${h.provider}/${h.model}`), ['openai/p1']);
});

test('F-22: limit and sinceMs are honored and clamped', async () => {
    const router = getSharedAiRouter();
    router.telemetry.record({ tenantId: 't-limit', ts: 1000, outcome: 'success' });
    router.telemetry.record({ tenantId: 't-limit', ts: 2000, outcome: 'success' });
    router.telemetry.record({ tenantId: 't-limit', ts: 3000, outcome: 'failure', errorClass: 'UPSTREAM' });

    const limited = await request(app).get(`${ROUTE}?tenantId=t-limit&limit=2`).set(bearer('super-admin'));
    assert.equal(limited.body.telemetry.entries.length, 2);
    assert.deepEqual(limited.body.telemetry.entries.map(e => e.ts), [3000, 2000], 'newest first, oldest dropped');

    const since = await request(app).get(`${ROUTE}?tenantId=t-limit&sinceMs=2000`).set(bearer('super-admin'));
    assert.deepEqual(since.body.telemetry.entries.map(e => e.ts), [3000, 2000]);

    const clamped = await request(app).get(`${ROUTE}?tenantId=t-limit&limit=99999`).set(bearer('super-admin'));
    assert.equal(clamped.status, 200);
    assert.equal(clamped.body.telemetry.entries.length, 3, 'absurd limits degrade to "everything in the ring", never an error');
});

test('F-22: authorization — anonymous 401, non-super-admin 403', async () => {
    const anonymous = await request(app).get(ROUTE);
    assert.equal(anonymous.status, 401);

    const asAdmin = await request(app).get(ROUTE).set(bearer('admin'));
    assert.equal(asAdmin.status, 403);
    assert.equal(asAdmin.body.error.code, 'FORBIDDEN');

    const asUser = await request(app).get(ROUTE).set(bearer('user'));
    assert.equal(asUser.status, 403);
});

test('F-22: decisionId surfaces for correlation; secret-shaped text is redacted before the wire', async () => {
    const router = getSharedAiRouter();
    router.telemetry.record({
        tenantId: 't-redact',
        ts: 1000,
        operation: 'chat',
        selectedProvider: 'openai',
        selectedModel: 'm1',
        outcome: 'failure',
        decisionId: 'dec-f22-42',
        errorClass: 'failed with sk-live-abc12345678 xyz',
        rejectionSummary: 'api_key=TOPSECRETVALUE999 refused the candidate',
    });

    const response = await request(app).get(`${ROUTE}?tenantId=t-redact`).set(bearer('super-admin'));
    assert.equal(response.status, 200);
    const entry = response.body.telemetry.entries[0];
    assert.equal(entry.decisionId, 'dec-f22-42', 'F-17 correlation id is visible to operators');
    assert.ok(!response.text.includes('sk-live-abc12345678'), 'credential-shaped text never reaches the response');
    assert.ok(!response.text.includes('TOPSECRETVALUE999'));
    assert.ok(response.text.includes('[REDACTED]'), 'redaction is visible, not silent deletion');
});
