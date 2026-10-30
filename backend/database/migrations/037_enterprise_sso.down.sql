-- Reverses 037_enterprise_sso.sql. Drop children before the parent so the
-- foreign keys never block the rollback.

DROP TABLE IF EXISTS saml_assertion_replay;
DROP TABLE IF EXISTS saml_authn_requests;
DROP TABLE IF EXISTS enterprise_sso_config;
