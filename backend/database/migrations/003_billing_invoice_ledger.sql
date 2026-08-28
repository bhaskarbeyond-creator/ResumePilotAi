-- Immutable accounting invoices generated only from verified payment orders.
-- The payment-order row serializes concurrent generation for the same order;
-- invoice counter allocation and invoice insertion commit together.

CREATE TABLE IF NOT EXISTS invoice_counters (
    financial_year VARCHAR(20) NOT NULL PRIMARY KEY,
    next_sequence BIGINT UNSIGNED NOT NULL DEFAULT 1,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_invoice_counter_positive CHECK (next_sequence >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    invoice_number VARCHAR(96) NOT NULL,
    invoice_sequence BIGINT UNSIGNED NOT NULL,
    financial_year VARCHAR(20) NOT NULL,
    payment_order_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    payment_reference VARCHAR(255),
    payment_status VARCHAR(32) NOT NULL,
    currency CHAR(3) NOT NULL,
    taxable_amount DECIMAL(15,2) NOT NULL,
    tax_amount DECIMAL(15,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    payload JSON NOT NULL,
    issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_invoice_number (invoice_number),
    UNIQUE KEY uq_invoice_payment_order (payment_order_id),
    UNIQUE KEY uq_invoice_financial_sequence (financial_year, invoice_sequence),
    INDEX idx_invoice_user_issued (user_id, issued_at),
    CONSTRAINT fk_invoice_payment_order FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoice_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_invoice_taxable_nonnegative CHECK (taxable_amount >= 0),
    CONSTRAINT chk_invoice_tax_nonnegative CHECK (tax_amount >= 0),
    CONSTRAINT chk_invoice_total_positive CHECK (total_amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
