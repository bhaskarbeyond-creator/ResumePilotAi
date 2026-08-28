-- Safe only before production issuance. Applied credit notes are accounting
-- records and must be retained or restored from a verified backup, not casually
-- rolled back in place.
DROP TABLE IF EXISTS credit_notes;
DROP TABLE IF EXISTS credit_note_counters;

DROP INDEX IF EXISTS idx_payment_refund_reconciliation ON payment_orders;
ALTER TABLE payment_orders
  DROP COLUMN IF EXISTS provider_refund_updated_at,
  DROP COLUMN IF EXISTS provider_refund_status,
  DROP COLUMN IF EXISTS refund_idempotency_key,
  DROP COLUMN IF EXISTS refund_attempt;
