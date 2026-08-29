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
| GAP-01 | P1 | **CLOSE** | Policy L53 + index L429 write-gate + Admin.jsx allowlist block AUDITOR/SUPPORT | Method-aware policy; GET mapped to least privilege; mutations still `system.config.write` |
| GAP-02 | P1 | **CLOSE** | PM2 production env hardcodes outbox worker `false` so queued mail never drains | `ecosystem.config.js` `NOTIFICATION_OUTBOX_WORKER_ENABLED='true'`; CMS/enterprise/GC remain `false` |
| GAP-03 | P2 | **CLOSE** | `/coverletter` SPA has no `RequireAuthenticated`; API already auth'd | `src/main.jsx` wraps `/coverletter`, `/coverletter/*`, `/cover-letter`, `/cover-letter/*` in `RequireAuthenticated`. Adversarial QA `requiresAuth: false` is a crawl flag, not a unit constraint. |
| GAP-04 | P2 | **ACCEPT** | 5,872-line `index.js` is functional; blind extract risks auth/payment regressions | Standing instruction: do not blindly refactor; 18 routers already exist |
| GAP-05 | P2 | **ACCEPT** | Backup scripts exist; crontab cannot be installed from this sandbox onto Hostinger | `ops/dr/install-backup-schedule.sh` remains operator-run; no fake cron proof |
| GAP-06 | P2 | **CLOSE** | `tickets.manage` has no table/API/UI | `015_support_tickets.sql` + `/api/support` (owner-scoped) + `/api/admin/support` (`tickets.manage`) + Admin Help Desk. SUPPORT 403 on operational-status. AUDITOR has no `tickets.manage`. |
| GAP-07 | P2 | **ACCEPT** | Impersonation would mint another user's session and weaken tenant isolation | Support uses `users.read` + tickets; no session swap |
| GAP-08 | P2 | **CLOSE** | Paytm/PhonePe advertise `callbackUrl` with no handler; browser poll can miss activation | `POST /api/paytm/callback` HTML 200 always after HMAC status query; `POST /api/phonepe/callback` X-VERIFY then status API; claim/activate/release; outbox reconcile LIMIT 25 |
| GAP-09 | P2 | **ACCEPT** | No Datadog/New Relic vendor or credentials | Healthz/readyz/request IDs remain; do not add unpaid APM |
| GAP-10 | P2 | **CLOSE** | Alert scripts unwired | Consecutive `/readyz` not-ready ≥2 fire-and-forget `queueEmail` `admin_system_alert:readyz:<hourBucket>` to `ADMIN_EMAIL`; never awaited before 503 |
| GAP-11 | P2 | **ACCEPT** | `501 STORAGE_PROVIDER_UNSUPPORTED` is intentional; no S3/Cloudinary adapter | StorageSettings remains informational |
| GAP-12 | P3 | **CLOSE** | `/front` renders `<div>front</div>` | `src/main.jsx` `<Navigate to="/" replace />` |
| GAP-13–15 | P3 | **ACCEPT** | Unused `initailisation/`, `addAds/`, `About/`, `Analytics.jsx` are dead but deletion is not required for production safety | No runtime import; leave tree to avoid test/doc churn |
| GAP-16 | P3 | **ACCEPT** | PM2 cluster would duplicate in-memory rate limiters and workers | Keep `instances: 1, exec_mode: 'fork'` |
| GAP-17 | P3 | **ACCEPT** | Skip-link + `#main-content` landed; no formal WCAG 2.1 AA audit | `index.html` skip-link, `src/index.css`, Admin + AuthenticatedAppShell `#main-content`. No AA claim. |
| GAP-18 | P3 | **ACCEPT** | No k6/Artillery run against live | Do not invent capacity numbers |
| GAP-19 | P3 | **ACCEPT** | No blue-green infra | Single-instance PM2 restart remains the deploy model |
| GAP-20 | P3 | **ACCEPT** | No Percy/Chromatic | Do not invent screenshot proof |

## Intentional worker state (production PM2)

| Flag | Production | Reason |
|---|---|---|
| `NOTIFICATION_OUTBOX_WORKER_ENABLED` | **true** | Drain transactional outbox |
| `CMS_SCHEDULER_ENABLED` | false | Admin `publish-due` remains the explicit publish path |
| `ENTERPRISE_OUTBOX_WORKER_ENABLED` | false | `ENTERPRISE_TENANCY_ENABLED=false` |
| `TENANT_GC_WORKER_ENABLED` | false | Tenancy dark; GC would be idle |

`.env.example` stays fail-closed (`false`) so a fresh clone does not start workers without operator intent.
