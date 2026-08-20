'use strict';

class EnterpriseObservability {
  constructor() {
    this.latencies = [];
    this.errorCounts = {
      clientErrors: 0,
      serverErrors: 0,
      authErrors: 0,
      dbErrors: 0,
      redisErrors: 0,
      queueErrors: 0,
      aiErrors: 0,
    };
  }

  recordRequest({ requestId, correlationId, tenantId, workspaceId, method, path, status, durationMs, error = null }) {
    this.latencies.push(durationMs);
    if (this.latencies.length > 5000) {
      this.latencies.shift();
    }

    if (status >= 400 && status < 500) {
      this.errorCounts.clientErrors++;
      if (status === 401 || status === 403) this.errorCounts.authErrors++;
    } else if (status >= 500) {
      this.errorCounts.serverErrors++;
      if (path && path.includes('/ai/')) this.errorCounts.aiErrors++;
    }

    // Structured JSON log line
    const logObject = {
      timestamp: new Date().toISOString(),
      level: status >= 500 ? 'ERROR' : (status >= 400 ? 'WARN' : 'INFO'),
      requestId: requestId || 'anonymous',
      correlationId: correlationId || 'anonymous',
      tenantId: tenantId ? `tenant:${tenantId.slice(0, 8)}...` : 'public',
      workspaceId: workspaceId ? `workspace:${workspaceId.slice(0, 8)}...` : null,
      method,
      path,
      status,
      durationMs,
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
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

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
