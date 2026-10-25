'use strict';

// F-20 (P2): provider error text leaked to clients. The OpenAI/Anthropic
// wire error bodies forwarded err.message verbatim (audit probe A.5 showed
// '[openai] server error from alpha (HTTP 500)' — the internal provider id
// and upstream response text — in the client response), and the success
// response embedded fallbacks[].error the same way. This spec pins the
// public boundary: 5xx and internally-detailed messages map to the stable
// public 'Upstream provider error'; machine-readable code/status/type and
// client-caused 4xx validation text pass through untouched; fallback entries
// keep their machine-readable fields but never their free-text error. The
// detailed string survives only in server logs and the in-process engine
// result that admin surfaces consume. Wire-level behaviour on the running
// stack is pinned by the F-20 live probe.

process.env.NODE_ENV = 'test';
process.env.FREELMAPI_METRICS_DB = ':memory:';
delete process.env.FREELMAPI_API_KEYS;

const test = require('node:test');
const assert = require('node:assert/strict');

// Proven boot harness: the contract stands in for MariaDB before index loads.
require('./helpers/routesIntegrationContract').installRoutesIntegrationContract();

const app = require('../index');
const { publicUpstreamMessage, openAiErrorBody, anthropicErrorBody, publicFallbackEntries } = app;

const engineError = (message, status, code) => Object.assign(new Error(message), { status, code });

test('F-20 mapping: internal detail becomes the public message; client-caused text passes through', () => {
    // The exact probe A.5 leak.
    assert.equal(publicUpstreamMessage(engineError('[openai] server error from alpha (HTTP 500)', 502, 'ALL_PROVIDERS_FAILED')), 'Upstream provider error');
    // F-03 pin diagnostics name the provider and pin state — internal.
    assert.equal(publicUpstreamMessage(engineError('Pinned AI provider "groq" is unavailable: groq (429: rate limited by beta)', 503, 'provider_unavailable')), 'Upstream provider error');
    // Provider-derived 429 text (pool/key internals) is sanitized by pattern.
    assert.equal(publicUpstreamMessage(engineError('HTTP 429 across all pooled keys', 429, 'RATE_LIMITED')), 'Upstream provider error');
    // Network internals never reach clients either.
    assert.equal(publicUpstreamMessage(engineError('fetch failed: ECONNREFUSED 10.0.0.5:443', 502, 'UPSTREAM')), 'Upstream provider error');
    // Any 5xx is public regardless of wording.
    assert.equal(publicUpstreamMessage(engineError('something odd happened', 503)), 'Upstream provider error');
    // Client-caused 4xx validation text is useful and safe — it passes through.
    assert.equal(publicUpstreamMessage(engineError('messages field is required', 400, 'BAD_REQUEST')), 'messages field is required');
    assert.equal(publicUpstreamMessage(engineError('AI daily quota exceeded', 429, 'AI_DAILY_QUOTA_EXCEEDED')), 'AI daily quota exceeded');
});

test('F-20 OpenAI wire body: message sanitized, code/status/type preserved', () => {
    const badGateway = openAiErrorBody(engineError('[groq] server error from beta (HTTP 500)', 502, 'ALL_PROVIDERS_FAILED'));
    assert.equal(badGateway.status, 502);
    assert.equal(badGateway.body.error.message, 'Upstream provider error');
    assert.equal(badGateway.body.error.code, 'ALL_PROVIDERS_FAILED', 'the machine-readable code stays');
    assert.equal(badGateway.body.error.type, 'api_error');
    assert.equal(JSON.stringify(badGateway.body).includes('server error from'), false);

    const unavailable = openAiErrorBody(engineError('Pinned AI provider "groq" is unavailable', 503, 'provider_unavailable'));
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.error.message, 'Upstream provider error');
    assert.equal(unavailable.body.error.code, 'provider_unavailable');

    const validation = openAiErrorBody(engineError('model field is required', 400, 'BAD_REQUEST'));
    assert.equal(validation.status, 400);
    assert.equal(validation.body.error.message, 'model field is required', 'client-caused text passes through');
    assert.equal(validation.body.error.type, 'invalid_request_error');

    const empty = openAiErrorBody({});
    assert.equal(empty.status, 502);
    assert.equal(empty.body.error.message, 'Upstream provider error');
});

test('F-20 Anthropic wire body: same boundary, native error shape', () => {
    const leaked = anthropicErrorBody(engineError('[openai] server error from alpha (HTTP 500)', 502));
    assert.equal(leaked.status, 502);
    assert.equal(leaked.body.type, 'error');
    assert.equal(leaked.body.error.message, 'Upstream provider error');
    assert.equal(leaked.body.error.type, 'api_error');
    const client = anthropicErrorBody(engineError('max_tokens is required', 400));
    assert.equal(client.body.error.message, 'max_tokens is required');
    assert.equal(client.body.error.type, 'invalid_request_error');
});

test('F-20 fallback entries: machine-readable fields stay, free-text error goes', () => {
    const entries = publicFallbackEntries([
        { provider: 'groq', model: 'beta-model', code: 'PROVIDER_ERROR', status: 500, latencyMs: 12, error: 'server error from beta (HTTP 500)' },
        { provider: 'openai', model: 'alpha-model', latencyMs: 8 },
    ]);
    assert.equal(entries[0].error, 'Upstream provider error');
    assert.equal(entries[0].provider, 'groq', 'provider/model/code/status remain for debugging by contract');
    assert.equal(entries[0].code, 'PROVIDER_ERROR');
    assert.equal(entries[0].status, 500);
    assert.deepEqual(entries[1], { provider: 'openai', model: 'alpha-model', latencyMs: 8 }, 'entries without error text are untouched');
    assert.deepEqual(publicFallbackEntries(undefined), []);
    assert.deepEqual(publicFallbackEntries(null), []);
});
