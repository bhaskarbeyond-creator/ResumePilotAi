'use strict';

/**
 * FreeLLMAPI In-Memory LRU Prompt Cache
 *
 * Caches deterministic AI completions in fast RAM (<1ms retrieval).
 * Saves 100% of LLM tokens on repeated queries (e.g. identical ATS evaluations,
 * prompt previews, or standard keyword suggestions).
 */

const crypto = require('crypto');

class LruPromptCache {
  constructor(maxEntries = 500, ttlMs = 3600_000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.cache = new Map(); // hash -> { value, expiresAt }
  }

  _computeKey(messages, model, temperature) {
    const payload = JSON.stringify({ messages, model, temp: Math.round(temperature * 100) / 100 });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  get(messages, model, temperature) {
    const key = this._computeKey(messages, model, temperature);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU order: delete and re-insert
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(messages, model, temperature, value) {
    const key = this._computeKey(messages, model, temperature);
    
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * F-11: proactively purge expired entries. The autonomous maintenance cycle
   * called this method since day one, but it did not exist — the TypeError was
   * swallowed by the shared try/catch, so expired entries were only evicted
   * lazily on get() or by LRU pressure. Returns the number of entries purged.
   */
  cleanExpired(now = Date.now()) {
    let purged = 0;
    for (const [key, entry] of this.cache) {
      if (!entry || now > entry.expiresAt) {
        this.cache.delete(key);
        purged += 1;
      }
    }
    return purged;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

const defaultPromptCache = new LruPromptCache();

module.exports = {
  LruPromptCache,
  promptCache: defaultPromptCache,
};
