'use strict';

/** Explicit unit-test adapter. Production code never imports this module. */
class InMemoryAtomicCounterStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.entries = new Map();
  }

  async increment(key, { ttlMs }) {
    const now = this.now();
    const current = this.entries.get(String(key));
    const active = current && current.expiresAt > now;
    const next = {
      count: active ? current.count + 1 : 1,
      expiresAt: active ? current.expiresAt : now + Number(ttlMs),
    };
    this.entries.set(String(key), next);
    return { ...next };
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = { InMemoryAtomicCounterStore };
