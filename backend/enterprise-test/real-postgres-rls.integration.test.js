'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { withTenantTransaction } = require('../enterprise/tenantDataPlane');
const { freezeContext } = require('../enterprise/tenantContext');

const shouldRun = process.env.RUN_REAL_POSTGRES_RLS_TESTS === 'true';
const databaseUrl = process.env.TENANT_RUNTIME_DATABASE_URL || process.env.ENTERPRISE_RLS_VERIFY_DATABASE_URL || process.env.TENANT_DATABASE_URL;

test('real PostgreSQL pool and forced RLS isolation integration suite', { skip: !shouldRun || !databaseUrl ? 'Skipping real PostgreSQL integration tests (RUN_REAL_POSTGRES_RLS_TESTS=true and TENANT_RUNTIME_DATABASE_URL required)' : false }, async (t) => {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    application_name: 'resumepilot-rls-integration-verifier',
  });

  t.after(async () => {
    await pool.end().catch(() => {});
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
    dataPlane: { type: 'SHARED_POSTGRES', routingVersion: 1 },
  });

  const resA1 = crypto.randomUUID();
  const resA2 = crypto.randomUUID();
  const resB1 = crypto.randomUUID();

  await t.test('Tenant A1 transaction inserts and commits scoped resource', async () => {
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

  await t.test('Direct raw query without tenant context cannot read tenant rows', async () => {
    const rawClient = await pool.connect();
    try {
      const { rows } = await rawClient.query(`SELECT id FROM tenant_data.resources WHERE id = $1`, [resA1]);
      assert.equal(rows.length, 0, 'Forced RLS must deny rows when app.tenant_id is missing');
    } finally {
      rawClient.release();
    }
  });

  await t.test('Tenant B1 transaction inserts B1 and cannot read Tenant A1 rows', async () => {
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

  await t.test('Tenant A workspace isolation and tenant-wide scope rules', async () => {
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

  await t.test('WITH CHECK constraint prevents cross-tenant or mismatched insertions', async () => {
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

  await t.test('Callback error triggers automatic ROLLBACK and leaves no partial state', async () => {
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

  await t.test('Concurrent A and B transactions do not cross-contaminate pooled connections', async () => {
    const results = await Promise.all([
      withTenantTransaction(pool, contextA1, async (client) => {
        const { rows } = await client.query(`SELECT id FROM tenant_data.resources`);
        return { tenant: 'A', count: rows.length, ids: rows.map(r => r.id) };
      }),
      withTenantTransaction(pool, contextB1, async (client) => {
        const { rows } = await client.query(`SELECT id FROM tenant_data.resources`);
        return { tenant: 'B', count: rows.length, ids: rows.map(r => r.id) };
      }),
    ]);

    assert.equal(results[0].ids.includes(resA1), true);
    assert.equal(results[0].ids.includes(resB1), false);
    assert.equal(results[1].ids.includes(resB1), true);
    assert.equal(results[1].ids.includes(resA1), false);
  });
});
