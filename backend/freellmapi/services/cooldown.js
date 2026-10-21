'use strict';

/**
 * FreeLLMAPI In-Memory Cooldown & Backoff Manager
 *
 * Tracks rate-limited or temporarily degraded providers/models in RAM and, when
 * a durable store is attached, mirrors the expiry into `data/freellm_metrics.db`
 * so a Node restart does not re-hammer a provider that is still benched.
 *
 * Self-healing: cooldowns expire lazily or can be cleared on demand.
 */

class CooldownManager {
  constructor({ persistence = null, now = () => Date.now() } = {}) {
    this.cooldowns = new Map(); // key -> { expiresAt, reason, strikeCount, lastFailureAt }
    this.DEFAULT_COOLDOWN_MS = 60_000; // 1 minute
    this.MAX_COOLDOWN_MS = 300_000;    // 5 minutes max
    this.persistence = persistence;
    this.now = now;
  }

  /**
   * Attach a MetricsPersistence instance (or null to detach) and hydrate any
   * cooldown that is still active from the previous process.
   */
  attachPersistence(persistence) {
    this.persistence = persistence || null;
    if (!this.persistence) return { hydrated: 0 };
    let hydrated = 0;
    try {
      for (const row of this.persistence.loadCooldowns({ now: this.now() })) {
        const key = this._makeKey(row.provider, row.model);
        this.cooldowns.set(key, {
          provider: String(row.provider || '').toLowerCase(),
          model: String(row.model || ''),
          expiresAt: Number(row.expiresAt),
          reason: row.reason || 'Persisted cooldown',
          strikeCount: Number(row.strikes || 1),
          lastFailureAt: Number(row.updatedAt || this.now()),
          durationMs: Math.max(0, Number(row.expiresAt) - Number(row.updatedAt || this.now())),
        });
        hydrated += 1;
      }
    } catch {
      // Hydration is best-effort: never block startup on a corrupt metrics DB.
    }
    return { hydrated };
  }

  _persist(fn) {
    if (!this.persistence) return;
    try { fn(this.persistence); } catch { /* persistence must never break routing */ }
  }

  _makeKey(provider, model) {
    const p = String(provider || '').toLowerCase().trim();
    const m = String(model || '').toLowerCase().trim();
    return m ? `${p}:${m}` : p;
  }

  isOnCooldown(provider, model) {
    const specificKey = this._makeKey(provider, model);
    const providerKey = this._makeKey(provider, '');

    const now = this.now();
    for (const key of [specificKey, providerKey]) {
      const entry = this.cooldowns.get(key);
      if (entry) {
        if (entry.expiresAt > now) {
          return { onCooldown: true, remainingMs: entry.expiresAt - now, reason: entry.reason };
        }
        // Expired -> lazy cleanup
        this.cooldowns.delete(key);
        this._persist(store => store.clearCooldown({ provider, model: key === providerKey ? '' : model }));
      }
    }

    return { onCooldown: false, remainingMs: 0, reason: null };
  }

  setCooldown(provider, model, reason = 'Rate limit or temporary provider degradation') {
    const key = this._makeKey(provider, model);
    const existing = this.cooldowns.get(key);

    const now = this.now();
    let strikeCount = 1;
    let durationMs = this.DEFAULT_COOLDOWN_MS;

    if (existing && (now - existing.lastFailureAt) < (this.MAX_COOLDOWN_MS * 2)) {
      strikeCount = (existing.strikeCount || 1) + 1;
      durationMs = Math.min(this.MAX_COOLDOWN_MS, this.DEFAULT_COOLDOWN_MS * Math.pow(2, strikeCount - 1));
    }

    const expiresAt = now + durationMs;
    this.cooldowns.set(key, {
      provider: String(provider).toLowerCase(),
      model: String(model || ''),
      expiresAt,
      reason,
      strikeCount,
      lastFailureAt: now,
      durationMs,
    });

    this._persist(store => store.recordCooldown({
      provider,
      model: String(model || ''),
      expiresAt,
      reason,
      strikes: strikeCount,
      at: now,
    }));

    return { expiresAt, durationMs, strikeCount };
  }

  clearCooldown(provider, model) {
    const specificKey = this._makeKey(provider, model);
    const providerKey = this._makeKey(provider, '');
    this.cooldowns.delete(specificKey);
    this.cooldowns.delete(providerKey);
    this._persist(store => {
      store.clearCooldown({ provider, model: String(model || '') });
      if (providerKey !== specificKey) store.clearCooldown({ provider, model: '' });
    });
  }

  resetAll() {
    this.cooldowns.clear();
    this._persist(store => store.clearAllCooldowns());
  }

  cleanExpired() {
    const now = this.now();
    for (const [key, entry] of this.cooldowns.entries()) {
      if (entry.expiresAt <= now) {
        this.cooldowns.delete(key);
        this._persist(store => store.clearCooldown({ provider: entry.provider, model: entry.model }));
      }
    }
  }

  /** Could this provider serve a request right now? Used by the search chain too. */
  hasAvailableProvider(providers) {
    return (providers || []).some(provider => !this.isOnCooldown(provider).onCooldown);
  }

  getStatus() {
    const now = this.now();
    const active = [];
    for (const [key, entry] of this.cooldowns.entries()) {
      if (entry.expiresAt > now) {
        active.push({
          key,
          provider: entry.provider,
          model: entry.model,
          remainingSeconds: Math.ceil((entry.expiresAt - now) / 1000),
          reason: entry.reason,
          strikeCount: entry.strikeCount,
        });
      } else {
        this.cooldowns.delete(key);
        this._persist(store => store.clearCooldown({ provider: entry.provider, model: entry.model }));
      }
    }
    return active;
  }
}

const defaultCooldownManager = new CooldownManager();

module.exports = {
  CooldownManager,
  cooldownManager: defaultCooldownManager,
};
