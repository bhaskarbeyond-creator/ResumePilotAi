-- DBA-only bootstrap. Do not run from the application, worker, or ordinary migration role.
-- Adapt role names/secret management to the managed PostgreSQL provider.

-- The runtime role has LOGIN supplied by the secret manager, NOINHERIT, and no
-- superuser/createdb/createrole/replication/BYPASSRLS capability.
CREATE ROLE resumepilot_tenant_runtime
  NOINHERIT
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

CREATE ROLE resumepilot_tenant_worker
  NOINHERIT
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

-- The migration owner is intentionally distinct. It is never injected into API/worker
-- runtime and is used only by approved CI/CD migrations.
CREATE ROLE resumepilot_tenant_migrator
  NOINHERIT
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

-- Table/schema grants are applied only after the reviewed migrations create the
-- tenant_data schema; see 003_enterprise_runtime_grants.sql.
