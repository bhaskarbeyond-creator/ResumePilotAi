# Gap Closure Matrix — Authoritative Register

**Baseline SHA:** `ee66b93f81c00394aac4f03672f0b0911539b974`
**Working branch:** `arena/01a04d8d-resumepilotai`
**Date:** 2026-08-29
**Constraint:** MariaDB-only, zero-Firestore, no authorization weakening, no invented live metrics.

Status vocabulary used below is only 🟢 COMPLETE, 🟡 PARTIAL, 🔴 MISSING, ⚫ EXTERNAL/BLOCKED.
No gap is allowed to sit at "ACCEPTED".

## Matrix

| ID | Pri | Status | Implementation | Evidence |
|---|---|---|---|---|
| GAP-01 | P1 | 🟢 COMPLETE | Method-aware policy; GET least-privilege; L429 mutations gated by `system.config.write` except `/support*` `tickets.manage` | `backend/security/policy.js`, `backend/test/p1-gap-source-contract.test.js`, RBAC tests |
| GAP-02 | P1 | 🟢 COMPLETE | PM2 production env hardcodes outbox worker `true`; CMS/enterprise/GC remain `false` | `ecosystem.config.js` |
| GAP-03 | P2 | 🟢 COMPLETE | `/coverletter`, `/cover-letter` and subroutes wrapped in `RequireAuthenticated` | `src/main.jsx`, `backend/test/p1-gap-source-contract.test.js` |
| GAP-04 | P2 | 🟡 PARTIAL | 5,944-line composition root still concentrates payment/admin handlers; 19 routers already exist. Extraction is planned but intentionally not blind-split because auth/payment regression risk is high | `backend/index.js` line count; `backend/routes/*` |
| GAP-05 | P2 | ⚫ EXTERNAL/BLOCKED | Backend DR toolkit complete (backup, retention, encryption, integrity, restore drill, monitoring). Host-level crontab cannot be installed from this sandbox | `scripts/dr-*`, `ops/dr/install-backup-schedule.sh`, `ops/dr/verify-backup-schedule.sh`, `docs/BACKUP_DR_HOST_CONFIGURATION.md` |
| GAP-06 | P2 | 🟢 COMPLETE | Migration 015 + owner-scoped `/api/support` + admin `/api/admin/support` + Help Desk | `backend/test/support-tickets.test.js`, `backend/test/p1-gap-source-contract.test.js` |
| GAP-07 | P2 | 🟡 PARTIAL | Safe time-bound, scoped, audit-logged support grants exist (`enterprise_support_grants`, `x-support-grant-id`); no session minting. They are enterprise-tenancy-gated and dormant because `ENTERPRISE_TENANCY_ENABLED=false`; production support runs through tickets + `users.read` | `backend/enterprise/supportAccessStore.js`, `mysqlSupportGrantStore.js`, `enterpriseAuth.js`, `backend/test/gap07-support-access-guard.test.js` |
| GAP-08 | P2 | 🟢 COMPLETE | Paytm/PhonePe callbacks + reconcile + claim/activate/release | `backend/test/indian-gateway-activation.test.js` |
| GAP-09 | P2 | 🟢 COMPLETE | Structured JSON request observability with request-id correlation, latency, status, path; no credential/body/query/PII logging. Health probes skipped | `backend/middleware/requestObservability.js`, `backend/test/observability-request-logging.test.js`, `X-Request-Id` middleware |
| GAP-10 | P2 | 🟢 COMPLETE | Consecutive readyz failures enqueue admin alert without awaiting before 503 | `backend/services/readyzAlerts.js`, `backend/test/readyz-alerts.test.js` |
| GAP-11 | P2 | 🟡 PARTIAL | No certified object-storage provider; generated docs are not persisted server-side; avatars/DB assets use MariaDB. Provider would need credentials, signed-upload authorization, malware/retention/tenant isolation evidence | `src/components/admin/settings/StorageSettings.jsx`, `backend/enterprise/tenantStorage.js`, `docs/GAP_11_STORAGE_ARCHITECTURE.md` |
| GAP-12 | P3 | 🟢 COMPLETE | `/front` redirects home | `src/main.jsx`, source contract |
| GAP-13 | P3 | 🟢 COMPLETE | `initailisation/` is **live** (imported by Welcome.jsx and security-tested) and was preserved. No unrelated dead code removed from it | `src/components/welcome/Welcome.jsx`, `tests/security-static.test.mjs` |
| GAP-14 | P3 | 🟢 COMPLETE | Removed genuinely unreferenced `src/components/addAds/` and `src/components/About/` after import scan; live service `addAds` in `api/platform.js` preserved | build + lint + product tests |
| GAP-15 | P3 | 🟢 COMPLETE | Removed uncalled `src/utils/Analytics.jsx`; live `src/components/Analytics.jsx` preserved | build + lint + product tests |
| GAP-16 | P3 | 🟢 COMPLETE | Single PM2 fork is intentional; cluster would duplicate in-memory rate limiters. Scaling path documented with MariaDB-atomic-counter requirement | `ecosystem.config.js`, `docs/GAP_16_PROCESS_MODEL_EVIDENCE.md` |
| GAP-17 | P3 | 🟡 PARTIAL | Skip link, `#main-content`, dialog `role`/`aria-modal`, focus trap + focus restore added to User 360; no formal WCAG 2.1 AA audit claimed | `index.html`, `src/index.css`, `User360Drawer.jsx`, `backend/test/gap17-accessibility-source.test.js` |
| GAP-18 | P3 | 🟢 COMPLETE | Reproducible dependency-free load harness added; no invented capacity numbers; observed-only output | `scripts/load-test.mjs`, `npm run test:load` |
| GAP-19 | P3 | 🟢 COMPLETE | Release identity verified end-to-end (backend/frontend SHA, aligned/verified), health/readyz external, rollback script | `/api/platform/version`, `scripts/verify-production-identity.mjs`, `docs/GAP_19_DEPLOYMENT_EVIDENCE.md` |
| GAP-20 | P3 | 🟡 PARTIAL | Visual regression harness exists (`template-lab/visual-regression.mjs` + `gate.mjs`) but `template-lab/shots/` is empty and the harness has not produced this session's baseline | `template-lab/visual-baseline.json`, `template-lab/visual-regression.mjs` |
| GAP-21 | P2 | 🟢 COMPLETE | Platform tenant API returns `type`; personal sandboxes excluded from assignable orgs; `platformFetch` normalizes string errors; drawer focus/labels intact | `backend/enterprise/platformTenantClassification.js`, `tenantService.js`, `platformApi.js`, `UsersManager.jsx`, `User360Drawer.jsx`, `backend/test/gap21-platform-tenant.test.js` |

## Derived totals

- 🟢 COMPLETE: GAP-01, 02, 03, 06, 08, 09, 10, 12, 13, 14, 15, 16, 18, 19, 21 (15)
- 🟡 PARTIAL: GAP-04, 07, 11, 17, 20 (5)
- 🔴 MISSING: none
- ⚫ EXTERNAL/BLOCKED: GAP-05 (1)

## Intentional worker state (production PM2)

| Flag | Production | Reason |
|---|---|---|
| `NOTIFICATION_OUTBOX_WORKER_ENABLED` | **true** | Drain transactional outbox |
| `CMS_SCHEDULER_ENABLED` | false | Admin `publish-due` remains the explicit publish path |
| `ENTERPRISE_OUTBOX_WORKER_ENABLED` | false | `ENTERPRISE_TENANCY_ENABLED=false` |
| `TENANT_GC_WORKER_ENABLED` | false | Tenancy dark; GC would be idle |

`.env.example` stays fail-closed (`false`) so a fresh clone does not start workers without operator intent.
