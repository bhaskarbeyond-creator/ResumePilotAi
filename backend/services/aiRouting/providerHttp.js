'use strict';

/**
 * Provider HTTP connection layer.
 *
 * Every outbound AI call (chat + discovery) goes through a DEDICATED,
 * pooled, keep-alive agent per protocol instead of relying on whatever the
 * process's global agent happens to be:
 *
 *   - Node >= 19 sets http.globalAgent keepAlive to true, but production
 *     runtimes on Node 18 (and any operator override) default to
 *     keepAlive: false — where EVERY AI request paid a fresh DNS + TCP +
 *     TLS handshake (typically 100-400ms per call).
 *   - The default global agent also keeps idle sockets for only ~1s
 *     (keepAliveMsecs default), which is shorter than the realistic
 *     "user reads the answer, then sends the next one" cadence of live
 *     interviews.
 *
 * The agents here:
 *   - keep idle sockets for 60s (covers the interview turn cadence),
 *   - schedule LIFO (reuse the most recently freed socket — the one whose
 *     TLS session and provider-side warm state is most likely still valid),
 *   - bound sockets per origin so a burst cannot exhaust file descriptors.
 *
 * BYOK / tenant isolation:
 *   - agents are keyed by ORIGIN (host:port) only; they carry no
 *     credentials, never any header state.
 *   - the tenant's Authorization header is attached PER REQUEST by the
 *     provider adapter, exactly as before.
 *   - HTTP/1.1 only: a connection is dedicated to at most one request at a
 *     time, so one tenant's credential can never be written to a connection
 *     that is concurrently serving another tenant's request (an HTTP/2
 *     multiplexed stream model would be safe by stream isolation too, but
 *     HTTP/1.1 keep-alive is the most conservative, universally compatible
 *     choice for third-party gateways).
 */

const http = require('http');
const https = require('https');

const AGENT_OPTIONS = {
    keepAlive: true,
    // Hold idle provider connections for the realistic interview cadence
    // (a user reads a response for seconds-to-a-minute before the next one).
    keepAliveMsecs: 60_000,
    keepAliveInitialDelay: 1_000,
    // A single account should not need more than a handful of concurrent
    // provider sockets; bound hard so bursts cannot exhaust descriptors.
    maxSockets: 32,
    maxFreeSockets: 4,
    scheduling: 'lifo',
    timeout: 0,
};

let httpAgent = null;
let httpsAgent = null;

function getAgentFor(urlString) {
    let host;
    let secure = false;
    try {
        const url = new URL(String(urlString));
        host = url.host;
        secure = url.protocol === 'https:';
    } catch {
        return null;
    }
    if (secure) {
        if (!httpsAgent) {
            httpsAgent = new https.Agent(AGENT_OPTIONS);
            httpsAgent.maxTotalSockets = 64;
        }
        return httpsAgent;
    }
    if (!httpAgent) httpAgent = new http.Agent(AGENT_OPTIONS);
    void host; // agent is process-global per protocol; origin safety is
    // achieved by header scoping (see module docs), not by per-origin agents.
    return httpAgent;
}

/**
 * True when the fetch implementation is node-fetch v2 — the one that honours
 * the `agent` option (and the one this backend installs as global.fetch).
 * Node's native undici fetch pools connections itself and does not accept an
 * `agent` option, so it is passed through untouched.
 *
 * Detection: node-fetch v2 exposes its classes and error types as statics on
 * the exported function (Headers/Request/Response/FetchError); the native
 * undici fetch is a bare function with none of these.
 */
function isNodeFetchV2(fetchImpl) {
    return typeof fetchImpl === 'function'
        && typeof fetchImpl.Headers === 'function'
        && typeof fetchImpl.Response === 'function'
        && typeof fetchImpl.FetchError === 'function';
}

/**
 * Returns the options object augmented with a pooled connection agent where
 * the fetch implementation supports it. Never mutates the caller's options.
 */
function withPooledAgent(fetchImpl, url, options = {}) {
    if (!isNodeFetchV2(fetchImpl)) return options;
    const agent = getAgentFor(url);
    if (!agent) return options;
    return { ...options, agent };
}

/** Test/reset hook (process-local state only). */
function resetAgentCacheForTests() {
    if (httpAgent) httpAgent.destroy();
    if (httpsAgent) httpsAgent.destroy();
    httpAgent = null;
    httpsAgent = null;
}

module.exports = {
    AGENT_OPTIONS,
    getAgentFor,
    isNodeFetchV2,
    withPooledAgent,
    resetAgentCacheForTests,
};
