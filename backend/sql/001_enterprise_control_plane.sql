-- ResumePilot AI enterprise control-plane schema.
-- Run only through the reviewed migration role in a non-production/staged PostgreSQL
-- data plane first. This migration intentionally does not create database roles.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.principals (
  id uuid PRIMARY KEY,
  principal_type text NOT NULL CHECK (principal_type IN ('human', 'service')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.users (
  principal_id uuid PRIMARY KEY REFERENCES platform.principals(id) ON DELETE RESTRICT,
  display_name text NOT NULL DEFAULT '',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.identity_links (
  id uuid PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES platform.principals(id) ON DELETE RESTRICT,
  issuer text NOT NULL,
  subject text NOT NULL,
  provider text NOT NULL,
  verified_email_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE IF NOT EXISTS platform.data_planes (
  id text PRIMARY KEY,
  plane_type text NOT NULL CHECK (plane_type IN ('SHARED_POSTGRES', 'DEDICATED_POSTGRES')),
  primary_region text NOT NULL,
  standby_region text,
  secret_reference text NOT NULL,
  storage_profile text NOT NULL,
  cache_profile text NOT NULL,
  queue_profile text NOT NULL,
  ai_profile text NOT NULL,
  security_profile text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_state IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED')),
  routing_version integer NOT NULL DEFAULT 1 CHECK (routing_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A deployment may replace this profile with a provider-specific secret reference,
-- but every standard tenant route must have an explicit shared-plane record.
INSERT INTO platform.data_planes (
  id, plane_type, primary_region, secret_reference, storage_profile, cache_profile,
  queue_profile, ai_profile, security_profile, lifecycle_state, routing_version
) VALUES (
  'shared-primary', 'SHARED_POSTGRES', 'default', 'deployment-managed:shared-primary',
  'shared', 'shared', 'shared', 'platform-default', 'standard', 'ACTIVE', 1
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform.tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'PROVISIONING' CHECK (lifecycle_state IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED')),
  isolation_tier text NOT NULL DEFAULT 'STANDARD' CHECK (isolation_tier IN ('STANDARD', 'ENTERPRISE', 'REGULATED')),
  data_plane_id text NOT NULL REFERENCES platform.data_planes(id) ON DELETE RESTRICT,
  region text NOT NULL,
  policy_version integer NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  legacy_owner_uid text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.workspaces (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_state IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_one_default_per_tenant
  ON platform.workspaces(tenant_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS platform.role_definitions (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  role_key text NOT NULL,
  display_name text NOT NULL,
  system_role boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role_key)
);
-- PostgreSQL treats NULLs as distinct in a normal UNIQUE constraint. This partial
-- index prevents duplicate globally defined system roles while still permitting
-- tenant-specific role names.
CREATE UNIQUE INDEX IF NOT EXISTS system_role_definitions_unique_idx
  ON platform.role_definitions(role_key) WHERE tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS platform.permissions (
  key text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS platform.role_permissions (
  role_id uuid NOT NULL REFERENCES platform.role_definitions(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES platform.permissions(key) ON DELETE RESTRICT,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS platform.tenant_memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  principal_id uuid NOT NULL REFERENCES platform.principals(id) ON DELETE RESTRICT,
  default_workspace_id uuid,
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  personal_tenant boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, principal_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, default_workspace_id) REFERENCES platform.workspaces(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS platform.workspace_memberships (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, membership_id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform.workspaces(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES platform.tenant_memberships(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform.membership_role_assignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES platform.role_definitions(id) ON DELETE RESTRICT,
  workspace_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES platform.tenant_memberships(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform.workspaces(tenant_id, id) ON DELETE CASCADE
);
-- NULL workspace_id represents a tenant-wide role. Coalescing makes duplicate
-- tenant-wide and workspace-scoped grants impossible without forcing NULL away.
CREATE UNIQUE INDEX IF NOT EXISTS membership_role_assignments_unique_idx
  ON platform.membership_role_assignments(
    membership_id,
    role_id,
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE IF NOT EXISTS platform.teams (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  workspace_id uuid,
  name text NOT NULL,
  external_group_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform.workspaces(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform.team_memberships (
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  PRIMARY KEY (team_id, membership_id),
  FOREIGN KEY (tenant_id, team_id) REFERENCES platform.teams(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES platform.tenant_memberships(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform.tenant_configurations (
  tenant_id uuid PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  ai_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  quota_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  security_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.service_accounts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  workspace_id uuid,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform.workspaces(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS platform.api_keys (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  workspace_id uuid,
  service_account_id uuid NOT NULL REFERENCES platform.service_accounts(id) ON DELETE RESTRICT,
  prefix text NOT NULL,
  secret_hash text NOT NULL,
  scopes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform.workspaces(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_active_prefix_idx ON platform.api_keys(prefix) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS platform.support_grants (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  workspace_id uuid,
  support_principal_id uuid NOT NULL REFERENCES platform.principals(id) ON DELETE RESTRICT,
  requested_by_principal_id uuid NOT NULL REFERENCES platform.principals(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  scopes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform.workspaces(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS support_grants_lookup_idx
  ON platform.support_grants(tenant_id, workspace_id, support_principal_id, expires_at) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS platform.sessions (
  id uuid PRIMARY KEY,
  principal_id uuid NOT NULL REFERENCES platform.principals(id) ON DELETE RESTRICT,
  session_version integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  mfa_level text NOT NULL DEFAULT 'STANDARD',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS platform.tenant_migration_ledger (
  id uuid PRIMARY KEY,
  source_store text NOT NULL,
  source_path text NOT NULL,
  source_uid text,
  source_revision bigint NOT NULL DEFAULT 0,
  source_checksum text NOT NULL,
  tenant_id uuid,
  workspace_id uuid,
  resource_type text NOT NULL,
  target_resource_id uuid,
  ownership_rule_version text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cutover_at timestamptz,
  reconciled_at timestamptz,
  rollback_window_expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS tenant_memberships_principal_active_idx
  ON platform.tenant_memberships(principal_id, tenant_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS workspaces_tenant_active_idx
  ON platform.workspaces(tenant_id, id) WHERE lifecycle_state = 'ACTIVE';
CREATE INDEX IF NOT EXISTS tenant_migration_ledger_source_idx
  ON platform.tenant_migration_ledger(source_store, source_path);
