'use strict';

/**
 * Model discovery with strict scope separation:
 *
 *  GLOBAL / SAFE  — provider model catalog: public, model-scoped metadata
 *                   (model id, context window, modalities, pricing...). No
 *                   credentials are ever stored here. Shared across tenants
 *                   because a model's public metadata does not change per key.
 *
 *  TENANT-SCOPED  — tenant model ACCESS: which model identifiers the TENANT'S
 *                   own credential was actually allowed to see. Authenticated
 *                   discovery is always performed with the tenant's BYOK
 *                   credential, never a global one.
 *
 * Failure handling (degrade, never fabricate):
 *   - live failure (timeout/network)  -> keep last-known catalog/access (stale)
 *   - credential rejected (401/403)   -> tenant access marked unverified; only
 *                                        operator-configured models stay eligible
 *   - rate limited (429)              -> keep last-known, back off refresh
 *   - malformed response              -> keep last-known, log
 *   - beyond maxStalenessMs           -> state no longer authoritative:
 *                                        catalog-only models are dropped,
 *                                        configured models remain (unproven
 *                                        unavailable).
 *
 * Refresh is deduped and asynchronous (fire-and-forget) so user requests are
 * never blocked on discovery; selection always runs against cached state.
 */

const { normalizeModelCapabilities, isValidModelId } = require('./capabilityModel');
const { fetchWithDeadline } = require('./httpDeadline');

const SECRET_VALUE_PATTERN = /\bsk-[A-Za-z0-9_-]{12,}\b|\bgsk_[A-Za-z0-9]{12,}\b|\bAIza[0-9A-Za-z_-]{20,}\b|\bnvapi-[A-Za-z0-9._-]{12,}\b/i;

const DEFAULTS = Object.freeze({
    catalogTtlMs: 15 * 60 * 1000,        // catalog considered fresh
    accessTtlMs: 15 * 60 * 1000,         // tenant access considered fresh
    maxStalenessMs: 6 * 60 * 60 * 1000,  // beyond this, state is not authoritative
    refreshMinIntervalMs: 60 * 1000,     // never hammer a provider
    rateLimitBackoffMs: 5 * 60 * 1000,
    discoveryTimeoutMs: 15 * 1000,
    maxModelsPerProvider: 4000,
    maxCatalogProviders: 128,
    maxTenantAccesses: 8192,
});

class LruMap {
    constructor(limit) {
        this.limit = Math.max(8, limit);
        this.map = new Map();
    }
    get(key) {
        if (!this.map.has(key)) return undefined;
        const value = this.map.get(key);
        this.map.delete(key);
        this.map.set(key, value);
        return value;
    }
    set(key, value) {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, value);
        while (this.map.size > this.limit) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
    }
    delete(key) {
        this.map.delete(key);
    }
    has(key) {
        return this.map.has(key);
    }
    get size() {
        return this.map.size;
    }
    clear() {
        this.map.clear();
    }
    values() {
        return this.map.values();
    }
    entries() {
        return this.map.entries();
    }
}

class DiscoveryService {
    constructor(options = {}) {
        this.opts = { ...DEFAULTS, ...options };
        this.now = options.now || (() => Date.now());
        this.log = options.log || (() => {});
        // GLOBAL: providerId -> { models: Map<modelId, capabilities>, fetchedAt, lastError }
        this.catalogs = new LruMap(this.opts.maxCatalogProviders);
        // TENANT-SCOPED: `${tenantId}|${providerId}` -> { modelIds: Set|null, fetchedAt, credentialOk: 'verified'|'rejected'|null, lastError }
        this.tenantAccess = new LruMap(this.opts.maxTenantAccesses);
        // GLOBAL, network-level only (endpoint reachability — NOT credential health):
        // providerId -> { unreachableUntil }
        this.providerReachability = new Map();
        this.inFlight = new Map(); // `${tenantId}|${providerId}` -> Promise
    }

    /** Synchronous cached state for selection (never performs network I/O). */
    getCachedState(providerId, tenantId = null, nowMs = null) {
        const now = nowMs ?? this.now();
        const catalog = this.catalogs.get(providerId) || null;
        const access = this.tenantAccess.get(this.accessKey(tenantId, providerId)) || null;
        const catalogFresh = catalog && (now - catalog.fetchedAt) <= this.opts.catalogTtlMs;
        const catalogAuthoritative = catalog && (now - catalog.fetchedAt) <= this.opts.maxStalenessMs;
        const accessFresh = access && (now - access.fetchedAt) <= this.opts.accessTtlMs;
        return {
            catalog: catalog ? { models: catalog.models, fetchedAt: catalog.fetchedAt, fresh: Boolean(catalogFresh), authoritative: Boolean(catalogAuthoritative) } : null,
            tenantAccess: access ? { modelIds: access.modelIds, fetchedAt: access.fetchedAt, credentialOk: access.credentialOk, fresh: Boolean(accessFresh) } : null,
        };
    }

    isProviderUnreachable(providerId, nowMs = null) {
        const now = nowMs ?? this.now();
        const state = this.providerReachability.get(providerId);
        return Boolean(state && state.unreachableUntil > now);
    }

    recordProviderNetworkFailure(providerId, nowMs = null) {
        const now = nowMs ?? this.now();
        // An endpoint-level network failure is provider-global (not per-credential):
        // the same unreachable endpoint affects every tenant equally.
        const state = this.providerReachability.get(providerId) || { unreachableUntil: 0 };
        state.unreachableUntil = Math.max(state.unreachableUntil, now + 30 * 1000);
        this.providerReachability.set(providerId, state);
    }

    recordProviderReachable(providerId) {
        this.providerReachability.delete(providerId);
    }

    /**
     * Deduped, async discovery refresh for one tenant/provider pair. Returns a
     * Promise that always resolves (errors are captured in state, not thrown).
     * Uses the TENANT's credential for authenticated discovery.
     */
    scheduleRefresh({ providerId, providerConfig, tenantId = null, adapter, fetchImpl = null, force = false, timeoutMs = null }) {
        const now = this.now();
        const key = this.accessKey(tenantId, providerId);
        if (!adapter) return Promise.resolve({ source: 'none', error: 'no-adapter' });
        if (!providerConfig?.key) {
            return Promise.resolve({ source: 'none', error: 'no-credential', credential: 'unverified' });
        }
        const state = this.getCachedState(providerId, tenantId, now);
        const refreshNeeded = force
            || !state.tenantAccess
            || (this.now() - state.tenantAccess.fetchedAt) > this.opts.accessTtlMs
            || state.tenantAccess.credentialOk === 'rejected' && (this.now() - state.tenantAccess.fetchedAt) > this.opts.refreshMinIntervalMs;
        if (!refreshNeeded) return Promise.resolve({ source: 'cached' });
        if (this.inFlight.has(key)) return this.inFlight.get(key);

        const fetcher = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);
        if (!fetcher) return Promise.resolve({ source: 'none', error: 'fetch-unavailable' });

        const attempt = this.runDiscovery({ providerId, providerConfig, tenantId, adapter, fetchImpl: fetcher, timeoutMs: timeoutMs || this.opts.discoveryTimeoutMs })
            .catch(err => {
                this.log(`[aiRouting] discovery refresh failed for provider=${providerId} tenant=${tenantId || 'platform'}: ${err?.message || err}`);
                return { source: 'none', error: String(err?.code || 'discovery-failed') };
            })
            .finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, attempt);
        return attempt;
    }

    async runDiscovery({ providerId, providerConfig, tenantId, adapter, fetchImpl, timeoutMs }) {
        const now = this.now();
        let request;
        try {
            request = adapter.buildDiscoveryRequest({ providerConfig });
        } catch (err) {
            return { source: 'none', error: 'adapter-error' };
        }
        let response;
        try {
            response = await fetchWithDeadline(fetchImpl, request.url, { method: request.method, headers: request.headers }, timeoutMs);
        } catch (err) {
            const message = String(err?.message || '');
            if (err?.code === 'AI_PROVIDER_TIMEOUT' || /timed out|timeout/i.test(message)) {
                return { source: this.lastKnownSource(providerId, tenantId), error: 'timeout', credential: 'unverified' };
            }
            // Network-level failure: endpoint reachability is a safe global signal.
            this.recordProviderNetworkFailure(providerId, now);
            return { source: this.lastKnownSource(providerId, tenantId), error: 'network', credential: 'unverified' };
        }

        if (response.status === 401 || response.status === 403) {
            this.setTenantAccess(tenantId, providerId, { modelIds: null, fetchedAt: now, credentialOk: 'rejected', lastError: 'credential-rejected' });
            return { source: this.lastKnownSource(providerId, tenantId), error: 'credential-rejected', credential: 'rejected' };
        }
        if (response.status === 429) {
            this.setTenantAccess(tenantId, providerId, { ...this.tenantAccess.get(this.accessKey(tenantId, providerId)), fetchedAt: now, lastError: 'rate-limited' });
            return { source: this.lastKnownSource(providerId, tenantId), error: 'rate-limited', credential: 'unverified' };
        }
        if (!response.ok) {
            this.setTenantAccess(tenantId, providerId, { ...this.tenantAccess.get(this.accessKey(tenantId, providerId)), fetchedAt: now, lastError: `http-${response.status}` });
            return { source: this.lastKnownSource(providerId, tenantId), error: `http-${response.status}`, credential: 'unverified' };
        }

        let body;
        try {
            body = await response.json();
        } catch {
            // Malformed discovery response: keep last-known state, never crash.
            this.setTenantAccess(tenantId, providerId, { ...this.tenantAccess.get(this.accessKey(tenantId, providerId)), fetchedAt: now, lastError: 'malformed-response' });
            return { source: this.lastKnownSource(providerId, tenantId), error: 'malformed-response', credential: 'unverified' };
        }

        let entries;
        try {
            entries = adapter.normalizeDiscoveryResponse(body) || [];
        } catch {
            this.setTenantAccess(tenantId, providerId, { ...this.tenantAccess.get(this.accessKey(tenantId, providerId)), fetchedAt: now, lastError: 'malformed-response' });
            return { source: this.lastKnownSource(providerId, tenantId), error: 'malformed-response', credential: 'unverified' };
        }
        if (!Array.isArray(entries)) entries = [];

        // GLOBAL catalog: a successful refresh is an authoritative snapshot —
        // the provider's current model list replaces the previous one, so a
        // model the provider no longer serves is dynamically retired.
        // (No credentials are ever stored here.)
        const models = new Map();
        for (const entry of entries.slice(0, this.opts.maxModelsPerProvider)) {
            if (!entry || !isValidModelId(entry.modelId)) continue;
            const capabilities = normalizeModelCapabilities(entry.raw);
            models.set(entry.modelId, { ...capabilities, extra: capabilities.extra });
        }
        if (models.size === 0 && entries.length > 0) {
            // Every entry was invalid -> treat as malformed; keep last-known catalog.
            this.setTenantAccess(tenantId, providerId, { ...this.tenantAccess.get(this.accessKey(tenantId, providerId)), fetchedAt: now, lastError: 'malformed-response' });
            return { source: this.lastKnownSource(providerId, tenantId), error: 'malformed-response', credential: 'unverified' };
        }
        this.catalogs.set(providerId, { models, fetchedAt: now, lastError: null });

        // TENANT-SCOPED access: exactly the models this tenant's credential saw.
        this.setTenantAccess(tenantId, providerId, {
            modelIds: new Set(entries.map(e => e.modelId)),
            fetchedAt: now,
            credentialOk: 'verified',
            lastError: null,
        });
        this.recordProviderReachable(providerId);
        return { source: 'live', credential: 'verified', count: entries.length };
    }

    lastKnownSource(providerId, tenantId) {
        const state = this.getCachedState(providerId, tenantId, this.now());
        if (state.tenantAccess && (this.now() - state.tenantAccess.fetchedAt) <= this.opts.maxStalenessMs) return 'stale-cache';
        if (state.catalog && (this.now() - state.catalog.fetchedAt) <= this.opts.maxStalenessMs) return 'stale-cache';
        return 'none';
    }

    accessKey(tenantId, providerId) {
        return `${tenantId || 'platform'}|${providerId}`;
    }

    setTenantAccess(tenantId, providerId, value) {
        this.tenantAccess.set(this.accessKey(tenantId, providerId), value);
    }

    /** Observability snapshot (no secrets, no prompts, no PII). */
    stats() {
        const catalogStats = {};
        for (const [providerId, catalog] of this.catalogs.entries()) {
            catalogStats[providerId] = { modelCount: catalog.models.size, fetchedAt: catalog.fetchedAt, lastError: catalog.lastError };
        }
        const accessStats = [];
        for (const [key, access] of this.tenantAccess.entries()) {
            const [tenantId, providerId] = String(key).split('|');
            accessStats.push({
                tenantId: tenantId === 'platform' ? null : tenantId,
                providerId,
                modelCount: access.modelIds ? access.modelIds.size : null,
                credentialOk: access.credentialOk,
                fetchedAt: access.fetchedAt,
            });
        }
        return {
            catalogs: catalogStats,
            tenantAccesses: accessStats,
            unreachableProviders: [...this.providerReachability.keys()].filter(p => this.isProviderUnreachable(p)),
        };
    }

    clearAll() {
        this.catalogs.clear();
        this.tenantAccess.clear();
        this.providerReachability.clear();
        this.inFlight.clear();
    }
}

module.exports = { DiscoveryService, LruMap, DEFAULTS };
