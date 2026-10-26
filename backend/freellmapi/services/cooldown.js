'use strict';

/**
 * FreeLLMAPI In-Memory Cooldown & Backoff Manager
 *
 * Tracks rate-limited or temporarily degraded providers/models in RAM and, when
 * a durable store is attached, mirrors the expiry into `data/freellm_metrics.db`
 * so a Node restart does not re-hammer a provider that is still benched.
 *
 * Self-healing: cooldowns expire lazily or can be cleared on demand.
 *
 * PH4-ENGINE-021 Phase A.5 — scoped keying (schema-proposal §3.5):
 *   - the in-memory key gains an evidence-scope dimension; the PLATFORM scope
 *     keeps the exact legacy key shape (`provider[:model]`), so every existing
 *     caller and every persisted behaviour is byte-identical,
 *   - non-platform scopes are keyed `scope\u0000provider[:model]` (the
 *     separator makes scope-name collisions with provider strings impossible),
 *   - isOnCooldown for a scoped caller checks, in order: scoped specific →
 *     scoped provider-wide → platform specific → platform provider-wide. A
 *     platform-credential cooldown legitimately applies to everyone
 *     (credential-physics honesty, schema-proposal §2.2),
 *   - a scoped clear/release NEVER touches platform rows (F-14 scope guard),
 *   - hydration reads every scope from the durable store (loadCooldowns
 *     default) so a restart preserves tenant benches too.
 */

const { PLATFORM_SCOPE, normalizeScopeKey } = require('./persistence');

class CooldownManager {
  constructor({ persistence = null, now = () => Date.now() } = {}) {
    this.cooldowns = new Map(); // key -> { expiresAt, reason, strikeCount, lastFailureAt, scopeKey, credentialKind }
    this.DEFAULT_COOLDOWN_MS = 60_000; // 1 minute
    this.MAX_COOLDOWN_MS = 300_000;    // 5 minutes max
    this.persistence = persistence;
    this.now = now;
  }

  /**
   * Attach a MetricsPersistence instance (or null to detach) and hydrate any
   * cooldown that is still active from the previous process — across every
   * scope (a tenant bench must survive a restart exactly like a platform one).
   */
  attachPersistence(persistence) {
    this.persistence = persistence || null;
    if (!this.persistence) return { hydrated: 0 };
    let hydrated = 0;
    try {
      for (const row of this.persistence.loadCooldowns({ now: this.now() })) {
        const scope = normalizeScopeKey(row.scopeKey);
        const key = this._makeKey(row.provider, row.model, scope);
        this.cooldowns.set(key, {
          provider: String(row.provider || '').toLowerCase(),
          model: String(row.model || ''),
          scopeKey: scope,
          credentialKind: String(row.credentialKind || 'platform'),
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

  _makeKey(provider, model, scopeKey = PLATFORM_SCOPE) {
    const p = String(provider || '').toLowerCase().trim();
    const m = String(model || '').toLowerCase().trim();
    const legacy = m ? `${p}:${m}` : p;
    const scope = normalizeScopeKey(scopeKey);
    return scope === PLATFORM_SCOPE ? legacy : `${scope}\u0000${legacy}`;
  }

  /**
   * Cooldown check. Platform scope = the exact legacy two-key probe. A scoped
   * caller additionally falls through to the platform rows: a shared-credential
   * bench is a fact about the provider for everyone (physics honesty), while a
   * tenant/byok bench is visible only inside its own scope.
   */
  isOnCooldown(provider, model, { scopeKey = PLATFORM_SCOPE } = {}) {
    const scope = normalizeScopeKey(scopeKey);
    const now = this.now();
    const probes = scope === PLATFORM_SCOPE
      ? [
        { key: this._makeKey(provider, model, scope), probeModel: String(model || '') },
        { key: this._makeKey(provider, '', scope), probeModel: '' },
      ]
      : [
        { key: this._makeKey(provider, model, scope), probeModel: String(model || '') },
        { key: this._makeKey(provider, '', scope), probeModel: '' },
        { key: this._makeKey(provider, model, PLATFORM_SCOPE), probeModel: String(model || '') },
        { key: this._makeKey(provider, '', PLATFORM_SCOPE), probeModel: '' },
      ];

    for (const probe of probes) {
      const entry = this.cooldowns.get(probe.key);
      if (entry) {
        if (entry.expiresAt > now) {
          return {
            onCooldown: true,
            remainingMs: entry.expiresAt - now,
            reason: entry.reason,
            scopeKey: entry.scopeKey || PLATFORM_SCOPE,
            credentialKind: entry.credentialKind || 'platform',
          };
        }
        // Expired -> lazy cleanup (always in the ENTRY's own scope — a scoped
        // expiry must never delete a platform row, and vice versa).
        this.cooldowns.delete(probe.key);
        this._persist(store => store.clearCooldown({
          provider: entry.provider,
          model: entry.model,
          scopeKey: entry.scopeKey || PLATFORM_SCOPE,
        }));
      }
    }

    return { onCooldown: false, remainingMs: 0, reason: null };
  }

  setCooldown(provider, model, reason = 'Rate limit or temporary provider degradation', retryAfterMs = null, { scopeKey = PLATFORM_SCOPE, credentialKind = 'platform' } = {}) {
    const scope = normalizeScopeKey(scopeKey);
    const kind = String(credentialKind || 'platform');
    const key = this._makeKey(provider, model, scope);
    const existing = this.cooldowns.get(key);

    const now = this.now();
    let strikeCount = 1;
    let durationMs = this.DEFAULT_COOLDOWN_MS;

    if (existing && (now - existing.lastFailureAt) < (this.MAX_COOLDOWN_MS * 2)) {
      strikeCount = (existing.strikeCount || 1) + 1;
      durationMs = Math.min(this.MAX_COOLDOWN_MS, this.DEFAULT_COOLDOWN_MS * Math.pow(2, strikeCount - 1));
    }

    // F-12: never wait LESS than the provider's Retry-After request; clamp to
    // MAX_COOLDOWN_MS so a pathological 24h header cannot bench a provider
    // for a day.
    const requested = Number(retryAfterMs);
    if (Number.isFinite(requested) && requested > durationMs) {
      durationMs = Math.min(this.MAX_COOLDOWN_MS, requested);
    }

    const expiresAt = now + durationMs;
    this.cooldowns.set(key, {
      provider: String(provider).toLowerCase(),
      model: String(model || ''),
      scopeKey: scope,
      credentialKind: kind,
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
      scopeKey: scope,
      credentialKind: kind,
    }));

    return { expiresAt, durationMs, strikeCount };
  }

  /**
   * F-14 scope guard: a clear only ever removes rows in the REQUESTING scope.
   * A tenant's last-resort release can never lift a platform bench, and a
   * platform reset can never lift a tenant bench (C.4 keeps those separate).
   */
  clearCooldown(provider, model, { scopeKey = PLATFORM_SCOPE } = {}) {
    const scope = normalizeScopeKey(scopeKey);
    const specificKey = this._makeKey(provider, model, scope);
    const providerKey = this._makeKey(provider, '', scope);
    this.cooldowns.delete(specificKey);
    this.cooldowns.delete(providerKey);
    this._persist(store => {
      store.clearCooldown({ provider, model: String(model || ''), scopeKey: scope });
      if (providerKey !== specificKey) store.clearCooldown({ provider, model: '', scopeKey: scope });
    });
  }

  resetAll({ scopeKey = null } = {}) {
    const scope = scopeKey === null || scopeKey === undefined ? null : normalizeScopeKey(scopeKey);
    if (scope === null) {
      this.cooldowns.clear();
      this._persist(store => store.clearAllCooldowns());
      return;
    }
    for (const [key, entry] of this.cooldowns.entries()) {
      if ((entry.scopeKey || PLATFORM_SCOPE) === scope) this.cooldowns.delete(key);
    }
    this._persist(store => store.clearAllCooldowns({ scopeKey: scope }));
  }

  cleanExpired() {
    const now = this.now();
    for (const [key, entry] of this.cooldowns.entries()) {
      if (entry.expiresAt <= now) {
        this.cooldowns.delete(key);
        this._persist(store => store.clearCooldown({
          provider: entry.provider,
          model: entry.model,
          scopeKey: entry.scopeKey || PLATFORM_SCOPE,
        }));
      }
    }
  }

  /** Could this provider serve a request right now? Used by the search chain too. */
  hasAvailableProvider(providers, { scopeKey = PLATFORM_SCOPE } = {}) {
    return (providers || []).some(provider => !this.isOnCooldown(provider, null, { scopeKey }).onCooldown);
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
          scopeKey: entry.scopeKey || PLATFORM_SCOPE,
          credentialKind: entry.credentialKind || 'platform',
          remainingSeconds: Math.ceil((entry.expiresAt - now) / 1000),
          reason: entry.reason,
          strikeCount: entry.strikeCount,
        });
      } else {
        this.cooldowns.delete(key);
        this._persist(store => store.clearCooldown({
          provider: entry.provider,
          model: entry.model,
          scopeKey: entry.scopeKey || PLATFORM_SCOPE,
        }));
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
