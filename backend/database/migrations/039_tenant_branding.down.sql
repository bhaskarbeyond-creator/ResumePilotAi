-- Migration 039 Down: Revert Dynamic Tenant Branding
ALTER TABLE enterprise_tenant_configurations
    DROP COLUMN IF EXISTS branding;
