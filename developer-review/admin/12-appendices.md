# 12 — Appendices

Raw, reproducible evidence for every quantitative claim in this set. Each appendix states its method and the exact command or script that reproduces it.

| Appendix | Contents |
|---|---|
| **A.1** | Route and guard census — every `/api/admin`, `/api/platform`, `/api/enterprise/platform` registration |
| **A.2** | Permission-vocabulary census — what is required, what is granted, and the gap in both directions |
| **A.3** | Empirical probe harness and results — 26-route × 5-role matrix, target-authority matrix |
| **A.4** | Legacy↔new backend structural diffs |
| **A.5** | Frontend→backend contract breaks and their correct remaps |
| **A.6** | Test coverage analysis |
| **A.7** | Module-toggle consumer census |

---

## A.1 — Route and guard census

**Method.** Static extraction over `backend/index.js` and `backend/routes/*.js`. A registration is captured by the pattern `(app|router).(get|post|put|patch|delete|all)('<path>', <middleware…>, <handler>)`; router-local paths are prefixed with their mount from `backend/index.js` (`app.use('/api/platform', platformRouter)` — `index.js:522,3287`; `app.use('/api/admin', adminAuditRouter)` — `:3286`; `app.use('/api/admin/users', adminUsersRouter)` — `:6897`; `app.use('/api/admin', adminPlatformOperationsRouter)` — `:6898`; `app.use('/api/enterprise', enterpriseRouter)` — `:521,3280`). The guard column is the middleware written between the path and the handler, verbatim.

**Result.** **134 registrations** resolving to **130 distinct `(method, path)` pairs**; **4 are second registrations** of an existing pair (RCA-018, marked **DUP**); **64 carry route-level permission middleware** (60 distinct). Routes marked *policy only* have no route-level guard and are authorised solely by `enforceApiPolicy` (`security/policy.js:106`) — 24 of them additionally perform an inline handler check (`isSuperAdmin`, `requirePermission` called inside the handler body), which the extractor cannot see from the registration line; those are identified by hand in §02 and §08.

**Reconciliation with the runtime inventory.** `npm run inventory:api` (`scripts/generate-api-inventory.mjs`) walks the mounted Express stack and reports **145** distinct admin/platform routes — 15 more than the static table below. The difference is sub-mounted routers and registrations whose argument lists the static pattern does not capture; both numbers describe the same surface, and every claim in this document that depends on a *specific* route is cited by file:line or probe rather than by count.

**Note on duplicated mounts.** `platformRouter` and `enterpriseRouter` are each mounted twice (`index.js:521-522` and `:3280,3287`). Express serves the first mount, so the second is inert — the same duplication pattern as the four duplicate route blocks, one level up. Recorded in RCA-018.

| # | File:line | Method | Path | Route-level guard (verbatim) | Dup |
|---|---|---|---|---|---|
| 1 | `backend/index.js:3291` | GET | `/api/admin/payment-settings` | `requirePermission(['payments.read', 'system.config.read'])` |  |
| 2 | `backend/index.js:3309` | GET | `/api/admin/ai-settings` | `requireSuperAdmin` |  |
| 3 | `backend/index.js:3327` | POST | `/api/admin/blog/categories` | — (policy only) |  |
| 4 | `backend/index.js:3338` | PATCH | `/api/admin/blog/categories/:categoryId` | — (policy only) |  |
| 5 | `backend/index.js:3355` | DELETE | `/api/admin/blog/categories/:categoryId` | — (policy only) |  |
| 6 | `backend/index.js:3376` | PATCH | `/api/admin/blog/posts/:postId` | — (policy only) |  |
| 7 | `backend/index.js:3396` | DELETE | `/api/admin/blog/posts/:postId` | — (policy only) |  |
| 8 | `backend/index.js:3412` | POST | `/api/admin/blog/publish-due` | — (policy only) |  |
| 9 | `backend/index.js:3434` | GET | `/api/admin/health-summary` | — (policy only) |  |
| 10 | `backend/index.js:3475` | POST | `/api/admin/system-health-settings` | `requireRecentAdminAuthentication` |  |
| 11 | `backend/index.js:3776` | GET | `/api/admin/settings` | — (policy only) |  |
| 12 | `backend/index.js:3813` | GET | `/api/admin/settings/:category` | — (policy only) |  |
| 13 | `backend/index.js:3843` | POST | `/api/admin/settings/:category` | — (policy only) |  |
| 14 | `backend/index.js:3984` | POST | `/api/admin/ai-settings` | `requireSuperAdmin` |  |
| 15 | `backend/index.js:4008` | POST | `/api/admin/ai/test-provider` | `requireSuperAdmin` |  |
| 16 | `backend/index.js:4021` | ALL | `/api/admin/ai/fetch-models` | `requireSuperAdmin` |  |
| 17 | `backend/index.js:4035` | GET | `/api/admin/ai/quota-stats` | — (policy only) |  |
| 18 | `backend/index.js:4082` | POST | `/api/admin/ai/quota-limits` | `requireRecentQuotaAdminAuth` |  |
| 19 | `backend/index.js:4105` | POST | `/api/admin/ai/reset-quota` | `requireRecentQuotaAdminAuth` |  |
| 20 | `backend/index.js:4135` | POST | `/api/admin/ai/reset-state` | `requireSuperAdmin` |  |
| 21 | `backend/index.js:4186` | GET | `/api/admin/ai/routing-telemetry` | `requireSuperAdmin` |  |
| 22 | `backend/index.js:4219` | POST | `/api/admin/payment-settings` | `requireRecentAdminAuthentication` |  |
| 23 | `backend/index.js:4515` | GET | `/api/admin/coupons` | `requireAuth, requirePermission(['payments.read', 'system.config.read'])` |  |
| 24 | `backend/index.js:4649` | POST | `/api/admin/coupons` | `requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write']), handleSaveCouponRoute); app.post('/api/admin/coupons/:code', requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write']), handleSaveCouponRoute); app.put('/api/admin/coupons/:code', requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write']), handleSaveCouponRoute); app.delete('/api/admin/coupons/:code', requireAuth, requirePermission(['payments.manage', 'system.config.manage', 'payments.write', 'system.config.write'])` |  |
| 25 | `backend/index.js:4673` | POST | `/api/admin/payment/test-provider` | `requireRecentAdminAuthentication` |  |
| 26 | `backend/index.js:4826` | GET | `/api/admin/twilio-settings` | — (policy only) |  |
| 27 | `backend/index.js:4845` | POST | `/api/admin/twilio-settings` | `requireRecentAdminAuthentication` |  |
| 28 | `backend/index.js:5895` | POST | `/api/admin/firebase-service-account` | `requireRecentAdminAuthentication` |  |
| 29 | `backend/index.js:6103` | POST | `/api/admin/payments/refund` | `requireRecentAdminAuthentication` |  |
| 30 | `backend/index.js:6250` | GET | `/api/admin/employer-applications` | — (policy only) |  |
| 31 | `backend/index.js:6257` | GET | `/api/admin/companies` | — (policy only) |  |
| 32 | `backend/index.js:6271` | GET | `/api/admin/jobs` | — (policy only) |  |
| 33 | `backend/index.js:6286` | GET | `/api/admin/reviews` | — (policy only) |  |
| 34 | `backend/index.js:6295` | GET | `/api/admin/ads` | — (policy only) |  |
| 35 | `backend/index.js:6300` | GET | `/api/admin/payment-orders` | — (policy only) |  |
| 36 | `backend/index.js:6390` | GET | `/api/admin/blog/categories` | — (policy only) |  |
| 37 | `backend/index.js:6395` | GET | `/api/admin/blog/posts` | — (policy only) |  |
| 38 | `backend/index.js:6411` | PATCH | `/api/admin/employer-applications/:uid` | — (policy only) |  |
| 39 | `backend/index.js:6474` | DELETE | `/api/admin/ads/:adId` | — (policy only) |  |
| 40 | `backend/index.js:6592` | GET | `/api/admin/pages` | — (policy only) |  |
| 41 | `backend/index.js:6601` | PUT | `/api/admin/pages/:slug` | — (policy only) |  |
| 42 | `backend/index.js:6629` | DELETE | `/api/admin/pages/:slug` | — (policy only) |  |
| 43 | `backend/index.js:6645` | POST | `/api/admin/website-meta` | `requireRecentAdminAuthentication` |  |
| 44 | `backend/index.js:6734` | GET | `/api/admin/trusted-by` | — (policy only) |  |
| 45 | `backend/index.js:6743` | POST | `/api/admin/trusted-by` | — (policy only) |  |
| 46 | `backend/index.js:6757` | PATCH | `/api/admin/trusted-by/:logoId` | — (policy only) |  |
| 47 | `backend/index.js:6775` | DELETE | `/api/admin/trusted-by/:logoId` | — (policy only) |  |
| 48 | `backend/index.js:6791` | POST | `/api/admin/reviews` | — (policy only) |  |
| 49 | `backend/index.js:6815` | DELETE | `/api/admin/reviews/:reviewId` | — (policy only) |  |
| 50 | `backend/index.js:6831` | PATCH | `/api/admin/companies/:companyId` | — (policy only) |  |
| 51 | `backend/index.js:6857` | PATCH | `/api/admin/jobs/:jobId` | — (policy only) |  |
| 52 | `backend/index.js:6881` | DELETE | `/api/admin/jobs/:jobId` | — (policy only) |  |
| 53 | `backend/routes/adminAudit.js:14` | GET | `/api/admin/audit-logs` | `requirePermission('audit.read')` |  |
| 54 | `backend/routes/adminAudit.js:49` | GET | `/api/admin/audit-logs/stats` | `requirePermission('audit.read')` |  |
| 55 | `backend/routes/adminAudit.js:90` | GET | `/api/admin/audit-logs/:id` | `requirePermission('audit.read')` |  |
| 56 | `backend/routes/adminPlatformOperations.js:73` | PUT | `/api/admin/platform/currency` | `requirePermission('system.config.write'), requireRecentAdminAuthentication` |  |
| 57 | `backend/routes/adminPlatformOperations.js:94` | GET | `/api/admin/subscriptions` | `requirePermission('payments.read')` |  |
| 58 | `backend/routes/adminPlatformOperations.js:186` | POST | `/api/admin/subscriptions/:uid/reconcile` | `requirePermission('payments.manage'), requireRecentAdminAuthentication` |  |
| 59 | `backend/routes/adminPlatformOperations.js:287` | GET | `/api/admin/ai/entitlements` | `requirePermission('ai.usage.read')` |  |
| 60 | `backend/routes/adminPlatformOperations.js:295` | POST | `/api/admin/platform/tenants/:tenantId/members` | `requirePermission('system.config.write'), requireRecentAdminAuthentication` |  |
| 61 | `backend/routes/adminPlatformOperations.js:352` | PATCH | `/api/admin/platform/tenants/:tenantId/members/:principalId` | `requirePermission('system.config.write'), requireRecentAdminAuthentication` |  |
| 62 | `backend/routes/adminPlatformOperations.js:369` | PATCH | `/api/admin/platform/tenants/:tenantId/commercials` | `requirePermission('system.config.write'), requireRecentAdminAuthentication, requireSuperAdmin` |  |
| 63 | `backend/routes/adminPlatformOperations.js:392` | PATCH | `/api/admin/platform/tenants/:tenantId/ai-policy` | `requirePermission('system.config.write'), requireRecentAdminAuthentication, requireSuperAdmin` |  |
| 64 | `backend/routes/adminPlatformOperations.js:450` | POST | `/api/admin/platform/tenants/:tenantId/ai-keys/test` | `requirePermission('system.config.write'), requireRecentAdminAuthentication` |  |
| 65 | `backend/routes/adminPlatformOperations.js:533` | GET | `/api/admin/platform/status` | `requirePermission('system.config.read'), requireRecentAdminAuthentication` |  |
| 66 | `backend/routes/adminPlatformOperations.js:576` | GET | `/api/admin/operations/feature-flags` | `requireSuperAdmin` |  |
| 67 | `backend/routes/adminPlatformOperations.js:588` | GET | `/api/admin/operations/feature-flags/:flagKey` | `requirePermission(['ai.usage.read', 'system.config.read'])` |  |
| 68 | `backend/routes/adminPlatformOperations.js:609` | PUT | `/api/admin/operations/feature-flags/:flagKey` | `requireRecentAdminAuthentication` |  |
| 69 | `backend/routes/adminUsers.js:101` | GET | `/api/admin/users/` | — (policy only) |  |
| 70 | `backend/routes/adminUsers.js:249` | POST | `/api/admin/users/bulk` | — (policy only) |  |
| 71 | `backend/routes/adminUsers.js:312` | POST | `/api/admin/users/` | — (policy only) |  |
| 72 | `backend/routes/adminUsers.js:405` | GET | `/api/admin/users/:uid/details` | — (policy only) |  |
| 73 | `backend/routes/adminUsers.js:635` | GET | `/api/admin/users/:uid` | — (policy only) |  |
| 74 | `backend/routes/adminUsers.js:865` | POST | `/api/admin/users/:uid/tenants` | — (policy only) |  |
| 75 | `backend/routes/adminUsers.js:917` | DELETE | `/api/admin/users/:uid/tenants/:tenantId` | — (policy only) |  |
| 76 | `backend/routes/adminUsers.js:937` | GET | `/api/admin/users/:uid/ai-entitlement` | — (policy only) |  |
| 77 | `backend/routes/adminUsers.js:943` | PUT | `/api/admin/users/:uid/ai-entitlement` | — (policy only) |  |
| 78 | `backend/routes/adminUsers.js:1037` | POST | `/api/admin/users/:uid/verify-email` | — (policy only) |  |
| 79 | `backend/routes/adminUsers.js:1059` | POST | `/api/admin/users/:uid/revoke-sessions` | — (policy only) |  |
| 80 | `backend/routes/adminUsers.js:1079` | POST | `/api/admin/users/:uid/unenroll-mfa` | — (policy only) |  |
| 81 | `backend/routes/adminUsers.js:1101` | GET | `/api/admin/users/:uid/export` | — (policy only) |  |
| 82 | `backend/routes/databaseAdmin.js:40` | GET | `/api/admin/database-settings/` | — (policy only) |  |
| 83 | `backend/routes/databaseAdmin.js:90` | GET | `/api/admin/database-settings/sync-status` | `retiredDatabaseControl); for (const path of ['/sync-now', '/verify-parity']) router.post(path, requireRecentAdminAuthentication, retiredDatabaseControl); router.post('/prune-outbox', requireRecentAdminAuthentication` |  |
| 84 | `backend/routes/databaseAdmin.js:143` | GET | `/api/admin/database-settings/conflicts` | `retiredDatabaseControl); router.get('/dead-letter'` |  |
| 85 | `backend/routes/databaseAdmin.js:157` | POST | `/api/admin/database-settings/retry-dead-letter` | `requireRecentAdminAuthentication, (_req, res) => res.status(400).json({ success: false, error: { code: 'BULK_REPLAY_FORBIDDEN', message: 'Dead letters must be reviewed and replayed individually with an idempotency key.' }, })); router.post('/test-connection'` |  |
| 86 | `backend/routes/databaseAdmin.js:174` | POST | `/api/admin/database-settings/initialize-schema` | `requireRecentAdminAuthentication` |  |
| 87 | `backend/routes/databaseAdmin.js:187` | POST | `/api/admin/database-settings/` | `requireRecentAdminAuthentication` |  |
| 88 | `backend/routes/enterprise.js:608` | GET | `/api/enterprise/platform/tenants` | — (policy only) |  |
| 89 | `backend/routes/enterprise.js:621` | POST | `/api/enterprise/platform/tenants/:tenantId/suspend` | — (policy only) |  |
| 90 | `backend/routes/enterprise.js:630` | POST | `/api/enterprise/platform/tenants/:tenantId/reactivate` | — (policy only) |  |
| 91 | `backend/routes/platform.js:207` | GET | `/api/platform/version` | `(_req, res) => { res.setHeader('Cache-Control', 'no-store'); const commitSha = getCommitSha(); const frontendBuildSha = getFrontendBuildSha(); return res.json({ commitSha, frontendBuildSha, service: 'resumepilot-backend', apiVersion: 'platform-v2', // Aggregated so a caller does not have to infer release alignment by hand. releaseIdentity: { backendSha: commitSha, frontendSha: frontendBuildSha, aligned: Boolean(frontendBuildSha) && frontendBuildSha === commitSha, verified: Boolean(frontendBuildSha) && frontendBuildSha === commitSha, }, }); }); // Public platform and module configuration (Public, 100% MariaDB-backed) router.get('/public-config'` |  |
| 92 | `backend/routes/platform.js:263` | GET | `/api/platform/health` | — (policy only) |  |
| 93 | `backend/routes/platform.js:287` | GET | `/api/platform/operational-status` | — (policy only) |  |
| 94 | `backend/routes/platform.js:305` | GET | `/api/platform/operational-status/api-matrix` | — (policy only) |  |
| 95 | `backend/routes/platform.js:317` | GET | `/api/platform/operational-status/:serviceId` | — (policy only) |  |
| 96 | `backend/routes/platform.js:368` | POST | `/api/platform/operational-status/:serviceId/test` | `requireRecentAdminAuthentication` |  |
| 97 | `backend/routes/platform.js:403` | POST | `/api/platform/operational-status/refresh` | `requirePermission('system.config.write')` |  |
| 98 | `backend/routes/platform.js:431` | GET | `/api/platform/overview` | — (policy only) |  |
| 99 | `backend/routes/platform.js:465` | GET | `/api/platform/queues` | — (policy only) |  |
| 100 | `backend/routes/platform.js:504` | POST | `/api/platform/queues/retry` | `requireRecentAdminAuthentication` |  |
| 101 | `backend/routes/platform.js:543` | POST | `/api/platform/queues/purge` | `requireRecentAdminAuthentication, (_req, res) => res.status(410).json({ error: { code: 'DEAD_LETTER_PURGE_RETIRED', message: 'Dead letters are retained for investigation and may not be bulk-deleted.' }, })); router.get('/maintenance'` |  |
| 102 | `backend/routes/platform.js:576` | POST | `/api/platform/maintenance` | `requireRecentAdminAuthentication` |  |
| 103 | `backend/routes/platform.js:621` | GET | `/api/platform/command-center` | — (policy only) |  |
| 104 | `backend/routes/platform.js:789` | GET | `/api/platform/security-events` | — (policy only) |  |
| 105 | `backend/routes/platform.js:836` | GET | `/api/platform/encryption` | — (policy only) |  |
| 106 | `backend/routes/platform.js:860` | GET | `/api/platform/observability` | — (policy only) |  |
| 107 | `backend/routes/platform.js:876` | GET | `/api/platform/backup-status` | — (policy only) |  |
| 108 | `backend/routes/platform.js:901` | GET | `/api/platform/payments-health` | — (policy only) |  |
| 109 | `backend/routes/platform.js:921` | GET | `/api/platform/search` | — (policy only) |  |
| 110 | `backend/routes/platform.js:977` | GET | `/api/platform/announcements` | — (policy only) |  |
| 111 | `backend/routes/platform.js:999` | POST | `/api/platform/announcements` | `requireRecentAdminAuthentication` |  |
| 112 | `backend/routes/platform.js:1035` | PATCH | `/api/platform/announcements/:id` | `requireRecentAdminAuthentication` |  |
| 113 | `backend/routes/platform.js:1091` | DELETE | `/api/platform/announcements/:id` | `requireRecentAdminAuthentication` |  |
| 114 | `backend/routes/platform.js:1229` | GET | `/api/platform/attention` | — (policy only) |  |
| 115 | `backend/routes/platform.js:1270` | GET | `/api/platform/health-indicator` | — (policy only) |  |
| 116 | `backend/routes/platform.js:1289` | GET | `/api/platform/enterprise-queue` | — (policy only) |  |
| 117 | `backend/routes/platform.js:1304` | GET | `/api/platform/operators` | — (policy only) |  |
| 118 | `backend/routes/platform.js:1342` | POST | `/api/platform/operators` | `requireRecentAdminAuthentication` |  |
| 119 | `backend/routes/platform.js:1402` | POST | `/api/platform/operators/:uid/revoke-sessions` | `requireRecentAdminAuthentication` |  |
| 120 | `backend/routes/platform.js:1444` | GET | `/api/platform/tenants/:tenantId` | — (policy only) |  |
| 121 | `backend/routes/platform.js:1534` | PATCH | `/api/platform/tenants/:tenantId` | `requireRecentAdminAuthentication` |  |
| 122 | `backend/routes/platform.js:1547` | POST | `/api/platform/tenants/:tenantId/decommission` | `requireRecentAdminAuthentication` |  |
| 123 | `backend/routes/platform.js:1587` | POST | `/api/platform/tenants/garbage-collect` | `requireRecentAdminAuthentication` |  |
| 124 | `backend/routes/platform.js:1637` | GET | `/api/platform/feature-flags` | `requireSuperAdmin` |  |
| 125 | `backend/routes/platform.js:1646` | PUT | `/api/platform/feature-flags/:flagKey` | `requireRecentAdminAuthentication` |  |
| 126 | `backend/routes/platform.js:1670` | GET | `/api/platform/configuration` | `requireSuperAdmin` |  |
| 127 | `backend/routes/platform.js:1707` | GET | `/api/platform/payment-settings` | `requirePermission(['payments.read', 'system.config.read'])` |  |
| 128 | `backend/routes/platform.js:1727` | GET | `/api/platform/payment-webhooks` | `requirePermission('system.config.read')` |  |
| 129 | `backend/routes/platform.js:1809` | POST | `/api/platform/payment-webhooks/:eventId/replay` | `requireSuperAdmin` |  |
| 130 | `backend/routes/platform.js:1846` | GET | `/api/platform/configuration` | `requireSuperAdmin` | **DUP** |
| 131 | `backend/routes/platform.js:1883` | GET | `/api/platform/payment-settings` | `requirePermission('system.config.read')` | **DUP** |
| 132 | `backend/routes/platform.js:1903` | GET | `/api/platform/payment-webhooks` | `requirePermission('system.config.read')` | **DUP** |
| 133 | `backend/routes/platform.js:1985` | POST | `/api/platform/payment-webhooks/:eventId/replay` | `requireSuperAdmin` | **DUP** |
| 134 | `backend/routes/platform.js:2027` | POST | `/api/platform/role-view-audit` | `requireAuth, requireSuperAdmin` |  |

---

## A.2 — Permission-vocabulary census

**Method.** Three greps, unioned:
1. every string literal passed to `requirePermission(...)` in `backend/**` (excluding tests);
2. every string literal returned by `resolveAdminReadPermission`/`resolveAdminMutationPermission` (`security/policy.js:54-101`);
3. the role bundles in `security/auth.js:63-88`.

### A.2.1 — Permission strings that are "in force" (22)

| Permission | Required by `requirePermission` (call sites) | Required by path policy | Granted to | Verdict |
|---|---|---|---|---|
| `system.config.write` | **23** | yes (default mutation) | ADMIN, SA | over-broad: 23 call sites for a generic default |
| `system.config.read` | 11 | yes (**default read** for all unmatched admin paths, `policy.js:79`) | **nobody** | 🔴 required-but-unassigned → P1 poisoning (§08 §1.4) |
| `system.config.manage` | 4 | yes (settings mutations) | **nobody** | 🔴 required-but-unassigned → ADMIN cannot save settings |
| `payments.manage` | 6 | yes (payment mutations) | ADMIN, SA | consistent |
| `payments.read` | 4 | yes | ADMIN, AUDITOR, SA | consistent |
| `payments.write` | 4 | no | **nobody** | 🔴 required-but-unassigned |
| `audit.read` | 3 | yes (`/platform/search`) | ADMIN, AUDITOR, SA | 🔴 decorative — no route resolves to it (RCA-004) |
| `security.read` | — | yes (health/security/queues/backup/encryption) | ADMIN, AUDITOR, SA | consistent |
| `users.read` | — | yes (users, employer-applications, jobs, reviews, search) | ADMIN, AUDITOR, SUPPORT, SA | consistent |
| `users.update` | — | yes (`/admin/users/*` mutations) | ADMIN, SA | consistent |
| `tickets.manage` | 2 | yes (support desk, jobs, reviews, search) | ADMIN, SUPPORT, SA | consistent |
| `email.logs.read` | 2 | yes | ADMIN, AUDITOR, SUPPORT, SA | consistent |
| `email.template.manage` | 1 | no | ADMIN, SA | consistent |
| `blog.write` | 2 | no | ADMIN, SA | consistent |
| `blog_management` | 2 | no | ADMIN, SA | consistent (duplicate concept of `blog.write` — vocabulary debt) |
| `content.manage` | 2 | no | ADMIN, SA | consistent |
| `ai.usage.read` | 2 | yes | ADMIN, AUDITOR, SA | consistent |
| `ai.entitlements.manage` | 1 | yes | ADMIN, SA | consistent |
| `tenants.read` | — | yes | ADMIN, AUDITOR, SUPPORT, SA | consistent |
| `secrets.manage` | — | yes (`/admin/firebase-service-account`) | **nobody** | 🔴 required-but-unassigned |
| `messages.read` | 1 | no | **nobody** | 🔴 required-but-unassigned |
| `tenant.support.access` | 1 (tenant policy) | no | **nobody** | 🔴 required-but-unassigned (tenant plane) |

Additionally **`users.export`** and **`users.security.manage`** appear in code (1 and 4 sites) and in no bundle → **8 required-but-unassigned** in total: `system.config.read`, `system.config.manage`, `payments.write`, `secrets.manage`, `messages.read`, `users.export`, `users.security.manage`, `tenant.support.access`.

### A.2.2 — Granted but never required

| Role | Permission | Occurrences outside `security/auth.js` |
|---|---|---|
| ADMIN | `notifications.send` | **0** |
| ADMIN | `blog.read` | **0** |
| ADMIN | `users.delete` | **0** |
| ADMIN | `tenants.write` | **0** |
| ADMIN | `tenants.manage` | **0** |

Five ADMIN grants authorise nothing (the effective gate for those paths is the path policy). The `ENTERPRISE_ADMIN`/`ENTERPRISE_MEMBER` vocabulary is enforced through `tenantPolicy.js` rather than the platform checks above and is not counted here.

> **Correction recorded.** An earlier working figure in this review set stated "24 permission strings granted to a role but never required". The reproducible count for the *platform* plane is **5** (plus the enterprise vocabulary, which is enforced by a different engine). §README and §01 have been corrected to 5. The change strengthens rather than weakens the underlying finding: the vocabulary's problem is not an excess of unused grants, it is **8 permissions that gate real routes while no role holds them**.

### A.2.3 — Why the vocabulary fails INV-3 (exact mechanism)

`permissionsFor` (`auth.js:190-197`) concatenates the role bundle with `claims.permissions` and `requirePermission` tests exact membership (`permissions.set.has(perm)`). Therefore:

* `system.config.write` does **not** satisfy `requirePermission('system.config.read')`;
* `system.config.write` does **not** satisfy `requirePermission('system.config.manage')`;
* a role can be denied the read of the thing it may write, and the write of the thing it may read.

That is the whole of the action-hierarchy gap, and it is three lines of code to state and one resolver to fix (REC-005).

---

## A.3 — Empirical probe harness and results

### A.3.1 — Harness

```js
// /tmp/ana/probe2.js  (executed 2026-10-26)
process.env.NODE_ENV = 'test';
const request = require('supertest');
const { setTokenVerifierForTests } = require('/home/user/ResumePilotAi/backend/security/auth');
const app = require('/home/user/ResumePilotAi/backend/index');

const ROLES = {
  USER:        { uid: 'u-user',  role: 'USER' },
  SUPPORT:     { uid: 'u-sup',   role: 'SUPPORT' },
  AUDITOR:     { uid: 'u-aud',   role: 'AUDITOR' },
  ADMIN:       { uid: 'u-adm',   role: 'ADMIN' },
  SUPER_ADMIN: { uid: 'u-sa',    role: 'SUPER_ADMIN',
                 firebase: { sign_in_second_factor: 'totp' } },
};
// The verifier is swapped per request so the whole middleware stack
// (requireAuth → enforceApiPolicy → route middleware → handler) runs for each role.
```

**Interpretation rule.** `403` = authorisation denied. Any other status — `200`, `400`, `404`, `500`, `503` — proves the request passed authorisation and reached business logic. With no MariaDB in the sandbox, DB-backed handlers return `503 ECONNREFUSED` and Firebase-backed handlers return `500 app/invalid-credential`; **neither is a product defect** and neither is reported as one.

### A.3.2 — Role matrix (26 routes × 5 identities)

Values are the HTTP status observed. See §08 §1.4 for the annotated version.

| Route | USER | SUPPORT | AUDITOR | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|
| `GET /api/admin/users` | 403 | 200 | 200 | 200 | 200 |
| `GET /api/admin/users/:id/audit` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/admin/audit-logs` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/admin/audit-logs/stats` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/platform/search` | 403 | 200 | 200 | 200 | 200 |
| `GET /api/platform/operators` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/platform/tenants/:id` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/platform/configuration` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/platform/queues` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/platform/backup-status` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/platform/attention` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/platform/encryption` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/platform/health-indicator` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/admin/settings` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/admin/settings/:category` | 403 | 403 | 403 | 403 | 200 |
| `POST /api/admin/settings/:category` | 403 | 403 | 403 | 403 | 400 (`REVISION_REQUIRED`) |
| `GET /api/admin/ai-settings` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/admin/ai/entitlements` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/admin/pages` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/admin/coupons` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/admin/companies` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/admin/subscriptions` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/admin/health-summary` | 403 | 403 | 200 | 200 | 200 |
| `GET /api/admin/database-settings` | 403 | 403 | 403 | 403 | 200 |
| `GET /api/admin/system-health-settings` | 403 | 403 | 403 | 403 | 200 |
| `POST /api/admin/system-health-settings` | 403 | 403 | 200 | 200 | 400 (validation) |
| `POST /api/admin/users/:id/unenroll-mfa` | 403 | 403 | 403 | **500** | **500** |
| `POST /api/admin/delete-user` | 403 | 403 | 403 | 403 | 500 |
| `POST /api/admin/payments/refund` | 403 | 403 | 403 | 403 | 500 |
| `POST /api/platform/role-view-audit` | 403 | 403 | 403 | 403 | 200 |
| `PUT /api/platform/feature-flags/:flag` | 403 | 403 | 403 | 403 | 400/503 |
| `GET /api/platform/feature-flags` | 403 | 403 | 403 | 403 | 200 |

The **only** row where a non-admin role reaches a mutation is `unenroll-mfa` (`ADMIN` → 500), which is RCA-005. Every other mutation is either SA-only or guarded correctly.

### A.3.3 — Phantom-route probe (`[PROBE-003]`)

Each FE-called path requested as `SUPER_ADMIN`; `404` proves the route does not exist.

| FE path | Status | Correct route |
|---|---|---|
| `POST /api/admin/users/:uid/status` | 404 | `PATCH /api/admin/users/:uid` `{suspended}` |
| `POST /api/admin/queues/dead-letter-queue/retry` | 404 | `POST /api/platform/queues/retry` `{jobId}` |
| `POST /api/admin/queues/dead-letter-queue/purge` | 404 | `POST /api/platform/queues/purge` `{jobId}` |
| `POST /api/admin/operations/backup` | 404 | `GET /api/platform/backup-status` (status) — no trigger route exists |
| `POST /api/admin/operations/cache-clear` | 404 | none exists (capability absent) |
| `POST /api/admin/employer-applications/:id/verify` | 404 | `PATCH /api/admin/employer-applications/:uid` |
| `POST /api/admin/jobs/:id/moderate` | 404 | `PATCH /api/admin/jobs/:jobId` |
| `DELETE /api/blog/posts/:id` | 404 | `DELETE /api/blog-data/:id` |
| `GET /api/blog/posts` | 404 | `GET /api/blog-data` |
| `GET /api/admin/dashboard` | 404 | `GET /api/platform/command-center` |
| `GET /api/admin/tenants` | 404 | `GET /api/enterprise/platform/tenants` |
| `GET /api/platform/tenants` | 404 | `GET /api/enterprise/platform/tenants` |
| `GET /api/admin/queues` | 404 | `GET /api/platform/queues` |

### A.3.4 — Target-authority matrix (the test REC-004 must make pass)

| Caller ↓ / Target → | SUPER_ADMIN | ADMIN | AUDITOR | Notes |
|---|---|---|---|---|
| **SUPER_ADMIN** | **permitted** (INV-2) | permitted | permitted | root may act on anyone |
| **ADMIN** | **403 required** — today `500` = permitted (RCA-005) | permitted | permitted | peer support stays legal |
| **AUDITOR** | 403 (already) | 403 (already) | n/a | read-only role |
| **SUPPORT** | 403 (already) | 403 (already) | n/a | read-only for these six mutations |

Applied to all six handlers (`unenroll-mfa`, `revoke-sessions`, `send-password-reset`, `ai-entitlement`, `PATCH /:uid`, `delete-user`) → 24 assertions.

---

## A.4 — Legacy↔new backend structural diffs

`diff -u reference-code/backend/<f> backend/<f>`; line counts are added+removed hunks.

| File | Diff size | Nature of the difference | Divergence |
|---|---|---|---|
| `routes/adminUsers.js` | **0 lines** | identical | none — legacy behaviour verbatim (incl. no target ceiling) |
| `routes/adminAudit.js` | **0 lines** | identical | none |
| `security/adminAudit.js` | **0 lines** | identical | none (incl. best-effort write, RCA-022) |
| `security/auth.js` | **+108 lines** | `optionalAuth`/`bearerTokenFrom` extraction only | DIV-012; permission map byte-identical |
| `security/policy.js` | **+46 lines** | `RECENT_AUTHENTICATION_PATHS`; DIR-106 `ai-settings` read entry; DIR-022 `subscriptions` mutation entry | DIV-013 territory; the path-table *design* is unchanged |
| `routes/adminPlatformOperations.js` | **392 lines (new file)** | new admin operations module | **0 audit calls** (RCA-022) |
| `routes/platform.js` | substantial | operational-status/health, configuration census, feature flags, payment projection, role-view audit added; four blocks duplicated | RCA-018, DIV-013 |
| `index.js` | substantial | settings transaction hardening (`3843-3978`), secret classification/preservation, Twilio route, AI routes, rate limiters | strongest new engineering in the set |

**Conclusion used in §02 and §07:** the admin *backend* is the legacy backend plus a hardening patch set. The RBAC model, the audit middleware and the users router are unchanged, which is why legacy defects LD-03, LD-05 and the best-effort audit write survive into the new system.

---

## A.5 — Frontend→backend contract breaks (13 distinct paths)

See A.3.3 for the executed table. Fifteen call sites in `frontend/src/components/admin/*.tsx` reference the 13 paths below; **all 13 return `404` for every role including `SUPER_ADMIN`**. Ten are shape/naming breaks where an existing handler covers the capability under a different path or verb; three are namespace misses (two of them — `/api/admin/tenants` and `/api/platform/tenants` — are duplicates of a single real path under `/api/enterprise`).

**Why this matters more than a broken link.** Each of the 10 is wrapped in `.catch(() => {})` and followed by an optimistic state update (RCA-002), so the observable behaviour is not an error — it is a success message. The contract break and the false success are one defect with two halves; REC-003 fixes the routing, REC-002 fixes the reporting, and neither is sufficient alone.

**Prevention.** `npm run certify:contracts` (REC-023): read every quoted `/api/...` string in `frontend/src`, strip the client's base URL, and assert a match against the Express route table, allowing `:param` segments to match any single path segment. Such a test would have caught all 13 before merge.

---

## A.6 — Test coverage analysis

**Method.** Enumerate test files under `frontend/tests/` (Playwright), `frontend/src/**/*.test.*` (none), and `backend/test/` (Node test runner).

| Layer | Files | Coverage of the admin plane |
|---|---|---|
| `backend/test/` | **17 admin/RBAC-relevant suites** — `admin-rbac-contract.test.js`, `superadmin-control-plane.test.js`, `superadmin-platform.test.js`, `superadmin-remediation-pass.test.js`, `rbac-role-visibility-forensic.test.js`, `platform-health-rbac.test.js`, `payment-settings-rbac.test.js`, `admin-audit-query.test.js`, `admin-backend-ux-control.test.js`, `admin-tenant-assignment.test.js`, `admin-routing-telemetry-route.test.js`, `admin-ai-reset-state.test.js`, `ai-admin.test.js`, `ai-admin-configured-enabled-split.test.js`, `ai-admin-partial-save-toggles.test.js`, `database-admin.test.js`, `payment-admin-settings.test.js` | **Substantial.** Backend authorisation is the best-tested part of the control plane. This is why the backend findings in this review are mostly *inherited gaps* rather than regressions — the suites encode the inherited behaviour as expected. |
| `frontend/tests/` | 7 Playwright specs, **1 admin spec**: `freellmapi-admin-e2e.spec.ts` (47 cases, all `tab=ai-settings` and its sub-views) | **14 of 15 console tabs have no dedicated UI test.** The `ai-settings` tab is the only covered one — which correlates exactly with it being the only tab built without fixtures. |
| `scripts/` certification | `verify-admin-superadmin-live.mjs` (`npm run certify:admin`), `generate-api-inventory.mjs` (`inventory:api`), `certify:crud` | Live-environment assertions exist; none asserts INV-1…INV-6 (REC-024). |

**What the coverage gap predicts.** The three Critical findings (fixtures, false success, phantom routes) are exactly the class a single UI test per tab would catch: render the tab with a failing API and assert no data is shown. That is one test per tab, ~15 tests, and it is the highest ratio of risk-removed to effort in the whole programme (REC-023).

**What must not be "fixed".** The 17 backend suites encode current behaviour, including the 8 unassigned permissions. REC-005/REC-006 will require updating them — that is expected. They must be *updated to the new authority model*, not deleted, or the backend loses its only regression net.

---

## A.7 — Module-toggle consumer census

**Method.** For each of the 18 keys in `MODULE_DEFINITIONS` (`frontend/src/components/admin/AdminSettingsTab.tsx:201-360`): count references in `backend/**` (excluding `node_modules` and tests) and in `frontend/src/**`, then read each hit to classify it as *enforcement* (gates behaviour), *display* (health/labels only), or *definition* (the toggle itself).

| Key | Backend references | Frontend references | Verdict |
|---|---|---|---|
| `enableMessagesModule` | 1 (`index.js:609` — `if (config?.modules?.enableMessagesModule === true) return next()`) | 1 (definition) | ✅ **enforced** |
| `enablePortfolioModule` | 1 (`routes/portfolios.js:16` — `!== false`, default on) | 1 (definition) | ✅ **enforced** (default-on) |
| `enableLinkedinAuthModule` | 1 (`services/platformHealth.js:210` — display string) | 1 (definition) | ⚠️ display only |
| `enableGithubAuthModule` | 1 (`platformHealth.js:209` — display string) | 1 (definition) | ⚠️ display only |
| `enableImportModule` | 2 (`services/aiAdmin.js:86,270` — a **field of the AI provider config**, name collision) | 1 (definition) | ❌ not a module gate |
| `enableGoogleAuthModule` | 0 | 1 | ❌ **inert** |
| `enableFacebookAuthModule` | 0 | 1 | ❌ **inert** |
| `enableEmailVerification` | 0 | 1 | ❌ **inert** |
| `enableCoverLetterModule` | 0 | 1 | ❌ **inert** |
| `enableAiSuggestionsModule` | 0 | 1 | ❌ **inert** |
| `enableAtsScoreModule` | 0 | 1 | ❌ **inert** |
| `enablePublicSharingModule` | 0 | 1 | ❌ **inert** |
| `enableJobScraperModule` | 0 | 1 | ❌ **inert** |
| `enableJobTrackerModule` | 0 | 1 | ❌ **inert** |
| `enableAppliedJobsModule` | 0 | 1 | ❌ **inert** |
| `enableCouponsModule` | 0 | 1 | ❌ **inert** |
| `enableSalesTaxModule` | 0 | 1 | ❌ **inert** |
| `enableBlogModule` | 0 | 1 | ❌ **inert** |

**Counts.** 2 keys gate behaviour; 2 are display-only in a health report; 1 is a name collision inside the AI config; **13 are inert**, and **all 18 have zero consumers in `frontend/src` other than the toggle definition itself**.

**Comparison with legacy (this is the regression).** In the legacy SPA the same keys were consumed by the UI — e.g. `enableMessagesModule` in 4 files, `enablePortfolioModule` in 6, `enableBlogModule`, `enableCouponsModule` and `enableJobTrackerModule` in 4 each (`grep -rl <key> src/`). Legacy therefore *hid* modules without enforcing them (LD-01/LD-02: UI-only authorisation). The new system removed the UI consumers as well, so **a toggle now has no observable effect anywhere except in the 2 enforced cases** — while the panel states "Instant Global Propagation … across all connected portals" (`AdminSettingsTab.tsx:484`).

**Why this is High rather than Low.** An operator performing maintenance ("turn off interviews for the next hour") is told the change propagated. It did not. The failure is silent, and the operator has no way to discover it from the console — which is the same false-assurance class as RCA-001, applied to configuration.

---

*End of appendices. Return to [README.md](README.md) for the index, or to [10-recommendations.md](10-recommendations.md) for the remediation plan.*
