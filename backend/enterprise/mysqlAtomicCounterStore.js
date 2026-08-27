'use strict';

const crypto = require('crypto');

class MySqlAtomicCounterStore {
  constructor({ pool, now = () => Date.now() }) {
    if (!pool) {
      const { getPool } = require('../database/mysql');
      this.pool = getPool();
    } else {
      this.pool = pool;
    }
    this.now = now;
  }

  assertAvailable() {
    if (!this.pool || this.pool._closed) {
      throw Object.assign(new Error('Tenant quota store is unavailable: MySQL pool is closed'), { code: 'TENANT_QUOTA_UNAVAILABLE', status: 503 });
    }
  }

  async increment(key, { ttlMs }) {
    this.assertAvailable();
    const now = this.now();
    const id = crypto.createHash('sha256').update(String(key)).digest('hex');

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT count, expiresAt FROM enterprise_quota_buckets WHERE id = ? FOR UPDATE',
        [id]
      );

      let count = 1;
      let expiresAt = now + ttlMs;

      if (rows.length > 0) {
        const currentExpiry = Number(rows[0].expiresAt || 0);
        const active = currentExpiry > now;
        count = active ? Number(rows[0].count || 0) + 1 : 1;
        expiresAt = active ? currentExpiry : now + ttlMs;

        await conn.query(
          'UPDATE enterprise_quota_buckets SET count = ?, expiresAt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [count, expiresAt, id]
        );
      } else {
        await conn.query(
          'INSERT INTO enterprise_quota_buckets (id, keyHash, count, expiresAt) VALUES (?, ?, ?, ?)',
          [id, id, count, expiresAt]
        );
      }

      await conn.commit();
      return { count, expiresAt };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  MySqlAtomicCounterStore,
};
