-- Migration 040 Down: Revert Tenant Custom Domains & SSL Lifecycle
DROP TABLE IF EXISTS tenant_custom_domains;
