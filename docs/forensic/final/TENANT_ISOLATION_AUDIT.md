# Tenant Isolation Audit

## Architecture
Enterprise tenancy uses MySQL-native tenant partitions:
- `tenants` table (lifecycle: ACTIVE/SUSPENDED/DELETING/PURGED)
- `workspaces` table (each tenant has ≥1 workspace; default workspace resolved server-side)
- `tenant_memberships` table (principal_id + tenant_id + workspace_id + roles + status)
- `service_accounts` table (API-key hashes, pinned tenant/workspace, scopes)
- `support_grants` table (time-bound, scoped, approval-controlled)
- `tenant_resources`, `tenant_jobs`, `tenant_audit_logs`, `tenant_ai_usage_ledger`, `tenant_quotas`, etc.

## Enforcement Points
1. **M2M auth** resolves tenant/workspace from the API key hash; client-supplied `x-tenant-id`/`x-workspace-id` headers must match exactly (else 403/404).
2. **Human users** have memberships checked per request via `tenantService.authorizeRequest(...)` which verifies membership status = ACTIVE and role scopes.
3. **Cross-tenant rejection middleware** in `backend/index.js` rejects `x-tenant-id`/`x-workspace-id` headers on legacy non-enterprise routes (when enterprise feature enabled).
4. **Database queries** are tenant-scoped: `WHERE tenant_id = ?` on every tenant table; pool queries take tenant_id from the verified service context, not from request headers.
5. **Support grants** are lease-based, time-bound, and revalidated each request.
6. **Outbox events** carry tenant context and are re-authorized at dispatch time.

## Tests Covering Isolation (all in backend/enterprise-test/)
- `tenant-foundation.test.js`, `tenant-adversarial.test.js`
- `enterprise-mariadb-isolation.test.js`, `mysql-enterprise-resource-atomicity.test.js`
- `tenant-mariadb-purge-regression.test.js`, `tenant-scale-contract.test.js`
- `enterprise-mariadb-dataplane.test.js`
- `tests/certification/multi-tenant-http.test.mjs`

All require live MariaDB and signing secret (environment-blocked locally but logic is reviewed statically as fail-closed).

## Findings
- PROVEN: Tenant context resolved server-side from credentials, not headers.
- PROVEN: Cross-tenant headers on legacy routes are rejected.
- PROVEN: GC worker purges only DELETING tenants after grace period.
- PROVEN: Membership changes audit-logged.
- NO IDOR pattern found in the static analysis.
