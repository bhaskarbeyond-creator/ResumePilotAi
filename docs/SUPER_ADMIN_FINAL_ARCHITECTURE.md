# Super Admin `/adm` — Final Architecture (Evidence-Based)

**Assessment date:** 2026-08-22 UTC  
**Repository branch:** `arena/01a0279e-resumepilotai`  
**Certification state:** **NO-GO** — local implementation and regression evidence exist; authenticated browser and deployed production verification are not complete. See `FINAL_SUPER_ADMIN_PRODUCTION_READINESS.md`.

## 1. Boundary and intent

`/adm` is the global ResumePilot operational control plane. It is separate from `/enterprise`, which remains the tenant/workspace control plane.

| Surface | Scope | Entry point | Server boundary |
|---|---|---|---|
| `/adm` | Global consumer administration and Super Admin platform operations | `src/components/admin/Admin.jsx` | `/api/admin/**` and `/api/platform/**` |
| `/enterprise` | Tenant/workspace administration | `src/enterprise/EnterpriseConsole.jsx` | `/api/enterprise/**` |
| Consumer application | Account-owned resumes, jobs, portfolio, billing | `src/main.jsx` | Owner-bound `/api/**` and Firestore rules |

The `/adm` tenant registry intentionally uses `/api/platform/tenants`, not `/api/enterprise/platform/tenants`. Enterprise routes are rollout-gated by `ENTERPRISE_TENANCY_ENABLED`; an Admin UI must not turn an operationally disabled feature flag into a generic **“API route not found”** failure.

## 2. Runtime topology

```text
Browser
  ├── Firebase ID token (same-origin Authorization bearer)
  ├── /adm ────────────────────────────────────────────────┐
  │       legacy Admin modules → /api/admin/**              │
  │       Super Admin platform modules → /api/platform/**   │
  └── /enterprise → /api/enterprise/**                      │
                                                           ▼
Express API boundary
  ├── requireAuth / revoked-token verification
  ├── enforceApiPolicy (role, verified-email, recent-auth)
  ├── requirePermission / requireSuperAdmin
  ├── admin audit middleware
  └── route/service layer
        ├── Firebase Admin Auth
        ├── Firestore consumer collections
        ├── Enterprise TenantService / registry
        ├── notification outbox / DLQ telemetry
        └── admin_audit_logs + security_audit_logs
```

### Important separation

- `/adm` **does not** resolve a client-supplied tenant context for platform actions.
- `/enterprise` resolves tenant/workspace identity only through the tenant service and verifies membership or a bounded support/M2M credential.
- New `/api/platform/tenants` operations require a server-side `SUPER_ADMIN` claim. Client-side hiding is only UX; routes enforce the claim.
- Generic `/api/admin/users/:uid` rejects mutations against a `SUPER_ADMIN` target. Generic deletion rejects `SUPER_ADMIN` targets for all callers. A documented out-of-band break-glass process is required for retirement.

## 3. `/adm` front-end structure

```text
Admin shell
  ├── Header: breadcrumbs, health probe, command palette, identity, sign-out
  ├── Responsive navigation rail / mobile drawer
  ├── Core control-plane modules
  │   ├── Dashboard / command center
  │   ├── Admin audit trail
  │   ├── Queue & DLQ monitor
  │   ├── Tenant registry (SUPER_ADMIN only)
  │   ├── Users manager + controlled user editor
  │   └── Phrase library
  ├── Consumer operations modules
  │   ├── Employer applications, jobs, companies
  │   ├── Blog, pages, landing content, reviews, trusted-by, messages
  │   └── settings / billing / email / AI / security
  └── Shared UI primitives
      └── AdminDialog: focus containment, Escape/backdrop policy, focus restore
```

Source of truth:

- Router: `src/components/admin/Admin.jsx`
- Navigation: `src/components/admin/sidebar/sidebar.jsx`
- Command menu: `src/components/admin/command/AdminCommandPalette.jsx`
- Modal primitive: `src/components/admin/shared/AdminDialog.jsx`
- Legacy bookmark compatibility: `src/main.jsx` redirects `/admin/*` to `/adm/dashboard`.

## 4. Super Admin platform services

### Tenant registry

`backend/routes/platform.js` mounts the following Super Admin routes outside the enterprise rollout gate:

| Method | Route | Authorization | Recent auth | Purpose |
|---|---|---|---|---|
| GET | `/api/platform/tenants` | `SUPER_ADMIN` | No | Paginated/bounded registry list |
| POST | `/api/platform/tenants` | `SUPER_ADMIN` | Yes | Provision tenant + default workspace |
| GET | `/api/platform/tenants/:tenantId` | `SUPER_ADMIN` | No | Detail |
| PATCH | `/api/platform/tenants/:tenantId` | `SUPER_ADMIN` | Yes | Rename display name |
| POST | `/api/platform/tenants/:tenantId/suspend` | `SUPER_ADMIN` | Yes + typed confirmation | Set `SUSPENDED` |
| POST | `/api/platform/tenants/:tenantId/reactivate` | `SUPER_ADMIN` | Yes + typed confirmation | Set `ACTIVE` |
| POST | `/api/platform/tenants/:tenantId/decommission` | `SUPER_ADMIN` | Yes + typed confirmation | Start `DELETING` lifecycle |

`TenantService` owns platform adapters (`getPlatformTenant`, `updateTenantProfileAsPlatform`, `setTenantLifecycleAsPlatform`, `provisionTenant`) and writes global security audit events. `recordPlatformAction` additionally writes a sanitized `admin_audit_logs` event for the `/adm` viewer.

### Queue / DLQ

| Method | Route | Authorization | Protection |
|---|---|---|---|
| GET | `/api/platform/queues` | Admin read boundary | Actual observed outbox telemetry; unavailable is not reported as zero |
| POST | `/api/platform/queues/retry` | `SUPER_ADMIN` | Recent auth, DLQ-only validation, one-of job/all validation, typed confirmation, bounded batch of 20 |

A live/active notification event cannot be replayed through the endpoint. `NO_DEAD_LETTERS`, `JOB_NOT_FOUND`, and `JOB_NOT_DEAD_LETTER` are explicit outcomes.

### Phrase library

The former browser-direct `categories` writes were incompatible with deny-by-default Firestore rules. The replacement is server-authoritative:

- Admin API: `/api/admin/phrases` and `/api/admin/phrases/:categoryId/entries`
- Public, read-only consumer projection: `/public/phrases.json`
- Writes have optimistic `revision` checks and standard Admin audit middleware coverage.

## 5. Authentication and authorization

```text
Request → Firebase bearer validation (checkRevoked=true)
        → verified email requirement where applicable
        → API policy (namespace, recent auth, elevated capability)
        → module route permission
        → service-level tenant/ownership checks
        → transaction / audited write
```

| Actor | `/adm` legacy settings | Platform read health/queue | Tenant registry | Queue replay | Generic ADMIN role grant | SUPER_ADMIN target mutation |
|---|---:|---:|---:|---:|---:|---:|
| USER | Denied | Denied | Denied | Denied | Denied | Denied |
| SUPPORT | Denied | Denied | Denied | Denied | Denied | Denied |
| ADMIN | Allowed where `system.config.write` applies | Read telemetry | Denied | Denied | Denied | Denied |
| SUPER_ADMIN | Allowed | Allowed | Allowed | Allowed | Allowed | Denied via generic route |

The last column is intentionally denied even to a Super Admin in the generic user endpoint. This prevents an accidental last-owner lockout through a row action or forged client body.

### Standard user provisioning

`POST /api/admin/users` is a separate **SUPER_ADMIN + recent-auth** workflow. It accepts only email, display name, and a policy-validated temporary password; it creates a standard `USER`/Basic identity and ignores any client role, membership, verification, tenant, or actor fields. The password is never returned and the audit sanitizer redacts it before persistence.

## 6. Observability truthfulness

`/api/platform/health` performs bounded reads, not a health-check write. It returns:

- `HEALTHY`, `DEGRADED`, or `UNAVAILABLE` platform status;
- `null` health score when the core Firestore observation is unavailable;
- queue counts only when queue telemetry was actually queried;
- runtime and tenant-service descriptors without fabricating external service health.

The command center no longer labels unavailable database, queue, or tenancy signals as “active” or healthy zeroes.

## 7. Deployment architecture

The repository contains Node, Apache/PHP proxy, PM2, and static SPA deployment assets. Production verification uncovered a current static-hosting failure: on 2026-08-22, public `GET /`, `/adm`, `/enterprise`, and `/index.html` returned HTTP 500 through the available external probe, while `/api/healthz` and `/api/readyz` returned JSON. This is deployment drift / static artifact availability, not evidence that `/adm` is live.

Do not deploy until all of the following are independently verified:

1. backup artifact is readable;
2. deployed docroot has `index.html`, current assets, and the correct SPA rewrite file;
3. `/`, `/adm`, and `/enterprise` return the SPA document (HTTP 200);
4. backend PM2 process, `/api/healthz`, `/api/readyz`, and authenticated `/api/platform/health` are healthy;
5. tested source SHA, frontend artifact SHA, `backend/COMMIT_SHA`, and deployed SHA agree.
