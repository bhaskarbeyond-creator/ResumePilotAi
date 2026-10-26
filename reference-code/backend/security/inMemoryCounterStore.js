'use strict';
/**
 * In-memory counter store for non-production/local-E2E use.
 *
 * Mirrors the contract of MySqlAtomicCounterStore.increment(key, { ttlMs })
 * returning { count, expiresAt }. Used automatically by security/abuse.js when
 * DEGRADED_MODE_REPOSITORY=inmemory (set by repositories/index.js during
 * startup when MySQL is unreachable in a non-production environment).
 *
 * NOT for production: in-memory counters are process-local and reset on
 * restart. Production uses the MariaDB-backed store for cross-instance rate
 * limiting.
 */
class InMemoryCounterStore {
    constructor() {
        this._counters = new Map();
        // Periodic cleanup to prevent unbounded growth
        this._sweep = setInterval(() => this._gc(), 60_000).unref?.();
    }

    _gc() {
        const now = Date.now();
        for (const [k, v] of this._counters) if (v.expiresAt <= now) this._counters.delete(k);
    }

    async increment(key, { ttlMs } = {}) {
        const now = Date.now();
        const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : 60_000;
        const existing = this._counters.get(key);
        let entry;
        if (!existing || existing.expiresAt <= now) {
            entry = { count: 1, expiresAt: now + ttl };
        } else {
            entry = { count: existing.count + 1, expiresAt: existing.expiresAt };
        }
        this._counters.set(key, entry);
        return { count: entry.count, expiresAt: entry.expiresAt };
    }

    async reset(key) {
        this._counters.delete(key);
        return true;
    }
}

module.exports = { InMemoryCounterStore };
