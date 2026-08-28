'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_DIR = path.resolve(__dirname, '../database/migrations');
function read(name) { return fs.readFileSync(path.join(MIGRATION_DIR, name), 'utf8'); }
function migrationFiles() { return fs.readdirSync(MIGRATION_DIR).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort(); }

test('enterprise MariaDB migrations are contiguous and each forward migration has an explicit rollback', () => {
  const up = migrationFiles().filter(name => !name.endsWith('.down.sql'));
  const versions = up.map(name => Number(name.slice(0, 3)));
  assert.deepEqual(versions, Array.from({ length: versions.length }, (_, index) => index + 1));
  for (const name of up) {
    assert.ok(read(name).trim().length > 0, `${name} must not be empty`);
    if (name.startsWith('001_')) continue; // A clean baseline is reverted by dropping the isolated database.
    const down = name.replace(/\.sql$/, '.down.sql');
    assert.ok(fs.existsSync(path.join(MIGRATION_DIR, down)), `${down} must exist`);
    assert.ok(read(down).trim().length > 0, `${down} must not be empty`);
  }
});

test('migration SQL contains no Firestore bridge, document path, or alternate data owner', () => {
  for (const name of migrationFiles()) {
    assert.doesNotMatch(read(name), /firestore|firebaseBridge|users\/\{uid\}|dual.?write/i, name);
  }
});

test('invitation and notification migration enforces relational ownership and delivery idempotency', () => {
  const sql = read('005_enterprise_invitation_outbox.sql');
  assert.match(sql, /FOREIGN KEY \(tenantId\)\s+REFERENCES enterprise_tenants \(id\)/i);
  assert.match(sql, /FOREIGN KEY \(notificationId\)\s+REFERENCES notification_outbox \(id\)/i);
  assert.match(sql, /UNIQUE KEY uq_ent_invitation_membership \(membershipId\)/i);
  assert.match(sql, /UNIQUE KEY uq_ent_invitation_event \(notificationEventId\)/i);
  assert.match(read('001_baseline.sql'), /UNIQUE KEY uq_notification_idempotency \(idempotency_key\)/i);
  assert.match(read('005_enterprise_invitation_outbox.down.sql'), /DROP TABLE IF EXISTS enterprise_membership_invitations/i);
});

test('AI ledger migration enforces tenant-scoped idempotency and API projection metadata', () => {
  const sql = read('006_enterprise_ai_usage_ledger.sql');
  for (const column of ['provider', 'operation', 'eventKey', 'correlationId', 'policyVersion', 'costMicros']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'), `${column} must be represented`);
  }
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS uq_ent_ai_usage_tenant_event\s+ON enterprise_ai_usage \(tenantId, eventKey\)/i);
  assert.match(sql, /CONSTRAINT fk_ent_ai_tenant FOREIGN KEY \(tenantId\)\s+REFERENCES enterprise_tenants \(id\)/i);
  assert.match(sql, /CONSTRAINT fk_ent_ai_workspace FOREIGN KEY \(tenantId, workspaceId\)\s+REFERENCES enterprise_workspaces \(tenantId, id\)/i);
  const down = read('006_enterprise_ai_usage_ledger.down.sql');
  assert.match(down, /DROP INDEX IF EXISTS uq_ent_ai_usage_tenant_event/i);
  assert.match(down, /DROP COLUMN IF EXISTS eventKey/i);
});

test('job tracker migration adds compare-and-swap revision metadata with rollback', () => {
  const sql = read('007_job_tracker_revision.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS revision INT UNSIGNED NOT NULL DEFAULT 1/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sort_order INT UNSIGNED NOT NULL DEFAULT 0/i);
  assert.match(sql, /idx_jt_user_updated/i);
  const down = read('007_job_tracker_revision.down.sql');
  assert.match(down, /DROP COLUMN IF EXISTS sort_order/i);
  assert.match(down, /DROP COLUMN IF EXISTS revision/i);
});

test('notification lifecycle migration constrains implemented states and has an evidence-preserving rollback', () => {
  const sql = read('008_notification_outbox_state_constraint.sql');
  for (const state of ['NOTIFICATION_QUEUED', 'DELIVERY_ATTEMPTED', 'RETRYING', 'DELIVERED', 'DEAD_LETTER', 'CANCELLED']) {
    assert.match(sql, new RegExp(`'${state}'`));
  }
  assert.match(sql, /CONSTRAINT chk_notification_outbox_state/i);
  assert.doesNotMatch(sql, /^\s*(?:UPDATE|DELETE)\b/im);
  const down = read('008_notification_outbox_state_constraint.down.sql');
  assert.match(down, /DROP CONSTRAINT chk_notification_outbox_state/i);
  assert.doesNotMatch(down, /^\s*(?:UPDATE|DELETE)\b/im);
});

test('refund reconciliation migration persists idempotency and immutable credit-note accounting', () => {
  const sql = read('011_refund_reconciliation_credit_notes.sql');
  for (const column of ['refund_attempt', 'refund_idempotency_key', 'provider_refund_status', 'provider_refund_updated_at']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'));
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS credit_notes/i);
  assert.match(sql, /UNIQUE KEY uq_credit_note_payment_order \(payment_order_id\)/i);
  assert.match(sql, /FOREIGN KEY \(invoice_id\) REFERENCES invoices\(id\) ON DELETE RESTRICT/i);
  assert.match(sql, /FOREIGN KEY \(payment_order_id\) REFERENCES payment_orders\(id\) ON DELETE RESTRICT/i);
  const down = read('011_refund_reconciliation_credit_notes.down.sql');
  assert.match(down, /DROP TABLE IF EXISTS credit_notes/i);
  assert.match(down, /DROP COLUMN IF EXISTS refund_idempotency_key/i);
});

test('billing snapshot and aggregate refund migration preserves complete financial evidence', () => {
  const sql = read('012_billing_snapshot_refund_references.sql');
  for (const column of ['billing_snapshot', 'supplier_snapshot', 'billing_snapshot_hash', 'billing_snapshot_version', 'provider_refund_reference_type']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'));
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS payment_refund_provider_references/i);
  assert.match(sql, /PRIMARY KEY \(provider, provider_refund_id\)/i);
  assert.match(sql, /FOREIGN KEY \(payment_order_id\) REFERENCES payment_orders\(id\) ON DELETE RESTRICT/i);
  assert.match(sql, /chk_payment_billing_snapshot_complete/i);
  assert.match(sql, /chk_payment_refund_reference_type/i);
  assert.match(sql, /chk_credit_note_refund_reference_type/i);
  assert.match(sql, /CHARACTER SET ascii COLLATE ascii_bin NOT NULL/i);
  const down = read('012_billing_snapshot_refund_references.down.sql');
  assert.match(down, /DROP TABLE IF EXISTS payment_refund_provider_references/i);
  assert.match(down, /DROP CONSTRAINT chk_payment_billing_snapshot_complete/i);
  assert.match(down, /DROP CONSTRAINT chk_credit_note_refund_reference_type/i);
  assert.match(down, /DROP COLUMN IF EXISTS billing_snapshot/i);
});

test('isolated migration verifier targets latest version 012 and requires rollback, failure, and reapply', () => {
  const verifier = fs.readFileSync(path.resolve(__dirname, '../../scripts/verify-mariadb-migrations.mjs'), 'utf8');
  assert.match(verifier, /version !== '012'/);
  assert.match(verifier, /012_billing_snapshot_refund_references\.down\.sql/);
  assert.match(verifier, /011_refund_reconciliation_credit_notes\.down\.sql/);
  assert.match(verifier, /010_payment_refund_state_machine\.down\.sql/);
  assert.match(verifier, /008_notification_outbox_state_constraint\.down\.sql/);
  assert.match(verifier, /UNKNOWN_HISTORICAL/);
  assert.match(verifier, /Incomplete billing snapshot/);
  assert.match(verifier, /Cross-order provider refund reference reuse/);
  assert.match(verifier, /Non-canonical refund currency/);
  assert.match(verifier, /007_job_tracker_revision\.down\.sql/);
  assert.match(verifier, /rollback/i);
  assert.match(verifier, /reappl/i);
  assert.match(verifier, /schema_migrations/);
});
