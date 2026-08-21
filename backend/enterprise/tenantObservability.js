'use strict';

/**
 * In-process enterprise observability.
 *
 * Metrics are computed from REAL request telemetry recorded by the enterprise
 * router middleware (latencies, status classes) plus the durable outbox state
 * exposed through /api/enterprise/queue/status. There is no Redis, PostgreSQL,
 * or external metrics service in this architecture, and no counter is reported
 * that is not actually incremented.
 */

class EnterpriseObservability {
  constructor() {
    this.latencies = [];
    this.errorCounts = {
      clientErrors: 0,
      serverErrors: 0,
      authErrors: 0,
      aiErrors: 0,
      quotaErrors: 0,
    };
    this.durableDb = null;
    this.admin = null;
    this.lastFlushTime = Date.now();
  }

  setDurableStore(db, admin) {
    if (this.durableDb) return;
    this.durableDb = db;
    this.admin = admin;
    setInterval(() => this.flushToDurableStore(), 1000 * 60 * 15); // Flush every 15 minutes
  }

  async flushToDurableStore() {
    if (!this.durableDb || !this.admin) return;
    try {
      const currentMetrics = this.getMetrics();
      if (currentMetrics.sampleCount === 0) return;
      
      const payload = {
        lastFlushedAt: this.admin.firestore.FieldValue.serverTimestamp(),
        lifetimeSamples: this.admin.firestore.FieldValue.increment(currentMetrics.sampleCount),
        errors: {
          clientErrors: this.admin.firestore.FieldValue.increment(this.errorCounts.clientErrors),
          serverErrors: this.admin.firestore.FieldValue.increment(this.errorCounts.serverErrors),
          authErrors: this.admin.firestore.FieldValue.increment(this.errorCounts.authErrors),
          aiErrors: this.admin.firestore.FieldValue.increment(this.errorCounts.aiErrors),
          quotaErrors: this.admin.firestore.FieldValue.increment(this.errorCounts.quotaErrors),
        }
      };
      await this.durableDb.collection('data').doc('observability').set(payload, { merge: true });
      
      // Reset after flush
      this.latencies = [];
      this.errorCounts = { clientErrors: 0, serverErrors: 0, authErrors: 0, aiErrors: 0, quotaErrors: 0 };
      this.lastFlushTime = Date.now();
    } catch (err) {
      console.warn('[EnterpriseObservability] Failed to flush to durable store:', err.message);
    }
  }

  recordRequest({ requestId, correlationId, tenantId, workspaceId, method, path, status, durationMs, error = null }) {
    if (!Number.isFinite(Number(durationMs))) return;
    this.latencies.push(Number(durationMs));
    if (this.latencies.length > 5000) {
      this.latencies.shift();
    }

    if (status >= 400 && status < 500) {
      this.errorCounts.clientErrors++;
      if (status === 401 || status === 403) this.errorCounts.authErrors++;
      if (status === 429) this.errorCounts.quotaErrors++;
    } else if (status >= 500) {
      this.errorCounts.serverErrors++;
      if (path && path.includes('/ai/')) this.errorCounts.aiErrors++;
    }

    // Structured JSON log line (no secrets; identifiers are truncated).
    const logObject = {
      timestamp: new Date().toISOString(),
      level: status >= 500 ? 'ERROR' : (status >= 400 ? 'WARN' : 'INFO'),
      requestId: requestId || 'anonymous',
      correlationId: correlationId || 'anonymous',
      tenantId: tenantId ? `tenant:${tenantId.slice(0, 8)}...` : 'public',
      workspaceId: workspaceId ? `workspace:${workspaceId.slice(0, 8)}` : null,
      method,
      path,
      status,
      durationMs: Math.round(Number(durationMs)),
      error: error ? error.message || String(error) : undefined,
    };

    if (status >= 500) {
      console.error('[Enterprise Request Audit]:', JSON.stringify(logObject));
    }
  }

  getMetrics() {
    if (this.latencies.length === 0) {
      return {
        sampleCount: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errors: { ...this.errorCounts },
      };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];

    return {
      sampleCount: sorted.length,
      p50,
      p95,
      p99,
      errors: { ...this.errorCounts },
    };
  }
}

const enterpriseObservability = new EnterpriseObservability();

module.exports = {
  EnterpriseObservability,
  enterpriseObservability,
};
