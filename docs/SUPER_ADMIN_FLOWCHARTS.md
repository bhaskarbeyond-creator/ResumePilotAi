# SUPER ADMIN `/adm` — Flowcharts

## A. Authentication & authorization

```
Browser → /adm/*
    → RequireAuthenticated (must have Firebase user)
    → Admin.jsx onAuthStateChanged
    → checkIfAdmin(uid)  [Firebase claim role ∈ {ADMIN, SUPER_ADMIN}]
         NO → Navigate /
         YES → Admin shell + AdminProvider({ isSuperAdmin })
    → API calls with Bearer ID token
    → requireAuth(verifyIdToken, checkRevoked=true)
    → enforceApiPolicy
         admin/platform path without system.config.write → 403
         email not verified → 403
         sensitive mutation without recent auth_time → 403 RECENT_AUTH_REQUIRED
    → requirePermission / requireSuperAdmin
    → handler
    → admin audit middleware (mutations + sensitive reads)
```

Never trusted: localStorage, UI `isSuperAdmin`, URL tenant IDs, client actor identity.

## B. Command center

```
Dashboard mount
  → GET /api/platform/command-center
  → buildHealthPayload (Firestore ping, notification_outbox sample, runtime)
  → inspect stats, earnings, tenants, payment_orders, security_audit_logs, admin_audit_logs
  → compute healthScore + riskScore from inspected sources only
  → derive recommendations (DLQ, failed payments, high security, suspended tenants, maintenance)
  → UI: scores, signals, next actions, attention tenants, recent audit
  missing source → sources[name]=unavailable (never estimated)
```

## C. Attention (derived incidents)

```
/adm/attention
  → GET /api/platform/attention
       buildHealthPayload + inspectAttentionSignals
         (payment sample, security sample, tenant lifecycle, maintenance)
  → GET /api/platform/command-center (UI merge; de-dupe by id+title)
  → list only inspected signals — not a ticket desk
```

## D. Tenant lifecycle (reuses Enterprise)

```
List        GET  /api/enterprise/platform/tenants
                 → tenantService.listPlatformTenants
Provision   POST /api/enterprise/tenants
                 → tenantService.provisionTenant
Suspend     POST /api/enterprise/platform/tenants/:id/suspend
                 → setTenantLifecycleAsPlatform(SUSPENDED)
Reactivate  POST /api/enterprise/platform/tenants/:id/reactivate
                 → setTenantLifecycleAsPlatform(ACTIVE)
Decommission POST /api/platform/tenants/:id/decommission
                 → requireSuperAdmin + recent auth + reason ≥ 8 + UI confirm
                 → setTenantLifecycleAsPlatform(DELETING)
                 → admin audit DECOMMISSION_PLATFORM_TENANT
                 → DELETING → DELETED only; no restore invented
Handoff     /enterprise?tab=audit|usage&tenant=ID
```

## E. Queue / DLQ + Enterprise outbox posture

```
Notification outbox
  GET  /api/platform/queues     → last 50 notification_outbox docs
  POST /api/platform/queues/retry
       → requireSuperAdmin + recent auth + UI confirm
       → reset attemptCount / state on one job or up to 20 dead letters
       → ADMIN sees the control disabled (Super Admin only)

Enterprise durable outbox (read-only in /adm)
  GET  /api/platform/enterprise-queue → getOutboxStatus(enterprise_outbox)
       Tenant job replay remains in /enterprise
```

## F. Operators (platform identity)

```
GET  /api/platform/operators
     → users where role ∈ {ADMIN, SUPER_ADMIN, SUPPORT}
     → note: Firestore role field; authoritative access is the Firebase claim

POST /api/platform/operators
     → requireSuperAdmin + recent auth + UI confirm
     → role ∈ {ADMIN, SUPPORT, USER} only (SUPER_ADMIN rejected 400)
     → existing SUPER_ADMIN claims cannot be changed (403)
     → self-demotion prohibited
     → setCustomUserClaims + revokeRefreshTokens + users.role merge
```

## G. Announcements

```
GET    /api/platform/announcements          ADMIN+
POST   /api/platform/announcements          SUPER_ADMIN + recent auth
PATCH  /api/platform/announcements/:id      SUPER_ADMIN + recent auth
DELETE /api/platform/announcements/:id      SUPER_ADMIN + recent auth + UI confirm
```

## H. Email CTA (existing, audited)

Password reset, verification, Enterprise invitation, job status, and invoice emails continue to use `publicAppUrl` / `protocol://WEBSITE_NAME`. No placeholder domain was introduced by this change. Production click-through is **UNVERIFIED** from this environment.

## I. Cross-module links

```
Command center / Attention → /adm/queues | /adm/security | /adm/tenants | /adm/operations
Tenant drawer → /enterprise?tab=audit|usage&tenant=…  (Enterprise console, not a clone)
Security event tenantId → /adm/tenants?focus=
Command palette ⌘K → nav + live GET /api/platform/search (email / uid / tenant)
DLQ row retry → confirm → same queue view refresh
```
