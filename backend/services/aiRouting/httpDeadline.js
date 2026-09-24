'use strict';

const { withPooledAgent } = require('./providerHttp');

/**
 * Bounded HTTP fetch with an external abort signal. Shared by the provider
 * adapters (chat + discovery) so every outbound AI call has a deadline and
 * honors client cancellation.
 *
 * Connection handling: for fetch implementations that support an explicit
 * agent (node-fetch v2 — what this backend installs as global.fetch), the
 * call runs over a dedicated pooled keep-alive agent (see ./providerHttp)
 * so repeated AI calls on the same origin reuse one TLS connection instead
 * of paying DNS+TCP+TLS every time. Credential isolation is preserved:
 * agents carry no headers; each request sends its own tenant-scoped
 * Authorization header over a connection that serves at most one request at
 * a time (HTTP/1.1).
 */
async function fetchWithDeadline(fetchImpl, url, options, timeoutMs, externalSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(Object.assign(new Error(`AI provider timeout (${timeoutMs}ms)`), { name: 'TimeoutError', code: 'AI_PROVIDER_TIMEOUT' }));
    }, timeoutMs);
    const abort = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
        if (externalSignal.aborted) abort();
        else externalSignal.addEventListener('abort', abort, { once: true });
    }
    try {
        return await fetchImpl(url, withPooledAgent(fetchImpl, url, { ...options, signal: controller.signal }));
    } catch (err) {
        if (timedOut && !externalSignal?.aborted) {
            throw Object.assign(new Error(`AI provider timed out (${timeoutMs}ms)`), { status: 504, code: 'AI_PROVIDER_TIMEOUT' });
        }
        throw err;
    } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener('abort', abort);
    }
}

function parseRetryAfterMs(headers, fallbackMs = 0) {
    if (!headers) return fallbackMs;
    const value = typeof headers.get === 'function' ? headers.get('retry-after') : (headers['retry-after'] || null);
    if (value === null || value === undefined) return fallbackMs;
    const seconds = Number(String(value).trim());
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10 * 60 * 1000);
    // HTTP-date form
    const dateMs = Date.parse(String(value));
    if (Number.isFinite(dateMs)) return Math.max(0, Math.min(dateMs - Date.now(), 10 * 60 * 1000));
    return fallbackMs;
}

module.exports = { fetchWithDeadline, parseRetryAfterMs };
