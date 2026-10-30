#!/usr/bin/env node
'use strict';

/**
 * Module 16 (FP-B06 / INV-1): Tenant Data Retention, Archival & Purging Engine
 *
 * Scans churned/decommissioned enterprise tenants in DELETING status past the
 * retention grace period (default 90 days), writes a durable JSON archive of
 * tenant metadata, and hard-purges all tenant-partitioned MariaDB records
 * in foreign-key safe order while writing a platform security audit log.
 *
 * Usage:
 *   node backend/scripts/tenant-garbage-collector.js [--dry-run] [--grace-period-days 90] [--archive-dir <path>]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment defensively
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const { getPool } = require('../database/mysql');
const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
const { TenantService } = require('../enterprise/tenantService');

const DEFAULT_GRACE_PERIOD_DAYS = Number(process.env.TENANT_GC_GRACE_PERIOD_DAYS || 90);
const DEFAULT_ARCHIVE_DIR = path.resolve(__dirname, '..', 'data', 'archives', 'tenants');

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    dryRun: false,
    gracePeriodDays: DEFAULT_GRACE_PERIOD_DAYS,
    archiveDir: DEFAULT_ARCHIVE_DIR,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--grace-period-days' && args[i + 1]) {
      options.gracePeriodDays = Math.max(0, Number(args[++i]) || DEFAULT_GRACE_PERIOD_DAYS);
    } else if (arg === '--archive-dir' && args[i + 1]) {
      options.archiveDir = path.resolve(args[++i]);
    }
  }

  return options;
}

/**
 * Generates an archival JSON snapshot of a tenant prior to deletion.
 */
async function archiveTenantSnapshot(pool, tenantId, archiveDir) {
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const [tenants] = await pool.query('SELECT * FROM enterprise_tenants WHERE id = ?', [tenantId]);
  const [configs] = await pool.query('SELECT * FROM enterprise_tenant_configurations WHERE tenantId = ?', [tenantId]);
  const [workspaces] = await pool.query('SELECT id, name, created_at FROM enterprise_workspaces WHERE tenantId = ?', [tenantId]);
  const [memberships] = await pool.query('SELECT id, principalId, roles, status, created_at FROM enterprise_memberships WHERE tenantId = ?', [tenantId]);
  const [domains] = await pool.query('SELECT domain, dns_status, ssl_status, verified_at FROM tenant_custom_domains WHERE tenant_id = ?', [tenantId]).catch(() => [[]]);

  const archiveData = {
    archiveVersion: '1.0',
    archivedAt: new Date().toISOString(),
    tenantId,
    tenant: tenants[0] || null,
    configuration: configs[0] || null,
    workspaces: workspaces || [],
    memberships: memberships || [],
    customDomains: domains || [],
    checksum: null,
  };

  const payloadString = JSON.stringify(archiveData, null, 2);
  const checksum = crypto.createHash('sha256').update(payloadString).digest('hex');
  archiveData.checksum = checksum;

  const fileName = `tenant-archive-${tenantId}-${Date.now()}.json`;
  const filePath = path.join(archiveDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(archiveData, null, 2), 'utf8');

  return { filePath, checksum };
}

/**
 * Executes the tenant retention & garbage collection workflow.
 */
async function runTenantRetentionPurge({
  pool = getPool(),
  registry = null,
  service = null,
  gracePeriodDays = DEFAULT_GRACE_PERIOD_DAYS,
  archiveDir = DEFAULT_ARCHIVE_DIR,
  dryRun = false,
  requestId = `tenant-retention-${Date.now()}`,
} = {}) {
  const activeRegistry = registry || new MySqlTenantRegistry({ pool });
  const activeService = service || new TenantService({ registry: activeRegistry });

  const msInDay = 24 * 60 * 60 * 1000;
  const gracePeriodMs = gracePeriodDays * msInDay;
  const now = Date.now();

  // Find all tenants in DELETING lifecycle state
  const candidates = await activeRegistry.listTenantsByLifecycleState('DELETING', { limit: 1000 });
  const eligible = [];

  for (const tenant of candidates) {
    const rawDate = tenant.updatedAt || tenant.createdAt;
    const epoch = rawDate instanceof Date ? rawDate.getTime() : new Date(rawDate).getTime();
    const ageMs = now - epoch;
    if (ageMs > gracePeriodMs) {
      eligible.push({ tenant, ageDays: Math.floor(ageMs / msInDay) });
    }
  }

  const result = {
    dryRun,
    gracePeriodDays,
    considered: candidates.length,
    eligibleCount: eligible.length,
    archived: [],
    purgedCount: 0,
    failures: [],
  };

  if (dryRun) {
    result.eligibleTenants = eligible.map(e => ({ id: e.tenant.id, name: e.tenant.displayName, ageDays: e.ageDays }));
    return result;
  }

  for (const item of eligible) {
    const tenantId = item.tenant.id;
    try {
      // 1. Write archive snapshot
      const archiveResult = await archiveTenantSnapshot(pool, tenantId, archiveDir);
      result.archived.push({ tenantId, archiveFile: archiveResult.filePath, checksum: archiveResult.checksum });

      // 2. Hard purge tenant partitions and platform record
      await activeRegistry.purgeTenantRecords(tenantId, { requestId });
      result.purgedCount += 1;
    } catch (err) {
      console.error(`[TenantRetentionPurge] Failed to purge tenant ${tenantId}:`, err?.message);
      result.failures.push({ tenantId, error: err?.message || String(err) });
    }
  }

  return result;
}

// CLI entry point
if (require.main === module) {
  const options = parseArgs();
  console.log(`[TenantRetentionEngine] Starting purge run (grace period: ${options.gracePeriodDays} days, dry-run: ${options.dryRun})...`);

  runTenantRetentionPurge(options)
    .then(summary => {
      console.log('[TenantRetentionEngine] Complete:', JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[TenantRetentionEngine] Fatal error:', err);
      process.exit(1);
    });
}

module.exports = {
  DEFAULT_ARCHIVE_DIR,
  DEFAULT_GRACE_PERIOD_DAYS,
  archiveTenantSnapshot,
  parseArgs,
  runTenantRetentionPurge,
};
