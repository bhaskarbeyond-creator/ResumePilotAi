-- ResumePilot AI shared tenant data-plane schema and mandatory RLS contract.
-- This schema is deployed to the shared data plane and to each dedicated PostgreSQL
-- data plane. Tenant context is set with SET LOCAL / set_config(..., true) by the
-- server transaction wrapper; missing context must deny rows.

CREATE SCHEMA IF NOT EXISTS tenant_data;

CREATE OR REPLACE FUNCTION tenant_data.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION tenant_data.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION tenant_data.current_workspace_scope()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_scope', true), '')
$$;

CREATE TABLE IF NOT EXISTS tenant_data.resources (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  resource_type text NOT NULL,
  owner_principal_id uuid NOT NULL,
  classification text NOT NULL DEFAULT 'PRIVATE' CHECK (classification IN ('PRIVATE', 'CONFIDENTIAL', 'INTERNAL', 'PUBLIC')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS tenant_data.audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  principal_id uuid,
  action text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  resource_type text,
  resource_id uuid,
  correlation_id text NOT NULL,
  outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS tenant_data.ai_usage_ledger (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  principal_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_micros bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_micros >= 0),
  correlation_id text NOT NULL,
  policy_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS resources_tenant_workspace_updated_idx
  ON tenant_data.resources(tenant_id, workspace_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS audit_events_tenant_occurred_idx
  ON tenant_data.audit_events(tenant_id, occurred_at DESC, id);
CREATE INDEX IF NOT EXISTS ai_usage_tenant_created_idx
  ON tenant_data.ai_usage_ledger(tenant_id, workspace_id, created_at DESC, id);

ALTER TABLE tenant_data.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_data.resources FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_data.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_data.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_data.ai_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_data.ai_usage_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_resources_isolation ON tenant_data.resources;
CREATE POLICY tenant_resources_isolation ON tenant_data.resources
  FOR ALL
  USING (
    tenant_id = tenant_data.current_tenant_id()
    AND (
      workspace_id IS NULL
      OR tenant_data.current_workspace_scope() = 'TENANT'
      OR workspace_id = tenant_data.current_workspace_id()
    )
  )
  WITH CHECK (
    tenant_id = tenant_data.current_tenant_id()
    AND (
      workspace_id IS NULL
      OR tenant_data.current_workspace_scope() = 'TENANT'
      OR workspace_id = tenant_data.current_workspace_id()
    )
  );

DROP POLICY IF EXISTS tenant_audit_events_isolation ON tenant_data.audit_events;
CREATE POLICY tenant_audit_events_isolation ON tenant_data.audit_events
  FOR ALL
  USING (
    tenant_id = tenant_data.current_tenant_id()
    AND (
      workspace_id IS NULL
      OR tenant_data.current_workspace_scope() = 'TENANT'
      OR workspace_id = tenant_data.current_workspace_id()
    )
  )
  WITH CHECK (
    tenant_id = tenant_data.current_tenant_id()
    AND (
      workspace_id IS NULL
      OR tenant_data.current_workspace_scope() = 'TENANT'
      OR workspace_id = tenant_data.current_workspace_id()
    )
  );

DROP POLICY IF EXISTS tenant_ai_usage_isolation ON tenant_data.ai_usage_ledger;
CREATE POLICY tenant_ai_usage_isolation ON tenant_data.ai_usage_ledger
  FOR ALL
  USING (
    tenant_id = tenant_data.current_tenant_id()
    AND (
      workspace_id IS NULL
      OR tenant_data.current_workspace_scope() = 'TENANT'
      OR workspace_id = tenant_data.current_workspace_id()
    )
  )
  WITH CHECK (
    tenant_id = tenant_data.current_tenant_id()
    AND (
      workspace_id IS NULL
      OR tenant_data.current_workspace_scope() = 'TENANT'
      OR workspace_id = tenant_data.current_workspace_id()
    )
  );

-- Do not grant table ownership or BYPASSRLS to the runtime role. Roles are provisioned
-- by the DBA-only bootstrap script, never by the application process.
