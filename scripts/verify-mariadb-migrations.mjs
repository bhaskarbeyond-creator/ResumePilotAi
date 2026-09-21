#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mysql = require(path.join(ROOT, 'backend/node_modules/mysql2/promise'));
const {
  discoverMigrations,
  runMigrations,
  splitSqlStatements,
} = require(path.join(ROOT, 'backend/database/migrationRunner'));

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const rootUser = process.env.MARIADB_ADMIN_USER || 'root';
const rootPassword = process.env.MARIADB_ADMIN_PASSWORD;
if (!rootPassword) {
  console.error('MARIADB_ADMIN_PASSWORD is required for an isolated migration verification database.');
  process.exit(2);
}

const databaseName = `rp_migration_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error('Unsafe generated database name');
let admin;
let pool;

async function executeFile(connection, file) {
  const sql = fs.readFileSync(file, 'utf8');
  for (const statement of splitSqlStatements(sql)) await connection.query(statement);
}

async function scalar(connection, sql, params = []) {
  const [rows] = await connection.query(sql, params);
  return Number(Object.values(rows[0] || {})[0] || 0);
}

function isConstraintRejection(error) {
  return ['ER_CONSTRAINT_FAILED', 'WARN_DATA_TRUNCATED', 'ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE'].includes(error.code)
    || /\bCONSTRAINT\b|check constraint/i.test(String(error.message || ''));
}

async function expectDatabaseRejection(connection, sql, params, acceptedCodes, label) {
  try {
    await connection.query(sql, params);
  } catch (error) {
    if (acceptedCodes.includes(error.code) || isConstraintRejection(error)) return;
    throw error;
  }
  throw new Error(`${label} was not rejected by MariaDB`);
}

try {
  admin = await mysql.createConnection({ host, port, user: rootUser, password: rootPassword, connectTimeout: 15_000 });
  const [[versionRow]] = await admin.query('SELECT VERSION() AS version');
  const expectedVersion = String(process.env.EXPECTED_MARIADB_MAJOR_MINOR || '').trim();
  if (expectedVersion && !String(versionRow.version).startsWith(`${expectedVersion}.`)) {
    throw new Error(`Expected MariaDB ${expectedVersion}.x, observed ${versionRow.version}`);
  }
  await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  pool = mysql.createPool({ host, port, user: rootUser, password: rootPassword, database: databaseName, connectionLimit: 3, multipleStatements: false });

  const clean = await runMigrations(pool, { mode: 'apply', appliedBy: 'isolated-ci-verifier' });
  const discovered = discoverMigrations();
  const latestMigrationVersion = discovered.at(-1)?.version;
  if (!clean.current || latestMigrationVersion !== '017') throw new Error(`Clean-state migration application did not reach version 017 (observed ${latestMigrationVersion || 'none'})`);

  const invitationTableCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enterprise_membership_invitations'`,
    [databaseName]);
  const membershipIndexCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enterprise_memberships' AND INDEX_NAME = 'uq_ent_membership_tenant_principal'`,
    [databaseName]);
  const aiMetadataColumnCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enterprise_ai_usage'
       AND COLUMN_NAME IN ('provider', 'operation', 'eventKey', 'correlationId', 'policyVersion', 'costMicros')`,
    [databaseName]);
  const aiIdempotencyIndexCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enterprise_ai_usage'
       AND INDEX_NAME = 'uq_ent_ai_usage_tenant_event'`,
    [databaseName]);
  const aiForeignKeyCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'enterprise_ai_usage'
       AND CONSTRAINT_NAME IN ('fk_ent_ai_tenant', 'fk_ent_ai_workspace')`,
    [databaseName]);
  const trackerColumnCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'job_tracker'
       AND COLUMN_NAME IN ('revision', 'sort_order')`,
    [databaseName]);
  const trackerIndexCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'job_tracker'
       AND INDEX_NAME = 'idx_jt_user_updated'`,
    [databaseName]);
  const notificationStateConstraintCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'notification_outbox'
       AND CONSTRAINT_NAME = 'chk_notification_outbox_state' AND CONSTRAINT_TYPE = 'CHECK'`,
    [databaseName]);
  const refundStateColumnCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_orders'
       AND COLUMN_NAME IN ('refund_claim_id', 'refund_claimed_at', 'refund_reason', 'refund_requested_by',
                           'refund_requested_at', 'refund_attempt', 'refund_idempotency_key',
                           'provider_refund_status', 'provider_refund_updated_at')`,
    [databaseName]);
  const creditNoteTableCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('credit_notes', 'credit_note_counters')`,
    [databaseName]);
  const creditNoteForeignKeyCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'credit_notes'
       AND CONSTRAINT_NAME IN ('fk_credit_note_invoice', 'fk_credit_note_payment_order', 'fk_credit_note_user')`,
    [databaseName]);
  const billingSnapshotColumnCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_orders'
       AND COLUMN_NAME IN ('billing_snapshot', 'supplier_snapshot', 'billing_snapshot_hash',
                           'billing_snapshot_version', 'provider_refund_reference_type')`,
    [databaseName]);
  const creditNoteReferenceTypeCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'credit_notes'
       AND COLUMN_NAME = 'provider_refund_reference_type'`,
    [databaseName]);
  const refundReferenceTableCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_refund_provider_references'`,
    [databaseName]);
  const refundReferenceForeignKeyCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'payment_refund_provider_references'
       AND CONSTRAINT_NAME = 'fk_refund_reference_order'`,
    [databaseName]);
  const billingEvidenceConstraintCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_TYPE = 'CHECK'
       AND CONSTRAINT_NAME IN ('chk_payment_billing_snapshot_complete',
                               'chk_payment_refund_reference_type',
                               'chk_credit_note_refund_reference_type')`,
    [databaseName]);
  const configurationCategoryCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM system_settings
     WHERE category IN ('public_config', 'payment_providers', 'system_settings', 'admin_configuration')`);
  const cmsRelationalColumnCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND (
       (TABLE_NAME = 'custom_pages' AND COLUMN_NAME IN ('description', 'status', 'revision'))
       OR (TABLE_NAME = 'trusted_by' AND COLUMN_NAME = 'revision')
       OR (TABLE_NAME = 'reviews' AND COLUMN_NAME = 'revision')
     )`,
    [databaseName]);
  const customPageStatusConstraintCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'custom_pages'
       AND CONSTRAINT_NAME = 'chk_custom_page_status' AND CONSTRAINT_TYPE = 'CHECK'`,
    [databaseName]);
  const failClosedDefaultsCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM system_settings
     WHERE category = 'public_config' AND revision = 0
       AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.modules.enableGoogleAuthModule')) = 'false'
       AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.modules.enableAtsScoreModule')) = 'false'
       AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.enableLlmGeo')) = 'false'`);
  const unevidencedRatingCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM system_settings
     WHERE category = 'website_meta' AND revision = 0
       AND JSON_CONTAINS_PATH(data, 'one', '$.rating')`);
  const supportTicketTableCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('support_tickets', 'support_ticket_messages')`,
    [databaseName]);
  const resumeTargetColumnCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'resumes'
       AND COLUMN_NAME IN ('targetJobDescription', 'targetRole')`,
    [databaseName]);
  const liveInterviewTableCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'live_interview_sessions'`,
    [databaseName]);
  const liveInterviewColumnCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'live_interview_sessions'
       AND COLUMN_NAME IN ('id', 'user_id', 'status', 'revision', 'state_json', 'expires_at', 'completed_at', 'created_at', 'updated_at')`,
    [databaseName]);
  const liveInterviewIndexCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'live_interview_sessions'
       AND INDEX_NAME IN ('idx_live_interview_owner_active', 'idx_live_interview_expiry')`,
    [databaseName]);
  const liveInterviewConstraintCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'live_interview_sessions'
       AND CONSTRAINT_NAME = 'chk_live_interview_status' AND CONSTRAINT_TYPE = 'CHECK'`,
    [databaseName]);
  const liveInterviewForeignKeyCount = await scalar(pool,
    `SELECT COUNT(*) AS count FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'live_interview_sessions'
       AND CONSTRAINT_NAME = 'fk_live_interview_sessions_user'`,
    [databaseName]);
  if (invitationTableCount !== 1 || membershipIndexCount !== 2
      || aiMetadataColumnCount !== 6 || aiIdempotencyIndexCount !== 2 || aiForeignKeyCount !== 2
      || trackerColumnCount !== 2 || trackerIndexCount !== 2 || notificationStateConstraintCount !== 1
      || refundStateColumnCount !== 9 || creditNoteTableCount !== 2 || creditNoteForeignKeyCount !== 3
      || billingSnapshotColumnCount !== 5 || creditNoteReferenceTypeCount !== 1
      || refundReferenceTableCount !== 1 || refundReferenceForeignKeyCount !== 1
      || billingEvidenceConstraintCount !== 3 || configurationCategoryCount !== 4
      || cmsRelationalColumnCount !== 5 || customPageStatusConstraintCount !== 1
      || failClosedDefaultsCount !== 1 || unevidencedRatingCount !== 0
      || supportTicketTableCount !== 2 || resumeTargetColumnCount !== 2
      || liveInterviewTableCount !== 1 || liveInterviewColumnCount !== 9
      || liveInterviewIndexCount !== 4 || liveInterviewConstraintCount !== 1 || liveInterviewForeignKeyCount !== 1) {
    // information_schema.STATISTICS has one row per indexed column. The owner
    // index has three indexed columns and the expiry index has one.
    throw new Error('Migration 005-017 tables, columns, indexes, constraints, bootstrap rows, or fail-closed defaults are missing');
  }

  const paymentProbeSql = `INSERT INTO payment_orders
      (id, uid, plan_id, provider, amount, original_amount, currency, status, revision,
       billing_snapshot, supplier_snapshot, billing_snapshot_hash, billing_snapshot_version,
       provider_refund_reference_type)
     VALUES (?, 'migration-user', 'monthly', 'stripe', 100, 100, 'INR', 'PENDING_PAYMENT', 1,
             ?, ?, ?, ?, ?)`;
  const checkErrors = ['ER_CONSTRAINT_FAILED', 'WARN_DATA_TRUNCATED'];
  await expectDatabaseRejection(
    pool,
    paymentProbeSql,
    ['migration-012-incomplete', null, null, 'a'.repeat(64), 1, null],
    checkErrors,
    'Incomplete billing snapshot'
  );
  await expectDatabaseRejection(
    pool,
    paymentProbeSql,
    ['migration-012-reference-type', null, null, null, null, 'UNTRUSTED'],
    checkErrors,
    'Invalid payment refund reference type'
  );
  for (const id of ['migration-012-order-a', 'migration-012-order-b']) {
    await pool.query(paymentProbeSql, [id, '{}', '{}', 'a'.repeat(64), 1, 'PROVIDER']);
  }
  const refundProbeSql = `INSERT INTO payment_refund_provider_references
      (payment_order_id, provider, provider_refund_id, provider_status, amount_minor, currency)
     VALUES (?, ?, ?, 'SUCCEEDED', ?, ?)`;
  await pool.query(refundProbeSql, ['migration-012-order-a', 'stripe', 're_migration_012', 100, 'INR']);
  await expectDatabaseRejection(
    pool, refundProbeSql,
    ['migration-012-order-b', 'stripe', 're_migration_012', 100, 'INR'],
    ['ER_DUP_ENTRY'],
    'Cross-order provider refund reference reuse'
  );
  await expectDatabaseRejection(
    pool, refundProbeSql,
    ['migration-012-order-a', 'stripe', 're_zero_amount_012', 0, 'INR'],
    checkErrors,
    'Zero refund amount'
  );
  await expectDatabaseRejection(
    pool, refundProbeSql,
    ['migration-012-order-a', 'STRIPE', 're_upper_provider_012', 100, 'INR'],
    checkErrors,
    'Non-canonical refund provider'
  );
  await expectDatabaseRejection(
    pool, refundProbeSql,
    ['migration-012-order-a', 'stripe', 're_lower_currency_012', 100, 'inr'],
    checkErrors,
    'Non-canonical refund currency'
  );
  await expectDatabaseRejection(
    pool, refundProbeSql,
    ['migration-012-missing-order', 'stripe', 're_orphan_012', 100, 'INR'],
    ['ER_NO_REFERENCED_ROW_2'],
    'Orphan refund reference'
  );
  await pool.query("DELETE FROM payment_refund_provider_references WHERE payment_order_id LIKE 'migration-012-%'");
  await pool.query("DELETE FROM payment_orders WHERE id LIKE 'migration-012-%'");

  await pool.query(
    `INSERT INTO notification_outbox
       (id, event_id, recipient, template_type, state)
     VALUES ('migration-008-probe', 'migration-008-probe', 'probe@example.test', 'probe', 'NOTIFICATION_QUEUED')`
  );
  let invalidNotificationStateRejected = false;
  try {
    await pool.query("UPDATE notification_outbox SET state = 'INVALID_STATE' WHERE id = 'migration-008-probe'");
  } catch (error) {
    invalidNotificationStateRejected = isConstraintRejection(error);
  }
  if (!invalidNotificationStateRejected) throw new Error('Migration 008 CHECK did not reject an invalid notification state');
  await pool.query("DELETE FROM notification_outbox WHERE id = 'migration-008-probe'");

  await pool.query("INSERT INTO users (id, email, revision) VALUES ('migration-017-owner', 'migration-017@example.test', 1)");
  await expectDatabaseRejection(
    pool,
    `INSERT INTO live_interview_sessions
       (id, user_id, status, revision, state_json, expires_at)
     VALUES ('migration-017-invalid-status', 'migration-017-owner', 'INVALID', 1, '{}', DATE_ADD(NOW(3), INTERVAL 30 MINUTE))`,
    [],
    checkErrors,
    'Invalid live interview status'
  );
  await pool.query("DELETE FROM users WHERE id = 'migration-017-owner'");

  const connection = await pool.getConnection();
  try {
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/017_live_interview_sessions.down.sql'));
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'live_interview_sessions'`, [databaseName])) {
      throw new Error('Migration 017 rollback did not remove live interview sessions');
    }
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/016_resume_target_role_and_job_description.down.sql'));
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'resumes'
       AND COLUMN_NAME IN ('targetJobDescription', 'targetRole')`, [databaseName])) {
      throw new Error('Migration 016 rollback did not remove resume target metadata');
    }
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/015_support_tickets.down.sql'));
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('support_tickets', 'support_ticket_messages')`, [databaseName])) {
      throw new Error('Migration 015 rollback did not remove support ticket tables');
    }
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/014_fail_closed_discovery_defaults.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/013_cms_relational_authority.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/012_billing_snapshot_refund_references.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/011_refund_reconciliation_credit_notes.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/010_payment_refund_state_machine.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/009_authoritative_configuration_bootstrap.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/008_notification_outbox_state_constraint.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/007_job_tracker_revision.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/006_enterprise_ai_usage_ledger.down.sql'));
    await executeFile(connection, path.join(ROOT, 'backend/database/migrations/005_enterprise_invitation_outbox.down.sql'));
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enterprise_membership_invitations'`, [databaseName])) {
      throw new Error('Migration 005 rollback did not remove the invitation table');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enterprise_ai_usage' AND COLUMN_NAME = 'eventKey'`, [databaseName])) {
      throw new Error('Migration 006 rollback did not remove AI ledger metadata');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'job_tracker' AND COLUMN_NAME IN ('revision', 'sort_order')`, [databaseName])) {
      throw new Error('Migration 007 rollback did not remove job tracker revision metadata');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'notification_outbox' AND CONSTRAINT_NAME = 'chk_notification_outbox_state'`, [databaseName])) {
      throw new Error('Migration 008 rollback did not remove the notification state constraint');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_refund_provider_references'`, [databaseName])) {
      throw new Error('Migration 012 rollback did not remove the refund-reference table');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_orders' AND COLUMN_NAME IN ('billing_snapshot', 'billing_snapshot_version', 'provider_refund_reference_type')`, [databaseName])) {
      throw new Error('Migration 012 rollback did not remove billing snapshot metadata');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_orders' AND COLUMN_NAME IN ('refund_claim_id', 'refund_idempotency_key')`, [databaseName])) {
      throw new Error('Migration 010/011 rollback did not remove refund state metadata');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('credit_notes', 'credit_note_counters')`, [databaseName])) {
      throw new Error('Migration 011 rollback did not remove credit-note tables');
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND (
         (TABLE_NAME = 'custom_pages' AND COLUMN_NAME IN ('description', 'status', 'revision'))
         OR (TABLE_NAME = 'trusted_by' AND COLUMN_NAME = 'revision')
         OR (TABLE_NAME = 'reviews' AND COLUMN_NAME = 'revision')
       )`, [databaseName])) {
      throw new Error('Migration 013 rollback did not remove CMS relational metadata');
    }
    await connection.query("DELETE FROM schema_migrations WHERE version IN ('005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016', '017')");
  } finally {
    connection.release();
  }

  const reapplied = await runMigrations(pool, { mode: 'apply', appliedBy: 'isolated-ci-rollback-verifier' });
  if (!reapplied.current || !['005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016', '017'].every(version => reapplied.applied.some(item => item.version === version))) {
    throw new Error('Migrations 005 through 017 did not reapply after rollback');
  }

  // Migration 008 must reject historical unknown states instead of silently
  // relabelling durable delivery evidence. Exercise its rollback independently,
  // introduce a corrupt row, prove reapplication fails closed, repair it, and
  // prove a clean reapplication succeeds.
  const notificationConnection = await pool.getConnection();
  try {
    await executeFile(notificationConnection, path.join(ROOT, 'backend/database/migrations/008_notification_outbox_state_constraint.down.sql'));
    await notificationConnection.query("DELETE FROM schema_migrations WHERE version = '008'");
    await notificationConnection.query(
      `INSERT INTO notification_outbox
         (id, event_id, recipient, template_type, state)
       VALUES ('migration-008-historical', 'migration-008-historical', 'probe@example.test', 'probe', 'UNKNOWN_HISTORICAL')`
    );
  } finally {
    notificationConnection.release();
  }
  let historicalStateRejected = false;
  try {
    await runMigrations(pool, { mode: 'apply', appliedBy: 'isolated-ci-invalid-state-verifier' });
  } catch (error) {
    historicalStateRejected = error.migration === '008_notification_outbox_state_constraint.sql';
  }
  if (!historicalStateRejected) throw new Error('Migration 008 did not fail closed on an unknown historical notification state');
  await pool.query("UPDATE notification_outbox SET state = 'NOTIFICATION_QUEUED' WHERE id = 'migration-008-historical'");
  const notificationReapplied = await runMigrations(pool, { mode: 'apply', appliedBy: 'isolated-ci-notification-repair-verifier' });
  if (!notificationReapplied.current || !notificationReapplied.applied.some(item => item.version === '008')) {
    throw new Error('Migration 008 did not reapply after historical state remediation');
  }
  await pool.query("DELETE FROM notification_outbox WHERE id = 'migration-008-historical'");

  const duplicateConnection = await pool.getConnection();
  try {
    await executeFile(duplicateConnection, path.join(ROOT, 'backend/database/migrations/008_notification_outbox_state_constraint.down.sql'));
    await executeFile(duplicateConnection, path.join(ROOT, 'backend/database/migrations/007_job_tracker_revision.down.sql'));
    await executeFile(duplicateConnection, path.join(ROOT, 'backend/database/migrations/006_enterprise_ai_usage_ledger.down.sql'));
    await executeFile(duplicateConnection, path.join(ROOT, 'backend/database/migrations/005_enterprise_invitation_outbox.down.sql'));
    await duplicateConnection.query("DELETE FROM schema_migrations WHERE version IN ('005', '006', '007', '008')");
    await duplicateConnection.query(
      `INSERT INTO enterprise_memberships (id, tenantId, principalId, canonicalPrincipalId, workspaceId, status, roles, revision)
       VALUES ('duplicate-a', 'tenant-duplicate', 'principal-duplicate', NULL, NULL, 'ACTIVE', '[\"MEMBER\"]', 1),
              ('duplicate-b', 'tenant-duplicate', 'principal-duplicate', NULL, NULL, 'ACTIVE', '[\"MEMBER\"]', 1)`
    );
  } finally {
    duplicateConnection.release();
  }

  let duplicateRejected = false;
  try {
    await runMigrations(pool, { mode: 'apply', appliedBy: 'isolated-ci-duplicate-verifier' });
  } catch (error) {
    duplicateRejected = error.code === 'ER_DUP_ENTRY' && error.migration === '005_enterprise_invitation_outbox.sql';
  }
  if (!duplicateRejected) throw new Error('Migration 005 did not fail closed on duplicate tenant/principal memberships');
  await pool.query("DELETE FROM enterprise_memberships WHERE id = 'duplicate-b'");
  const repaired = await runMigrations(pool, { mode: 'apply', appliedBy: 'isolated-ci-repair-verifier' });
  if (!repaired.current) throw new Error('Migration 005 did not apply after duplicate membership remediation');

  await pool.query("INSERT INTO enterprise_tenants (id, slug, displayName) VALUES ('tenant-fixture', 'tenant-fixture', 'Tenant Fixture')");
  await pool.query("INSERT INTO enterprise_workspaces (id, tenantId, name) VALUES ('workspace-fixture', 'tenant-fixture', 'Workspace Fixture')");
  await pool.query("INSERT INTO enterprise_memberships (id, tenantId, principalId, workspaceId, status, roles) VALUES ('membership-fixture', 'tenant-fixture', 'principal-fixture', 'workspace-fixture', 'INVITED', '[\"MEMBER\"]')");
  await pool.query(
    `INSERT INTO enterprise_membership_invitations
       (id, membershipId, tenantId, principalId, workspaceId, recipientEmail, invitedByPrincipalId, expiresAt)
     VALUES ('invitation-fixture', 'membership-fixture', 'tenant-fixture', 'principal-fixture', 'workspace-fixture', 'invitee@example.com', 'owner-fixture', DATE_ADD(NOW(6), INTERVAL 7 DAY))`
  );

  let checkRejected = false;
  try {
    await pool.query("UPDATE enterprise_membership_invitations SET invitationState = 'INVALID' WHERE id = 'invitation-fixture'");
  } catch (error) { checkRejected = isConstraintRejection(error); }
  if (!checkRejected) throw new Error('Invitation state CHECK constraint did not reject an invalid state');

  let foreignKeyRejected = false;
  try {
    await pool.query(
      `INSERT INTO enterprise_membership_invitations
         (id, membershipId, tenantId, principalId, workspaceId, recipientEmail, invitedByPrincipalId, expiresAt)
       VALUES ('invitation-orphan', 'missing-membership', 'tenant-fixture', 'principal-fixture-2', 'workspace-fixture', 'orphan@example.com', 'owner-fixture', DATE_ADD(NOW(6), INTERVAL 7 DAY))`
    );
  } catch (error) { foreignKeyRejected = error.code === 'ER_NO_REFERENCED_ROW_2'; }
  if (!foreignKeyRejected) throw new Error('Invitation membership foreign key did not reject an orphan');

  const failedAttempts = await scalar(pool, "SELECT COUNT(*) FROM schema_migration_attempts WHERE version = '005' AND outcome = 'FAILED'");
  if (failedAttempts < 1) throw new Error('Failed duplicate migration attempt was not recorded');

  console.log(JSON.stringify({
    status: 'VERIFIED',
    mariadbVersion: versionRow.version,
    cleanMigrationsApplied: clean.applied.length,
    rollbackReapply: true,
    notificationStateRollbackReapply: true,
    notificationHistoricalStateFailure: true,
    duplicatePreflightFailure: true,
    constraints: true,
  }));
} catch (error) {
  const detail = {
    status: 'NOT VERIFIED',
    code: error.code || null,
    migration: error.migration || null,
    message: String(error.message || error),
  };
  console.error(JSON.stringify(detail));
  if (process.env.GITHUB_ACTIONS) {
    const annotation = `${detail.migration ? `${detail.migration}: ` : ''}${detail.code ? `${detail.code}: ` : ''}${detail.message}`
      .replace(/\r?\n/g, ' ')
      .slice(0, 500);
    console.error(`::error title=MariaDB migration verifier failed::${annotation}`);
  }
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``).catch(() => {});
    await admin.end().catch(() => {});
  }
}
