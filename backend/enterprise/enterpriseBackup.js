'use strict';

const crypto = require('crypto');
const { assertUuid } = require('./tenantContext');

// Logical tenant portability is intentionally separate from encrypted physical
// MariaDB backups. Credential hashes and transient quota buckets are excluded.
const TENANT_TABLES = Object.freeze([
  { table: 'enterprise_tenants', scopeColumn: 'id', keyColumns: ['id'] },
  { table: 'enterprise_workspaces', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'enterprise_memberships', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'enterprise_membership_invitations', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'enterprise_workspace_memberships', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'enterprise_tenant_configurations', scopeColumn: 'tenantId', keyColumns: ['tenantId'] },
  { table: 'enterprise_principal_tenants', scopeColumn: 'personalTenantId', keyColumns: ['principalId'] },
  { table: 'enterprise_teams', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'enterprise_team_members', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'enterprise_resources', scopeColumn: 'tenantId', keyColumns: ['tenantId', 'resourceType', 'id'] },
  { table: 'enterprise_audit_events', scopeColumn: 'tenantId', keyColumns: ['id'], appendOnly: true },
  { table: 'enterprise_ai_usage', scopeColumn: 'tenantId', keyColumns: ['id'], appendOnly: true },
  { table: 'enterprise_support_grants', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'enterprise_outbox', scopeColumn: 'tenantId', keyColumns: ['id'] },
  { table: 'notification_outbox', scopeColumn: 'tenant_id', keyColumns: ['id'] },
]);

const TABLE_BY_NAME = new Map(TENANT_TABLES.map(definition => [definition.table, definition]));

function canonicalize(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return { __ts: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __buffer: value.toString('base64') };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function revive(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(revive);
  if (Object.keys(value).length === 1 && typeof value.__ts === 'string') return new Date(value.__ts);
  if (Object.keys(value).length === 1 && typeof value.__buffer === 'string') return Buffer.from(value.__buffer, 'base64');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revive(item)]));
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

async function exportTenantSnapshot({ pool, tenantId, now = new Date() }) {
  if (!pool?.getConnection) {
    throw Object.assign(new Error('Enterprise export requires a MariaDB connection pool'), { code: 'ENTERPRISE_BACKUP_UNAVAILABLE', status: 503 });
  }
  tenantId = assertUuid(tenantId, 'Tenant identifier');
  const connection = await pool.getConnection();
  try {
    // One repeatable-read snapshot prevents rows committed halfway through the
    // export from producing a checksum-valid but relationally inconsistent file.
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const tables = [];
    for (const definition of TENANT_TABLES) {
      const [rows] = await connection.query(
        `SELECT * FROM \`${definition.table}\` WHERE \`${definition.scopeColumn}\` = ? ORDER BY ${definition.keyColumns.map(column => `\`${column}\``).join(', ')}`,
        [tenantId]
      );
      tables.push({
        name: definition.table,
        count: rows.length,
        rows: rows.map(row => canonicalize(row)),
      });
    }
    if (tables.find(table => table.name === 'enterprise_tenants')?.count !== 1) {
      throw Object.assign(new Error('Tenant was not found for logical export'), { code: 'TENANT_NOT_FOUND', status: 404 });
    }
    await connection.commit();
    const recordCount = tables.reduce((total, table) => total + table.count, 0);
    const content = tables.map(table => ({ name: table.name, count: table.count, rows: table.rows }));
    return Object.freeze({
      format: 'resumepilot-enterprise-mariadb-tenant-snapshot',
      version: 3,
      tenantId,
      createdAt: new Date(now).toISOString(),
      recordCount,
      checksum: checksum(content),
      tables,
      notes: [
        'enterprise_service_accounts are excluded because API-key hashes are credential material',
        'enterprise_quota_buckets are transient rate counters and are intentionally excluded',
        'Use encrypted physical MariaDB backups for complete disaster recovery',
      ],
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

function verifySnapshot(snapshot) {
  const problems = [];
  if (!snapshot || snapshot.format !== 'resumepilot-enterprise-mariadb-tenant-snapshot' || snapshot.version !== 3) {
    return { ok: false, problems: ['snapshot format/version is invalid'] };
  }
  try { assertUuid(snapshot.tenantId, 'Tenant identifier'); } catch { problems.push('snapshot tenantId is invalid'); }
  if (!Number.isFinite(Date.parse(String(snapshot.createdAt || '')))) problems.push('snapshot createdAt is invalid');
  if (!/^[a-f0-9]{64}$/.test(String(snapshot.checksum || ''))) problems.push('snapshot checksum encoding is invalid');
  const tables = Array.isArray(snapshot.tables) ? snapshot.tables : [];
  const seen = new Set();
  const rowsByTable = new Map();
  for (const table of tables) {
    if (!TABLE_BY_NAME.has(table?.name) || seen.has(table?.name)) {
      problems.push(`unknown or duplicate table: ${String(table?.name || '')}`);
      continue;
    }
    seen.add(table.name);
    const rows = Array.isArray(table.rows) ? table.rows : [];
    rowsByTable.set(table.name, rows);
    if (!Number.isInteger(table.count) || table.count < 0 || table.count !== rows.length) problems.push(`invalid count for ${table.name}`);
    const definition = TABLE_BY_NAME.get(table.name);
    const rowKeys = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        problems.push(`invalid row in ${table.name}`);
        continue;
      }
      if (String(row[definition.scopeColumn] || '') !== snapshot.tenantId) problems.push(`tenant scope mismatch in ${table.name}`);
      const keyParts = definition.keyColumns.map(column => row[column]);
      if (keyParts.some(value => value === null || value === undefined || typeof value === 'object' || String(value) === '')) {
        problems.push(`required key is missing or invalid in ${table.name}`);
        continue;
      }
      const rowKey = JSON.stringify(keyParts);
      if (rowKeys.has(rowKey)) problems.push(`duplicate row key in ${table.name}`);
      rowKeys.add(rowKey);
    }
  }
  for (const required of TENANT_TABLES) {
    if (!seen.has(required.table)) problems.push(`required table is missing: ${required.table}`);
  }
  const tenantRows = rowsByTable.get('enterprise_tenants') || [];
  if (tenantRows.length !== 1 || String(tenantRows[0]?.id || '') !== snapshot.tenantId) {
    problems.push('snapshot must contain exactly one matching tenant record');
  }
  const ids = table => new Set((rowsByTable.get(table) || []).map(row => String(row.id || '')));
  const membershipIds = ids('enterprise_memberships');
  const workspaceIds = ids('enterprise_workspaces');
  for (const invitation of rowsByTable.get('enterprise_membership_invitations') || []) {
    if (!membershipIds.has(String(invitation.membershipId || ''))) problems.push('invitation references a missing membership');
    if (!workspaceIds.has(String(invitation.workspaceId || ''))) problems.push('invitation references a missing workspace');
  }
  for (const row of rowsByTable.get('enterprise_workspace_memberships') || []) {
    if (!workspaceIds.has(String(row.workspaceId || ''))) problems.push('workspace membership references a missing workspace');
  }
  const recordCount = tables.reduce((total, table) => total + (Array.isArray(table.rows) ? table.rows.length : 0), 0);
  if (Number(snapshot.recordCount) !== recordCount) problems.push('record count mismatch');
  const recomputed = checksum(tables.map(table => ({ name: table.name, count: table.count, rows: table.rows })));
  if (recomputed !== snapshot.checksum) problems.push('checksum mismatch: snapshot was altered or corrupted');
  return { ok: problems.length === 0, problems, checksum: recomputed };
}

async function tableColumns(connection, table) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map(row => String(row.Field)));
}

async function restoreTenantSnapshot({ pool, snapshot, mode = 'dry-run' }) {
  if (!pool?.getConnection) {
    throw Object.assign(new Error('Enterprise restore requires a MariaDB connection pool'), { code: 'ENTERPRISE_BACKUP_UNAVAILABLE', status: 503 });
  }
  const verification = verifySnapshot(snapshot);
  if (!verification.ok) {
    throw Object.assign(new Error(`Snapshot verification failed: ${verification.problems.join('; ')}`), { code: 'ENTERPRISE_BACKUP_CORRUPT', status: 409 });
  }
  if (!['dry-run', 'apply'].includes(mode)) {
    throw Object.assign(new Error('Restore mode must be dry-run or apply'), { code: 'ENTERPRISE_BACKUP_INVALID_MODE', status: 400 });
  }
  const report = { mode, restored: 0, skipped: 0, verifiedChecksum: verification.checksum };
  if (mode === 'dry-run') {
    report.restored = snapshot.recordCount;
    return report;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Restore in the schema dependency order, never in caller-controlled file
    // order. This keeps foreign-key behavior deterministic for valid snapshots.
    const snapshotTables = new Map(snapshot.tables.map(table => [table.name, table]));
    for (const definition of TENANT_TABLES) {
      const table = snapshotTables.get(definition.table);
      const allowedColumns = await tableColumns(connection, table.name);
      for (const raw of table.rows) {
        const row = revive(raw);
        const columns = Object.keys(row).filter(column => allowedColumns.has(column));
        if (!columns.length || definition.keyColumns.some(column => !columns.includes(column))) {
          throw Object.assign(new Error(`Snapshot row is missing required keys for ${table.name}`), { code: 'ENTERPRISE_BACKUP_CORRUPT', status: 409 });
        }
        const values = columns.map(column => {
          const value = row[column];
          return value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value) ? JSON.stringify(value) : value;
        });
        const columnSql = columns.map(column => `\`${column}\``).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const updates = columns.filter(column => !definition.keyColumns.includes(column)).map(column => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
        const appendNoOp = `\`${definition.keyColumns[0]}\` = \`${definition.keyColumns[0]}\``;
        const sql = definition.appendOnly
          ? `INSERT INTO \`${table.name}\` (${columnSql}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${appendNoOp}`
          : `INSERT INTO \`${table.name}\` (${columnSql}) VALUES (${placeholders})${updates ? ` ON DUPLICATE KEY UPDATE ${updates}` : ''}`;
        const [result] = await connection.query(sql, values);
        {
          // ON DUPLICATE KEY is deliberately narrow: unlike INSERT IGNORE it
          // cannot hide truncation/FK/check failures. Validate every expected
          // primary-key row after its upsert so an alternate-unique-key
          // collision can neither masquerade as an idempotent append nor
          // mutate a different row during a mutable-table restore.
          const keyWhere = definition.keyColumns.map(column => `\`${column}\` = ?`).join(' AND ');
          const [persistedRows] = await connection.query(
            `SELECT ${columnSql} FROM \`${table.name}\` WHERE ${keyWhere} FOR UPDATE`,
            definition.keyColumns.map(column => row[column])
          );
          const persisted = persistedRows[0];
          const equivalent = persisted && columns.every(column => {
            const expected = row[column];
            const actual = persisted[column];
            if (expected === null || expected === undefined || actual === null || actual === undefined) return expected == null && actual == null;
            if (expected instanceof Date || actual instanceof Date) return new Date(expected).getTime() === new Date(actual).getTime();
            if (Buffer.isBuffer(expected) || Buffer.isBuffer(actual)) return Buffer.isBuffer(expected) && Buffer.isBuffer(actual) && expected.equals(actual);
            const normalizeJson = value => {
              if (typeof value !== 'string') return value;
              try { return JSON.parse(value); } catch { return value; }
            };
            const left = normalizeJson(expected);
            const right = normalizeJson(actual);
            if (typeof left === 'object' || typeof right === 'object') return checksum(left) === checksum(right);
            return String(left) === String(right);
          });
          if (!equivalent) {
            throw Object.assign(new Error(`Restore conflict in ${table.name}`), {
              code: 'ENTERPRISE_BACKUP_CONFLICT', status: 409,
            });
          }
        }
        if (Number(result.affectedRows || 0) > 0) report.restored += 1;
        else report.skipped += 1;
      }
    }
    await connection.commit();
    return report;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function verifyTenantRestored({ pool, snapshot }) {
  const fresh = await exportTenantSnapshot({ pool, tenantId: snapshot.tenantId });
  const expected = new Map();
  for (const table of snapshot.tables) {
    const definition = TABLE_BY_NAME.get(table.name);
    for (const row of table.rows) {
      expected.set(`${table.name}:${definition.keyColumns.map(column => row[column]).join(':')}`, checksum(row));
    }
  }
  const actual = new Map();
  for (const table of fresh.tables) {
    const definition = TABLE_BY_NAME.get(table.name);
    for (const row of table.rows) {
      actual.set(`${table.name}:${definition.keyColumns.map(column => row[column]).join(':')}`, checksum(row));
    }
  }
  const missing = [];
  const mismatched = [];
  for (const [key, hash] of expected) {
    if (!actual.has(key)) missing.push(key);
    else if (actual.get(key) !== hash) mismatched.push(key);
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

module.exports = {
  TENANT_TABLES,
  canonicalize,
  checksum,
  exportTenantSnapshot,
  restoreTenantSnapshot,
  verifySnapshot,
  verifyTenantRestored,
};
