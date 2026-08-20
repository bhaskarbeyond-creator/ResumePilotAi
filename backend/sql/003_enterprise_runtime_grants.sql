-- DBA-only post-migration grants. Run after 001/002 and never from the API/worker.

REVOKE ALL ON SCHEMA tenant_data FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA tenant_data FROM PUBLIC;

GRANT USAGE ON SCHEMA tenant_data TO resumepilot_tenant_runtime, resumepilot_tenant_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_data.resources TO resumepilot_tenant_runtime, resumepilot_tenant_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_data.audit_events TO resumepilot_tenant_runtime, resumepilot_tenant_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_data.ai_usage_ledger TO resumepilot_tenant_runtime, resumepilot_tenant_worker;

-- Runtime identities receive no TRUNCATE, ALTER, ownership, schema creation, platform
-- control-plane table access, superuser, or BYPASSRLS privilege.
