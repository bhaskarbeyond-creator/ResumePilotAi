# Admin + Super Admin final architecture (forensic implementation)

**Audit baseline:** `01168acccff4cecdec95af224a1f34ce30917da1`
**Repository:** `bhaskarbeyond-creator/ResumePilotAi`
**Audit date:** 2026-08-23 (Asia/Calcutta)
**Live status:** not verified from this sandbox. A local/live certification run is required before release.

## Executive decision

The control plane is a same-origin React shell at `/adm/*`, with `/admin/*` and `/platform/*` as compatibility redirects to the same authenticated console. It uses Firebase ID tokens at the browser boundary, Firebase Admin `verifyIdToken(token, true)` on the server, claim-derived RBAC, Firestore as the durable application/Enterprise data plane, and server-owned audit records. No browser role, tenant id, entitlement, payment amount, or provider secret is authoritative.

This audit fixed implementation gaps in the candidate baseline, including the missing payment-settings GET contract used by Razorpay configuration, wrong platform feature-flag Admin SDK lookup, stale/invalid backend SHA encoding, static Enterprise gating, stale Firestore-only Admin user reads, missing tenant detail/rename contracts, several broken `fetchAdminWithReauth` call sites, zero-on-unavailable dashboards, and missing explicit secret-clear semantics.

## Layered architecture

```text
Browser
  ├─ /adm/* and /admin/* alias
  ├─ React Admin shell, sidebar, settings, command palette
  ├─ same-origin fetch interceptor attaches Firebase bearer token
  └─ sessionStorage/localStorage is UI preference/context only
        │
        ▼
Express API boundary
  ├─ request id, CORS allowlist, Helmet, rate limits, JSON limits
  ├─ public protocol endpoints explicitly allowlisted
  ├─ Firebase bearer verification with checkRevoked=true
  ├─ route policy + verified email + recent-auth/MFA gates
  ├─ /api/admin/*, /api/platform/*, /api/enterprise/*
  └─ stable error code + request id; no raw secret responses
        │
        ├─ Admin/Super Admin services
        │    ├─ configuration census + runtime feature flags
        │    ├─ authoritative Firebase Auth user directory
        │    ├─ payment order/ledger and provider status
        │    ├─ tenant lifecycle/detail/rename
        │    └─ admin/security/tenant audit events
        │
        ▼
Firebase Admin / Firestore
  ├─ users + Firebase Auth custom claims
  ├─ public_config (curated, browser-readable)
  ├─ server-only settings/* secret stores
  ├─ payment_orders, notification_outbox, security_audit_logs
  ├─ enterprise_tenants / memberships / workspaces
  └─ tenants/{tenantId}/resources, audit_events, ai_usage
```

## Authority rules

| Concern | Authoritative source | Browser may request | Browser may not decide |
| --- | --- | --- | --- |
| Admin access | verified Firebase custom claim | render a shell while checking | role by email, URL, localStorage, Firestore profile |
| Super Admin | `role=SUPER_ADMIN` or approved wildcard claim, server checked | invoke a route | grant itself `*` or `SUPER_ADMIN` |
| User disabled state | Firebase Auth `disabled` plus profile projection | request suspend/reactivate | use a stale profile boolean |
| User role | Firebase Auth custom claims | request an allowed role change | assign `SUPER_ADMIN` or mutate claims directly |
| Tenant context | server-resolved membership and lifecycle | send requested context | cross tenant by header/body/URL |
| Payment entitlement | verified provider callback + `payment_orders` transaction | start checkout | amount, plan, membership, webhook success |
| Secrets | deployment environment or server-only store | submit a replacement over TLS | read, log, cache, or clear implicitly |
| Platform health | real probes and bounded evidence | refresh/view | infer zero, healthy, or 100% from missing data |

## Identity and privileged operation gates

1. `requireAuth` verifies a Firebase token with revocation checking.
2. `requirePermission` derives permissions from verified claims; Admin has no wildcard.
3. `requireSuperAdmin` protects platform-only operations.
4. Production Super Admin destructive/configuration mutations require a verified second factor.
5. `requireRecentAdminAuthentication` additionally checks server-side `auth_time` (10 minutes by default).
6. Firebase service-account rotation is intentionally infrastructure-only in production and returns `501 RUNTIME_SECRET_ROTATION_DISABLED`.

## Persistence and audit

Important mutation paths use a backend transaction/batch or provider verification, then write an audit event and return the committed revision/state. The UI re-reads the authoritative list/detail after success. API middleware also records admin mutations and sensitive reads; high-severity events are mirrored to `security_audit_logs`.

The new payment settings contract uses:

- `settings/payment_providers` for write-only provider credentials;
- `data/public_config.subscriptions` for public IDs/toggles/pricing;
- `_revision` / `_settingsRevisions.payments` for conflict detection;
- `clearSecrets` only for deliberate removal;
- blank/masked input as preserve, never delete;
- response fields limited to configured/source/masked status.

## Deployment identity

`GET /healthz`, `GET /api/healthz`, and public `GET /api/platform/version` expose a validated 40-character SHA. Vite injects the build SHA into a non-executable `data-build-sha` HTML meta tag. `scripts/verify-production-identity.mjs` compares both to `EXPECTED_SHA`; it no longer assumes an invented API count.

## Enterprise tenancy flag

`ENTERPRISE_TENANCY_ENABLED` is a rollout gate, not an authorization grant. The effective value is resolved by the same feature-flag service for the Enterprise router, M2M router, health collector, availability endpoint, and Enterprise browser context. A Firestore override is runtime-read; an environment value is startup/deployment-owned and requires restart. A disabled value produces explicit `ENTERPRISE_DISABLED`/`DISABLED` state, not a fake healthy tenant list. Tenant isolation still depends on membership, lifecycle, policy, and repository checks.

## Deliberate infrastructure-only boundaries

The UI exposes operational status and remediation for Firebase Admin credentials, process/network configuration, Cloudflare edge/API bindings, Chromium path, and environment-owned secrets. It does not expose arbitrary environment editing, private keys, deployment files, or process restart controls. Those are changed through deployment/Secret Manager with the runbook below.

## Source-of-truth documents and tools

- Capability matrix: `docs/ADMIN_SUPER_ADMIN_CAPABILITY_MATRIX.md`
- Configuration matrix: `docs/ADMIN_SUPER_ADMIN_CONFIGURATION_MATRIX.md`
- API release manifest: `docs/FINAL_API_INVENTORY.md`
- Live runbook: `docs/ADMIN_SUPER_ADMIN_LOCAL_LIVE_CERTIFICATION_RUNBOOK.md`
- `scripts/verify-admin-superadmin-live.mjs`
- `scripts/verify-platform-health-live.mjs`
- `scripts/verify-api-inventory-live.mjs`
- `scripts/verify-crud-live.mjs`
- `tests/admin-superadmin-live-certification.spec.js`
