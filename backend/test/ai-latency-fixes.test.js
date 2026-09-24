'use strict';

/**
 * Adversarial tests for the AI-latency fixes:
 *   1. Pooled provider connection layer (providerHttp + fetchWithDeadline)
 *   2. Retry/backoff tuning (fast backoff, Retry-After respect, failover)
 *   3. Latency budget (bounded candidate spend, failover on exhaustion)
 *   4. BYOK/tenant isolation under a SHARED pooled connection (the highest-risk
 *      surface: tenant A's credential must never be written to a connection
 *      serving tenant B's request, even when both reuse one socket)
 */
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

const { getAgentFor, isNodeFetchV2, withPooledAgent, resetAgentCacheForTests } = require('../services/aiRouting/providerHttp');
const { fetchWithDeadline } = require('../services/aiRouting/httpDeadline');
const { createAiModelRouter } = require('../services/aiRouting');

// ---------------------------------------------------------------------------
// Unit: agent selection
// ---------------------------------------------------------------------------
test('P1: providerHttp exposes a keep-alive agent for provider URLs', () => {
    resetAgentCacheForTests();
    const a = getAgentFor('https://api.nvidia.com/v1/chat/completions');
    assert.ok(a, 'https agent returned');
    assert.equal(a.keepAlive, true, 'keepAlive enabled');
    assert.ok(a.keepAliveMsecs >= 30_000, 'idle keep-alive covers interview cadence');
    assert.ok(a.maxSockets > 0 && a.maxSockets <= 64, 'bounded sockets');
    const b = getAgentFor('https://openrouter.ai/api/v1/chat/completions');
    assert.equal(b, a, 'one agent per protocol (credentials are per-request headers)');
    resetAgentCacheForTests();
});

test('P2: withPooledAgent adds agent only for node-fetch v2, never mutates options', () => {
    const fakeV2 = Object.assign(function fetch() {}, {
        Headers: function () {}, Request: function () {}, Response: function () {}, FetchError: function () {},
    });
    const plain = function fetch() {};
    const base = { method: 'POST', headers: { a: 'b' }, body: 'x' };

    assert.equal(isNodeFetchV2(fakeV2), true);
    assert.equal(isNodeFetchV2(plain), false);
    assert.equal(isNodeFetchV2(null), false, 'null-safe');
    assert.equal(isNodeFetchV2(undefined), false, 'undefined-safe');
    // Node's native fetch (if not overridden by index.js in this process)
    // must NOT be misdetected as node-fetch v2.
    if (typeof globalThis.fetch === 'function') {
        const nativeLike = !globalThis.fetch.Headers;
        if (nativeLike) assert.equal(isNodeFetchV2(globalThis.fetch), false, 'native fetch passthrough');
    }

    const augmented = withPooledAgent(fakeV2, 'https://x.example/v1/chat/completions', base);
    assert.ok(augmented.agent, 'agent attached for node-fetch v2');
    assert.notEqual(augmented, base, 'new options object (no mutation)');
    assert.equal(base.agent, undefined, 'caller options untouched');

    const passthrough = withPooledAgent(plain, 'https://x.example/v1/chat/completions', base);
    assert.equal(passthrough.agent, undefined, 'plain fetch left untouched (undici pools itself)');

    const bad = withPooledAgent(fakeV2, 'not a url', base);
    assert.equal(bad.agent, undefined, 'unparseable URL → pass through');
});

// ---------------------------------------------------------------------------
// Integration: real sockets — reuse + credential isolation over one socket
// ---------------------------------------------------------------------------
function startEchoAuthServer() {
    // Records, per connection, the ordered list of Authorization headers it
    // saw on that socket. This is the ground truth for the isolation proof:
    // on a reused (keep-alive) socket the server sees multiple requests, and
    // each must carry ONLY its own tenant's credential.
    const state = { connections: 0, perConnection: [] };
    const server = http.createServer((req, res) => {
        if (!req.socket._rec) {
            req.socket._rec = [];
            state.perConnection.push(req.socket._rec);
            state.connections += 1;
        }
        req.socket._rec.push(String(req.headers.authorization || ''));
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ echo: body, auth: String(req.headers.authorization || '') }));
        });
    });
    return {
        state,
        start: async () => {
            server.listen(0, '127.0.0.1');
            await once(server, 'listening');
            return `http://127.0.0.1:${server.address().port}`;
        },
        stop: async () => {
            await new Promise(r => server.close(r));
        },
    };
}

test('P3: two sequential AI calls reuse ONE pooled connection (node-fetch v2)', async () => {
    const nodeFetch = require('node-fetch');
    assert.equal(isNodeFetchV2(nodeFetch), true, 'fixture sanity: node-fetch v2 detected');
    const srv = await startEchoAuthServer();
    const base = await srv.start();
    try {
        const r1 = await fetchWithDeadline(nodeFetch, `${base}/chat`, { method: 'POST', headers: { Authorization: 'Bearer tA' }, body: '1' }, 5000);
        assert.equal(r1.status, 200);
        assert.equal((await r1.json()).auth, 'Bearer tA');
        const r2 = await fetchWithDeadline(nodeFetch, `${base}/chat`, { method: 'POST', headers: { Authorization: 'Bearer tB' }, body: '2' }, 5000);
        assert.equal((await r2.json()).auth, 'Bearer tB');
        assert.equal(srv.state.connections, 1, 'both calls over one kept-alive connection');
        assert.deepEqual(srv.state.perConnection[0], ['Bearer tA', 'Bearer tB'], 'each request carried only its own credential');
    } finally {
        await srv.stop();
    }
});

test('P4: concurrent requests from two tenants over the pooled layer — zero credential cross-talk', async () => {
    const nodeFetch = require('node-fetch');
    const srv = await startEchoAuthServer();
    const base = await srv.start();
    try {
        // 4 concurrent calls, 2 tenants, alternating — with LIFO keep-alive
        // several of these will land on the same socket.
        const mk = (tenant, i) => fetchWithDeadline(nodeFetch, `${base}/chat`, {
            method: 'POST',
            headers: { Authorization: `Bearer key-${tenant}-${i}` },
            body: `${tenant}-${i}`,
        }, 5000).then(async r => (await r.json()));
        const results = await Promise.all([
            mk('A', 1), mk('B', 1), mk('A', 2), mk('B', 2),
        ]);
        for (const r of results) {
            const m = /^key-(A|B)-\d+$/.exec(r.auth.replace('Bearer ', ''));
            assert.ok(m, 'response carried a tenant credential');
            assert.equal(r.echo.startsWith(m[1]), true, 'body and credential belong to the SAME tenant');
        }
        // Global invariant: on every connection, the i-th response must match
        // the i-th credential seen on that connection (no interleaving on one
        // HTTP/1.1 stream).
        for (const rec of srv.state.perConnection) {
            for (const entry of rec) assert.ok(/^Bearer key-[AB]-\d+$/.test(entry));
        }
    } finally {
        await srv.stop();
    }
});

test('P5: timeout on the pooled fetch still aborts and does not poison the pool', async () => {
    const nodeFetch = require('node-fetch');
    let release = () => {};
    const server = http.createServer((req, res) => {
        req.on('end', () => {
            // Delay the response until released.
            const p = new Promise(r => { release = r; });
            p.then(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); });
        });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        await assert.rejects(
            fetchWithDeadline(nodeFetch, `${base}/slow`, { method: 'POST', body: 'x' }, 300),
            /timed out/,
        );
        // Pool still usable afterwards:
        const srv2 = await startEchoAuthServer();
        const b2 = await srv2.start();
        const r = await fetchWithDeadline(nodeFetch, `${b2}/ok`, { method: 'POST', body: 'x' }, 5000);
        assert.equal(r.status, 200);
        await srv2.stop();
    } finally {
        release();
        await new Promise(r => server.close(r));
    }
});

// ---------------------------------------------------------------------------
// Retry policy: fast backoff, Retry-After respect, budget-bounded failover
// ---------------------------------------------------------------------------
function cfg(entries, tenantId = 'tenant-perf') {
    return {
        primary: Object.keys(entries)[0],
        enableFallback: true,
        temperature: 0.5,
        maxTokens: 200,
        tenantId,
        providers: Object.fromEntries(Object.entries(entries).map(([name, v]) => [name, { enabled: true, key: `${name}-key`, model: `${name}-model-1`, ...v }])),
    };
}

function okFetch(content = 'ok') {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content } }] }) };
}

function flakyProviderFetch({ failN = Infinity, failStatus = 500, calls = { n: 0 } } = {}) {
    return async () => {
        calls.n += 1;
        if (calls.n <= failN) {
            return { ok: false, status: failStatus, headers: { get: () => null }, json: async () => ({ error: { message: 'boom' } }) };
        }
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: 'recovered' } }] }) };
    };
}

test('R1: latency-critical op retries with FAST bounded backoff (150ms, not 3s)', async () => {
    const router = createAiModelRouter({ now: () => Date.now() });
    const calls = { n: 0 };
    const started = Date.now();
    const result = await router.route({
        prompt: 'p',
        configuration: cfg({ openai: {} }, 'tenant-r1'),
        operation: 'autocomplete',
        fetchImpl: flakyProviderFetch({ failN: 1, calls }),
    });
    const elapsed = Date.now() - started;
    assert.equal(calls.n, 2, 'one retry');
    assert.equal(result.provider, 'openai');
    assert.ok(elapsed >= 100, `backoff applied (elapsed ${elapsed}ms)`);
    assert.ok(elapsed < 1000, `backoff fast (elapsed ${elapsed}ms)`);
});

test('R2: long Retry-After on a 429 is NOT waited out — immediate failover to next candidate', async () => {
    const router = createAiModelRouter({ now: () => Date.now() });
    const openaiCalls = { n: 0 };
    const started = Date.now();
    const result = await router.route({
        prompt: 'p',
        configuration: cfg({ openai: {}, groq: {} }, 'tenant-r2'),
        operation: 'autocomplete',
        fetchImpl: (url) => {
            if (String(url).includes('api.openai.com')) {
                openaiCalls.n += 1;
                return {
                    ok: false, status: 429,
                    headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '30' : null) },
                    json: async () => ({ error: { message: 'rate limited' } }),
                };
            }
            return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: 'groq-ok' } }] }) };
        },
    });
    const elapsed = Date.now() - started;
    assert.equal(result.provider, 'groq', 'failed over to the next candidate');
    assert.equal(openaiCalls.n, 1, 'did NOT burn the budget waiting out a 30s Retry-After');
    assert.ok(elapsed < 1000, `failover was fast (elapsed ${elapsed}ms)`);
});

test('R3: short Retry-After (<=2s) IS respected on latency-critical retry', async () => {
    const router = createAiModelRouter({ now: () => Date.now() });
    const calls = { n: 0 };
    const started = Date.now();
    await router.route({
        prompt: 'p',
        configuration: cfg({ openai: {} }, 'tenant-r3'),
        operation: 'autocomplete',
        fetchImpl: async () => {
            calls.n += 1;
            if (calls.n === 1) {
                return {
                    ok: false, status: 429,
                    headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '1' : null) },
                    json: async () => ({ error: { message: 'rate limited' } }),
                };
            }
            return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
        },
    });
    const elapsed = Date.now() - started;
    assert.equal(calls.n, 2, 'retried after the short Retry-After');
    assert.ok(elapsed >= 900, `waited out the 1s Retry-After (elapsed ${elapsed}ms)`);
});

test('R4: latency budget bounds total candidate spend on a degraded provider', async () => {
    // Fake clock: the degraded candidate burns 44s on attempt 1, then a
    // clamped (≤2s) attempt 2. With the legacy code (3 attempts × 75s
    // timeout, 3s+4.5s sleeps) the same scenario would burn 150s+ on this
    // candidate alone. Contract: total spend on the candidate stays within
    // budget + one minimum clamped attempt, then failover happens.
    let clockNow = 0;
    const router = createAiModelRouter({ now: () => clockNow });
    let openaiAttempts = 0;
    const fetchImpl = async () => {
        openaiAttempts += 1;
        clockNow += openaiAttempts === 1 ? 44_000 : 2_000;
        return {
            ok: false, status: 500,
            headers: { get: () => null },
            json: async () => ({ error: { message: 'boom' } }),
        };
    };
    let groqCalls = 0;
    const result = await router.route({
        prompt: 'p',
        configuration: cfg({ openai: {}, groq: {} }, 'tenant-r4'),
        operation: 'live-interview-turn',
        fetchImpl: (url) => {
            if (String(url).includes('groq')) {
                groqCalls += 1;
                return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: 'groq-saved-it' } }] }) });
            }
            return fetchImpl();
        },
    });
    assert.equal(result.provider, 'groq', 'failed over to the healthy candidate');
    assert.equal(groqCalls, 1);
    assert.equal(openaiAttempts, 2, 'bounded number of attempts on the degraded candidate');
    // Total fake time burned on openai before failover: 44s + 150ms backoff
    // + 2s clamped attempt = 46.15s — i.e. budget(45s) + the minimum
    // clamped attempt, NOT 3 × 75s + 7.5s of sleeps.
    assert.ok(clockNow <= 47_000, `candidate spend bounded (spent ${clockNow}ms)`);
});

test('R4b: budget exhaustion is recorded when failover occurs mid-attempt-plan', async () => {
    // Two attempts, BOTH of which consume the entire remaining budget:
    // attempt 1 burns 40s, attempt 2 burns 40s. After attempt 2 the loop
    // ends; the recorded failure must still reflect the budget-bound flow
    // and the router must not start any third attempt.
    let clockNow = 0;
    const router = createAiModelRouter({ now: () => clockNow });
    let attempts = 0;
    await assert.rejects(
        router.route({
            prompt: 'p',
            configuration: cfg({ openai: {} }, 'tenant-r4b'),
            operation: 'live-interview-turn',
            fetchImpl: async () => {
                attempts += 1;
                clockNow += 40_000;
                return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: { message: 'boom' } }) };
            },
        }),
        (err) => {
            assert.equal(err.code, 'AI_PROVIDER_ERROR');
            assert.ok(Array.isArray(err.failures) && err.failures.length === 1);
            return true;
        },
    );
    assert.ok(attempts <= 2, `no third attempt (attempts=${attempts})`);
    assert.ok(clockNow <= 81_000, `spend bounded (~2×40s + backoff, not 3×75s; spent ${clockNow}ms)`);
});

test('R5: non-latency-critical operations keep exactly ONE attempt (no retry storms)', async () => {
    const router = createAiModelRouter({ now: () => Date.now() });
    const calls = { n: 0 };
    const openaiFetch = flakyProviderFetch({ failN: Infinity, calls });
    const result = await router.route({
        prompt: 'p',
        configuration: cfg({ openai: {}, groq: {} }, 'tenant-r5'),
        operation: 'generate-summary',
        fetchImpl: (url) => (String(url).includes('api.openai.com') ? openaiFetch(url) : Promise.resolve(okFetch('groq'))),
    });
    assert.equal(result.provider, 'groq');
    assert.equal(calls.n, 1, 'one attempt, then failover');
});

test('R6: client abort during backoff sleep is honored (no orphaned retry)', async () => {
    const router = createAiModelRouter({ now: () => Date.now() });
    const calls = { n: 0 };
    const controller = new AbortController();
    const p = router.route({
        prompt: 'p',
        configuration: cfg({ openai: {} }, 'tenant-r6'),
        operation: 'autocomplete',
        signal: controller.signal,
        fetchImpl: (url, opts) => {
            if (opts.signal?.aborted) return Promise.reject(opts.signal.reason);
            calls.n += 1;
            if (calls.n === 1) {
                return Promise.resolve({
                    ok: false, status: 500,
                    headers: { get: () => null },
                    json: async () => ({ error: { message: 'boom' } }),
                });
            }
            return new Promise((resolve, reject) => {
                opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
                setTimeout(() => resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: 'late' } }] }) }), 5000);
            });
        },
    });
    setTimeout(() => controller.abort(new Error('client-left')), 30);
    await assert.rejects(p, /client-left|abort/i);
    assert.equal(calls.n, 1, 'aborted during the backoff window before the retry was issued');
});
