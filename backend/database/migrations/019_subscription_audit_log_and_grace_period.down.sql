-- Roll back the DIR-022 audit ledger + grace period extension.
--
-- The triggers must be dropped first: MariaDB refuses to drop a table that a
-- trigger references, so dropping `subscription_audit_log` while its own
-- BEFORE UPDATE / BEFORE DELETE triggers still exist fails with an error.
DROP TRIGGER IF EXISTS subscription_audit_log_no_update;
DROP TRIGGER IF EXISTS subscription_audit_log_no_delete;

DROP INDEX IF EXISTS idx_users_grace ON users;
DROP INDEX IF EXISTS idx_payment_orders_renewal ON payment_orders;

ALTER TABLE users
  DROP COLUMN IF EXISTS renewalFailedAt,
  DROP COLUMN IF EXISTS paymentGraceStartedAt,
  DROP COLUMN IF EXISTS paymentGraceUntil;

ALTER TABLE payment_orders
  DROP COLUMN IF EXISTS renewal_state;

DROP TABLE IF EXISTS subscription_audit_log;