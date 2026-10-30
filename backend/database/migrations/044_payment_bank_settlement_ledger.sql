-- Migration 044: Live Bank Gateway Settlement Ledger & Webhook Reconciliation
-- Target: MariaDB 10.4+ / 11.4+
-- Implements FP-G15 (Live Bank Gateway Settlement & Payout Ledger)

CREATE TABLE IF NOT EXISTS payment_bank_settlements (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    settlement_id VARCHAR(128) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    gross_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    fee_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    net_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    bank_utr VARCHAR(128) NULL,
    bank_account_last4 VARCHAR(8) NULL,
    settled_at DATETIME(3) NULL,
    failure_reason VARCHAR(255) NULL,
    reconciled_order_count INT NOT NULL DEFAULT 0,
    metadata JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_settlement_provider_id (provider, settlement_id),
    INDEX idx_settlement_status (status),
    INDEX idx_settlement_settled_at (settled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_settlement_items (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    settlement_id VARCHAR(128) NOT NULL,
    payment_order_id VARCHAR(128) NOT NULL,
    provider_payment_id VARCHAR(255) NULL,
    order_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    fee DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    net DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_settlement_order (payment_order_id),
    INDEX idx_settlement_item_parent (settlement_id),
    CONSTRAINT fk_settlement_item_parent FOREIGN KEY (settlement_id) REFERENCES payment_bank_settlements(id) ON DELETE CASCADE,
    CONSTRAINT fk_settlement_item_order FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(32) NOT NULL DEFAULT 'UNSETTLED',
  ADD COLUMN IF NOT EXISTS settled_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS settlement_id VARCHAR(128) NULL;

CREATE INDEX IF NOT EXISTS idx_order_settlement_status ON payment_orders (settlement_status);
