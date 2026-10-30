'use strict';

/**
 * Live MariaDB Integration Test Suite for Module 6 & Module 1:
 * Real Infrastructure Storage Telemetry & Tenant Quota Calculations
 * (FP-A08 / DISC-012)
 *
 * Verifies:
 * 1. Live database disk byte calculations from MariaDB information_schema
 * 2. Document storage byte aggregation across resumes
 * 3. Platform storage telemetry calculation without synthetic fallbacks
 * 4. Tenant-scoped storage quota and capacity threshold evaluation
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  getPlatformStorageTelemetry,
  getTenantStorageTelemetry,
  getDatabaseStorageBytes,
  getDocumentStorageBytes,
  DEFAULT_GLOBAL_QUOTA_MB,
} = require('../services/storageTelemetry');
const { getPool } = require('../database/mysql');

test('Module 6 & 1: Storage Infrastructure Telemetry Suite', async (t) => {
  const pool = getPool();
  const testTenantId = `tnt_stor_${crypto.randomUUID().substring(0, 16)}`;
  const testUserId = `usr_stor_${crypto.randomUUID().substring(0, 16)}`;
  const testMembershipId = `mbr_stor_${crypto.randomUUID().substring(0, 16)}`;
  const testResumeId = `res_${crypto.randomUUID().substring(0, 16)}`;
  const testResourceId = `rsc_${crypto.randomUUID().substring(0, 16)}`;

  const sampleSummary = 'Experienced software architect specialized in enterprise systems';
  const sampleResourceData = JSON.stringify({ assetType: 'portfolio_pdf', sizeBytes: 2048 });

  // Setup: create test tenant, user, membership, resume, and enterprise resource
  await pool.query(
    `INSERT INTO enterprise_tenants (id, displayName, slug, lifecycleState, seat_quota, created_at)
     VALUES (?, 'Acme Storage Test', ?, 'ACTIVE', 50, NOW(3))`,
    [testTenantId, `acme-${testTenantId.substring(9)}`]
  );

  await pool.query(
    `INSERT INTO enterprise_tenant_configurations (tenantId, quotaPolicy)
     VALUES (?, JSON_OBJECT('storageQuotaMb', 50))`,
    [testTenantId]
  );

  await pool.query(
    `INSERT INTO users (id, email, role, created_at)
     VALUES (?, ?, 'USER', NOW(3))`,
    [testUserId, `${testUserId}@example.com`]
  );

  await pool.query(
    `INSERT INTO enterprise_memberships (id, tenantId, principalId, roles, status, created_at)
     VALUES (?, ?, ?, '["MEMBER"]', 'ACTIVE', NOW(3))`,
    [testMembershipId, testTenantId, testUserId]
  );

  // Insert a test resume with known summary length
  await pool.query(
    `INSERT INTO resumes (id, user_id, title, summary, created_at)
     VALUES (?, ?, 'Test Resume for Storage', ?, NOW(3))`,
    [testResumeId, testUserId, sampleSummary]
  );

  // Insert an enterprise resource asset
  await pool.query(
    `INSERT INTO enterprise_resources (id, tenantId, resourceType, data, created_at)
     VALUES (?, ?, 'document', ?, NOW(3))`,
    [testResourceId, testTenantId, sampleResourceData]
  );

  const expectedTotalBytes = sampleSummary.length + sampleResourceData.length;

  t.after(async () => {
    // Teardown test records
    await pool.query('DELETE FROM resumes WHERE id = ?', [testResumeId]);
    await pool.query('DELETE FROM enterprise_resources WHERE tenantId = ?', [testTenantId]);
    await pool.query('DELETE FROM enterprise_memberships WHERE tenantId = ?', [testTenantId]);
    await pool.query('DELETE FROM enterprise_tenant_configurations WHERE tenantId = ?', [testTenantId]);
    await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
    await pool.query('DELETE FROM enterprise_tenants WHERE id = ?', [testTenantId]);
    await pool.end();
  });

  await t.test('1. getDatabaseStorageBytes queries real information_schema disk bytes', async () => {
    const dbStats = await getDatabaseStorageBytes(pool);

    assert.ok(typeof dbStats.totalBytes === 'number', 'totalBytes must be numeric');
    assert.ok(dbStats.totalBytes > 0, 'Database total bytes must be strictly greater than 0');
    assert.ok(dbStats.tableCount >= 80, `Expected at least 80 tables in MariaDB, got ${dbStats.tableCount}`);
    assert.ok(dbStats.dataBytes > 0, 'dataBytes must be greater than 0');
  });

  await t.test('2. getDocumentStorageBytes aggregates actual content bytes', async () => {
    const docStats = await getDocumentStorageBytes(pool, testTenantId);

    assert.equal(docStats.documentCount, 2, 'Should count 1 resume and 1 enterprise resource for tenant');
    assert.equal(docStats.documentBytes, expectedTotalBytes, 'Document bytes must equal expectedTotalBytes');
    assert.equal(docStats.averageBytesPerDoc, Math.round(expectedTotalBytes / 2));
  });

  await t.test('3. getPlatformStorageTelemetry returns authoritative live storage metrics', async () => {
    const telemetry = await getPlatformStorageTelemetry(pool);

    assert.equal(telemetry.source, 'relational_audit');
    assert.equal(telemetry.isLiveCalculation, true);
    assert.ok(telemetry.totalStorageBytes > 0, 'Total storage bytes must be > 0');
    assert.ok(telemetry.totalStorageMb > 0, 'Total storage MB must be > 0');
    assert.equal(telemetry.globalQuotaMb, DEFAULT_GLOBAL_QUOTA_MB);
    assert.ok(telemetry.quotaPercent >= 0 && telemetry.quotaPercent <= 100);
    assert.ok(['HEALTHY', 'WARNING', 'CRITICAL'].includes(telemetry.status));
  });

  await t.test('4. getTenantStorageTelemetry calculates tenant-scoped quota consumption', async () => {
    const tenantStats = await getTenantStorageTelemetry(pool, testTenantId);

    assert.equal(tenantStats.tenantId, testTenantId);
    assert.equal(tenantStats.name, 'Acme Storage Test');
    assert.equal(tenantStats.quotaMb, 50);
    assert.equal(tenantStats.usedBytes, expectedTotalBytes);
    assert.equal(tenantStats.quotaExceeded, false);

    // Rejection for non-existent tenant
    await assert.rejects(
      getTenantStorageTelemetry(pool, 'tnt_non_existent_uuid'),
      /Tenant organization was not found/
    );
  });
});
