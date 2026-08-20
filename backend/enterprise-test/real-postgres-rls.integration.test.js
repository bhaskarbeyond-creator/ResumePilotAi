'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { withTenantTransaction } = require('../enterprise/tenantDataPlane');
const { freezeContext } = require('../enterprise/tenantContext');

const externalDbUrl = process.env.TENANT_RUNTIME_DATABASE_URL || process.env.ENTERPRISE_RLS_VERIFY_DATABASE_URL || process.env.TENANT_DATABASE_URL;

async function setupPostgresPool() {
  if (externalDbUrl) {
    const pool = new Pool({
      connectionString: externalDbUrl,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
      application_name: 'resumepilot-rls-integration-verifier',
    });
    return {
      pool,
      mode: 'EXTERNAL_POSTGRES',
      close: () => pool.end().catch(() => {}),
    };
  }

  // Use embedded PostgreSQL 16 (PGlite) engine as high-fidelity in-process data plane
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();

  // Provision schema, tables, and forced RLS policies
  await db.query('CREATE SCHEMA IF NOT EXISTS tenant_data');
  await db.query('CREATE TABLE IF NOT EXISTS tenant_data.resources (id text PRIMARY KEY, tenant_id text NOT NULL, workspace_id text, resource_type text NOT NULL, owner_principal_id text NOT NULL, payload jsonb NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())');
  await db.query('ALTER TABLE tenant_data.resources ENABLE ROW LEVEL SECURITY');
  await db.query('ALTER TABLE tenant_data.resources FORCE ROW LEVEL SECURITY');

  await db.query(`
    CREATE OR REPLACE FUNCTION tenant_data.current_tenant_id() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('app.tenant_id', true), '')::text;
    $$;
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION tenant_data.current_workspace_id() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('app.workspace_id', true), '')::text;
    $$;
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION tenant_data.current_workspace_scope() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('app.workspace_scope', true), ''), 'WORKSPACE')::text;
    $$;
  `);

  await db.query('DROP POLICY IF EXISTS resources_tenant_isolation ON tenant_data.resources');
  await db.query(`
    CREATE POLICY resources_tenant_isolation ON tenant_data.resources
      USING (
        tenant_id = tenant_data.current_tenant_id()
        AND (
          workspace_id IS NULL
          OR tenant_data.current_workspace_scope() = 'TENANT'
          OR workspace_id = tenant_data.current_workspace_id()
        )
      )
      WITH CHECK (
        tenant_id = tenant_data.current_tenant_id()
        AND (
          workspace_id IS NULL
          OR tenant_data.current_workspace_scope() = 'TENANT'
          OR workspace_id = tenant_data.current_workspace_id()
        )
      )
  `);

  // Provision non-superuser application runtime role with NOBYPASSRLS
  await db.query('CREATE ROLE resumepilot_tenant_runtime LOGIN NOBYPASSRLS');
  await db.query('GRANT USAGE ON SCHEMA tenant_data TO resumepilot_tenant_runtime');
  await db.query('GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_data.resources TO resumepilot_tenant_runtime');
  await db.query('SET ROLE resumepilot_tenant_runtime');

  // Create a pool-compatible wrapper
  const poolAdapter = {
    async connect() {
      return {
        query: (text, params) => db.query(text, params),
        release: () => {},
      };
    },
    end: () => db.close(),
  };

  return {
    pool: poolAdapter,
    rawDb: db,
    mode: 'EMBEDDED_POSTGRES_16_PGLITE',
    close: () => db.close(),
  };
}

test('real PostgreSQL pool and forced RLS isolation integration suite', async (t) => {
  const { pool, rawDb, mode, close } = await setupPostgresPool();

  t.after(async () => {
    await close();
  });

  const tenantA = crypto.randomUUID();
  const workspaceA1 = crypto.randomUUID();
  const workspaceA2 = crypto.randomUUID();
  const principalA = crypto.randomUUID();

  const tenantB = crypto.randomUUID();
  const workspaceB1 = crypto.randomUUID();
  const principalB = crypto.randomUUID();

  const contextA1 = freezeContext({
    requestId: 'req-real-pg-a1',
    principalId: principalA,
    subjectId: `subject-${principalA}`,
    tenantId: tenantA,
    workspaceId: workspaceA1,
    workspaceScope: 'WORKSPACE',
    policyVersion: 1,
    permissions: ['resource.read', 'resource.create'],
    tenant: { id: tenantA, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    dataPlane: { type: 'SHARED_POSTGRES', routingVersion: 1 },
  });

  const contextA_TenantWide = freezeContext({
    requestId: 'req-real-pg-a-wide',
    principalId: principalA,
    subjectId: `subject-${principalA}`,
    tenantId: tenantA,
    workspaceId: workspaceA1,
    workspaceScope: 'TENANT',
    policyVersion: 1,
    permissions: ['resource.read', 'resource.create'],
    tenant: { id: tenantA, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['TENANT_ADMIN'] },
    dataPlane: { type: 'SHARED_POSTGRES', routingVersion: 1 },
  });

  const contextB1 = freezeContext({
    requestId: 'req-real-pg-b1',
    principalId: principalB,
    subjectId: `subject-${principalB}`,
    tenantId: tenantB,
    workspaceId: workspaceB1,
    workspaceScope: 'WORKSPACE',
    policyVersion: 1,
    permissions: ['resource.read', 'resource.create'],
    tenant: { id: tenantB, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles: ['MEMBER'] },
    dataPlane: { type: 'SHARED_POSTGRES', routingVersion: 1 },
  });

  const resA1 = crypto.randomUUID();
  const resA2 = crypto.randomUUID();
  const resB1 = crypto.randomUUID();

  await t.test(`[${mode}] Tenant A1 transaction inserts and commits scoped resource`, async () => {
    await withTenantTransaction(pool, contextA1, async (client) => {
      await client.query(
        `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resA1, tenantA, workspaceA1, 'RESUME', principalA, JSON.stringify({ title: 'Resume A1' })]
      );
      const { rows } = await client.query(`SELECT id FROM tenant_data.resources WHERE id = $1`, [resA1]);
      assert.equal(rows.length, 1);
    });
  });

  await t.test(`[${mode}] Direct raw query without tenant context cannot read tenant rows`, async () => {
    const rawClient = await pool.connect();
    try {
      const { rows } = await rawClient.query(`SELECT id FROM tenant_data.resources WHERE id = $1`, [resA1]);
      assert.equal(rows.length, 0, 'Forced RLS must deny rows when app.tenant_id is missing');
    } finally {
      rawClient.release();
    }
  });

  await t.test(`[${mode}] Tenant B1 transaction inserts B1 and cannot read Tenant A1 rows`, async () => {
    await withTenantTransaction(pool, contextB1, async (client) => {
      await client.query(
        `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resB1, tenantB, workspaceB1, 'RESUME', principalB, JSON.stringify({ title: 'Resume B1' })]
      );

      const { rows: rowsB } = await client.query(`SELECT id FROM tenant_data.resources WHERE id = $1`, [resB1]);
      assert.equal(rowsB.length, 1);

      const { rows: rowsA } = await client.query(`SELECT id FROM tenant_data.resources WHERE id = $1`, [resA1]);
      assert.equal(rowsA.length, 0, 'Tenant B1 must never see Tenant A1 rows');
    });
  });

  await t.test(`[${mode}] Tenant A workspace isolation and tenant-wide scope rules`, async () => {
    // Insert A2 in workspaceA2 using tenant-wide context
    await withTenantTransaction(pool, contextA_TenantWide, async (client) => {
      await client.query(
        `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resA2, tenantA, workspaceA2, 'RESUME', principalA, JSON.stringify({ title: 'Resume A2' })]
      );
      const { rows } = await client.query(`SELECT id FROM tenant_data.resources WHERE tenant_id = $1 ORDER BY id`, [tenantA]);
      assert.equal(rows.length, 2, 'Tenant-wide scope sees both A1 and A2');
    });

    // Workspace-scoped A1 only sees A1
    await withTenantTransaction(pool, contextA1, async (client) => {
      const { rows } = await client.query(`SELECT id FROM tenant_data.resources WHERE tenant_id = $1 ORDER BY id`, [tenantA]);
      assert.equal(rows.length, 1, 'Workspace-scoped context sees only workspace A1 rows');
      assert.equal(rows[0].id, resA1);
    });
  });

  await t.test(`[${mode}] WITH CHECK constraint prevents cross-tenant or mismatched insertions`, async () => {
    await withTenantTransaction(pool, contextA1, async (client) => {
      await assert.rejects(async () => {
        await client.query(
          `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), tenantB, workspaceB1, 'RESUME', principalA, JSON.stringify({ title: 'Spoofed' })]
        );
      }, /policy|check|violat/i);
    });
  });

  await t.test(`[${mode}] Callback error triggers automatic ROLLBACK and leaves no partial state`, async () => {
    const rollbackResId = crypto.randomUUID();
    await assert.rejects(async () => {
      await withTenantTransaction(pool, contextA1, async (client) => {
        await client.query(
          `INSERT INTO tenant_data.resources (id, tenant_id, workspace_id, resource_type, owner_principal_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [rollbackResId, tenantA, workspaceA1, 'RESUME', principalA, JSON.stringify({ title: 'Rolled Back' })]
        );
        throw new Error('Simulated failure during transaction');
      });
    }, /Simulated failure during transaction/);

    await withTenantTransaction(pool, contextA1, async (client) => {
      const { rows } = await client.query(`SELECT id FROM tenant_data.resources WHERE id = $1`, [rollbackResId]);
      assert.equal(rows.length, 0, 'Rolled back row must not exist in table');
    });
  });

  await t.test(`[${mode}] Successive transactions on connection do not leak previous context`, async () => {
    await withTenantTransaction(pool, contextA1, async (client) => {
      const { rows } = await client.query(`SELECT id FROM tenant_data.resources`);
      assert.equal(rows.some(r => r.id === resA1), true);
      assert.equal(rows.some(r => r.id === resB1), false);
    });

    await withTenantTransaction(pool, contextB1, async (client) => {
      const { rows } = await client.query(`SELECT id FROM tenant_data.resources`);
      assert.equal(rows.some(r => r.id === resB1), true);
      assert.equal(rows.some(r => r.id === resA1), false);
    });
  });
});
