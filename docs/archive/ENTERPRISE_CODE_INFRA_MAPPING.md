> **SUPERSEDED (2026-08-20 architecture refactor):** The enterprise architecture described here (PostgreSQL/RLS data plane, local queue, Redis) was replaced by the Firestore-first architecture. The current truth is `docs/ENTERPRISE_ARCHITECTURE.md`; the deployment runbook is `docs/ENTERPRISE_LOCAL_INFRASTRUCTURE_HANDOFF.md`. This document is retained as history.

# Enterprise Code-to-Infrastructure Mapping

**Repository:** `bhaskarbeyond-creator/ResumePilotAi`  
**Branch:** `arena/01a01c9e-resumepilotai`  
**Date:** 2026-08-20  

This document provides the authoritative mapping between repository code paths, entry points, runtime configurations, required infrastructure components, and verification test suites.

---

## 1. Subsystem Architecture & Integration Map

| Subsystem | Actual Repository Paths / Entry Point | Required Infrastructure | Runtime Configuration / Expected Behavior | Primary Verification Tests |
|---|---|---|---|---|
| **Feature Flags** | `backend/enterprise/featureFlags.js`; `src/enterprise/EnterpriseContext.jsx`; `.env.example` | Environment configuration service | `ENTERPRISE_TENANCY_ENABLED` is authoritative server gate; `VITE_ENTERPRISE_TENANCY_ENABLED` is UX-only; `/api/enterprise/status` reports true server state | `backend/enterprise-test/consistency-audit.test.js`, `tests/enterprise-ui.test.mjs` |
| **Express App Integration** | `backend/index.js` (lines around `createTenantService`, route mounts, CORS header guard) | Node.js Express server + reverse proxy | Initializes `createTenantService`; CORS allows enterprise headers for trusted origins only; legacy routes reject enterprise headers | `backend/enterprise-test/enterprise-routes.test.js` |
| **Tenant Registry & Control Plane** | `backend/enterprise/tenantRegistry.js` | Firestore transitional store or PostgreSQL control plane | `enterprise_*` Firestore documents are server-only; personal tenant mapping is 1:1 deterministic by canonical principal | `backend/enterprise-test/tenant-foundation.test.js` |
| **Context Resolution** | `backend/enterprise/tenantContext.js`; `tenantService.resolveContext`; `backend/routes/enterprise.js` | Firebase Auth / IdP + Control Plane | Derives canonical UUID principal from `issuer` + `subject`; resolves active membership, roles, and data-plane route | `tenant-foundation.test.js`, `consistency-audit.test.js`, `enterprise-routes.test.js` |
| **Tenant Authorization & Policies** | `backend/enterprise/tenantPolicy.js`; `backend/security/auth.js`; `backend/security/policy.js` | Firebase Auth + RBAC rules | Multi-tier authorization: route permission checks + resource ownership + workspace scope + DB RLS | `enterprise-routes.test.js`, `security.test.js` (163/163) |
| **PostgreSQL RLS Transaction** | `backend/enterprise/tenantDataPlane.js` | PostgreSQL `pg.Pool` (PostgreSQL 16+) | `TENANT_DATABASE_URL`; executes `BEGIN`, sets `app.tenant_id`, `app.workspace_id`, `app.workspace_scope`, `app.principal_id`, `app.policy_version`, `app.routing_version`, `COMMIT`/`ROLLBACK`, `RESET ALL` | `tenant-foundation.test.js` (PGlite), `real-postgres-rls.integration.test.js` |
| **SQL Migrations & Schema** | `backend/sql/000_*` through `003_*`; `backend/scripts/applyEnterpriseMigrations.js`; `backend/enterprise/sqlMigrations.js` | PostgreSQL roles (DBA, Migrator, Runtime, Worker) | DBA provisions roles (000) and grants (003); migrator applies DDL and RLS policies (001, 002) via `npm run migrate:enterprise` | `tenant-foundation.test.js` (DDL & RLS tests) |
| **Shared / Dedicated Routing** | `backend/enterprise/tenantRouting.js`; `tenantDataPlane.TenantDataPlaneRouter` | Multi-pool router | Resolves `SHARED_POSTGRES` or `DEDICATED_POSTGRES`; dedicated route fails closed if dedicated pool resolver is not provisioned | `tenant-foundation.test.js` |
| **Tenant Cache & Quota** | `backend/enterprise/tenantCache.js`; `backend/enterprise/tenantQuota.js` | Firestore atomic quota / Redis | Key includes `v1:tenant:{id}:workspace:{id}:domain:{...}:revision:{v}`; rate limits partitioned by tenant + principal | `tenant-foundation.test.js`, `tenant-scale-contract.test.js` |
| **Signed Jobs & Queue Outbox** | `backend/enterprise/tenantJobs.js`; `backend/services/notificationOutbox.js`; `backend/index.js` | Firestore outbox / Queue worker | HMAC-SHA256 signed envelope with context; worker reauthorizes current membership and lifecycle before execution | `tenant-foundation.test.js`, `tenant-adversarial.test.js` |
| **Storage & Signed Artifacts** | `backend/enterprise/tenantStorage.js`; `backend/enterprise/tenantSignedArtifacts.js` | Object Storage / KMS | Tenant/workspace namespace enforcement; purpose-bound, route-bound, short-lived signed artifact tokens | `tenant-foundation.test.js`, `tenant-adversarial.test.js` |
| **Enterprise AI Isolation** | `backend/enterprise/tenantAi.js`; `backend/routes/enterprise.js` (`/ai/generate-content`) | AI Provider Vault / Usage Ledger | Deny-by-default on empty provider allowlist; client authority rejected; RLS-backed usage ledger; prompt/context isolation | `tenant-foundation.test.js`, `tenant-adversarial.test.js` |
| **Migration Bridge & Adapter** | `backend/enterprise/firebaseBridge.js`; `backend/enterprise/firebaseMigrationAdapter.js`; `backend/enterprise/certifiedModuleBridge.js` | Firestore source + Postgres target | Reversible migration plan; personal tenant 1:1 bridge; ambiguous data quarantined; collection reconciliation | `tenant-foundation.test.js` |
| **M2M / Service Accounts** | `backend/enterprise/serviceIdentity.js`; `backend/enterprise/serviceAccountStore.js`; `backend/routes/enterpriseM2m.js` | Server-only Firestore store | One-time `rpa_` key issuance; SHA-256 hash storage; scope and tenant binding enforced on M2M endpoint | `enterprise-routes.test.js`, `tenant-foundation.test.js` |
| **Support & Break-Glass** | `backend/enterprise/supportAccessStore.js`; `backend/routes/enterprise.js` | Server-only Firestore store | Explicit time-limited, workspace-scoped grants; reason required; revocable; full audit trail | `enterprise-routes.test.js`, `tenant-foundation.test.js` |
| **Audit & Telemetry** | `backend/enterprise/tenantAudit.js`; `backend/enterprise/tenantTelemetry.js`; `backend/enterprise/tenantRepository.js` | Structured audit sink / Postgres | Detailed audit events with correlation ID; low-cardinality metric labels (raw tenant IDs stripped) | `tenant-foundation.test.js` |
| **Enterprise UI Shell** | `src/enterprise/*`; `src/main.jsx` (lazy `/enterprise` route); `ProfileDisplay.jsx` | Browser DOM / React Router | Tenant/workspace switcher, command palette, role-aware navigation, dark/light theme, accessibility & WCAG 2.2 AA compliant | `tests/enterprise-ui.test.mjs`, `npm run build` |
| **Firebase Security Rules** | `SecurityRules.txt`; `Realtime_database_Security_rules.txt`; `firebase.json`; `firestore.indexes.json` | Firebase Emulator / Project | Deny-by-default catchall ensures browser clients cannot access `enterprise_*` internal server collections | `tests/firestore.rules.test.mjs`, `tests/database.rules.test.mjs` |

---

## 2. Source Code & Interface Consistency Audit

1. **Zero Client Authority Invariant:** Client-supplied `x-tenant-id` or body payload parameters are never trusted as proof of authorization. The backend always verifies the authenticated Firebase token/M2M key, resolves memberships, and sets server-controlled context.
2. **Deterministic Canonical Principal:** External identity subject strings (e.g. Firebase UIDs) are deterministically hashed with issuer namespace to form UUID v4-shaped canonical principals for relational PostgreSQL foreign keys.
3. **Legacy API Isolation:** Legacy `/api/*` endpoints (resume builder, CV, cover letters, payments) remain strictly personal UID-scoped and reject unexpected tenant headers when enterprise tenancy is enabled.
