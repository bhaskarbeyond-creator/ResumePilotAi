-- Durable refund command state. A provider call is external and cannot share a
-- MariaDB transaction, so a short lease prevents concurrent refund commands
-- while allowing an abandoned attempt to be resumed safely.
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS refund_claim_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS refund_claimed_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS refund_requested_by VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS refund_requested_at DATETIME(3) NULL;

CREATE INDEX IF NOT EXISTS idx_payment_refund_claim
  ON payment_orders (status, refund_claimed_at);
