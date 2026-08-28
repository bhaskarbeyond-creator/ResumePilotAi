-- Rollback for 006_enterprise_ai_usage_ledger.sql.
-- Provider, operation, idempotency, correlation, policy, and micro-cost metadata
-- written after migration 006 will be lost.

ALTER TABLE enterprise_ai_usage
  DROP FOREIGN KEY IF EXISTS fk_ent_ai_workspace,
  DROP FOREIGN KEY IF EXISTS fk_ent_ai_tenant;
DROP INDEX IF EXISTS idx_ent_ai_usage_tenant_provider ON enterprise_ai_usage;
DROP INDEX IF EXISTS idx_ent_ai_usage_tenant_recorded ON enterprise_ai_usage;
DROP INDEX IF EXISTS uq_ent_ai_usage_tenant_event ON enterprise_ai_usage;
DROP INDEX IF EXISTS uq_ent_workspace_tenant_id ON enterprise_workspaces;
ALTER TABLE enterprise_ai_usage
  DROP COLUMN IF EXISTS costMicros,
  DROP COLUMN IF EXISTS policyVersion,
  DROP COLUMN IF EXISTS correlationId,
  DROP COLUMN IF EXISTS eventKey,
  DROP COLUMN IF EXISTS operation,
  DROP COLUMN IF EXISTS provider;
