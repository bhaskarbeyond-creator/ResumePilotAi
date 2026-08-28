-- Complete the MariaDB enterprise AI usage ledger contract.
-- Existing token columns remain authoritative and are projected as input/output
-- tokens by the repository. New nullable metadata columns preserve compatibility
-- with historical rows while every new write supplies a deterministic event key.

ALTER TABLE enterprise_ai_usage
  ADD COLUMN IF NOT EXISTS provider VARCHAR(80) NULL AFTER dayKey,
  ADD COLUMN IF NOT EXISTS operation VARCHAR(120) NULL AFTER model,
  ADD COLUMN IF NOT EXISTS eventKey CHAR(64) NULL AFTER operation,
  ADD COLUMN IF NOT EXISTS correlationId VARCHAR(160) NULL AFTER eventKey,
  ADD COLUMN IF NOT EXISTS policyVersion INT UNSIGNED NOT NULL DEFAULT 0 AFTER correlationId,
  ADD COLUMN IF NOT EXISTS costMicros BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER totalTokens;

-- Reject orphaned or cross-tenant usage rows at the storage boundary. Existing
-- inconsistent rows intentionally make this migration fail for operator review.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ent_workspace_tenant_id
  ON enterprise_workspaces (tenantId, id);

ALTER TABLE enterprise_ai_usage
  ADD CONSTRAINT fk_ent_ai_tenant FOREIGN KEY (tenantId)
    REFERENCES enterprise_tenants (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_ent_ai_workspace FOREIGN KEY (tenantId, workspaceId)
    REFERENCES enterprise_workspaces (tenantId, id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ent_ai_usage_tenant_event
  ON enterprise_ai_usage (tenantId, eventKey);

CREATE INDEX IF NOT EXISTS idx_ent_ai_usage_tenant_recorded
  ON enterprise_ai_usage (tenantId, recordedAt);

CREATE INDEX IF NOT EXISTS idx_ent_ai_usage_tenant_provider
  ON enterprise_ai_usage (tenantId, provider);
