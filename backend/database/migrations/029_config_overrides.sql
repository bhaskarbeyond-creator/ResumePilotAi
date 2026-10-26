-- 029_config_overrides — dashboard-editable configuration with a revision guard
-- and a per-key audit trail (REC-012, INV-4, INV-6, CFG-001…034).
--
-- Why a generic table instead of more `system_settings` categories: the register
-- found nine values whose dashboard field either failed its write or landed in a
-- category nothing read. A generic store keyed by the registry key means the value
-- the operator edits and the value the runtime reads are the same row, and adding a
-- key does not require a migration.
--
-- `revision` is per row, not per category: two operators editing different keys must
-- not invalidate each other's form. The write path compares the revision it was shown
-- against this row (SELECT … FOR UPDATE) and refuses on mismatch, so a stale form
-- cannot silently overwrite a change made in another tab.
CREATE TABLE IF NOT EXISTS config_overrides (
    config_key VARCHAR(191) NOT NULL PRIMARY KEY,
    value JSON NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    updated_by VARCHAR(128) NULL,
    updated_by_email VARCHAR(255) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The change log. Kept separately from `admin_audit_logs` because it answers a
-- different question — "what was this value before, and who changed it" — and must
-- survive retention pruning of the request-level trail implemented by CFG-015, which
-- defaults to one year while a value's history is expected to outlive that.
CREATE TABLE IF NOT EXISTS config_change_log (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    config_key VARCHAR(191) NOT NULL,
    scope VARCHAR(32) NOT NULL,
    value_before JSON NULL,
    value_after JSON NOT NULL,
    revision_before INT NULL,
    revision_after INT NOT NULL,
    actor_uid VARCHAR(128) NOT NULL,
    actor_email VARCHAR(255) NULL,
    actor_role VARCHAR(64) NULL,
    reason VARCHAR(500) NULL,
    request_id VARCHAR(128) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_config_change_key (config_key, created_at),
    INDEX idx_config_change_actor (actor_uid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
