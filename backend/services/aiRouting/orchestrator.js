'use strict';

/**
 * AI request orchestration: requirement analysis -> model selection ->
 * execution with SAME-TENANT compatible fallback -> health recording ->
 * safe telemetry.
 *
 * Guarantees:
 *  - Credentials are resolved ONLY from the tenant-scoped configuration the
 *    caller passes (applyTenantAiPolicy output). The router never stores or
 *    looks up credentials itself; fallback never crosses tenant boundaries
 *    because candidates are built exclusively from the caller's configuration.
 *  - Fallback candidates are re-validated against the SAME requirement
 *    profile (capability/eligibility), never arbitrary models.
 *  - The orchestrator produces NO content of its own: when every candidate
 *    fails it throws the existing provider-error contract and upstream code
 *    applies its source-preserving / explicit-unavailable fallbacks.
 *  - Cancellation (external signal) is honored at every hop.
 */

const { getAdapter, ProviderRequestError, extractProviderErrorMessage } = require('./providerAdapters');
const { deriveRequirementProfile } = require('./requirementProfiles');
const { selectModels, computeProviderOrder } = require('./modelSelector');
const { fetchWithDeadline, parseRetryAfterMs } = require('./httpDeadline');

// Operations where the existing runtime retried transient errors up to 3x.
const LATENCY_CRITICAL_OPERATIONS = new Set([
    'autocomplete', 'generate-interview', 'live-interview-turn', 'live-interview-open', 'live-interview-report',
]);

const NETWORK_ERROR_PATTERN = /ECONNRESET|ETIMEDOUT|fetch failed|Inference connection error|connection error|socket hang up|network|ENOTFOUND|EAI_AGAIN/i;

function classifyProviderError({ status, message = '' }) {
    const text = String(message);
    if (status === 429 || /rate.?limit|too many requests|Worker local total request limit|quota exceeded/i.test(text)) return 'rate_limited';
    if (status === 401 || status === 403) return 'credential';
    if (status === 404
        || /model_not_found|model not found|not found for account|invalid.?model|no such model|end of life|no longer available|deprecated|retired/i.test(text)) {
        return 'model_not_found';
    }
    if (status === 504 || /timed out|timeout/i.test(text)) return 'timeout';
    if (status >= 500) return 'server';
    if (status === 400) return 'bad_request';
    if (NETWORK_ERROR_PATTERN.test(text)) return 'network';
    return 'provider_error';
}

function classifyThrownError(error) {
    if (!error) return { errorClass: 'provider_error', status: 0 };
    if (error instanceof ProviderRequestError) return { errorClass: error.errorClass, status: error.status || 0 };
    if (error.name === 'TimeoutError' || error.code === 'AI_PROVIDER_TIMEOUT') return { errorClass: 'timeout', status: 504 };
    if (error.name === 'AbortError') return { errorClass: 'aborted', status: 0 };
    const message = String(error.message || '');
    const status = Number(error.status) || 0;
    if (status) return { errorClass: classifyProviderError({ status, message }), status };
    if (NETWORK_ERROR_PATTERN.test(message)) return { errorClass: 'network', status: 0 };
    return { errorClass: 'provider_error', status: 0 };
}

const RETRYABLE_CLASSES = new Set(['server', 'network', 'rate_limited']);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class AiModelRouter {
    constructor({
        now,
        discovery = null,
        health = null,
        telemetry = null,
        autoDiscovery = false,
        discoveryTimeoutMs = 15000,
        maxStalenessMs = 6 * 60 * 60 * 1000,
        log = () => {},
    } = {}) {
        this.now = typeof now === 'function' ? now : () => Date.now();
        this.discovery = discovery;
        this.health = health;
        this.telemetry = telemetry;
        this.autoDiscovery = autoDiscovery;
        this.discoveryTimeoutMs = discoveryTimeoutMs;
        this.maxStalenessMs = maxStalenessMs;
        this.log = log;
    }

    reset() {
        this.discovery?.clearAll?.();
        this.health?.clearAll?.();
        this.telemetry?.clear?.();
    }

    /**
     * Route one AI request.
     *   configuration — tenant-applied provider configuration (keys already
     *                    tenant-scoped by applyTenantAiPolicy / operator env)
     *   operation     — product operation name (drives the requirement profile)
     *   prompt        — fully built prompt (context size estimated from it)
     * Returns { raw, provider, model, usage, routing } or throws the
     * existing AI_PROVIDER_UNAVAILABLE / AI_PROVIDER_ERROR contract.
     */
    async route({ prompt, configuration, operation, fetchImpl, signal, timeoutMs, payload }) {
        const now = this.now();
        const requirement = deriveRequirementProfile({ operation, prompt, payload });
        const tenantId = configuration?.tenantId || null;
        const providerIds = computeProviderOrder(configuration);

        if (!providerIds.length) {
            const error = Object.assign(new Error('No AI provider is configured'), { code: 'AI_PROVIDER_UNAVAILABLE', status: 503 });
            this.telemetry?.record({
                ts: now, tenantId, operation, outcome: 'failure', errorCode: 'AI_PROVIDER_UNAVAILABLE',
                errorClass: 'no-provider', candidatesConsidered: 0, candidatesRejected: 0,
            });
            throw error;
        }

        // 1. Routing state: cached catalog + tenant access (no network here).
        const catalog = new Map();
        const tenantAccess = new Map();
        const discoveryEnabled = this.autoDiscovery && this.discovery && configuration?.discoveryEnabled === true;
        if (discoveryEnabled) {
            for (const provider of providerIds) {
                const providerConfig = configuration.providers[provider];
                if (!providerConfig?.enabled) continue;
                const state = this.discovery.getCachedState(provider, tenantId, now);
                if (state.catalog) catalog.set(provider, state.catalog);
                if (state.tenantAccess) tenantAccess.set(provider, state.tenantAccess);
                // Refresh asynchronously; the current request uses cached state.
                const adapter = getAdapter(provider);
                if (adapter) {
                    this.discovery.scheduleRefresh({
                        providerId: provider,
                        providerConfig,
                        tenantId,
                        adapter,
                        timeoutMs: this.discoveryTimeoutMs,
                    }).catch(() => {});
                }
            }
        }

        // 2. Selection (fast, in-memory).
        const seedModels = new Map();
        for (const provider of providerIds) {
            const adapter = getAdapter(provider);
            if (adapter?.defaultModel) seedModels.set(provider, adapter.defaultModel);
        }
        const decision = selectModels({
            configuration,
            requirement,
            catalog,
            tenantAccess,
            health: this.health,
            seedModels,
            isProviderUnreachable: (provider) => Boolean(this.discovery?.isProviderUnreachable?.(provider, this.now())),
            primaryModelPolicy: configuration?.tenantPolicy?.primaryModel || null,
            now,
        });

        if (!decision.selection) {
            this.telemetry?.record({
                ts: now, tenantId, operation, outcome: 'failure',
                errorCode: 'AI_PROVIDER_UNAVAILABLE', errorClass: 'no-eligible-model',
                candidatesConsidered: decision.candidates.length, candidatesRejected: decision.rejectedCount,
                selectionLatencyMs: decision.selectionLatencyMs,
                rejectionSummary: decision.rationale,
            });
            const error = Object.assign(new Error('No AI provider is configured'), { code: 'AI_PROVIDER_UNAVAILABLE', status: 503 });
            error.routing = this.routingSummary(decision, { fallbackCount: -1, attempts: 0 });
            throw error;
        }

        // 3. Execute candidates in ranked order (same tenant only).
        const failures = [];
        let totalAttempts = 0;
        let lastError = null;
        let lastCandidate = null;

        for (let index = 0; index < decision.order.length; index += 1) {
            const candidate = decision.order[index];
            const provider = candidate.provider;
            const model = candidate.model;
            lastCandidate = candidate;
            const providerConfig = configuration.providers[provider];
            const adapter = getAdapter(provider);
            if (!adapter) {
                failures.push({ provider, model, status: 0, code: 'NO_PROVIDER_ADAPTER', message: `No adapter registered for provider ${provider}` });
                continue;
            }

            const generation = {
                temperature: operation === 'autocomplete' ? 0.1 : configuration.temperature,
                maxTokens: operation === 'autocomplete' ? 180 : configuration.maxTokens,
            };
            const effectiveTimeout = timeoutMs
                || (operation === 'live-interview-report' ? 120000 : (/^live-interview|generate-interview/.test(String(operation || '')) ? 75000 : 45000));
            const attempts = LATENCY_CRITICAL_OPERATIONS.has(operation) ? 3 : 1;
            const callFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch;

            let executed = false;
            for (let attempt = 1; attempt <= attempts && !executed; attempt += 1) {
                totalAttempts += 1;
                const attemptStart = this.now();
                let request;
                try {
                    request = adapter.buildChatRequest({
                        providerConfig, model, prompt,
                        temperature: generation.temperature,
                        maxTokens: generation.maxTokens,
                    });
                } catch (err) {
                    failures.push({ provider, model, status: 0, code: 'ADAPTER_ERROR', message: String(err?.message || err) });
                    break;
                }

                try {
                    const response = await fetchWithDeadline(callFetch, request.url, {
                        method: request.method,
                        headers: request.headers,
                        body: request.body,
                    }, effectiveTimeout, signal);

                    const retryAfterMs = parseRetryAfterMs(response.headers, 0);
                    let body = null;
                    try {
                        body = await response.json();
                    } catch {
                        body = null;
                    }

                    if (!response.ok) {
                        const message = extractProviderErrorMessage(body, response.status, adapter.name);
                        // classifyProviderError returns the class string directly.
                        const errorClass = classifyProviderError({ status: response.status, message });
                        this.health?.record({
                            tenantId, provider, model, ok: false,
                            latencyMs: this.now() - attemptStart, errorClass, retryAfterMs,
                        });
                        if (errorClass === 'credential') {
                            // Tenant credential was rejected: tell discovery so
                            // discovery-only models stop being proposed for THIS tenant.
                            this.discovery?.setTenantAccess?.(tenantId, provider, {
                                ...this.discovery.getCachedState(provider, tenantId, this.now()).tenantAccess,
                                modelIds: null,
                                fetchedAt: this.now(),
                                credentialOk: 'rejected',
                                lastError: 'credential-rejected-at-execution',
                            });
                        }
                        if (RETRYABLE_CLASSES.has(errorClass) && attempt < attempts && !signal?.aborted) {
                            const backoffMs = Math.min(5000, (1 + attempt) * 1500);
                            this.log(`[aiRouting] retry ${provider}/${model} attempt ${attempt + 1}/${attempts} after ${errorClass} in ${backoffMs}ms`);
                            await sleep(backoffMs);
                            continue;
                        }
                        const err = Object.assign(new Error(message), {
                            status: response.status,
                            code: errorClass === 'credential' ? 'AI_PROVIDER_AUTHENTICATION_FAILED'
                                : errorClass === 'timeout' ? 'AI_PROVIDER_TIMEOUT'
                                    : 'PROVIDER_ERROR',
                            errorClass,
                            retryAfterMs,
                        });
                        lastError = err;
                        break;
                    }

                    let result;
                    try {
                        result = adapter.extractChatResponse(body, response.status);
                    } catch (adapterErr) {
                        const { errorClass } = { errorClass: adapterErr.errorClass || 'invalid_response' };
                        this.health?.record({
                            tenantId, provider, model, ok: false,
                            latencyMs: this.now() - attemptStart, errorClass,
                        });
                        if (attempt < attempts && !signal?.aborted) {
                            const backoffMs = Math.min(5000, (1 + attempt) * 1500);
                            await sleep(backoffMs);
                            continue;
                        }
                        lastError = adapterErr;
                        break;
                    }

                    const latencyMs = this.now() - attemptStart;
                    this.health?.record({ tenantId, provider, model, ok: true, latencyMs });
                    const selected = decision.selection;
                    this.telemetry?.record({
                        ts: this.now(), tenantId, operation,
                        selectedProvider: selected.provider, selectedModel: selected.model,
                        fallbackProvider: provider === selected.provider ? null : selected.provider,
                        fallbackModel: model === selected.model ? null : selected.model,
                        outcome: 'success',
                        fallbackCount: index,
                        attempts: totalAttempts,
                        selectionLatencyMs: decision.selectionLatencyMs,
                        executionLatencyMs: latencyMs,
                        candidatesConsidered: decision.candidates.length,
                        candidatesRejected: decision.rejectedCount,
                        lastResort: decision.lastResort,
                        decisionId: decision.decisionId,
                        selectionReasons: decision.candidates.find(c => c.eligible && c.provider === provider && c.model === model)?.reasons,
                    });
                    return {
                        raw: result.content,
                        provider,
                        model,
                        usage: result.usage,
                        routing: this.routingSummary(decision, {
                            fallbackCount: index,
                            attempts: totalAttempts,
                            executionLatencyMs: latencyMs,
                            executedCandidate: candidate,
                        }),
                    };
                } catch (err) {
                    if (signal?.aborted) {
                        this.telemetry?.record({
                            ts: this.now(), tenantId, operation, outcome: 'aborted',
                            selectedProvider: provider, selectedModel: model,
                            fallbackCount: index, attempts: totalAttempts,
                            selectionLatencyMs: decision.selectionLatencyMs,
                            decisionId: decision.decisionId,
                        });
                        throw err;
                    }
                    const { errorClass, status } = classifyThrownError(err);
                    this.health?.record({
                        tenantId, provider, model, ok: false,
                        latencyMs: this.now() - attemptStart, errorClass,
                        modelNotFound: errorClass === 'model_not_found',
                    });
                    const retryable = RETRYABLE_CLASSES.has(errorClass) && errorClass !== 'timeout' && !(err?.code === 'AI_PROVIDER_TIMEOUT') && status !== 504;
                    lastError = err;
                    if (retryable && attempt < attempts && !signal?.aborted) {
                        const backoffMs = Math.min(5000, (1 + attempt) * 1500);
                        this.log(`[aiRouting] retry ${provider}/${model} attempt ${attempt + 1}/${attempts} after ${errorClass} in ${backoffMs}ms`);
                        await sleep(backoffMs);
                        continue;
                    }
                    break;
                }
            }

            const finalClass = classifyThrownError(lastError).errorClass;
            failures.push({
                provider,
                model,
                status: Number(lastError?.status) || 0,
                code: lastError?.code || 'PROVIDER_ERROR',
                errorClass: finalClass,
                message: String(lastError?.message || 'provider failed').slice(0, 500),
            });
        }

        const finalClass = classifyThrownError(lastError).errorClass;
        this.telemetry?.record({
            ts: this.now(), tenantId, operation,
            selectedProvider: lastCandidate?.provider || null, selectedModel: lastCandidate?.model || null,
            // Request-level outcome code (per-hop codes stay on the thrown
            // error's failures[] array, the audit surface for details).
            outcome: 'failure', errorClass: finalClass, errorCode: 'AI_PROVIDER_ERROR',
            fallbackCount: decision.order.length - 1,
            attempts: totalAttempts,
            selectionLatencyMs: decision.selectionLatencyMs,
            candidatesConsidered: decision.candidates.length,
            candidatesRejected: decision.rejectedCount,
            lastResort: decision.lastResort,
            decisionId: decision.decisionId,
            rejectionSummary: decision.rationale,
        });
        const error = Object.assign(new Error('All configured AI providers failed'), {
            code: 'AI_PROVIDER_ERROR',
            status: 502,
            operation,
        });
        error.failures = failures;
        error.errorClass = finalClass;
        error.routing = this.routingSummary(decision, { fallbackCount: decision.order.length - 1, attempts: totalAttempts });
        throw error;
    }

    routingSummary(decision, { fallbackCount, attempts, executionLatencyMs = null, executedCandidate = null } = {}) {
        return {
            decisionId: decision.decisionId,
            selectedProvider: decision.selection?.provider || null,
            selectedModel: decision.selection?.model || null,
            executedProvider: executedCandidate?.provider || null,
            executedModel: executedCandidate?.model || null,
            fallbackCount: Math.max(0, fallbackCount),
            attempts,
            selectionLatencyMs: decision.selectionLatencyMs,
            executionLatencyMs,
            candidatesConsidered: decision.candidates.length,
            candidatesRejected: decision.rejectedCount,
            lastResort: decision.lastResort,
            rationale: decision.rationale,
        };
    }
}

module.exports = { AiModelRouter, classifyProviderError, classifyThrownError, LATENCY_CRITICAL_OPERATIONS };
