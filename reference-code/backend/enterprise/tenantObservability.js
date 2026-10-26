'use strict';

class EnterpriseObservability {
  constructor() {
    this.latencies = [];
    this.errorCounts = this.emptyErrors();
    this.pool = null;
    this.lastFlushTime = Date.now();
    this.flushTimer = null;
  }

  emptyErrors() {
    return { clientErrors: 0, serverErrors: 0, authErrors: 0, aiErrors: 0, quotaErrors: 0 };
  }

  setDurableStore(pool) {
    if (this.pool || !pool?.query) return;
    this.pool = pool;
    this.flushTimer = setInterval(() => {
      this.flushToDurableStore().catch(error => {
        console.error('[EnterpriseObservability] Durable flush failed:', error?.message || error);
      });
    }, 15 * 60_000);
    this.flushTimer.unref?.();
  }

  async flushToDurableStore() {
    if (!this.pool) return { flushed: false, reason: 'STORE_UNAVAILABLE' };
    const sampleCount = this.latencies.length;
    if (!sampleCount) return { flushed: false, reason: 'NO_SAMPLES' };
    const metrics = this.getMetrics();
    const errors = { ...this.errorCounts };
    const windowStart = new Date(this.lastFlushTime);
    const windowEnd = new Date();
    await this.pool.query(
      `INSERT INTO enterprise_observability_rollups
       (id, lifetimeSamples, clientErrors, serverErrors, authErrors, aiErrors,
        quotaErrors, lastP50Ms, lastP95Ms, lastP99Ms, windowStartedAt, windowEndedAt)
       VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         lifetimeSamples = lifetimeSamples + VALUES(lifetimeSamples),
         clientErrors = clientErrors + VALUES(clientErrors),
         serverErrors = serverErrors + VALUES(serverErrors),
         authErrors = authErrors + VALUES(authErrors),
         aiErrors = aiErrors + VALUES(aiErrors),
         quotaErrors = quotaErrors + VALUES(quotaErrors),
         lastP50Ms = VALUES(lastP50Ms), lastP95Ms = VALUES(lastP95Ms), lastP99Ms = VALUES(lastP99Ms),
         windowStartedAt = VALUES(windowStartedAt), windowEndedAt = VALUES(windowEndedAt),
         updated_at = CURRENT_TIMESTAMP`,
      [sampleCount, errors.clientErrors, errors.serverErrors, errors.authErrors,
        errors.aiErrors, errors.quotaErrors, metrics.p50, metrics.p95, metrics.p99,
        windowStart, windowEnd]
    );
    // Remove only the samples included in this flush; concurrent arrivals stay.
    this.latencies.splice(0, sampleCount);
    for (const key of Object.keys(errors)) this.errorCounts[key] = Math.max(0, this.errorCounts[key] - errors[key]);
    this.lastFlushTime = windowEnd.getTime();
    return { flushed: true, sampleCount, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() };
  }

  recordRequest({ requestId, correlationId, tenantId, workspaceId, method, path, status, durationMs, error = null }) {
    if (!Number.isFinite(Number(durationMs))) return;
    this.latencies.push(Number(durationMs));
    if (this.latencies.length > 5_000) this.latencies.shift();
    if (status >= 400 && status < 500) {
      this.errorCounts.clientErrors += 1;
      if (status === 401 || status === 403) this.errorCounts.authErrors += 1;
      if (status === 429) this.errorCounts.quotaErrors += 1;
    } else if (status >= 500) {
      this.errorCounts.serverErrors += 1;
      if (path && path.includes('/ai/')) this.errorCounts.aiErrors += 1;
    }
    if (status >= 500) {
      console.error('[Enterprise Request Audit]:', JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        requestId: requestId || 'anonymous',
        correlationId: correlationId || 'anonymous',
        tenantId: tenantId ? `tenant:${tenantId.slice(0, 8)}...` : 'public',
        workspaceId: workspaceId ? `workspace:${workspaceId.slice(0, 8)}` : null,
        method, path, status, durationMs: Math.round(Number(durationMs)),
        error: error ? String(error.message || error).slice(0, 300) : undefined,
      }));
    }
  }

  getMetrics() {
    const sorted = [...this.latencies].sort((left, right) => left - right);
    const percentile = fraction => sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
      : null;
    return {
      sampleCount: sorted.length,
      windowStartedAt: new Date(this.lastFlushTime).toISOString(),
      measuredFrom: 'server request durations recorded in this process',
      p50: percentile(0.50),
      p95: percentile(0.95),
      p99: percentile(0.99),
      errors: { ...this.errorCounts },
    };
  }
}

const enterpriseObservability = new EnterpriseObservability();
module.exports = { EnterpriseObservability, enterpriseObservability };
