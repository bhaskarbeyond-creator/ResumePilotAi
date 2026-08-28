'use strict';

/** Explicit test double for the MariaDB atomic quota bucket contract. */
class InMemoryAtomicCounterStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.counters = new Map();
  }

  async increment(key, { ttlMs }) {
    const currentTime = Number(this.now());
    const existing = this.counters.get(String(key));
    const row = !existing || existing.expiresAt <= currentTime
      ? { count: 0, expiresAt: currentTime + Number(ttlMs) }
      : existing;
    row.count += 1;
    this.counters.set(String(key), row);
    return { count: row.count, expiresAt: row.expiresAt };
  }
}

module.exports = { InMemoryAtomicCounterStore };
