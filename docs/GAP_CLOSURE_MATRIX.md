# 16-Gap Closure Matrix

**Baseline SHA:** `127ec160f968fb6fb0f4bac49d59171456e2c642`
**Working branch:** `arena/01a04d22-resumepilotai`
**Date:** 2026-08-29
**Constraint:** MariaDB-only, zero-Firestore, no authorization weakening, no invented live metrics.

## Dependency order

1. GAP-01 RBAC (unblocks Auditor/Support reads; required before Help Desk UX)
2. GAP-02 Notification worker (PM2 production env only; other workers stay fail-closed)
3. GAP-03 Cover-letter SPA auth
4. GAP-06 Support tickets (API + MariaDB + Admin UI; needs GAP-01)
5. GAP-08 Paytm/PhonePe server callbacks + pending-order reconcile
6. Remaining P2/P3: CLOSED only with code; otherwise ACCEPTED/BLOCKED with evidence

Do **not** grant SUPPORT all admin GETs. Least privilege is path-mapped.

## Matrix

| ID | Pri | Decision | Why | Evidence |
|---|---|---|---|---|
| GAP-01 | P1 | 🟢 CLOSED | Policy L53 + index L429 write-gate + Admin.jsx allowlist block AUDITOR/SUPPORT | Method-aware policy; GET mapped to least privilege; mutations still `system.config.write` |
| GAP-02 | P1 | 🟢 CLOSED | PM2 production env hardcodes outbox worker `false` so queued mail never drains | `ecosystem.config.js` `NOTIFICATION_OUTBOX_WORKER_ENABLED='true'`; CMS/enterprise/GC remain `false` | Performance consequence now documented at GAP-23.
| GAP-03 | P2 | 🟢 CLOSED | `/coverletter` SPA has no `RequireAuthenticated`; API already auth'd | `src/main.jsx` wraps `/coverletter`, `/coverletter/*`, `/cover-letter`, `/cover-letter/*` in `RequireAuthenticated`. Adversarial QA `requiresAuth: false` is a crawl flag, not a unit constraint. |
| GAP-04 | P2 | 🟡 ACCEPTED | 5,872-line `index.js` is functional; blind extract risks auth/payment regressions | Standing instruction: do not blindly refactor; 18 routers already exist |
| GAP-05 | P2 | 🟡 ACCEPTED | Backup scripts exist; crontab cannot be installed from this sandbox onto Hostinger | `ops/dr/install-backup-schedule.sh` remains operator-run; no fake cron proof |
| GAP-06 | P2 | 🟢 CLOSED | `tickets.manage` has no table/API/UI | `015_support_tickets.sql` + `/api/support` (owner-scoped) + `/api/admin/support` (`tickets.manage`) + Admin Help Desk. SUPPORT 403 on operational-status. AUDITOR has no `tickets.manage`. |
| GAP-07 | P2 | 🟡 ACCEPTED | Impersonation would mint another user's session and weaken tenant isolation | Support uses `users.read` + tickets; no session swap |
| GAP-08 | P2 | 🟢 CLOSED | Paytm/PhonePe advertise `callbackUrl` with no handler; browser poll can miss activation | `POST /api/paytm/callback` HTML 200 always after HMAC status query; `POST /api/phonepe/callback` X-VERIFY then status API; claim/activate/release; outbox reconcile LIMIT 25 (per-row credential reads + per-tick coupling later re-scoped by GAP-23) |
| GAP-09 | P2 | 🟡 ACCEPTED | No Datadog/New Relic vendor or credentials | Healthz/readyz/request IDs remain; do not add unpaid APM |
| GAP-10 | P2 | 🟢 CLOSED | Alert scripts unwired | Consecutive `/readyz` not-ready â‰¥2 fire-and-forget `queueEmail` `admin_system_alert:readyz:<hourBucket>` to `ADMIN_EMAIL`; never awaited before 503 |
| GAP-11 | P2 | 🟡 ACCEPTED | `501 STORAGE_PROVIDER_UNSUPPORTED` is intentional; no S3/Cloudinary adapter | StorageSettings remains informational |
| GAP-12 | P3 | 🟢 CLOSED | `/front` renders `<div>front</div>` | `src/main.jsx` `<Navigate to="/" replace />` |
| GAP-13â€“15 | P3 | 🟡 ACCEPTED | Unused `initailisation/`, `addAds/`, `About/`, `Analytics.jsx` are dead but deletion is not required for production safety | No runtime import; leave tree to avoid test/doc churn |
| GAP-16 | P3 | 🟡 ACCEPTED | PM2 cluster would duplicate in-memory rate limiters and workers | Keep `instances: 1, exec_mode: 'fork'` |
| GAP-17 | P3 | 🟡 ACCEPTED | Skip-link + `#main-content` landed; no formal WCAG 2.1 AA audit | `index.html` skip-link, `src/index.css`, Admin + AuthenticatedAppShell `#main-content`. No AA claim. |
| GAP-18 | P3 | 🟡 ACCEPTED | No k6/Artillery run against live | Do not invent capacity numbers |
| GAP-19 | P3 | 🟡 ACCEPTED | No blue-green infra | Single-instance PM2 restart remains the deploy model |
| GAP-20 | P3 | 🟡 ACCEPTED | No Percy/Chromatic | Do not invent screenshot proof |
| GAP-21 | P2 | 🟢 CLOSED | `architecture-flowchart.md` Â§64: personal-workspace (`personal-<id>`) rows surface in the User 360 assign-tenant dropdown | Design decision (auto-promotion vs dropdown segregation) is required before code; the backend string-error normalization leg landed as part of GAP-22 |
| GAP-22 | P0 | 🟢 CLOSED | `POST /api/admin/users/:uid/tenants` and `POST /api/admin/platform/tenants/:tenantId/members` called strict `grantMembership` without the mandatory tenant-owned `workspaceId` â†’ every Super Admin User 360 tenant assignment failed with HTTP 400 `INVALID_TENANT_CONTEXT` | Fixed at the route boundary via `backend/enterprise/workspaceResolution.js`: tenant validated (404/403 lifecycle), canonical `isDefault` workspace resolved (deterministic `409 TENANT_NO_USABLE_WORKSPACE` otherwise), explicit `workspaceId` validated tenant-owned (400/404), strict registry contract unchanged. Evidence: `backend/test/admin-tenant-assignment.test.js` 17/17, `tests/gap22-user360-tenant-assignment.test.mjs` 11/11, full suite green. Live proof: **not claimed** (no redeploy this session) |
| GAP-23 | P1 | 🟢 CLOSED | Slow database-backed requests. Root cause was round-trip count and shared-pool contention, not MariaDB execution speed (`/api/readyz` `latencyMs: 0`). GAP-02 flipped the outbox worker on and GAP-08 coupled payment reconciliation into its 15s tick; combined with two N+1 read paths this put sustained and burst load on the single `connectionLimit` 15 / `queueLimit` 200 pool | `backend/services/indianGatewayActivation.js` credentials resolved once per provider per pass (25-order tick: 51 -> 1-3 pool round trips); `/api/messages/conversations` 1+2N -> constant 3; `/api/admin/users` 2N -> 2 batched reads via `getUsersByIds` + `listMembershipsForPrincipals`, each row revalidated against its own principal. Provider status fetch now enforces `AbortSignal.timeout(10_000)` because global fetch ignores the `timeout` option. Evidence: `backend/test/mariadb-query-budget.test.js` (14 cases; guards fail on pre-fix code), full platform suites green. No index added, no cache widened, no auth/RBAC/tenant change, no Firestore reintroduction. Live before/after latency **not claimed** (no APM, no live DB access) |

## Intentional worker state (production PM2)

| Flag | Production | Reason |
|---|---|---|
| `NOTIFICATION_OUTBOX_WORKER_ENABLED` | **true** | Drain transactional outbox |
| `CMS_SCHEDULER_ENABLED` | false | Admin `publish-due` remains the explicit publish path |
| `ENTERPRISE_OUTBOX_WORKER_ENABLED` | false | `ENTERPRISE_TENANCY_ENABLED=false` |
| `TENANT_GC_WORKER_ENABLED` | false | Tenancy dark; GC would be idle |

`.env.example` stays fail-closed (`false`) so a fresh clone does not start workers without operator intent.

## 2026-08-29 enterprise-hardening pass (baseline `ee66b93`)

**GAP-22 â€” OPEN â†’ CLOSED.** Independent RCA reproduced the local-developer finding from source (route â†’ strict registry contract â†’ guaranteed HTTP 400) and from the API contract (frontend legitimately supplies `tenantId` only). Fixed at the correct abstraction boundary with a shared canonical workspace resolver; `mysqlTenantRegistry` and DB constraints were not weakened; no workspace is invented or arbitrarily selected; tenant/workspace isolation and RBAC remain enforced. Regression evidence: 17 backend HTTP-surface cases + 11 frontend/contract guards, all green; full platform suites green (`test:security`, `test:product`, `test:enterprise`, `test:templates`, `dr:test`, `db:verify`, `certify:firestore-zero`, lint, build). Production was not redeployed from this session â€” deployment handoff required before live proof can be claimed.

**GAP-21 â€” remains OPEN.** The `platformFetch` error-normalization sub-item (precise backend message instead of a bare `HTTP <status>`) is delivered. The personal-workspace dropdown/auto-promotion decision is still a pending design choice (`architecture-flowchart.md` Â§64) and was intentionally not resolved in this pass.

## 2026-08-29 MariaDB performance forensic pass (baseline `f0c8163`)

**GAP-23 — OPEN → CLOSED.** Independent identity verification first: `origin/main`, local `HEAD`, `/api/platform/version` backend SHA and frontend build SHA were all `f0c8163`, `authoritativeDatabase: MARIADB`, `firestoreDataPlane: REMOVED`, `/api/healthz` and `/api/readyz` green with `mysql.latencyMs: 0` and `schema: INITIALIZED`. No deployment was performed before the investigation.

The reported symptom ("MySQL-backed calls became slow") did **not** originate in MariaDB. Ranked evidence:

1. **P0 worker-induced sustained load.** `548d328` simultaneously enabled `NOTIFICATION_OUTBOX_WORKER_ENABLED` (GAP-02) and appended `reconcilePendingIndianGatewayOrders` to that worker's tick (GAP-08). The reconcile loop resolved Paytm/PhonePe credentials *inside* the per-order loop, and each resolution is two uncached `system_settings` reads. With a 25-order batch that is 51 pool round trips every 15 seconds (~3.4 qps, ~290k queries/day) of byte-identical repeats. Because the batch is `ORDER BY created_at ASC LIMIT 25`, it permanently reprocesses the oldest abandoned `PENDING_PAYMENT` rows and never drains, so the load is steady-state rather than transient. Measured after fix: 1 round trip when idle, 3 with both providers configured, constant regardless of backlog depth.
2. **P1 pool queue overflow on the admin directory.** `/api/admin/users` issued `getUser` + `listMemberships` per identity with no concurrency bound. At the documented maximum page size (200) that is 400 simultaneous acquisitions against `connectionLimit` 15: 185 exceed `queueLimit` 200 and mysql2 rejects them with `Queue limit reached.` Verified by reproducing the pool's documented admission rule. Every such page also starved user traffic behind an administrative listing.
3. **P1 N+1 on messaging.** `/api/messages/conversations` issued `1 + 2N` sequential round trips — 201 at the 100-conversation cap — each a separate pool acquisition. The per-conversation queries were already index-optimal (`conversation_participants(user_id)`, `conversation_messages(conversation_id, timestamp)`); only the count was wrong, so it was fixed by batching, not by adding indexes.
4. **P2 external dependency inside the authenticated path (not fixed, deliberately).** `requireAuth` calls `verifyIdToken(token, true)` — revoked-token checking performs an extra identity-provider round trip — and additionally falls back to a `getUser()` lookup whenever the token lacks `email_verified`. This is per-request latency that *presents* as slow database calls. It was left alone: weakening revocation checking or email-verification enforcement to buy latency would trade a security guarantee for speed.
5. **P3 serialization overhead (not fixed, no measured need).** Every repository read passes through `canonicalizeRecord`, a recursive deep clone with a linear `DATE_FIELD_NAMES.includes(field)` scan per key, on top of the repository's own row projection. Cost scales with payload size and is real but unquantified here; it is recorded rather than refactored, since a shared-path refactor without profiling data is exactly the speculative optimization this audit prohibits.

**Deliberate non-actions.** No index was added: the audited hot queries were already served by usable indexes, the brief requires `QUERY → EXPLAIN → JUSTIFICATION` per index, and `EXPLAIN`/`EXPLAIN ANALYZE` cannot be run against production from this environment, so any index here would have been speculative. No new migration was introduced (adding `016` would also require re-coupling `scripts/verify-mariadb-migrations.mjs` and the migration-version assertions). No SQL was rewritten for style, no cache was added to tenant- or credential-bearing reads, no transaction scope was loosened, and `resumes`' unbounded `SELECT *` list read was left as-is because no measured row count justifies changing its contract. The audit environment has no MariaDB binary and no route to the production host, so no wall-clock before/after numbers are asserted anywhere in this pass.
