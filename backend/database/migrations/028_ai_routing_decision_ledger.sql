-- PH4-ENGINE-022: durable AI routing decision ledger (design: developer-review/prep-021-022/schema-proposal.md §4.1)
-- One row per routed AI request, joinable to enterprise_ai_usage via decision_id (migration 029).
-- Observability data, NOT a system of record: quota (ai_usage) and billing (enterprise_ai_usage) never depend on it.
-- No FK constraints by design: write paths differ per engine and the ledger must never block or fail a request
-- (fail-open on evidence, fail-closed on money). Joins are logical, documented in the schema proposal.
-- NULL-when-unknown discipline (F-18): token counts and observed latency are NULL for unknowns, never 0.

CREATE TABLE IF NOT EXISTS ai_routing_decisions (
    decision_id         CHAR(36)     NOT NULL PRIMARY KEY,
    created_at          DATETIME(3)  NOT NULL,
    day_key             VARCHAR(10)  NOT NULL,
    scope               VARCHAR(16)  NOT NULL,
    tenant_id           VARCHAR(128) NULL,
    uid_hash            VARCHAR(40)  NULL,
    mode                VARCHAR(16)  NULL,
    requested_model     VARCHAR(128) NULL,
    chosen_provider     VARCHAR(64)  NULL,
    chosen_model        VARCHAR(128) NULL,
    exploration         VARCHAR(16)  NULL,
    quality_evidence    VARCHAR(32)  NULL,
    observed_latency_ms INT          NULL,
    observation_count   INT          NULL,
    outcome             VARCHAR(16)  NULL,
    status              SMALLINT     NULL,
    latency_ms          INT          NULL,
    prompt_tokens       INT          NULL,
    completion_tokens   INT          NULL,
    INDEX idx_ard_tenant_day  (tenant_id, day_key),
    INDEX idx_ard_uid_day     (uid_hash, day_key),
    INDEX idx_ard_created     (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
