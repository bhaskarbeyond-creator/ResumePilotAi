-- DIR-022: subscription transition audit ledger + renewal grace period.
--
-- INV-3 / INV-4 rationale
-- ------------------------
-- `payment_webhook_events` already IS the idempotency ledger (provider event id
-- is the primary key), so this migration deliberately does NOT introduce a
-- second `processed_webhooks` table. Duplicating the ledger would let the same
-- provider event be claimed twice through two different code paths and break
-- exactly the double-crediting guarantee AC-1 exists to prevent.
--
-- What was genuinely missing is financial AUDITABILITY. MariaDB holds
-- entitlement truth in `users.paymentStatus` / `users.membership` plus
-- `payment_orders`, but every transition overwrote the previous value in place,
-- so "why is this account PAST_DUE?" was unanswerable after the fact. This
-- migration adds an append-only ledger so every transition CREATED -> ACTIVE ->
-- PAST_DUE -> CANCELLED/EXPIRED leaves an immutable, timestamped, actor-attributed
-- row that no UPDATE or DELETE path in the application can rewrite.
--
-- The grace columns support INV-5 (zero false-positive lockout): a transient
-- gateway decline flags `PAST_DUE` and starts a bounded recovery window instead
-- of revoking a paying user's resume access immediately. DATETIME(3) matches the
-- precision already used by the refund lease columns in migration 010.

CREATE TABLE IF NOT EXISTS subscription_audit_log (
    id CHAR(36) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    order_id VARCHAR(128),
    from_status VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    to_status VARCHAR(32) NOT NULL,
    actor VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
    reason VARCHAR(255),
    gateway VARCHAR(64),
    event_id VARCHAR(128),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_sal_uid_created (uid, created_at),
    INDEX idx_sal_order (order_id),
    INDEX idx_sal_transition (uid, to_status),
    INDEX idx_sal_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only enforcement. A financial audit trail that can be silently edited
-- is not an audit trail, so UPDATE and DELETE are refused at the database
-- boundary rather than merely being absent from the application code. This is
-- the strongest guarantee available without a separate privileged DB account.
CREATE TRIGGER subscription_audit_log_no_update
BEFORE UPDATE ON subscription_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'subscription_audit_log is append-only and cannot be updated';

CREATE TRIGGER subscription_audit_log_no_delete
BEFORE DELETE ON subscription_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'subscription_audit_log is append-only and cannot be deleted';

-- INV-5 grace window. `paymentGraceUntil` is the authoritative deadline;
-- `paymentGraceStartedAt` records when the failed renewal opened the window so
-- an operator can audit how long the account has been in recovery, and
-- `renewalFailedAt` records the provider decline itself so gateway-reported and
-- platform-observed failures stay distinguishable.
-- Three separate statements, not one: a MariaDB `AFTER` clause may only
-- reference a column that already exists, so adding a column and anchoring it
-- "after" a sibling introduced in the same ALTER TABLE is rejected.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS renewalFailedAt DATETIME(3) NULL DEFAULT NULL AFTER lastPaymentDate;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paymentGraceUntil DATETIME(3) NULL DEFAULT NULL AFTER renewalFailedAt;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paymentGraceStartedAt DATETIME(3) NULL DEFAULT NULL AFTER paymentGraceUntil;

-- Renewal state on the order row keeps the recurring-billing lifecycle (mirrors
-- the refund state machine added in migration 010) beside the financial record
-- it describes instead of on the user, so a failed renewal for a specific order
-- stays attributable to that order.
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS renewal_state VARCHAR(32) NOT NULL DEFAULT 'NOT_APPLICABLE' AFTER status;

CREATE INDEX IF NOT EXISTS idx_payment_orders_renewal
  ON payment_orders (renewal_state, updated_at);

CREATE INDEX IF NOT EXISTS idx_users_grace
  ON users (paymentStatus, paymentGraceUntil);