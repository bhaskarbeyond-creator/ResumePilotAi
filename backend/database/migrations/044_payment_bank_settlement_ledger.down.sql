-- Migration 044 Down: Revert Live Bank Gateway Settlement Ledger & Webhook Reconciliation

DROP TABLE IF EXISTS payment_settlement_items;
DROP TABLE IF EXISTS payment_bank_settlements;

ALTER TABLE payment_orders
  DROP COLUMN IF EXISTS settlement_status,
  DROP COLUMN IF EXISTS settled_at,
  DROP COLUMN IF EXISTS settlement_id;
