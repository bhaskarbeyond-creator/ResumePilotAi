-- Provider refunds are external commands and cannot share a transaction with
-- MariaDB. Persist one idempotency key per logical attempt, the provider's
-- accepted reference/status, and immutable GST credit notes for completed full
-- refunds. A pending/unknown attempt keeps its key so retries cannot duplicate
-- the external money movement.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS refund_attempt INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_idempotency_key VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS provider_refund_status VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS provider_refund_updated_at DATETIME(3) NULL;

CREATE INDEX IF NOT EXISTS idx_payment_refund_reconciliation
  ON payment_orders (status, provider_refund_status, provider_refund_updated_at);

CREATE TABLE IF NOT EXISTS credit_note_counters (
    financial_year VARCHAR(20) NOT NULL PRIMARY KEY,
    next_sequence BIGINT UNSIGNED NOT NULL DEFAULT 1,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_credit_note_counter_positive CHECK (next_sequence >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_notes (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    credit_note_number VARCHAR(16) NOT NULL,
    credit_note_sequence BIGINT UNSIGNED NOT NULL,
    financial_year VARCHAR(20) NOT NULL,
    invoice_id VARCHAR(64) NOT NULL,
    payment_order_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    provider_refund_id VARCHAR(255) NOT NULL,
    currency CHAR(3) NOT NULL,
    taxable_amount DECIMAL(15,2) NOT NULL,
    tax_amount DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    payload JSON NOT NULL,
    issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_credit_note_number (credit_note_number),
    UNIQUE KEY uq_credit_note_invoice (invoice_id),
    UNIQUE KEY uq_credit_note_payment_order (payment_order_id),
    UNIQUE KEY uq_credit_note_financial_sequence (financial_year, credit_note_sequence),
    INDEX idx_credit_note_user_issued (user_id, issued_at),
    CONSTRAINT fk_credit_note_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
    CONSTRAINT fk_credit_note_payment_order FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_credit_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_credit_note_taxable_positive CHECK (taxable_amount > 0),
    CONSTRAINT chk_credit_note_tax_nonnegative CHECK (tax_amount >= 0),
    CONSTRAINT chk_credit_note_total_positive CHECK (total_amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
