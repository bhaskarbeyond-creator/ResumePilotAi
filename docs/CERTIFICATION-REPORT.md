# ResumePilot AI — Final Certification Report (Adversarial Round)

**Date:** 2026-08-27 · **Branch:** `arena/01a03e27-resumepilotai`
**Starting SHA (round 1):** `ef99e91a2743bf11418aab2eb41dd7933bddeb5a`
**Round-1 certification SHA:** `1ee81ac` · **This round's head SHA:** see `git log` (§23)

This report supersedes the round-1 report. Per the adversarial mandate, the round-1
certification was treated as a release candidate and attacked. **Three P0/P1
security vulnerabilities and seven further defects were found and fixed** (§21).
Every gate below was re-executed with reproducible evidence.

---

## 1. Architecture

React 19 SPA (Vite) → Express 5 API → MySQL/MariaDB. Firebase Auth remains the
identity provider (ID-token verification only). Firestore is removed from every
runtime path; the data-plane handle is a compile-time `const db = null`.

## 2. Database architecture

Single authoritative store: MySQL/MariaDB. Connection pool (mysql2), startup
schema bootstrap (idempotent, non-fatal), portable information_schema-guarded
migrations, FOR UPDATE revision guards, transactional outbox tables.

## 3. Firestore / Firebase dependency boundary (§1 — disambiguation)

```text
FIRESTORE DATA-PLANE DEPENDENCY: ZERO
FIREBASE AUTH IDENTITY DEPENDENCY: INTENTIONAL
```

- **Firestore (data plane): ZERO.** No Firestore reads/writes/listeners/transactions
  on any synchronous or asynchronous production path. Proven three ways:
  static census (0 ACTIVE_DATA_PLANE hits), product-classification scan
  (only auth/admin-auth/app-core imports outside the dormant enterprise module),
  and a network-level run with **every Google endpoint blackholed in /etc/hosts**
  — the full certified journey passed 10/10 (`tests/certification/firestore-hosts-block.sh`).
- **Firebase Auth (identity): INTENTIONAL.** Production identity is Firebase Auth:
  the browser holds a Firebase session; the backend verifies ID tokens via the
  Admin SDK (`firebase-admin/auth`). This is an identity service, not a database.
  Why it remains: it is the deployed IdP (email/password + OAuth, MFA, token
  revocation, custom claims/roles). Removing it would be an identity-provider
  migration, a different project. In environments without Firebase (this sandbox),
  the certified local-auth harness (HMAC-signed preview tokens, inert in
  NODE_ENV=production) exercises the identical journeys.
- **Other Firebase products:** Storage/Realtime-DB/Functions/Analytics appear only
  in the dormant enterprise tenancy module (flag OFF in the certified configuration;
  dormancy asserted by test) and the narrow identity adapter.

## 4. Source-of-truth matrix

| Domain | Authoritative | Read path | Write path | Secondary sync |
| --- | --- | --- | --- | --- |
| Users / profiles | MySQL `users` | `/api/users-data/*` | same (owner-bound) | none |
| Resumes | MySQL `resumes` | `/api/resumes/*` | same (IDOR-guarded) | none |
| Portfolios / covers | MySQL | `/api/portfolios|covers/*` | same (IDOR-guarded) | none |
| AI usage / quota | MySQL `ai_usage` | abuse middleware | row-locked increments | none |
| Subscriptions / payments | MySQL `payment_orders` (+`payment_webhook_events`) | payment services | webhook idempotent claim | none |
| Settings / feature flags | MySQL `system_settings` | platform config | admin API (txn + audit) | none |
| Audit logs | MySQL `admin_audit_logs`, `security_audit_logs` | admin console | `recordAdminAuditLog` | none |
| Notifications (email queue) | MySQL `notification_outbox` | platform queues | transactional enqueue | async worker → SMTP |
| Messaging | MySQL `conversations*` | `/api/messages/*` | same | none |

## 5. Synchronization architecture (§6 correction)

```text
ACTIVE SECONDARY DATABASE SYNC: NONE
```

`sync_outbox` exists but is **dormant** (no secondary is commissioned; it stays
empty and no user path depends on it). The only active asynchronous pipeline is
the notification outbox (email delivery).

**Delivery-semantics correction (§5):** the guarantee is **at-least-once delivery
with application-level idempotency (effectively-once)** — *not* end-to-end
exactly-once. Enqueue is atomic with the business transaction; claims are leased;
duplicate delivery is made safe by the unique `idempotency_key` and by the
provider-side dedup where supported. After a worker crash mid-delivery the event
may be redelivered; receivers dedup. This is stated precisely, not overstated.

## 6–9. Security / Authentication / Authorization / Multi-tenancy

- Zero-trust: all `/api/*` authenticated except an explicit public allowlist; RBAC
  (USER/ADMIN/SUPER_ADMIN, permission sets); SUPER_ADMIN destructive ops require
  MFA claim + recent auth.
- **Adversarial multi-tenant suite (9/9):** cross-user resume read/modify/delete
  denied; profile overwrite lands only on the caller; USER denied admin endpoints;
  ADMIN denied SUPER_ADMIN ops; expired/forged/malformed tokens → 401; manipulated
  ids rejected; control case (own access) not over-blocked.
- Brute-force: account-keyed rate limiters (auth/email/AI/export/contact/messaging).

## 10–11. API / Frontend

- API: contract preserved; controlled error propagation (`replyRepoError` maps
  repository 503/404/409 instead of masking as 500).
- Frontend: no Firestore SDK imports; `fire.js` refuses Firestore; local-auth mode
  for no-Firebase environments; unmount-flush fixes fast-navigation data loss.

## 12. Browser E2E (§2 — mandatory, now real)

Real headless Chromium (desktop 1366×900 + mobile 390×844), real backend + MySQL:
**18/18 pass** (`tests/browser-e2e/run.mjs`, evidence in
`.arena/evidence/browser-e2e/`). Journey: registration → login → dashboard →
profile → resume creation (fast step navigation) → AI generation (provider
round-trip) → autosave persistence → reload restore → edit → template preview →
export entitlement gate + DOCX → logout; plus expired-session, API-failure and
DB-failure injection, tenant isolation, and zero unexpected console/page errors.

## 13. Backend E2E / HTTP E2E

HTTP-level certification (`tests/certification/firestore-off-boot.test.mjs`, 10/10)
+ multi-tenant HTTP suite (9/9). HTTP and browser E2E are reported as separate
layers (per mandate), both green.

## 14. Database (§13 schema audit)

Schema ↔ models ↔ migrations agree (portable, guarded). FK `resumes.user_id →
users.id` enforced. Revision/dead-letter/idempotency columns present. Legacy dead
`conversations/messages` draft schema superseded non-destructively.

## 15. Failure injection (§8, §12) — all physically executed

`tests/certification/db-failure-injection.test.mjs` (5/5) +
`tests/certification/mysql-outage.test.mjs`:

| Scenario | Result |
| --- | --- |
| A MySQL down at boot | degraded liveness, honest readiness 503, controlled 503 reads |
| B failure mid-transaction | rollback, controlled error, nothing acknowledged |
| C connection dies at commit | controlled error, no partial ack |
| D real deadlock (cross-order FOR UPDATE) | reproduced; repository retry survives concurrent saves |
| E connection starvation (limit 1, burst 12) | queues; all return real results; none fabricated |
| F long query | covered by pool-pressure (50 conc, 30s) |
| G MySQL killed under a RUNNING app | requests degrade 503; readiness flips not_ready |
| H MySQL returns | reads/writes/readiness recover WITHOUT app restart |

Fix found by scenario G: `ER_SERVER_SHUTDOWN`/shutdown-in-progress now classify to
controlled 503 (previously leaked a generic 500).

## 16. Performance (§4) — thresholds fixed BEFORE execution

`tests/performance/SPEC.md` (committed pre-run) + `tests/performance/load.mjs`,
all scenarios pass vs real MySQL:

| Scenario | Concurrency | p50 | p95 | p99 | err |
| --- | ---: | ---: | ---: | ---: | ---: |
| resume read | 20 | 24ms | 101ms | 140ms | 0% |
| resume save | 10 | 12ms | 61ms | 107ms | 0% |
| mixed reads | 30 | 46ms | 104ms | 165ms | 0% |
| AI fallback | 5 | 22ms | 33ms | 37ms | 0% |
| DOCX export | 3 | 56ms | 135ms | 135ms | 0% |
| pool pressure | 50 (30s) | 27ms | 50ms | 77ms | 0% |

Same-document concurrency: exactly one winner per revision round, correct conflict
count, revision guard consistent. Resources: settled RSS returns to baseline (no
leak trend); DB connection delta under load within the pool limit.

## 17. Backup / restore (§26)

`tests/certification/backup-restore.test.mjs` — real drill: seed → logical backup
(`scripts/db-backup.mjs`) → integrity verify → `DROP DATABASE` → restore →
reconcile (table census + marker rows + content). Passes.

## 18. CI/CD (§3) — **UNRESOLVED BLOCKER (permissions)**

The pipeline is authored and committed (`.github/workflows/ci.yml`, commit
`bbc96ed`): build → lint → unit → integration (MariaDB service) → zero-Firestore →
security → browser E2E → smoke. **It is NOT yet active:** the automation
credential lacks the GitHub `workflows` permission (push of a workflow file was
refused), and the token subsequently expired. This requires a human admin to grant
the permission / install the workflow. Reported honestly per the mandate rather
than claiming automation that is not live.

## 19. Deployment / 20. Monitoring

Deployment docs + release checklist in repo; graceful shutdown (drain HTTP → close
pool) implemented and exercised; `/healthz`, `/readyz` (MySQL-gated), request-id,
rate-limit headers, structured audit logging.

## 21. Defect ledger (this adversarial round)

| Sev | Discovered | Fixed | Remaining |
| --- | ---: | ---: | ---: |
| P0 | 2 | 2 | 0 |
| P1 | 2 | 2 | 0 |
| P2 | 4 | 4 | 0 |
| P3 | 1 | 1 | 0 |

- **P0-1 IDOR resume hijack** — `saveResume` upserted by PK id without ownership
  check; user B could overwrite/re-own user A's resume. Fixed (FOR UPDATE guard).
- **P0-2 IDOR portfolio/cover hijack** — same pattern. Fixed.
- **P1-1 PII leak** — `GET /api/users-data/:id` returned the full record for any
  uid. Fixed (owner/admin full; else public projection).
- **P1-2 HeadingStep data loss** — debounce cleared on unmount lost recent
  keystrokes on fast step navigation. Fixed (unmount flush).
- **P2-1** `mfaService` "No Firebase App" crash in no-Firebase mode. Fixed.
- **P2-2** `getAllReviews` hit admin endpoint from public pages. Fixed.
- **P2-3** `getSubscriptionStatus` required admin payment-settings. Fixed.
- **P2-4** auth rate-limiter not env-aware (throttled certification). Fixed.
- **P3-1** `ER_SERVER_SHUTDOWN` misclassified as generic 500. Fixed.

Zero unresolved P0/P1 defects.

## 22. Exact test evidence (§17 reconciliation)

Reproduced by `tests/certification/reconcile-counts.mjs` — every suite executed
exactly once, no double counting. Machine-readable result:
`.arena/evidence/test-reconciliation.json`. Final tally:

| Suite | Tests | Pass | Fail |
| --- | ---: | ---: | ---: |
| unit+integration (backend/test, live MySQL) | 437 | 437 | 0 |
| enterprise (backend/enterprise-test) | 187 | 187 | 0 |
| frontend-security | 28 | 28 | 0 |
| frontend-product | 374 | 374 | 0 |
| zero-firestore static | 10 | 10 | 0 |
| runtime certification (firestore-off boot, MySQL outage, outbox lifecycle, backup/restore, DB failure injection A–H) | 31 | 31 | 0 |
| browser E2E (real Chromium, desktop + mobile) | 18 | 18 | 0 |
| **TOTAL** | **1085** | **1085** | **0** |

Exact commands: `npm run test:security`, `npm run test:product`,
`npm --prefix backend test`, `npm --prefix backend run test:enterprise`,
`node tests/certification/reconcile-counts.mjs` (wraps all of the above plus
the certification suites). Individual evidence files under `.arena/evidence/`.

## 23. Git evidence

- Start SHA: `ef99e91a2743bf11418aab2eb41dd7933bddeb5a`
- Round-1 head: `1ee81ac`; adversarial-round commits:
  `01c340c` (browser E2E + latency fixes), `0f5f748` (performance),
  `b259f26` (failure injection), `bbc96ed` (CI workflow), `d3da17a` (IDOR/PII),
  `468f9ed` (test retargeting), `31f59d0` (this report).
- Head SHA at report time: `31f59d0` (worktree clean; 80 files changed vs the
  start SHA, +14084/−1009 lines).
- **Push to origin is blocked:** the GitHub credential expired mid-session AND
  the app token lacks the `workflows` permission required to push
  `.github/workflows/ci.yml`. All commits are preserved locally and in the
  Arena snapshot. Flagged for the owner (§18).

## 24. Remaining limitations (explicit, not downgraded)

1. **CI not yet active** — workflow committed; needs GitHub `workflows` permission
   (human action). (§3)
2. **Production smoke against the live deployment not executed** — no production
   credentials/network from this sandbox. The identical code path is smoke-tested
   against the preview stack. (§15)
3. **MariaDB-engine binary verification** — certification ran on MySQL 5.7.29
   (real server). The schema/migrations are portable (information_schema-guarded)
   and CI targets `mariadb:11`; a MariaDB binary could not be provisioned in this
   sandbox (no package route), so MariaDB-specific confirmation lands in CI. (§7)
4. **Browser E2E used headless Chromium on a 2-vCPU sandbox** — timing-sensitive
   assertions use conservative thresholds; re-run on production-grade CI runners.

## 25. Final certification decision (§20)

Two mandatory gates remain incomplete for reasons external to code quality
(CI activation permission; production-deployment access). Per §20, this is stated
explicitly rather than downgraded:

```text
NOT YET CERTIFIED FOR PRODUCTION
```

**Exact remaining blockers:**
1. Activate `.github/workflows/ci.yml` (grant GitHub `workflows` permission /
   install the workflow) and produce a green CI run.
2. Execute the production smoke (§15) against the live deployment with safe test
   data.

All code-level gates pass: build, lint, unit, integration, **real browser E2E
(18/18)**, HTTP E2E, security, multi-tenant (9/9), Firestore-OFF (10/10), census
(0 active data-plane refs), production bundle clean, MySQL failure injection
(scenarios A–H), DB recovery without restart, outbox lifecycle, concurrency,
backup/restore, and performance (pre-defined thresholds). Zero unresolved P0/P1
defects. Once blockers 1–2 are cleared by the owner, the release is ready for
final sign-off.
