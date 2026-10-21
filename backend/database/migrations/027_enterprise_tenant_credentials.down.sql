-- Rollback: Remove encrypted tenant AI provider credentials store

DROP TABLE IF EXISTS enterprise_tenant_credential_tests;

DROP TABLE IF EXISTS enterprise_tenant_credentials;