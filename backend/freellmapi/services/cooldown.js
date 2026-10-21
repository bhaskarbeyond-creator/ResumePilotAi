'use strict';

/**
 * FreeLLMAPI In-Memory Cooldown & Backoff Manager
 *
 * Tracks rate-limited or temporarily degraded providers/models in RAM.
 * Ensures that if a provider returns HTTP 429 or 503, traffic immediately
 * pivots to the next priority provider without blocking user requests.
 *
 * Self-healing: Cooldowns expire lazily or can be cleared on demand.
 */

class CooldownManager {
  constructor() {
    this.cooldowns = new Map(); // key -> { expiresAt, reason, strikeCount, lastFailureAt }
    this.DEFAULT_COOLDOWN_MS = 60_000; // 1 minute
    this.MAX_COOLDOWN_MS = 300_000;    // 5 minutes max
  }

  _makeKey(provider, model) {
    const p = String(provider || '').toLowerCase().trim();
    const m = String(model || '').toLowerCase().trim();
    return m ? `${p}:${m}` : p;
  }

  isOnCooldown(provider, model) {
    const specificKey = this._makeKey(provider, model);
    const providerKey = this._makeKey(provider, '');

    const now = Date.now();
    for (const key of [specificKey, providerKey]) {
      const entry = this.cooldowns.get(key);
      if (entry) {
        if (entry.expiresAt > now) {
          return { onCooldown: true, remainingMs: entry.expiresAt - now, reason: entry.reason };
        }
        // Expired -> lazy cleanup
        this.cooldowns.delete(key);
      }
    }

    return { onCooldown: false, remainingMs: 0, reason: null };
  }

  setCooldown(provider, model, reason = 'Rate limit or temporary provider degradation') {
    const key = this._makeKey(provider, model);
    const existing = this.cooldowns.get(key);

    const now = Date.now();
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

    return { expiresAt, durationMs, strikeCount };
  }

  clearCooldown(provider, model) {
    const specificKey = this._makeKey(provider, model);
    const providerKey = this._makeKey(provider, '');
    this.cooldowns.delete(specificKey);
    this.cooldowns.delete(providerKey);
  }

  resetAll() {
    this.cooldowns.clear();
  }

  getStatus() {
    const now = Date.now();
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
