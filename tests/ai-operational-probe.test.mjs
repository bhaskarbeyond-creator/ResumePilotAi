import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * DIR-048 S4 — the non-billable AI operational probe.
 *
 * The property under test is honesty: a verdict may claim `ready` only for a
 * catalog this process actually fetched and parsed; a rejection is definitive;
 * anything incomplete is `degraded`; and no verdict ever leaks the credential
 * it probed with. Every case injects BOTH the provider list and the fetch
 * implementation, so the suite performs no repository reads and no network I/O.
 */

process.env.NODE_ENV = 'test';
const require = createRequire(import.meta.url);
const probe = require('../backend/services/aiOperationalProbe.js');

/** A public IP literal: it passes the SSRF guard without any DNS lookup, and
 *  the injected fetch stub intercepts the request before any socket opens. */
const PUBLIC_BASE = 'https://93.184.216.34/v1';
const providers = (baseUrl = PUBLIC_BASE) => [
    { id: 'openai', providerConfig: { key: 'probe-test-secret-key', baseUrl } },
];

const fetchOnce = (responder) => {
    const calls = [];
    const impl = async (url, options) => {
        calls.push({ url: String(url), options: options || {} });
        return responder(String(url), options || {});
    };
    impl.calls = calls;
    return impl;
};

const okCatalog = (models = [{ id: 'gpt-4o' }]) => ({
    ok: true, status: 200, json: async () => ({ data: models }),
});

test('a reachable model catalog is the only path to a ready verdict', async () => {
    probe.resetAiProbeCache();
    const fetchImpl = fetchOnce(() => okCatalog());
    const verdict = await probe.getAiOperationalStatus({ providers: providers(), fetchImpl });
    assert.equal(verdict.state, 'ready');
    assert.equal(verdict.configured, 1);
    assert.equal(verdict.reachable, 1);
    assert.equal(fetchImpl.calls.length, 1);
    // The probe must not publish the credential it probed with.
    assert.doesNotMatch(JSON.stringify(verdict), /probe-test-secret-key/);

    // A second read inside the TTL is served from cache: no second request.
    const cached = await probe.getAiOperationalStatus({ providers: providers(), fetchImpl });
    assert.equal(cached.state, 'ready');
    assert.equal(fetchImpl.calls.length, 1, 'cached verdicts must not re-probe');
});

test('a rejected credential is a definitive unavailable, not an unknown', async () => {
    probe.resetAiProbeCache();
    const fetchImpl = fetchOnce(() => ({ ok: false, status: 401, json: async () => ({}) }));
    const verdict = await probe.getAiOperationalStatus({ providers: providers(), fetchImpl });
    assert.equal(verdict.state, 'unavailable');
    assert.equal(verdict.cause, 'credential-rejected');
    assert.equal(verdict.reachable, 0);
});

test('an inconclusive probe is degraded and can never be upgraded to ready', async () => {
    probe.resetAiProbeCache();
    const fetchImpl = fetchOnce(() => { throw new Error('socket hang up'); });
    const verdict = await probe.getAiOperationalStatus({ providers: providers(), fetchImpl });
    assert.equal(verdict.state, 'degraded');
    assert.equal(verdict.cause, 'inconclusive');
    assert.equal(verdict.reachable, 0);
});

test('HTTP 200 with an unparseable catalog stays inconclusive', async () => {
    probe.resetAiProbeCache();
    const fetchImpl = fetchOnce(() => ({ ok: true, status: 200, json: async () => ({ data: 'not-a-list' }) }));
    const verdict = await probe.getAiOperationalStatus({ providers: providers(), fetchImpl });
    assert.equal(verdict.state, 'degraded', 'a malformed body is an unknown, not an authoritative "no"');
});

test('a well-formed empty catalog is unavailable, not degraded', async () => {
    probe.resetAiProbeCache();
    const fetchImpl = fetchOnce(() => okCatalog([]));
    const verdict = await probe.getAiOperationalStatus({ providers: providers(), fetchImpl });
    assert.equal(verdict.state, 'unavailable');
    assert.equal(verdict.cause, 'credential-rejected');
    assert.equal(fetchImpl.calls.length, 1);
});

test('an internal BYOK host is refused before any request is made', async () => {
    probe.resetAiProbeCache();
    const fetchImpl = fetchOnce(() => okCatalog());
    const verdict = await probe.getAiOperationalStatus({
        providers: providers('http://localhost:9999/v1'), fetchImpl,
    });
    assert.equal(verdict.state, 'unavailable');
    assert.equal(verdict.cause, 'host-blocked');
    assert.equal(fetchImpl.calls.length, 0, 'a private target must never be dialed');
});

test('a runtime without a transport reports configured-but-unconfirmed', async () => {
    probe.resetAiProbeCache();
    const verdict = await probe.getAiOperationalStatus({ providers: providers(), fetchImpl: null });
    assert.equal(verdict.state, 'degraded', 'no transport is configured-not-confirmed, never ready');
    assert.equal(verdict.cause, 'no-transport');
});

test('no configured providers is an honest unavailable with zero counts', async () => {
    probe.resetAiProbeCache();
    const verdict = await probe.getAiOperationalStatus({ providers: [], fetchImpl: null });
    assert.equal(verdict.state, 'unavailable');
    assert.equal(verdict.cause, 'unconfigured');
    assert.equal(verdict.configured, 0);
    assert.equal(verdict.reachable, 0);
});

test('the public projection maps every verdict without overclaiming', () => {
    const { projectAiAvailability } = require('../backend/services/platformHealth.js');
    const verdict = (state, configured) => ({ state, configured });

    assert.deepEqual(projectAiAvailability(verdict('ready', 2)),
        { providers: true, available: true, degraded: false, configured: 2 });
    assert.deepEqual(projectAiAvailability(verdict('degraded', 2)),
        { providers: false, available: false, degraded: true, configured: 2 });
    assert.deepEqual(projectAiAvailability(verdict('unavailable', 2)),
        { providers: false, available: false, degraded: false, configured: 2 });

    // UNKNOWN: an absent measurement must NOT become a boolean claim. The
    // client then honestly answers "unknown" instead of "unavailable".
    for (const absent of [null, undefined, {}]) {
        const unknown = projectAiAvailability(absent);
        assert.equal(typeof unknown.providers, 'undefined');
        assert.equal(typeof unknown.available, 'undefined');
        assert.equal(typeof unknown.degraded, 'undefined');
        assert.equal(unknown.configured, 0);
    }
});

test('peek never triggers a probe and reports an absent measurement as null', async () => {
    probe.resetAiProbeCache();
    assert.equal(probe.peekAiOperationalStatus(), null, 'nothing measured yet is null, not a guess');

    const fetchImpl = fetchOnce(() => okCatalog());
    await probe.getAiOperationalStatus({ providers: providers(), fetchImpl });
    const peeked = probe.peekAiOperationalStatus();
    assert.equal(peeked?.state, 'ready');
    assert.equal(fetchImpl.calls.length, 1, 'peeking must not re-probe');
    assert.equal(probe.peekAiOperationalStatus(), peeked, 'peek returns the cached verdict identity');
});

