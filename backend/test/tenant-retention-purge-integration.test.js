'use strict';

/**
 * Module 16: Tenant Data Retention, Archival & Purging Integration Suite (FP-B06 / INV-1)
 *
 * Verifies live MariaDB integration against `airesume_test`:
 * 1. Churned tenants in DELETING status >90 days are identified for archival & purging.
 * 2. Active tenants and recently decommissioned tenants (<90 days) are strictly preserved.
 * 3. JSON archival snapshot is created on disk with SHA-256 integrity checksum.
 * 4. Atomic cascade purge removes all tenant child records in FK-safe order.
 * 5. Platform security audit log PLATFORM_TENANT_HARD_DELETED is recorded in security_audit_logs.
 * 6. Dry-run mode previews candidates without touching MariaDB records.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.RUN_MARIADB_INTEGRATION = 'true';
process.env.MARIADB_TEST_ALLOW_RESET = 'true';
process.env.DB_NAME = process.env.DB_NAME || 'airesume_test';

const { getPool } = require('../database/mysql');
const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
const { TenantService } = require('../enterprise/tenantService');
const { runTenantRetentionPurge, archiveTenantSnapshot } = require('../scripts/tenant-garbage-collector');

test('Module 16: Churned Tenant Data Retention Archival & Hard Purge Engine', async (t) => {
  const pool = getPool();
  const testArchiveDir = path.join(os.tmpdir(), `tenant-gc-test-${Date.now()}`);

  const oldChurnedTenantId = '16161616-1616-4616-8616-161616161616';
  const recentDeletedTenantId = '26262626-2626-4626-8626-262626262626';
  const activeTenantId = '36363636-3636-4636-8636-363636363636';

  const registry = new MySqlTenantRegistry({ pool });
  const service = new TenantService({ registry });

  async function seedTestTenants() {
    // Clean up first
    await pool.query('DELETE FROM enterprise_tenants WHERE id IN (?, ?, ?)', [oldChurnedTenantId, recentDeletedTenantId, activeTenantId]);

    // 1. Churned tenant deleted 95 days ago
    await pool.query(
      `INSERT INTO enterprise_tenants (id, slug, displayName, legacyOwnerUid, lifecycleState, created_at, updated_at)
       VALUES (?, 'churned-corp', 'Churned Corp', 'churned-owner', 'DELETING',
               DATE_SUB(NOW(), INTERVAL 120 DAY), DATE_SUB(NOW(), INTERVAL 95 DAY))`,
      [oldChurnedTenantId]
    );

    // Seed child rows for churned tenant
    await pool.query(
      `INSERT INTO enterprise_tenant_configurations (tenantId, revision, customRoles, aiPolicy, quotaPolicy, retentionPolicy, securityPolicy, identityPolicy, commercials, branding, updated_at)
       VALUES (?, 1, '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', NOW())`,
      [oldChurnedTenantId]
    );
    await pool.query(
      `INSERT INTO enterprise_workspaces (id, tenantId, name, lifecycleState, isDefault, created_at, updated_at)
       VALUES ('ws-churned-1', ?, 'Engineering', 'ACTIVE', 1, NOW(), NOW())`,
      [oldChurnedTenantId]
    );
    await pool.query(
      `INSERT INTO enterprise_memberships (id, tenantId, principalId, status, roles, revision, created_at, updated_at)
       VALUES ('mem-churned-1', ?, 'user-churned-1', 'ACTIVE', '["MEMBER"]', 1, NOW(), NOW())`,
      [oldChurnedTenantId]
    );

    // 2. Recently decommissioned tenant (deleted 10 days ago)
    await pool.query(
      `INSERT INTO enterprise_tenants (id, slug, displayName, legacyOwnerUid, lifecycleState, created_at, updated_at)
       VALUES (?, 'recent-del-corp', 'Recent Deletion Corp', 'recent-del-owner', 'DELETING',
               DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY))`,
      [recentDeletedTenantId]
    );

    // 3. Active tenant
    await pool.query(
      `INSERT INTO enterprise_tenants (id, slug, displayName, legacyOwnerUid, lifecycleState, created_at, updated_at)
       VALUES (?, 'active-corp', 'Active Corp', 'active-owner', 'ACTIVE',
               DATE_SUB(NOW(), INTERVAL 300 DAY), NOW())`,
      [activeTenantId]
    );
  }

  t.before(async () => {
    await seedTestTenants();
  });

  t.after(async () => {
    await pool.query('DELETE FROM enterprise_tenants WHERE id IN (?, ?, ?)', [oldChurnedTenantId, recentDeletedTenantId, activeTenantId]);
    await pool.query('DELETE FROM security_audit_logs WHERE target_id IN (?, ?, ?)', [oldChurnedTenantId, recentDeletedTenantId, activeTenantId]);
    if (fs.existsSync(testArchiveDir)) {
      fs.rmSync(testArchiveDir, { recursive: true, force: true });
    }
  });

  await t.test('1. Dry-run mode identifies churned tenants >90 days without altering MariaDB', async () => {
    const summary = await runTenantRetentionPurge({
      pool,
      registry,
      service,
      gracePeriodDays: 90,
      dryRun: true,
      archiveDir: testArchiveDir,
    });

    assert.equal(summary.dryRun, true);
    assert.ok(summary.eligibleCount >= 1);
    const churnedMatch = summary.eligibleTenants.find(t => t.id === oldChurnedTenantId);
    assert.ok(churnedMatch, 'Churned tenant >90 days must be identified');
    assert.ok(churnedMatch.ageDays >= 90);

    // Verify row is still in DB
    const [rows] = await pool.query('SELECT lifecycleState FROM enterprise_tenants WHERE id = ?', [oldChurnedTenantId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].lifecycleState, 'DELETING');
  });

  await t.test('2. Tenant archival snapshot generates valid JSON with SHA-256 checksum on disk', async () => {
    const snapshot = await archiveTenantSnapshot(pool, oldChurnedTenantId, testArchiveDir);
    assert.ok(fs.existsSync(snapshot.filePath));
    assert.ok(snapshot.checksum);

    const fileContent = fs.readFileSync(snapshot.filePath, 'utf8');
    const parsed = JSON.parse(fileContent);
    assert.equal(parsed.tenantId, oldChurnedTenantId);
    assert.equal(parsed.tenant.slug, 'churned-corp');
    assert.equal(parsed.workspaces.length, 1);
    assert.equal(parsed.memberships.length, 1);
  });

  await t.test('3. Live retention purge cascades across relational partitions and writes platform audit log', async () => {
    const summary = await runTenantRetentionPurge({
      pool,
      registry,
      service,
      gracePeriodDays: 90,
      dryRun: false,
      archiveDir: testArchiveDir,
    });

    assert.ok(summary.purgedCount >= 1);
    assert.equal(summary.failures.length, 0);

    // 1. Churned tenant row must be completely removed
    const [tenants] = await pool.query('SELECT * FROM enterprise_tenants WHERE id = ?', [oldChurnedTenantId]);
    assert.equal(tenants.length, 0, 'Churned tenant must be hard-purged');

    // 2. Child tables must be completely cleared
    const [workspaces] = await pool.query('SELECT * FROM enterprise_workspaces WHERE tenantId = ?', [oldChurnedTenantId]);
    assert.equal(workspaces.length, 0);
    const [memberships] = await pool.query('SELECT * FROM enterprise_memberships WHERE tenantId = ?', [oldChurnedTenantId]);
    assert.equal(memberships.length, 0);

    // 3. Platform security audit log must be recorded
    const [auditRows] = await pool.query(
      'SELECT * FROM security_audit_logs WHERE target_id = ? AND action = "PLATFORM_TENANT_HARD_DELETED"',
      [oldChurnedTenantId]
    );
    assert.equal(auditRows.length, 1, 'Platform audit row must be committed with purge');
    assert.equal(auditRows[0].category, 'enterprise.tenancy');
  });

  await t.test('4. Recently deleted tenant (<90 days) and active tenant are strictly preserved', async () => {
    const [recentRows] = await pool.query('SELECT * FROM enterprise_tenants WHERE id = ?', [recentDeletedTenantId]);
    assert.equal(recentRows.length, 1, 'Recent deletion within 90 days must be preserved');
    assert.equal(recentRows[0].lifecycleState, 'DELETING');

    const [activeRows] = await pool.query('SELECT * FROM enterprise_tenants WHERE id = ?', [activeTenantId]);
    assert.equal(activeRows.length, 1, 'Active tenant must NEVER be purged');
    assert.equal(activeRows[0].lifecycleState, 'ACTIVE');
  });

  await t.test('5. Hard-purge operation is idempotent when tenant is already purged', async () => {
    const secondPurge = await registry.purgeTenantRecords(oldChurnedTenantId, { requestId: 'idempotent-test' });
    assert.deepEqual(secondPurge, { success: true, alreadyPurged: true });
  });
});
