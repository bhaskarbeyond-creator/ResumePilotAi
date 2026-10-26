-- Bind the legal billing identity and supplier/tax configuration before any
-- provider is contacted. New payment orders carry a versioned, hashed snapshot
-- that activation consumes when it issues the immutable invoice in the same
-- MariaDB transaction as the entitlement grant.
--
-- A Stripe charge can be fully refunded through several partial refunds. Keep
-- every provider reference and amount in a normalized ledger instead of
-- misrepresenting the final partial-refund id as the whole reversal.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS billing_snapshot JSON NULL,
  ADD COLUMN IF NOT EXISTS supplier_snapshot JSON NULL,
  ADD COLUMN IF NOT EXISTS billing_snapshot_hash CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS billing_snapshot_version SMALLINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS provider_refund_reference_type VARCHAR(16) NULL,
  ADD CONSTRAINT chk_payment_billing_snapshot_complete CHECK (
    (billing_snapshot_version IS NULL AND billing_snapshot IS NULL
      AND supplier_snapshot IS NULL AND billing_snapshot_hash IS NULL)
    OR
    (billing_snapshot_version = 1 AND billing_snapshot IS NOT NULL
      AND supplier_snapshot IS NOT NULL AND billing_snapshot_hash IS NOT NULL
      AND billing_snapshot_hash COLLATE utf8mb4_bin REGEXP '^[a-f0-9]{64}$')
  ),
  ADD CONSTRAINT chk_payment_refund_reference_type CHECK (
    provider_refund_reference_type IS NULL
    OR provider_refund_reference_type IN ('PROVIDER', 'AGGREGATE')
  );

CREATE INDEX IF NOT EXISTS idx_payment_billing_snapshot
  ON payment_orders (billing_snapshot_version, status);

ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS provider_refund_reference_type VARCHAR(16) NOT NULL DEFAULT 'PROVIDER',
  ADD CONSTRAINT chk_credit_note_refund_reference_type CHECK (
    provider_refund_reference_type IN ('PROVIDER', 'AGGREGATE')
  );

CREATE TABLE IF NOT EXISTS payment_refund_provider_references (
    payment_order_id VARCHAR(128) NOT NULL,
    provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    provider_refund_id VARCHAR(255) NOT NULL,
    provider_status VARCHAR(32) NOT NULL,
    amount_minor BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    completed_at DATETIME(3) NULL,
    recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (provider, provider_refund_id),
    INDEX idx_refund_reference_order (payment_order_id, provider, provider_refund_id),
    INDEX idx_refund_reference_order_status (payment_order_id, provider_status),
    CONSTRAINT fk_refund_reference_order
      FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT,
    CONSTRAINT chk_refund_reference_amount CHECK (amount_minor > 0),
    CONSTRAINT chk_refund_reference_currency CHECK (currency REGEXP '^[A-Z]{3}$'),
    CONSTRAINT chk_refund_reference_type CHECK (provider IN ('stripe', 'paypal', 'razorpay', 'paytm', 'phonepe'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
