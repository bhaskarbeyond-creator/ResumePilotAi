-- Rollback for 003_billing_invoice_ledger.sql.
-- Production execution requires the same approved backup/change controls as an
-- upgrade; dropping issued invoices is destructive and must never be automatic.
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS invoice_counters;
