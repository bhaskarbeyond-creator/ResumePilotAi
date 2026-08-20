# Enterprise PostgreSQL data-plane migrations

These SQL files implement the **server-mediated shared-schema + forced RLS contract** described in the enterprise architecture documents.

## Order

1. A DBA provisions distinct runtime, worker, and migration identities using `000_enterprise_runtime_roles.sql` (adapted to the managed PostgreSQL provider).
2. The reviewed migration identity applies `001_enterprise_control_plane.sql` where the control plane is co-located for development/staging.
3. The migration identity applies `002_enterprise_tenant_data_plane_rls.sql` to the shared data plane and each dedicated tenant PostgreSQL data plane.
4. A DBA applies `003_enterprise_runtime_grants.sql` after schemas/tables exist.
5. A non-production RLS/pool harness proves tenant A/B isolation, missing-context denial, connection reuse cleanup, worker context, report behavior, and no runtime bypass before any certified aggregate cutover.

## Runtime contract

The application uses `backend/enterprise/tenantDataPlane.js` to begin an explicit transaction and set only transaction-local context values:

```text
app.tenant_id
app.workspace_id
app.workspace_scope
app.principal_id
app.policy_version
app.routing_version
```

All tenant resource queries must run through that transaction. A missing `app.tenant_id` resolves to `NULL` in RLS predicates and denies rows.

## Important constraints

- The app runtime/worker roles must not be owners, superusers, or `BYPASSRLS` roles.
- Platform control plane access and tenant data-plane access use separate credentials.
- RLS is defense in depth. API membership/policy authorization remains mandatory.
- Never run the role bootstrap from the Node process or expose database URLs to the browser.
- This repository does not claim a production PostgreSQL deployment until deployment/IAM/RLS evidence exists.
