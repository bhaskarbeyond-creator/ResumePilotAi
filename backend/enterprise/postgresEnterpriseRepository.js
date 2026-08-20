'use strict';

const sqlRepository = require('./tenantRepository');
const { createTenantPool, TenantDataPlaneRouter } = require('./tenantDataPlane');

/**
 * Optional PostgreSQL adapter for the enterprise repository interface.
 *
 * This preserves the previously certified RLS-backed data plane for operators
 * that already run a tenant database. It is NOT required: the canonical
 * provider is Firestore. All tenant isolation for this adapter continues to be
 * enforced by PostgreSQL row-level security driven by the verified server
 * context (see tenantDataPlane.setTransactionLocalContext).
 */
class PostgresEnterpriseRepository {
  constructor({ pool = null, connectionString = null } = {}) {
    this.pool = pool || (connectionString ? createTenantPool({ connectionString }) : null);
    if (!this.pool) {
      throw Object.assign(new Error('PostgreSQL enterprise repository requires a pool or TENANT_DATABASE_URL'), { code: 'ENTERPRISE_DATA_PLANE_UNAVAILABLE', status: 503 });
    }
    this.router = new TenantDataPlaneRouter({ sharedPool: this.pool });
    this.providerName = 'postgres';
  }

  async withTx(context, callback) {
    return this.router.withContext(context, callback);
  }

  async createResource(context, input) {
    return this.withTx(context, async tx => sqlRepository.createTenantResource(tx, context, input));
  }

  async getResource(context, resourceId) {
    return this.withTx(context, tx => sqlRepository.getTenantResource(tx, context, resourceId));
  }

  async listResources(context, options) {
    return this.withTx(context, tx => sqlRepository.listTenantResources(tx, context, options));
  }

  async updateResource(context, resourceId, input) {
    return this.withTx(context, tx => sqlRepository.updateTenantResource(tx, context, resourceId, input));
  }

  async deleteResource(context, resourceId) {
    return this.withTx(context, async tx => {
      const resource = await sqlRepository.getTenantResource(tx, context, resourceId);
      if (!resource) return false;
      await sqlRepository.deleteTenantResource(tx, context, resourceId);
      await sqlRepository.appendTenantAuditEvent(tx, context, { action: 'RESOURCE_DELETED', category: 'resource.lifecycle', severity: 'HIGH', resource: { type: resource.resourceType, id: resource.id } });
      return true;
    });
  }

  async appendAuditEvent(context, event) {
    return this.withTx(context, tx => sqlRepository.appendTenantAuditEvent(tx, context, {
      action: event?.action,
      category: event?.category,
      severity: event?.severity,
      outcome: event?.outcome,
      resource: event?.resourceId ? { type: event.resourceType, id: event.resourceId } : null,
      metadata: event?.metadata || {},
    }));
  }

  async listAuditEvents(context, { limit = 100 } = {}) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
    return this.withTx(context, tx => tx.query(
      `SELECT id, tenant_id, workspace_id, principal_id, action, category, severity, resource_type, resource_id, correlation_id, outcome, metadata, occurred_at
         FROM tenant_data.audit_events ORDER BY occurred_at DESC LIMIT $1`,
      [boundedLimit]
    )).then(result => (result.rows || []).map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      principalId: row.principal_id,
      action: row.action,
      category: row.category,
      severity: row.severity,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      correlationId: row.correlation_id,
      outcome: row.outcome,
      metadata: row.metadata || {},
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    })));
  }

  async recordAiUsage(context, input) {
    return this.withTx(context, async tx => {
      const usage = await sqlRepository.recordTenantAiUsage(tx, context, input);
      await sqlRepository.appendTenantAuditEvent(tx, context, { action: 'AI_GENERATION_COMPLETED', category: 'ai.usage', resource: null, metadata: { provider: input.provider, model: input.model, operation: input.operation } });
      return { ...usage, outcome: 'RECORDED' };
    });
  }

  async getAiUsageSummary(context, { days = 30 } = {}) {
    const boundedDays = Math.max(1, Math.min(Number(days) || 30, 366));
    const result = await this.withTx(context, tx => tx.query(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
              count(*)::int AS requests,
              coalesce(sum(input_tokens), 0)::int AS input_tokens,
              coalesce(sum(output_tokens), 0)::int AS output_tokens,
              coalesce(sum(estimated_cost_micros), 0)::bigint AS estimated_cost_micros
         FROM tenant_data.ai_usage_ledger
        WHERE tenant_id IS NOT NULL AND created_at >= now() - ($1 || ' days')::interval
        GROUP BY 1 ORDER BY 1`,
      [String(boundedDays)]
    ));
    const byDay = (result.rows || []).map(row => ({
      day: row.day,
      requests: Number(row.requests),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      estimatedCostMicros: Number(row.estimated_cost_micros),
    }));
    return {
      tenantId: context.tenantId,
      days: boundedDays,
      requests: byDay.reduce((total, day) => total + day.requests, 0),
      inputTokens: byDay.reduce((total, day) => total + day.inputTokens, 0),
      outputTokens: byDay.reduce((total, day) => total + day.outputTokens, 0),
      estimatedCostMicros: byDay.reduce((total, day) => total + day.estimatedCostMicros, 0),
      byDay,
      byWorkspace: {},
      byProvider: {},
      byModel: {},
    };
  }

  async ping() {
    const started = Date.now();
    await this.pool.query('SELECT 1');
    return { ok: true, provider: this.providerName, durable: true, latencyMs: Date.now() - started };
  }
}

module.exports = { PostgresEnterpriseRepository };
