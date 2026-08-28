DROP INDEX IF EXISTS idx_payment_refund_claim ON payment_orders;

ALTER TABLE payment_orders
  DROP COLUMN IF EXISTS refund_requested_at,
  DROP COLUMN IF EXISTS refund_requested_by,
  DROP COLUMN IF EXISTS refund_reason,
  DROP COLUMN IF EXISTS refund_claimed_at,
  DROP COLUMN IF EXISTS refund_claim_id;
