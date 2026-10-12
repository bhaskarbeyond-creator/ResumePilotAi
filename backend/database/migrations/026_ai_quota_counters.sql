-- DIR-106 — AI quota: organization-wide (shared) counter + tenant attribution.
--
-- PROBLEM THIS SOLVES (P0-5)
-- `ai_usage` is keyed (day_key, uid_hash) — per user only. With N members each
-- granted a personal limit, a tenant's real ceiling was N x perUserLimit and was
-- never enforced. Rule A requires: "Organization-level limits must be enforced
-- across all applicable users and requests, including concurrent requests."
--
-- This migration is purely ADDITIVE:
--   * `ai_usage` gains tenant attribution columns (nullable / defaulted), so an
--     existing row keeps its meaning and no backfill is required.
--   * `ai_quota_counters` is a new table holding the SHARED organization counter.
--     Per-user counters continue to live in `ai_usage`, which is already
--     concurrency-safe (SELECT ... FOR UPDATE).
--
-- Both counters are written inside ONE transaction by `enforceDailyAiQuota`, so
-- a request is either charged to both or to neither.

ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(128) NULL AFTER uid,
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL' AFTER tenant_id;

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_day
  ON ai_usage (tenant_id, day_key);

-- Shared quota counters. One row per (scope, scope_key, uid, day_key).
--   scope='TENANT', scope_key=<tenantId>, uid=''      -> the organization budget
-- The unique primary key is what makes the guarded UPDATE race-free.
CREATE TABLE IF NOT EXISTS ai_quota_counters (
    scope VARCHAR(20) NOT NULL,
    scope_key VARCHAR(160) NOT NULL,
    uid VARCHAR(128) NOT NULL DEFAULT '',
    day_key VARCHAR(10) NOT NULL,
    count INT NOT NULL DEFAULT 0,
    limit_used INT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scope, scope_key, uid, day_key),
    INDEX idx_ai_qc_scope_day (scope, scope_key, day_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
