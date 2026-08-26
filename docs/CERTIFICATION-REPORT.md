# ResumePilot AI — Production Certification Report

**Date:** 2026-08-27 · **Branch:** `arena/01a03e27-resumepilotai` · **Starting commit:** `ef99e91a2743bf11418aab2eb41dd7933bddeb5a`

Mission: transform ResumePilot AI into a production-grade SaaS platform with **zero Firestore dependency on all production paths**, **MySQL/MariaDB as the single authoritative database**, resilient asynchronous synchronization, verified backups, and objective evidence.

---

## 1. Executive verdict

```text
FIRESTORE PRODUCTION DEPENDENCY: ZERO
AUTHORITATIVE DATABASE: MYSQL/MARIADB
```

All production data paths (auth state resolution, users, resumes, portfolios, covers, jobs, blog, CMS, notifications, AI usage, payments, settings, audit logs, feature flags, announcements, export tokens, OAuth state) are served exclusively by MySQL/MariaDB. The Firestore data plane has been **removed from the runtime** (the `db` handle is a permanent `null` constant; a static census proves zero active Firestore references; a runtime acceptance suite proves full application function with Firestore absent and unconfigured).

---

## 2. Architecture delivered

```text
Browser (React SPA, Firebase Auth identity only)
   │  Bearer ID token
   ▼
Express API  ──requireAuth──►  Firebase ID-token verification (identity only)
   │
   ▼
ResilientRepository (MySQL-only; no secondary handle exists)
   │
   ▼
MySQLRepository ──transactions──► MySQL / MariaDB   ◄── single source of truth
   │
   ├── sync_outbox (transactional outbox, dormant until a secondary is commissioned)
   └── notification_outbox (durable email queue, lease-based worker, retry/backoff/DLQ)
```

Key structural guarantees introduced/hardened in this engagement:

| Guarantee | Mechanism |
| --- | --- |
| Firestore cannot be enabled at runtime | `const db = null` in `backend/index.js`; credential rotation endpoint can no longer assign a Firestore client; `getActiveEngine()` can only ever return `mysql`; `FIREBASE_DATA_PLANE` env is ignored with a warning |
| No Firestore fallback anywhere | `ResilientRepository` pins `firestoreRepo = null` / `firestoreDb = null`; `repositories/index.js` never returns a Firestore adapter on the application path |
| Admin diagnostics cannot touch Firestore | `testEngineConnectivity('firestore')` reports `removed: true` without creating a client (previously it lazily created a Firestore client and issued a real read) |
| MySQL outage fails safely | Controlled `503 DATABASE_UNAVAILABLE` / `SERVICE_DEGRADED`; no fabricated writes, no silent secondary switch (verified by failure-injection suite) |
| Durable async work | MySQL `notification_outbox` transactional outbox: atomic enqueue inside business transactions, lease claims, exponential backoff + jitter, dead-letter, crash-safe re-claim, idempotent replay |
| Release engineering | Startup schema bootstrap (idempotent, non-fatal), `/readyz` gated on MySQL health, graceful shutdown (drain HTTP → close pool) |

---

## 3. Source-of-truth matrix (§15)

| Domain | Authoritative Source | Read Path | Write Path | Secondary Sync |
| --- | --- | --- | --- | --- |
| Users | MySQL `users` | API `/api/users-data/*` → `MySQLRepository.getUser(s)` | same routes → `saveUser*` (transaction + revision guard) | none (outbox dormant) |
| Resumes | MySQL `resumes` (+ JSON columns) | `/api/resumes/*` → `getResume(s)` | `saveResume` (txn, optimistic revision) | none |
| Profiles | MySQL `users` | `/api/users-data/profile` | `saveUserWithRevisionGuard` (txn, `FOR UPDATE`) | none |
| AI Usage | MySQL `ai_usage` | `security/abuse.js` quota check | row-locked increments in same request txn | none |
| Subscriptions / Payments | MySQL `payment_orders`, `payment_webhook_events` | payment activation service | provider webhooks (idempotent claim) | none |
| Settings | MySQL `system_settings` | `platformConfiguration`, `featureFlagService` | admin routes (transactional) | none |
| Audit Logs | MySQL `admin_audit_logs`, `security_audit_logs` | admin console routes | `recordAdminAuditLog` (MySQL primary) | Firestore standby replica removed from semantics (guarded legacy write is unreachable: `db` is null) |
| Notifications | MySQL `notification_outbox` | platform queues console | transactional enqueue | async worker → SMTP provider |
| Feature Flags | MySQL `system_settings('feature_flags')` | `featureFlagService` | Super Admin API (txn + audit in same txn) | none |
| Announcements | MySQL `platform_announcements` | platform console | Super Admin API (revision-guarded txn) | none |
| OAuth state / export tokens | MySQL `oauth_states`, `oauth_exchange_codes`, `export_render_tokens` | auth/export routes | single-use atomic consume | none |

There is **no domain with ambiguous ownership**. The dormant `sync_outbox` exists solely as the transactional-outbox mechanism for any future asynchronous secondary integration; with no secondary enabled it stays empty and no user path depends on it.

---

## 4. Zero-Firestore certification (§32)

### 4.1 Static proof

- `scripts/firestore-dependency-census.mjs` scans all production source and classifies every Firebase/Firestore reference. Latest run:

```text
ACTIVE_DATA_PLANE hits: 0
CERTIFICATION: ZERO synchronous Firestore data-plane references.
```

- Classification summary (full detail in `docs/firestore-dependency-census.json`): IDENTITY_ONLY (Firebase Auth — the IdP, not a database), COMPAT_ADAPTER (narrow Admin SDK wrapper used for token verification), DORMANT_LEGACY (legacy branches guarded behind the permanently-null `db` handle — proven inert by the runtime suite below), LEGACY_NAMED_API_SHIM (frontend `src/firestore/*` modules that are API-first MySQL clients), MIGRATION_TOOLING / OPERATIONAL_TOOLING (out-of-band scripts, never executed by the server), TEST_INFRASTRUCTURE, UI_LABEL, DOCUMENTATION.
- `tests/certification/firestore-zero-static.test.mjs` (6 tests) asserts: repository factory never hands out a Firestore adapter; resilient repository pins null handles; census = 0 active hits; frontend has no Firestore SDK imports and the compat shim throws on `firestore()`; notification outbox is MySQL-only; the runtime data-plane gate is a permanent `null` that no env can re-enable.

### 4.2 Runtime proof (Firestore OFF acceptance, §3)

`tests/certification/firestore-off-boot.test.mjs` boots the **real production server binary** (`node backend/index.js`) with an environment containing **no Firebase credentials of any kind** and **no Firestore configuration**, then executes the certification chain:

```text
Firestore OFF (no credentials, data plane removed)
        ↓
Application starts                 ✅ /healthz 200, boot log "[Firestore Data Plane] REMOVED"
        ↓
Authentication works               ✅ bearer enforcement; forged token → 401; verified identity → 200
        ↓
Dashboard works                    ✅ profile create/read via MySQL
        ↓
Resume creation works              ✅ POST /api/resumes/:id → row verified directly in MySQL
        ↓
Resume editing works               ✅ revisioned save, reopen, optimistic conflict → 409
        ↓
Persistence works                  ✅ reopen across requests + direct SQL verification
        ↓
AI functionality works             ✅ real provider round-trip through a local OpenAI-compatible gateway
                                     (config → request → parse → response), X-AI-Provider: openai
        ↓
Export works                       ✅ entitlement gate enforced (402 Basic) + DOCX binary generated (PK zip) for paid tier
        ↓
Admin functionality works          ✅ user directory, maintenance toggle, queue telemetry — all MySQL-backed;
                                     USER denied (403), ADMIN denied SUPER_ADMIN writes (403),
                                     SUPER_ADMIN + MFA + recent auth required
```

Multi-tenant zero-trust was exercised in the same boot: user B cannot read/delete user A's resume (404), and user A never appears in user B's listing.

---

## 5. MySQL certification (§33)

A real MySQL 5.7.29 server was provisioned for this certification (see §10 for environment notes). Evidence:

- **Writes / Reads / Transactions** — every certification journey above commits through `MySQLRepository` transactions (`beginTransaction`/`commit`, deadlock retry). Resume and profile saves verified by direct SQL.
- **Constraints** — optimistic revision guards return 409 on stale writes (resume + profile); unique idempotency key on `notification_outbox` prevents duplicate events; single-use export tokens consumed atomically (`SELECT … FOR UPDATE` + delete in one transaction).
- **Persistence** — reopen-after-write asserted across process requests; backup/restore drill (§8) proves durability through total destruction and recovery.
- **Recovery / Concurrency** — 4-worker concurrent claim race on the outbox: exactly one lease winner (tested); deadlock retry loop in repository transactions; schema bootstrap is idempotent and non-fatal on an unreachable database.
- **Migration integrity** — schema bootstrap (`schema.sql` + portable extensions) runs at startup and on demand; extensions are information_schema-guarded so they work on both MySQL and MariaDB (previous MariaDB-only `ADD COLUMN IF NOT EXISTS` syntax silently skipped every extension on plain MySQL — fixed).

---

## 6. MySQL outage behavior (§6) — failure injection evidence

`tests/certification/mysql-outage.test.mjs` boots the real server with MySQL **unreachable** (ECONNREFUSED):

| Check | Expected | Observed |
| --- | --- | --- |
| Process starts | liveness intact | ✅ `/healthz` 200; boot log "starting in degraded mode" |
| Readiness | honest 503 | ✅ `/readyz` 503, `checks.mysql.status = UNAVAILABLE`, `firestoreDataPlane = REMOVED` |
| Reads | controlled error | ✅ 503 `DATABASE_UNAVAILABLE`, `success:false`, no fabricated list |
| Writes | rejected, nothing acknowledged | ✅ 503 `DATABASE_UNAVAILABLE`, `success:false` on resume + profile writes |
| Independent endpoints | still available | ✅ `/api/platform/version` 200 |
| Secondary switch | never attempted | ✅ no failover/fallback markers in logs |

`backend/routes/errorResponder.js` normalizes raw transport codes (ECONNREFUSED/ETIMEDOUT/…) into controlled domain codes so driver internals never leak to clients.

Additional injected scenarios covered by the backend suite (437 tests, all passing against live MySQL): provider failure/AI fallback (`ai-runtime`, `ai-adversarial-and-stress`), payment webhook idempotency (`payments`, `payment-activation`), export token store outage (`export-tokens` — fail closed), SMTP misconfiguration (`email-deliverability-honesty` — three-state semantics), deadlock retry (`resilient-repository`, `resilient-mutations`).

---

## 7. Synchronization certification (§34)

The platform's only durable asynchronous pipeline is the **notification outbox** (email delivery). Its certification (`tests/certification/outbox-lifecycle.test.mjs`, 8 tests):

| Property | Evidence |
| --- | --- |
| Transactional outbox (§8) | Business write + event commit atomically; **rollback discards the event** (asserted) |
| Idempotency (§9) | Triple enqueue of the same event → exactly one row (unique `idempotency_key`, `INSERT IGNORE`) |
| Exactly-once claim | 4 concurrent workers → exactly 1 lease winner (atomic UPDATE claim) |
| Crash safety (§11-D) | Abandoned lease expires → event reclaimed by a healthy worker; nothing lost |
| Retry/backoff (§9) | Failures advance `RETRYING` with exponential delay; accounting verified per attempt |
| Dead-letter (§9) | Max attempts terminalize to `DEAD_LETTER`; DLQ rows are not re-claimed by the due scan |
| Replay (§11-C) | Operator requeue of a dead letter → delivered successfully, `provider_accepted=1` |
| Terminal finality (§11-E) | Delivered events leave the due-query scan and are never redelivered |
| Metadata (§9) | Both `notification_outbox` and `sync_outbox` carry event id, entity id, tenant id, type, version, status, attempts, timestamps, error, idempotency key (schema-asserted) |

The user's HTTP request never waits on delivery: success means the MySQL transaction committed; delivery happens on the worker interval with full retry semantics.

---

## 8. Backup and restore (§26)

Tooling: `scripts/db-backup.mjs` (logical backup: `SHOW CREATE TABLE` + batched INSERTs; `backup` / `restore` / `verify` commands; gzip support).

`tests/certification/backup-restore.test.mjs` performs a **real destruction drill**:

1. Seed marker records (user + resume with known content and revisions)
2. Backup → file (50 tables, all rows)
3. Verify backup integrity (completeness footer + table census)
4. **`DROP DATABASE`** — total data loss; census afterwards = 0 tables
5. Recreate empty database, **restore from backup**
6. Reconciliation: table census identical to pre-destruction; marker rows restored with exact content/revision values; schema health re-verified

Result: **2/2 pass** — restore proven, not assumed.

---

## 9. Defect report (§35)

Defects discovered and fixed in this engagement (in addition to making the pre-existing 64 failing backend tests pass by providing the authoritative database and fixing schema portability):

| ID | Sev | Description | Status |
| --- | --- | --- | --- |
| D-01 | P0 | `/readyz` readiness was gated on the **Firestore** handle — with the Firestore data plane off (the production default) readiness permanently reported 503, failing every deployment health check | **Fixed** — readiness now gates on MySQL health |
| D-02 | P0 | Admin database diagnostics (`testEngineConnectivity('firestore')`) lazily created a live Firestore client and issued a real read — an active Firestore dependency reachable from the admin API | **Fixed** — probe reports `removed` without creating any client |
| D-03 | P0 | Engine manager could still resolve/switch to the Firestore engine from `engine_state.json` or `DB_ENGINE=firestore`, recreating dual-source risk | **Fixed** — `getActiveEngine()` always returns `mysql`; switch to Firestore refused |
| D-04 | P0 | Credential-rotation endpoint reassigned the data-plane handle to a fresh Firestore client | **Fixed** — rotation is identity-only; `db` is a permanent null (lint `no-const-assign` proved the guard) |
| D-05 | P1 | Notification outbox was Firestore-backed — the durable queue required Firestore | **Fixed** — rewritten as a MySQL transactional outbox (leases, backoff+jitter, DLQ, idempotent replay); worker runs with zero Firestore |
| D-06 | P1 | Schema extensions used MariaDB-only `ADD COLUMN IF NOT EXISTS` — silently skipped on plain MySQL, leaving columns missing | **Fixed** — information_schema-guarded portable ALTERs |
| D-07 | P1 | Schema never bootstrapped at startup — a fresh deployment served 500s on every data route until an admin manually hit an init endpoint | **Fixed** — idempotent startup bootstrap, non-fatal when MySQL is down |
| D-08 | P1 | Feature flags and platform announcements were Firestore-only — admin control-plane writes returned 503 with Firestore absent | **Fixed** — both ported to MySQL with transactional audit |
| D-09 | P1 | No graceful shutdown — SIGTERM left pools/sockets open (test processes hung indefinitely) | **Fixed** — workers stopped, HTTP drained, pool closed, clean exit |
| D-10 | P1 | Data-plane outages were masked as opaque 500s on core resume/profile routes | **Fixed** — `errorResponder` propagates controlled 503 domain codes |
| D-11 | P2 | Email resend looked up logs in Firestore; admin audit gates required Firestore presence; email log durability | **Fixed** — MySQL `email_logs` lookup; Firestore gates removed; MySQL logging already primary |
| D-12 | P2 | AI providers hard-bound to public vendor URLs — no self-hosted/private gateway support, AI pipeline untestable end-to-end offline | **Fixed** — per-provider `*_BASE_URL` overrides (env + admin settings), validated |
| D-13 | P2 | Outbox claim logic (during MySQL rewrite) initially omitted the `provider_accepted` exclusion — delivered events could be re-claimed | **Fixed** — claim scan and claim UPDATE both exclude accepted events; terminal state `DELIVERED` leaves the active set |
| D-14 | P3 | Test-token verifier dropped MFA claims; lint errors; unused Firestore probe code paths | **Fixed** |

**Remaining P0/P1 defects: zero.** Dormant legacy code (enterprise tenancy module, guarded legacy branches) is classified in the census and structurally unreachable with the production configuration (`ENTERPRISE_TENANCY_ENABLED=false`, `db = null`).

---

## 10. Test report (§36)

Environment: Node v22.22.3; real MySQL 5.7.29 (provisioned from the npm-published server binary with libaio built from source — the sandbox has no system package manager route to MariaDB); backend `.env` with app credentials. Browser binaries are unavailable in this sandbox (downloads blocked), so browser-level UI E2E runs in CI/production environments; the HTTP-level certification suite exercises the identical journeys through the real server binary.

| Category | Tests | Passed | Failed |
| --- | ---: | ---: | ---: |
| Unit (backend suite: repository, authority, fencing, payments, AI, email, exports, security) | 437 | 437 | 0 |
| Integration (routes/API against live MySQL, included above) | (in 437) | — | 0 |
| E2E — Firestore-OFF boot acceptance (auth, dashboard, resume CRUD, persistence, AI, export, admin, multi-tenant) | 10 | 10 | 0 |
| Security (frontend static security suites) | 28 | 28 | 0 |
| Security (backend auth/RBAC/MFA/recent-auth — inside backend suite) | (in 437) | — | 0 |
| Database (schema, constraints, conflicts — inside backend suite + outbox metadata test) | (in 437+8) | — | 0 |
| Migration (schema bootstrap on fresh DB) | 1 | 1 | 0 |
| Firestore-off | 6 static + 10 runtime | 16 | 0 |
| MySQL failure | 6 | 6 | 0 |
| Synchronization (outbox lifecycle) | 8 | 8 | 0 |
| Performance | — | — | — |
| Regression (frontend product suites) | 374 | 374 | 0 |
| Production smoke (healthz/readyz/version in boot suite) | (in 10) | — | 0 |
| Build + lint | 2 | 2 | 0 |
| **Total** | **871** | **871** | **0** |

Performance note: no formal load test was executed in this sandbox (2 CPU / 3.8 GB RAM, single MySQL instance). Latency-relevant design is in place: pooled connections (`DB_CONNECTION_LIMIT`), indexed outbox scans, single-query reads, JSON column storage avoiding N+1 joins. Recommended pre-launch: k6 load pass on resume CRUD + AI + export at target concurrency.

---

## 11. Git evidence (§31)

- Starting SHA: `ef99e91a2743bf11418aab2eb41dd7933bddeb5a` (branch point of `arena/01a03e27-resumepilotai`)
- Final SHA: see `git log` — commits on `arena/01a03e27-resumepilotai`
- Build: `npm run build` → success (rolldown/vite, 4.5s)
- Lint: `npm run lint` → 0 errors
- Certify entry points: `npm run certify:zero-firestore` (static + runtime certification suites)
- CI/CD: full certification pipeline at `docs/ci-templates/certification-ci.yml` (build/lint/unit → backend integration against a live MariaDB service container → zero-Firestore certification → dependency audit). It lives in `docs/ci-templates/` — the repo's established convention — because the automation credential lacks the GitHub `workflows` permission; copy to `.github/workflows/ci.yml` to activate. Failed critical checks block the pipeline.

---

## 12. Production deployment checklist (§25, §28)

1. Provision managed MySQL/MariaDB; set `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` (`DB_SSL=true` for managed providers).
2. Configure Firebase **identity** credentials (Workload Identity/ADC preferred) — no Firestore enablement required.
3. First boot self-initializes the schema (idempotent). Verify `/readyz` → `ready`, `checks.mysql.status = READY`, `firestoreDataPlane = REMOVED`.
4. Enable workers per instance role: `NOTIFICATION_OUTBOX_WORKER_ENABLED=true` (email delivery), `CMS_SCHEDULER_ENABLED=true` (blog scheduler) — both MySQL-backed.
5. Backups: schedule `node scripts/db-backup.mjs backup --out <retention-dir>/<date>.sql --gzip`; run a restore drill per the certification test on a staging schema.
6. Rollback: redeploy previous build; schema changes are additive and idempotent.
7. Never set `ENTERPRISE_TENANCY_ENABLED=true` in the certified production configuration (dormant module, separate certification track).

---

## 13. Final certification (§37)

```text
CERTIFIED FOR PRODUCTION
```

Basis: zero synchronous Firestore references (static census + structural pins), full application function proven at runtime with Firestore absent and unconfigured, MySQL/MariaDB authoritative for every persistent domain with transaction/constraint/persistence evidence, controlled and tested failure behavior under database outage, durable asynchronous outbox with crash/replay/idempotency evidence, verified backup/restore drill, complete user journeys green, zero unresolved P0/P1 defects.
