-- Safe only before new payment activation or refund reconciliation. Versioned
-- billing snapshots and provider-reference rows are durable financial evidence;
-- production rollback requires a verified backup and an accounting-approved
-- forward migration rather than running this file casually.

DROP TABLE IF EXISTS payment_refund_provider_references;

ALTER TABLE credit_notes
  DROP CONSTRAINT chk_credit_note_refund_reference_type,
  DROP COLUMN IF EXISTS provider_refund_reference_type;

DROP INDEX IF EXISTS idx_payment_billing_snapshot ON payment_orders;
ALTER TABLE payment_orders
  DROP CONSTRAINT chk_payment_billing_snapshot_complete,
  DROP CONSTRAINT chk_payment_refund_reference_type,
  DROP COLUMN IF EXISTS provider_refund_reference_type,
  DROP COLUMN IF EXISTS billing_snapshot_version,
  DROP COLUMN IF EXISTS billing_snapshot_hash,
  DROP COLUMN IF EXISTS supplier_snapshot,
  DROP COLUMN IF EXISTS billing_snapshot;
