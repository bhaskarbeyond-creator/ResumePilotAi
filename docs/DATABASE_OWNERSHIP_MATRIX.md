# Database Ownership Matrix

Generated: 2026-08-29T02:15:00Z
Deployment Commit: `a9de1b3748d869f98cab6994e9de88c748dc845e`
Target Production: `https://airesume.projectdemo.guru`

## Authoritative Datastore Architecture (Live Verified)

The ResumePilot AI production system is **100% MariaDB-authoritative** for all application data, persistence, queues, and metadata.
**Firebase Authentication** is strictly retained for user identity and token issuance.
**Firestore and all Firebase data planes are completely REMOVED** (`firestoreDataPlane: REMOVED`, `quotaStore: mariadb-atomic`).

| Domain | Owner database | Authoritative tables / store | Write path | Read path | Consistency / sync | Failure behavior | Backup / retention | Migration status | Live Production Status |
|---|---|---|---|---|---|---|---|---|---|
| Identity tokens / external user auth | Firebase Auth | Firebase Auth user directory | Firebase SDK / Admin Auth | Firebase SDK / Admin Auth | External identity source; app stores uid/email reference | Auth unavailable blocks auth flows only | Firebase provider managed | Retained (Identity only) | **VERIFIED LIVE** (`certify:identity` PASS) |
| User profile & billing tier | MariaDB | `users` | `/api/users-data/profile`, `saveUserWithRevisionGuard` | `getUser` | Single-owner ACID + optimistic revision lock | 503 controlled fail-closed error | Server daily backup + pre-deploy snapshot | Migrations 001–014 Applied | **VERIFIED LIVE** (MariaDB 11.8.8-log) |
| Resumes & autosave versions | MariaDB | `resumes`, `public_resumes` | `POST /api/resumes/:id` | `GET /api/resumes`, `GET /api/resumes/:id` | Single-owner ACID + revision guard | 503 controlled DB error; 409 conflict | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** |
| Portfolios & WebCV | MariaDB | `portfolios` | `POST /api/portfolios` | `GET /api/portfolios`, `/api/portfolios/public/:slug` | Single-owner ACID | 503 controlled DB error | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** |
| Cover letters | MariaDB | `covers` | `POST /api/covers` | `GET /api/covers`, `GET /api/covers/:id` | Single-owner ACID | 503 controlled DB error | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** |
| Jobs / companies / applications | MariaDB | `jobs`, `companies`, `applications`, `job_tracker` | employer/job APIs and tracker APIs | public/admin/employer APIs | Single-owner; app-level tenant validation | 503 controlled DB error | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** |
| Billing / payments / orders | MariaDB | `payment_orders`, `payment_webhook_events`, `invoices`, `credit_notes`, `coupons` | Provider webhooks (Stripe/PayPal/Razorpay) | owner/admin APIs | ACID, HMAC idempotency, immutable invoice snapshots | Fail-closed, no client-authored payment state | Legal financial retention | Migrations 001–014 Applied | **VERIFIED LIVE** |
| Notifications / outbox | MariaDB | `notifications`, `notification_outbox` | Transactional outbox commits with domain event | Notification APIs & background worker | Durable transactional outbox with lease & backoff | Outage preserves queue; worker reclaims leases | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** (`mysql-transactional-outbox`) |
| Enterprise tenants & governance | MariaDB | `enterprise_tenants`, `enterprise_memberships`, `enterprise_policies`, `enterprise_audit_log` | `/api/enterprise` routes | `/api/enterprise` routes | Tenant context isolation + RBAC + outbox | 503 fail-closed; tenant isolation enforced | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** (`dataProvider: mysql`) |
| CMS / blog / static catalogs | MariaDB | `blog`, `custom_pages`, `trusted_by`, `reviews`, `system_settings` | Admin APIs | Public & admin APIs | Single-owner revisioned writes | 503 controlled DB error | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** |
| AI settings & provider secrets | MariaDB + Server Env | `system_settings` (keys masked in DOM) & server env | Admin AI settings API | Server-only loaders; secret-free UI projections | Real-time provider routing + client secret masking | Fallback provider failover with error logs | Server backup | Migrations 001–014 Applied | **VERIFIED LIVE** (`quotaStore: mariadb-atomic`) |

## Datastore Status Summary

- **MariaDB (11.8.8-MariaDB-log on 127.0.0.1:3306, DB `u727965524_airesume`):** 100% authoritative store. 14/14 migrations applied.
- **Firebase Auth:** 100% operational for identity tokens and TOTP MFA.
- **Firestore / Firebase Realtime / Firebase Storage Data Plane:** 100% REMOVED. 0 runtime connections, 0 client SDK instances, 0 configuration endpoints.
- **PostgreSQL:** No active PostgreSQL instance is used or required.
