'use strict';

/**
 * Runtime model health — strictly TENANT-SCOPED.
 *
 * The same (provider, model) pair can behave very differently per tenant
 * because each tenant's BYOK account has its own quotas, rate limits, and
 * permissions. Therefore every health bucket is keyed by
 * `tenantId|provider|model` (tenantId null = platform scope) and one tenant's
 * rate limits/failures can never cool down another tenant's independent
 * account.
 *
 * The ONLY global health signal is provider ENDPOINT reachability (network
 * level), which is tracked by the discovery service, not here.
 *
 * Adaptivity is bounded and decaying:
 *   - events expire after eventTtlMs (one failure is forgotten, ~30 min)
 *   - 429 -> rate-limit cooldown honoring Retry-After (capped 10 min)
 *   - model_not_found -> model-unavailable block (30 min, until catalog refresh)
 *   - N consecutive hard failures -> exponential backoff cooldown (1m base,
 *     2x, capped 10 min); any success resets the chain
 *   - bounded memory: per-key event ring + LRU across keys
 */

const DEFAULTS = Object.freeze({
    eventTtlMs: 30 * 60 * 1000,
    maxEventsPerKey: 64,
    maxKeys: 8192,
    rateLimitDefaultMs: 60 * 1000,
    rateLimitCapMs: 10 * 60 * 1000,
    consecutiveFailureThreshold: 3,
    backoffBaseMs: 60 * 1000,
    backoffCapMs: 10 * 60 * 1000,
    modelUnavailableTtlMs: 30 * 60 * 1000,
});

class HealthStore {
    constructor(options = {}) {
        this.opts = { ...DEFAULTS, ...options };
        this.now = options.now || (() => Date.now());
        this.entries = new Map();
    }

    keyFor(tenantId, provider, model) {
        return `${tenantId || 'platform'}|${provider}|${model}`;
    }

    /**
     * Record one routing outcome.
     *   ok: boolean
     *   errorClass: 'timeout'|'rate_limited'|'credential'|'model_not_found'|
     *               'server'|'network'|'invalid_response'|'empty_response'|'bad_request'|'provider_error'
     *   retryAfterMs: number (rate limits)
     *   modelNotFound: boolean — provider explicitly rejected the model
     *               (404 / deprecated / retired): hard-block the model for
     *               this tenant until the catalog refreshes or the block expires
     */
    record({ tenantId, provider, model, ok, latencyMs = null, errorClass = null, retryAfterMs = null, modelNotFound = false, nowMs = null }) {
        const now = nowMs ?? this.now();
        const key = this.keyFor(tenantId, provider, model);
        let entry = this.entries.get(key);
        if (!entry) {
            entry = {
                events: [],
                rateLimitedUntil: 0,
                modelUnavailableUntil: 0,
                consecutiveFailures: 0,
                lastFailureAt: 0,
                insertedAt: now,
            };
            this.entries.set(key, entry);
            // Bounded memory: evict the least-recently-updated key.
            while (this.entries.size > this.opts.maxKeys) {
                let oldestKey = null;
                let oldestAt = Infinity;
                for (const [k, e] of this.entries) {
                    if (e.insertedAt < oldestAt) { oldestAt = e.insertedAt; oldestKey = k; }
                }
                if (!oldestKey) break;
                this.entries.delete(oldestKey);
            }
        } else {
            entry.insertedAt = now;
        }

        if (ok) {
            entry.consecutiveFailures = 0;
            entry.lastFailureAt = 0;
            entry.events.push({ ts: now, ok: true, latencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null });
        } else {
            entry.consecutiveFailures += 1;
            entry.lastFailureAt = now;
            entry.events.push({
                ts: now,
                ok: false,
                latencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
                errorClass: errorClass || 'provider_error',
            });
            if (errorClass === 'rate_limited') {
                const delay = Math.min(Math.max(Number(retryAfterMs) || this.opts.rateLimitDefaultMs, 1000), this.opts.rateLimitCapMs);
                entry.rateLimitedUntil = Math.max(entry.rateLimitedUntil, now + delay);
            }
            if (errorClass === 'model_not_found' || modelNotFound) {
                entry.modelUnavailableUntil = Math.max(entry.modelUnavailableUntil, now + this.opts.modelUnavailableTtlMs);
            }
        }
        // Bounded per-key events.
        while (entry.events.length > this.opts.maxEventsPerKey) entry.events.shift();
        return entry;
    }

    /**
     * Rolling, decayed stats for one tenant/provider/model.
     * Returns null when there is no (or fully expired) data.
     */
    stats({ tenantId, provider, model }, nowMs = null) {
        const now = nowMs ?? this.now();
        const entry = this.entries.get(this.keyFor(tenantId, provider, model));
        if (!entry) return null;

        const ttl = this.opts.eventTtlMs;
        const events = entry.events.filter(e => now - e.ts <= ttl);
        const cooldownUntil = this.cooldownUntil(entry, now);
        const rateLimited = entry.rateLimitedUntil > now;
        const modelUnavailable = entry.modelUnavailableUntil > now;
        if (events.length === 0 && !rateLimited && !modelUnavailable && cooldownUntil <= now) return null;

        const successes = events.filter(e => e.ok).length;
        const latencies = events.map(e => e.latencyMs).filter(v => v !== null).sort((a, b) => a - b);
        const percentile = (p) => {
            if (!latencies.length) return null;
            const index = Math.min(latencies.length - 1, Math.floor(p * latencies.length));
            return latencies[index];
        };
        // Consecutive failures counted from the most recent event backwards.
        let consecutive = 0;
        for (let i = events.length - 1; i >= 0; i -= 1) {
            if (!events[i].ok) consecutive += 1;
            else break;
        }
        return {
            sampleSize: events.length,
            successRate: events.length ? successes / events.length : null,
            p50LatencyMs: percentile(0.5),
            p95LatencyMs: percentile(0.95),
            consecutiveFailures: consecutive,
            rateLimitedUntil: entry.rateLimitedUntil,
            modelUnavailableUntil: entry.modelUnavailableUntil,
            cooldownUntil,
            lastErrorClass: events.length ? (events[events.length - 1].ok ? null : events[events.length - 1].errorClass) : null,
            lastEventAt: events.length ? events[events.length - 1].ts : null,
        };
    }

    /** Exponential backoff after consecutive hard failures; resets on success. */
    cooldownUntil(entry, now) {
        if (entry.consecutiveFailures < this.opts.consecutiveFailureThreshold || !entry.lastFailureAt) return 0;
        const exponent = Math.min(entry.consecutiveFailures - this.opts.consecutiveFailureThreshold + 1, 10);
        const delay = Math.min(this.opts.backoffCapMs, this.opts.backoffBaseMs * 2 ** (exponent - 1));
        return entry.lastFailureAt + delay;
    }

    /** True when the model should be skipped right now (any active cooldown). */
    inCooldown(stats, nowMs = null) {
        if (!stats) return false;
        const now = nowMs ?? this.now();
        return stats.rateLimitedUntil > now
            || stats.modelUnavailableUntil > now
            || stats.cooldownUntil > now;
    }

    cooldownKind(stats, nowMs = null) {
        if (!stats) return null;
        const now = nowMs ?? this.now();
        if (stats.modelUnavailableUntil > now) return 'model-unavailable';
        if (stats.rateLimitedUntil > now) return 'rate-limited';
        if (stats.cooldownUntil > now) return 'failure-backoff';
        return null;
    }

    /** Observability snapshot for ONE tenant (tenant-scoped API). */
    tenantSnapshot(tenantId) {
        const prefix = `${tenantId || 'platform'}|`;
        const out = [];
        for (const [key, entry] of this.entries) {
            if (!key.startsWith(prefix)) continue;
            const [, provider, model] = key.split('|');
            const stats = this.stats({ tenantId, provider, model });
            if (stats) out.push({ provider, model, ...stats });
        }
        return out;
    }

    clearTenant(tenantId) {
        const prefix = `${tenantId || 'platform'}|`;
        for (const key of [...this.entries.keys()]) {
            if (key.startsWith(prefix)) this.entries.delete(key);
        }
    }

    clearAll() {
        this.entries.clear();
    }
}

module.exports = { HealthStore, DEFAULTS };
