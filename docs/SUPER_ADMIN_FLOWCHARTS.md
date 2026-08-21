# SUPER ADMIN `/adm` — Flowcharts

## A. Authentication & authorization

```
Browser → /adm/*
    → RequireAuthenticated (must have Firebase user)
    → Admin.jsx onAuthStateChanged
    → checkIfAdmin(uid)  [claims.role ∈ {ADMIN, SUPER_ADMIN}]
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

## B. Command center

```
Dashboard mount
  → GET /api/platform/command-center
  → buildHealthPayload (Firestore ping, outbox sample, runtime)
  → inspect stats, earnings, tenants, payment_orders, security_audit_logs, admin_audit_logs
  → compute healthScore + riskScore from inspected sources only
  → derive recommendations (DLQ, failed payments, high security, suspended tenants, maintenance)
  → UI: scores, signals, next actions, attention tenants, recent audit
  missing source → sources[name]=unavailable (never estimated)
```

## C. Tenant lifecycle (reuses Enterprise)

```
List     GET /api/enterprise/platform/tenants
                 → tenantService.listPlatformTenants
Provision POST /api/enterprise/tenants
                 → tenantService.provisionTenant
Suspend   POST /api/enterprise/platform/tenants/:id/suspend
                 → setTenantLifecycleAsPlatform(SUSPENDED)
Reactivate POST /api/enterprise/platform/tenants/:id/reactivate
                 → setTenantLifecycleAsPlatform(ACTIVE)
Decommission POST /api/platform/tenants/:id/decommission
                 → requireSuperAdmin + reason ≥ 8
                 → setTenantLifecycleAsPlatform(DELETING)
                 → admin audit DECOMMISSION_PLATFORM_TENANT
```

## D. Queue / DLQ

```
GET /api/platform/queues  → last 50 notification_outbox docs
POST /api/platform/queues/retry
     → requireSuperAdmin + recent auth
     → reset attemptCount / state on one job or up to 20 dead letters
```

## E. Email CTA (existing, audited)

Password reset, verification, Enterprise invitation, job status, and invoice emails continue to use `publicAppUrl` / `protocol://WEBSITE_NAME`. No placeholder domain was introduced by this change. Production click-through is **UNVERIFIED** from this environment.

## F. Cross-module links

```
Command center recommendation → /adm/queues | /adm/security | /adm/tenants | /adm/operations
Tenant drawer → /enterprise?tab=audit|usage&tenant=…  (Enterprise console, not a clone)
Security event tenantId → /adm/tenants?focus=
DLQ row retry → same queue view refresh
```
