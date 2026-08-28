'use strict';

function cloneRow(row) {
  return row ? { ...row, envelope: typeof row.envelope === 'string' ? row.envelope : JSON.stringify(row.envelope) } : row;
}
function time(value) { return value instanceof Date ? value.getTime() : new Date(value || 0).getTime(); }

class InMemoryEnterpriseOutboxPool {
  constructor() {
    this.jobs = new Map();
    this.auditEvents = [];
  }

  async end() { this._closed = true; }

  async getConnection() {
    const pool = this;
    let snapshot = null;
    return {
      async beginTransaction() { snapshot = new Map([...pool.jobs].map(([id, row]) => [id, cloneRow(row)])); },
      async commit() { snapshot = null; },
      async rollback() { if (snapshot) pool.jobs = new Map([...snapshot].map(([id, row]) => [id, cloneRow(row)])); snapshot = null; },
      release() {},
      query(sql, params) { return pool.query(sql, params); },
    };
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO enterprise_outbox /.test(normalized)) {
      const id = params[0];
      if (this.jobs.has(id)) return [{ affectedRows: 0 }];
      this.jobs.set(id, {
        id, tenantId: params[1], workspaceId: params[2], principalId: params[3], subjectId: params[4],
        identityIssuer: params[5], actorType: params[6], jobType: params[7], correlationId: params[8],
        idempotencyKey: params[9], classification: params[10], envelope: params[11], status: 'QUEUED',
        attemptCount: 0, maxAttempts: params[12], nextAttemptAt: params[13], expiresAt: params[14],
        leaseOwner: null, leaseExpiresAt: null, lastError: null, created_at: new Date(), updated_at: new Date(),
      });
      return [{ affectedRows: 1 }];
    }
    if (normalized === 'SELECT status, tenantId, workspaceId, principalId, jobType, classification, envelope FROM enterprise_outbox WHERE id = ?') {
      const row = this.jobs.get(params[0]);
      return [[...(row ? [cloneRow(row)] : [])]];
    }
    if (/^SELECT \* FROM enterprise_outbox WHERE expiresAt > \?/.test(normalized)) {
      const now = time(params[0]);
      const due = [...this.jobs.values()].filter(row => time(row.expiresAt) > now && (
        (['QUEUED', 'RETRYING'].includes(row.status) && time(row.nextAttemptAt) <= time(params[1]))
        || (row.status === 'PROCESSING' && time(row.leaseExpiresAt) <= time(params[2]))
      )).sort((a, b) => time(a.nextAttemptAt) - time(b.nextAttemptAt) || time(a.created_at) - time(b.created_at));
      return [due.slice(0, 1).map(cloneRow)];
    }
    if (/SET status = 'PROCESSING'/.test(normalized)) {
      const row = this.jobs.get(params[4]);
      if (!row) return [{ affectedRows: 0 }];
      Object.assign(row, { status: 'PROCESSING', attemptCount: params[0], leaseOwner: params[1], leaseExpiresAt: params[2], lastAttemptAt: params[3], updated_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (/SET status = 'COMPLETED'/.test(normalized)) {
      const row = this.jobs.get(params[2]);
      if (!row || row.status !== 'PROCESSING' || row.leaseOwner !== params[3]) return [{ affectedRows: 0 }];
      Object.assign(row, { status: 'COMPLETED', result: params[0], completedAt: params[1], leaseOwner: null, leaseExpiresAt: null, lastError: null, updated_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (normalized === 'SELECT * FROM enterprise_outbox WHERE id = ? FOR UPDATE') {
      const row = this.jobs.get(params[0]);
      return [[...(row ? [cloneRow(row)] : [])]];
    }
    if (/SET status = \?, lastError = \?/.test(normalized)) {
      const row = this.jobs.get(params[4]);
      if (!row) return [{ affectedRows: 0 }];
      Object.assign(row, { status: params[0], lastError: params[1], nextAttemptAt: params[2], dlqAt: params[3], leaseOwner: null, leaseExpiresAt: null, updated_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (/SET status = 'REJECTED'/.test(normalized)) {
      const row = this.jobs.get(params[2]);
      if (!row || ['COMPLETED', 'REJECTED'].includes(row.status)) return [{ affectedRows: 0 }];
      Object.assign(row, { status: 'REJECTED', rejectedReason: params[0], rejectedAt: params[1], leaseOwner: null, leaseExpiresAt: null, updated_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (normalized === 'SELECT * FROM enterprise_outbox WHERE id = ? AND tenantId = ? FOR UPDATE') {
      const row = this.jobs.get(params[0]);
      return [[...(row && row.tenantId === params[1] ? [cloneRow(row)] : [])]];
    }
    if (/SET status = 'QUEUED', attemptCount = 0/.test(normalized)) {
      const row = this.jobs.get(params[3]);
      if (!row) return [{ affectedRows: 0 }];
      Object.assign(row, { status: 'QUEUED', attemptCount: 0, nextAttemptAt: params[0], replayedBy: params[1], replayedAt: params[2], dlqAt: null, lastError: null, leaseOwner: null, leaseExpiresAt: null, updated_at: new Date() });
      return [{ affectedRows: 1 }];
    }
    if (/^INSERT INTO enterprise_audit_events /.test(normalized)) {
      this.auditEvents.push({ id: params[0], tenantId: params[1], workspaceId: params[2], actorPrincipalId: params[3], action: 'JOB_REPLAYED', resourceType: params[4], resourceId: params[5], metadata: params[6], occurredAt: params[7] });
      return [{ affectedRows: 1 }];
    }
    if (/^SELECT id FROM enterprise_outbox WHERE status IN/.test(normalized)) {
      const cutoff = time(params[0]);
      const limit = Number(params[1]);
      return [[...[...this.jobs.values()].filter(row => ['QUEUED', 'RETRYING'].includes(row.status) && time(row.expiresAt) <= cutoff).slice(0, limit).map(row => ({ id: row.id }))]];
    }
    if (normalized === 'SELECT status, COUNT(*) AS total FROM enterprise_outbox GROUP BY status') {
      const counts = {};
      for (const row of this.jobs.values()) counts[row.status] = (counts[row.status] || 0) + 1;
      return [[...Object.entries(counts).map(([status, total]) => ({ status, total }))]];
    }
    if (/^SELECT \* FROM enterprise_outbox WHERE tenantId = \?/.test(normalized)) {
      const withStatus = normalized.includes('AND status = ?');
      const tenantId = params[0];
      const status = withStatus ? params[1] : null;
      const limit = Number(params[withStatus ? 2 : 1]);
      return [[...[...this.jobs.values()].filter(row => row.tenantId === tenantId && (!status || row.status === status)).sort((a, b) => time(b.created_at) - time(a.created_at)).slice(0, limit).map(cloneRow)]];
    }
    throw new Error(`Unexpected in-memory outbox SQL: ${normalized}`);
  }
}

module.exports = { InMemoryEnterpriseOutboxPool };
