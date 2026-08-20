'use strict';

/**
 * Optional legacy PostgreSQL tenant data plane (RLS adapter).
 *
 * This module is ONLY used when ENTERPRISE_DATA_PROVIDER=postgres AND
 * TENANT_DATABASE_URL is configured. The canonical enterprise data plane is
 * Firestore (firestoreEnterpriseRepository.js) which requires no external
 * database. All tenant isolation here is enforced by PostgreSQL row-level
 * security driven by the verified server context.
 */

const { Pool } = require('pg');
const { assertUuid } = require('./tenantContext');

const CONTEXT_SETTINGS = Object.freeze([
  ['app.tenant_id', context => assertUuid(context.tenantId, 'Tenant identifier')],
  ['app.workspace_id', context => context.workspaceId ? assertUuid(context.workspaceId, 'Workspace identifier') : ''],
  ['app.workspace_scope', context => context.workspaceScope === 'TENANT' ? 'TENANT' : 'WORKSPACE'],
  ['app.principal_id', context => assertUuid(context.principalId, 'Canonical principal identifier')],
  ['app.policy_version', context => String(Number(context.policyVersion || 0))],
  ['app.routing_version', context => String(Number(context.dataPlane?.routingVersion || 0))],
]);

function tenantDatabaseUrl(environment = process.env) {
  // Do not fall back to a generic DATABASE_URL. Enterprise tenant data must use an
  // explicitly approved data-plane credential rather than accidentally sharing an
  // unrelated operational database.
  const value = String(environment.TENANT_DATABASE_URL || '').trim();
  if (!value) {
    const error = new Error('Tenant PostgreSQL data plane is not configured');
    error.code = 'TENANT_DATA_PLANE_UNAVAILABLE';
    error.status = 503;
    throw error;
  }
  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    const error = new Error('Tenant PostgreSQL URL must use postgres:// or postgresql://');
    error.code = 'TENANT_DATA_PLANE_INVALID';
    error.status = 503;
    throw error;
  }
  return value;
}

function createTenantPool({ connectionString = tenantDatabaseUrl(), max = 12, idleTimeoutMillis = 30_000, connectionTimeoutMillis = 8_000 } = {}) {
  return new Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    application_name: 'resumepilot-tenant-runtime',
  });
}

async function setTransactionLocalContext(client, context) {
  for (const [name, derive] of CONTEXT_SETTINGS) {
    await client.query("SELECT set_config($1, $2, true)", [name, derive(context)]);
  }
}

function scopedClient(client, context) {
  return Object.freeze({
    context,
    async query(text, values = []) {
      if (typeof text !== 'string' || !text.trim()) throw new Error('Tenant query text is required');
      return client.query(text, values);
    },
  });
}

async function withTenantTransaction(pool, context, callback) {
  if (!pool || typeof pool.connect !== 'function') {
    const error = new Error('Tenant PostgreSQL pool is unavailable');
    error.code = 'TENANT_DATA_PLANE_UNAVAILABLE';
    error.status = 503;
    throw error;
  }
  if (!context?.tenantId || !context?.principalId) {
    const error = new Error('Tenant context is required for data-plane access');
    error.code = 'TENANT_CONTEXT_REQUIRED';
    error.status = 403;
    throw error;
  }
  const client = await pool.connect();
  let opened = false;
  try {
    await client.query('BEGIN');
    opened = true;
    await setTransactionLocalContext(client, context);
    const output = await callback(scopedClient(client, context));
    await client.query('COMMIT');
    opened = false;
    return output;
  } catch (error) {
    if (opened) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    // SET LOCAL is transaction-scoped. RESET ALL is defensive for a driver/pool that
    // is ever changed to session pooling; failure to reset destroys the connection.
    let resetError = null;
    await client.query('RESET ALL').catch(error => { resetError = error; });
    if (typeof client.release === 'function') {
      client.release(resetError ? new Error('Unable to reset tenant connection state') : undefined);
    }
  }
}

class TenantDataPlaneRouter {
  constructor({ sharedPool = null, dedicatedPoolResolver = null }) {
    this.sharedPool = sharedPool;
    this.dedicatedPoolResolver = dedicatedPoolResolver;
  }

  async resolvePool(context) {
    const type = String(context?.dataPlane?.type || '').toUpperCase();
    if (type === 'SHARED_POSTGRES') {
      if (!this.sharedPool) throw Object.assign(new Error('Shared tenant data plane is unavailable'), { code: 'TENANT_DATA_PLANE_UNAVAILABLE', status: 503 });
      return this.sharedPool;
    }
    if (type === 'DEDICATED_POSTGRES' && typeof this.dedicatedPoolResolver === 'function') {
      const pool = await this.dedicatedPoolResolver(context.dataPlane, context);
      if (pool?.connect) return pool;
    }
    throw Object.assign(new Error('Dedicated tenant data plane is unavailable'), { code: 'TENANT_DATA_PLANE_UNAVAILABLE', status: 503 });
  }

  async withContext(context, callback) {
    return withTenantTransaction(await this.resolvePool(context), context, callback);
  }
}

module.exports = {
  CONTEXT_SETTINGS,
  TenantDataPlaneRouter,
  createTenantPool,
  scopedClient,
  setTransactionLocalContext,
  tenantDatabaseUrl,
  withTenantTransaction,
};
