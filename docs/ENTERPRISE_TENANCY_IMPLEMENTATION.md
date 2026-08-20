# Enterprise Tenancy Foundation — Implementation Guide

**Implementation branch:** `arena/01a01c9e-resumepilotai`
**Protected restore point:** `enterprise-pre-migration-restore` → `10196c029758e000f7c602b874c5976a1ffba890`
**Default runtime state:** **dark / disabled** until `ENTERPRISE_TENANCY_ENABLED=true` and `VITE_ENTERPRISE_TENANCY_ENABLED=true` are deliberately enabled after deployment proof gates.

## What is implemented

### Control plane (server-only)

`backend/enterprise/tenantRegistry.js` provides the control-plane contract and a Firestore transitional implementation:

```text
verified Firebase/OIDC subject
  → deterministic canonical UUID principal
  → personal tenant + default workspace (lazy, server-only)
  → zero or more active tenant memberships
  → optional workspace membership
  → tenant configuration / data-plane profile / lifecycle state
```

Server-only Firestore collections used by the bridge are deny-by-default under the existing catch-all Firestore rules:

```text
enterprise_principal_tenants
enterprise_tenants
enterprise_tenant_slugs
enterprise_memberships
enterprise_workspace_memberships
enterprise_workspaces
enterprise_teams
enterprise_tenant_configurations
enterprise_audit_events
```

The browser does not receive direct Firestore access to these collections.

### Tenant context and authorization

`backend/enterprise/tenantContext.js`, `tenantPolicy.js`, and `tenantService.js` implement:

- immutable server-derived `TenantContext`;
- original identity subject separate from canonical UUID principal used by PostgreSQL;
- active tenant/membership/workspace validation;
- tenant/workspace role bundles and permissions;
- tenant owner restriction for granting tenant ownership;
- known-identity verification through Firebase Admin when available;
- tenant lifecycle transitions (`ACTIVE`, `SUSPENDED`, etc.);
- platform-only reactivation path;
- role-aware workspace and team access.

A browser-supplied `X-Tenant-Id` / `X-Workspace-Id` is only a requested context. The API verifies membership and workspace access before attaching a context. It is never authorization proof.

### PostgreSQL shared data plane + forced RLS

The backend now depends on `pg` and includes reviewed SQL:

```text
backend/sql/000_enterprise_runtime_roles.sql
backend/sql/001_enterprise_control_plane.sql
backend/sql/002_enterprise_tenant_data_plane_rls.sql
backend/sql/003_enterprise_runtime_grants.sql
```

`backend/enterprise/tenantDataPlane.js`:

```text
BEGIN
  set_config('app.tenant_id', ..., true)
  set_config('app.workspace_id', ..., true)
  set_config('app.workspace_scope', ..., true)
  set_config('app.principal_id', ..., true)
  set_config('app.policy_version', ..., true)
  set_config('app.routing_version', ..., true)
  tenant-aware repository operations
COMMIT / ROLLBACK
RESET ALL before release
```

`tenant_data.resources`, `tenant_data.audit_events`, and `tenant_data.ai_usage_ledger` have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Policies enforce tenant and workspace scope with both `USING` and `WITH CHECK` clauses.

Runtime, worker, migration, and break-glass roles are intentionally separate. The runtime role must not be a table owner, superuser, or `BYPASSRLS` role.

**No production PostgreSQL migration has been run by this repository session.** Use the explicit `npm run migrate:enterprise` command only with an approved non-production/production migration identity and `TENANT_DATABASE_URL`.

### Legacy Firebase adapter bridge

`backend/enterprise/firebaseBridge.js`, `firebaseMigrationAdapter.js`, and `certifiedModuleBridge.js` implement adapter-first migration planning:

- UID-owned Resume/CV/Cover data maps only to the user’s personal tenant by default.
- The legacy Firebase path remains authoritative until a module cutover is certified.
- Checksums, source revision, ownership rule, and rollback metadata are recorded in a migration plan/ledger shape.
- Companies, jobs, applications, conversations, financial ledgers, and duplicate portfolios are classified as ambiguous and fail closed until a deterministic policy is approved.
- A business tenant never obtains access to a personal Firebase tree merely because the user has joined it.

### Tenant safe downstream primitives

| Boundary | Implementation |
|---|---|
| Cache | `tenantCache.js` creates tenant/workspace/principal/version-prefixed keys; public/global keys are separate. |
| Quotas | `tenantQuota.js` models atomic tenant/principal quota accounting. The in-memory store is test-only; deployment needs Redis or another shared atomic store. |
| Jobs | `tenantJobs.js` creates HMAC-signed envelopes with tenant/workspace/principal/resource/routing/correlation/idempotency fields. |
| Notification worker | `notificationOutbox` now stores optional tenant context and fails tenant-bound events closed unless the worker reauthorizes them. `backend/index.js` invokes `tenantService.authorizeOutboxEvent` before dispatch. Legacy events retain their certified behavior. |
| Files | `tenantStorage.js` and `tenantSignedArtifacts.js` define tenant/workspace object namespaces and short-lived purpose-bound artifact tokens. |
| AI | `tenantAi.js` rejects client authority fields, isolates source scope/cache key/profile, filters provider candidates by tenant policy, and supports tenant usage/audit ledger integration. The enterprise AI endpoint fails closed without the RLS-backed data plane. |
| Audit/telemetry | `tenantAudit.js`, `tenantRepository.js`, and `tenantTelemetry.js` carry tenant/workspace/principal/resource/correlation scope while avoiding raw tenant ID labels in broad metrics. |

### Enterprise UI

The feature-gated `/enterprise` route provides an isolated, responsive enterprise shell without rewriting certified Resume/CV/Interview screens:

- tenant and workspace switchers;
- command palette (`⌘/Ctrl+K`);
- role-aware navigation;
- overview, users/teams, roles/permissions, security, AI, usage, audit, privacy, and settings surfaces;
- visible active tenant/workspace/data-plane status;
- loading, empty, error, keyboard, focus, and reduced-motion patterns;
- feature-gated sidebar entry in the existing dashboard.

## Enterprise API surface

All routes require the existing authenticated API boundary, verified email, and the server feature flag.

```text
GET    /api/enterprise/tenants
GET    /api/enterprise/context
GET    /api/enterprise/workspaces
POST   /api/enterprise/tenants                    platform permission only
POST   /api/enterprise/memberships                tenant membership permission
GET    /api/enterprise/teams
POST   /api/enterprise/teams
POST   /api/enterprise/tenants/:tenantId/reactivate  platform permission only
POST   /api/enterprise/lifecycle/suspend
GET    /api/enterprise/audit
GET    /api/enterprise/configuration
PATCH  /api/enterprise/configuration
POST   /api/enterprise/ai/generate-content        RLS ledger required
GET    /api/enterprise/resources                  RLS data plane required
POST   /api/enterprise/resources                  RLS data plane required
GET    /api/enterprise/resources/:resourceId      RLS data plane required
PATCH  /api/enterprise/resources/:resourceId      RLS data plane required
DELETE /api/enterprise/resources/:resourceId      RLS data plane required
```

The current certified `/api/generate-*`, resume, export, DOCX, and Interview Coach paths are deliberately **not** silently converted. They remain on the Firebase compatibility bridge until their per-module adapters and regression gates are approved.

## Local verification commands

```bash
npm run test:enterprise
npm run test:interview
npm run test:security
npm run test:product
npm run build
npm run lint
npm run audit:production
```

`test:enterprise` includes:

- API tenant spoofing/role/lifecycle/team/configuration tests;
- actual PGlite forced-RLS tests for tenant/workspace isolation and missing context;
- pooled transaction contract/rollback tests;
- dedicated-plane routing contract;
- cache/quota/file/artifact/job/AI/adversarial isolation tests;
- migration parser/checksum/legacy bridge tests;
- 1,000 logical-tenant namespace and noisy-neighbor contract tests;
- enterprise UI contract tests.

## Subsequent hardening added after the initial foundation

- **Identity consistency:** canonical PostgreSQL principals are derived from an issuer + external subject pair; a persisted mismatch fails closed rather than being silently accepted.
- **Legacy context guard:** when server tenancy is enabled, legacy routes reject tenant/workspace headers instead of silently mixing UID-scoped behavior with tenant context.
- **Feature-flag consistency:** `/api/enterprise/status` is authenticated and exposes only rollout state; the frontend explains server-disabled rollout rather than attempting tenant calls.
- **M2M:** tenant security administrators can create a service account and receive an API key exactly once. The store retains only a hash; `/api/enterprise/m2m/context` validates the key, tenant and workspace without Firebase bearer auth.
- **Support/break-glass:** platform admins create time-limited, reasoned, workspace-bound support grants. Support users require a matching active grant; grants can be revoked and are auditable.
- **Quota coordination:** the enabled server control plane uses a Firestore atomic counter contract for AI rate/daily quota enforcement; deployments may replace it with Redis while keeping the same key contract.
- **Routing consistency:** jobs and artifact tokens carry data-plane/profile/routing claims and validate them against the active context.
- **Migration reconciliation:** collection-level duplicate, missing, unexpected and checksum mismatch detection is available before a cutover.

## Deployment gates still required

This code does not claim a production-ready PostgreSQL deployment, Redis, object store, IdP/SAML/SCIM provider, Cloudflare policy, dedicated plane, or production migration. Before enabling the feature in any shared environment:

1. Provision real PostgreSQL roles and apply migrations in staging.
2. Run connection-pool/RLS tests against the managed PostgreSQL provider.
3. Configure a shared quota/cache store, durable queue/worker topology, object storage, secret manager, and tenant-job signing secret.
4. Validate Firebase IAM/rules/indexes and Firestore transitional control-plane access.
5. Approve ownership mappings for ambiguous historical records.
6. Complete SSO/SAML/OIDC/SCIM/provider contract testing.
7. Run browser/accessibility/load/DAST/pen-test/backup-restore drills.
8. Enable server and client flags only through staged canary rollout.
