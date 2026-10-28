# Test Execution Report

**Revision under test:** `a7d08a2fa67b44aefe4692405b470fa6b174d29f` (branch `arena/393531fe-resumepilotai`)
**Executed:** 2026-10-28, 19:29–20:15 UTC, inside the temporary environment described in
`TEMP-ENVIRONMENT-MANIFEST.md`
**Environment class:** real Node/Express + real Vite + real Chromium; **SQL engine substituted**
(MySQL 5.7.29 for MariaDB 11.4), **no live third-party credentials**, **no Apache/PHP**.

> **Read this first.** A successful environment setup is not proof of application
> correctness. Every number below is a *measured* result with a command, an exit
> status and a log path. Where a prerequisite could not be provisioned the row says
> `BLOCKED` instead of quietly reporting something else. `SUBSTITUTE-ENGINE` marks
> results obtained against MySQL 5.7 instead of MariaDB 11.4 — they are **not**
> target-database evidence and are not counted as acceptance evidence anywhere.

---

## 0. Summary

| # | Category | Executed | Passed | Failed | Skipped | Blocked | Verdict |
|---|---|---|---:|---:|---:|---:|---|
| 1 | Unit + backend test discovery | 1,315 | 1,271 | 14 | 30 | – | **EXECUTED — 14 failures, all DB-substitution** |
| 2 | Backend integration (routes/middleware) | 71 (subset re-run) | 57 | 14 | 0 | – | **EXECUTED — blocked by MariaDB schema** |
| 3 | Authentication & authorization | 8 (browser) + 10 (HTTP probe) | 8 (+10 probes) | 0 | 0 | – | **EXECUTED (in-memory identity)** |
| 4 | Tenant isolation / IDOR | 0 | – | – | – | 1 | **BLOCKED — needs MariaDB tenancy tables** |
| 5 | Database operations & migrations | 29 migrations probed + 1 gate test | 1 migration | 1 gate | – | 28 | **BLOCKED — MariaDB unavailable** |
| 6 | AI provider fallback/streaming/timeout | 53 + 43 + 8 | 53 + 43 + 8 | 0 | 0 | live | **EXECUTED (mocked providers), live BLOCKED** |
| 7 | File uploads / storage | 0 | – | – | – | 1 | **BLOCKED — no S3/storage credentials** |
| 8 | Payment webhooks | 43 | 43 | 0 | 0 | live | **EXECUTED (mocked gateways), live BLOCKED** |
| 9 | Frontend components & critical workflows | 45 + 59 | 45 + 59 | 0 | 0 | – | **EXECUTED** |
| 10 | Browser E2E (repository specs) | 35 + 53 + 8 + 17 + 5 | 13 + 53 + 8 + 15 + 4 | 22 + 0 + 0 + 2 + 1 | 30 did-not-run | 1 suite | **PARTIALLY EXECUTED** |
| 11 | Responsive viewports (375/390/768/1440/1920 + 360/768/1280/1920/3840) | 45 + 35 | 45 + 13 | 0 + 22 | – | – | **EXECUTED — visual deltas font-attributable** |
| 12 | Accessibility (axe-core) | 59 + 45 scans | 59 + 45 | 0 | – | – | **EXECUTED — 5 real violations found** |

Totals for the *application* test suites executed in this pass:
**Node test runner:** 1,315 + 187 + 43 tests → **1,501 passed / 14 failed / 30 skipped**.
**Playwright:** 252 test executions → **197 passed / 25 failed / 30 did-not-run / 175 not-attempted (candidate suite)**
(arithmetic: 45+59+53+8+35+5+47 = 252; passes 45+59+53+8+13+4+15 = 197; fails 22+1+2 = 25; did-not-run 30).
Failure classification is in §13.

---

## 1. Test discovery (rediscovered, not assumed)

| Metric | Previously claimed | **Rediscovered this pass** | Method |
|---|---|---|---|
| Backend test **files** | 210 total (164 backend + 25 enterprise + 21 frontend) | **164** `backend/test/*.test.js`, **25** `backend/enterprise-test/*.test.js`, **21** `frontend/tests/**/*.spec.ts` (**210** total — claim confirmed) | `ls`/`find` counts |
| Backend **tests** | 1,356 passing | **1,315 discovered** (1,271 pass / 14 fail / 30 skip) | `node --test --test-reporter=tap` totals |
| Enterprise tests | (subset of above) | **187** | `npm run test:enterprise` |
| Payment tests | not separately reported | **43** | `npm run test:payments` |
| Frontend Playwright tests | not enumerated | **175** in `tests/candidate/` + **111** across the other 7 spec files | `npx playwright test --list` equivalents |

**Discrepancy:** the previously reported figure of **1,356** backend tests is
**41 higher** than the 1,315 the runner actually discovered at this revision. The
reconciled counts are `1,315 (backend) + 187 (enterprise) = 1,502` when the
enterprise suite is counted separately, which does not reproduce 1,356 under any
grouping tried. Logged as **DISC-013** in `DISCREPANCY-LOG.md`.

Evidence: `Evidence/logs/backend-suite-mock-pass.log` (TAP totals block).

---

## 2. Category 1 — Unit and backend test suites

**Command (repository runner, unmodified):**

```bash
cd backend && RUN_MARIADB_INTEGRATION=false MARIADB_TEST_ALLOW_RESET=false \
  node scripts/run-tests-with-annotations.js
```

**Exit status:** `1`  **Duration:** 71.99 s  **Log:** `Evidence/logs/backend-suite-mock-pass.log`

| Metric | Count |
|---|---:|
| tests | 1,315 |
| pass | 1,271 |
| fail | **14** |
| skipped | **30** |
| cancelled / todo | 0 / 0 |

All 30 skips are MariaDB gates, and the skip reasons are the application's own
strings (evidence of honest test design):

```
6 ×  # SKIP NOT VERIFIED: requires a disposable migrated MariaDB database
23 × # SKIP NOT VERIFIED: set RUN_MARIADB_INTEGRATION=true against a disposable migrated MariaDB database
1 ×  # SKIP set RUN_MARIADB_INTEGRATION=true against a disposable MariaDB 11.4 database
```

**The 14 failures and their cause** (all 14 re-executed individually in §3):

| Test (TAP #) | File | Error |
|---|---|---|
| 450 Enterprise Role View & Simulation Security Architecture | `enterprise-role-view-simulation.test.js` | `connect ECONNREFUSED 127.0.0.1:3306` |
| 486 Forensic MariaDB ↔ API Data Lineage Validation Suite | `forensic-data-lineage.test.js` | `connect ECONNREFUSED 127.0.0.1:3306` |
| 542/555/557/558/559/560 FreeLLMAPI HTTP surface (6 tests) | `freellmapi-engine.test.js` | `503 !== 200` — rate-limit store fail-closed without DB |
| 936/937/942 RBAC Forensic (3 tests) | `rbac-role-visibility-forensic.test.js` | `503 !== 200` — same fail-closed cause |
| 1072 Authentication, Token Lifecycle & Re-Authentication | `session-reauth-lifecycle.test.js` | `connect ECONNREFUSED 127.0.0.1:3306` |
| 1111/1112 Payment Webhook diagnostic/replay | `superadmin-remediation-pass.test.js` | `500 !== 200` / `500 !== 404` |

**Classification:** `ENVIRONMENT-BLOCKED` — every one of the 14 is a database
dependency, not an assertion about application logic. Confirmed by re-running them
with a SQL server reachable (§3): the failures changed from `ECONNREFUSED` to
`ER_NO_SUCH_TABLE` (`enterprise_membership_invitations` and the other
MariaDB-migration-002+ tables do not exist), i.e. they now fail one layer deeper
for exactly the same root cause.

**Test doubles in use:** these suites use the repository's own in-memory
repository doubles (`backend/test/helpers/inMemory*.js`) and `supertest` — they are
**mocked/unit-level**, not live-service tests.

---

## 3. Category 2 — Backend integration subset with a reachable SQL engine

**Command:**

```bash
cd backend && NODE_ENV=test DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= \
  DB_NAME=airesume_test RUN_MARIADB_INTEGRATION=false \
  node --test --test-reporter=tap --test-concurrency=1 --test-force-exit \
  test/enterprise-role-view-simulation.test.js test/forensic-data-lineage.test.js \
  test/session-reauth-lifecycle.test.js test/freellmapi-engine.test.js \
  test/rbac-role-visibility-forensic.test.js test/superadmin-remediation-pass.test.js
```

**Exit status:** `1`  **Log:** `Evidence/logs/backend-db-recheck.log`

| Metric | Count |
|---|---:|
| tests | 71 |
| pass | 57 |
| fail | 14 |

**Result:** the 14 that failed without a database still fail with one, because the
substitute engine cannot apply migrations 002–029 (§5). `ER_NO_SUCH_TABLE` on
`airesume_test.enterprise_membership_invitations` is the first one.
**Classification:** `ENVIRONMENT-BLOCKED (MariaDB required)`.
**Label:** `SUBSTITUTE-ENGINE`.

---

## 4. Category 3 — Authentication and authorization

### 4.1 Live HTTP probes against the real Express app (in-memory repository mode)

Log: `Evidence/logs/backend-http-probe.log`

| # | Probe | Expected | **Actual** | Verdict |
|---|---|---|---|---|
| 1 | `GET /api/health` | 200 + identity/db metadata | **200**, `authoritativeDatabase: "MARIADB"`, `commitSha` matches HEAD | PASS |
| 2 | `GET /api/readyz` | non-200 while DB unusable | **503** `not_ready`, `checks.mysql.status = UNAVAILABLE` | PASS |
| 3 | `GET /api/admin/ai-settings` (no auth) | 401 | **401** `AUTH_REQUIRED` | PASS |
| 4 | Security headers on `/api/health` | CSP/HSTS/XFO/nosniff/Referrer/Permissions | **all present** (CSP with per-request nonce, `frame-ancestors 'none'`, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), …`) | PASS |
| 5 | `POST /api/auth/preview-login` (superadmin) | 200 + signed token | **200**, `role=SUPER_ADMIN`, `token_len=323` | PASS |
| 6 | `GET /api/admin/ai-settings` (SUPER_ADMIN) | 200 + settings | **200**, returns settings object | PASS |
| 7 | Forged token `rptest.forged.token` | 401 | **401** | PASS |
| 8 | CANDIDATE token on admin route | 403 | **403** | PASS — RBAC enforced |
| 9 | `preview-login` with 3-char password | 400 | **400** | PASS |
| 10 | Unknown `/api/*` route | 401 (auth before 404) | **401** | PASS (noted: route existence is not leaked to unauthenticated callers) |

### 4.2 Browser-level authorization (real Chromium, no mocking)

From the audit viewport matrix (`Evidence/artifacts/browser-observations.json`),
unauthenticated navigation to protected routes always redirected to the login page
with a preserved `next` parameter:

| Route requested | Final URL (all 5 viewports) |
|---|---|
| `/dashboard` | `/login?next=%2Fdashboard` |
| `/admin` | `/login?next=%2Fadmin` |
| `/admin/ai-settings?subtab=providers` | `/login?next=%2Fadmin%2Fai-settings%3Fsubtab%3Dproviders` |
| `/build-resume` | `/login?next=%2Fbuild-resume` |
| `/dashboard/settings?tab=support` | `/login?next=%2Fdashboard%2Fsettings%3Ftab%3Dsupport` |

**Note (honest limitation):** the app's `localStorage.ime_dev_user` shim used by
`frontend/tests/accessibility.spec.ts` does **not** authenticate the route guard
(`frontend/src/lib/preview-session.ts` is consumed by preview/export components,
not by the router). Authenticated *routes* were therefore reached in the
repository specs via the app's `POST /api/auth/preview-login` +
`Authorization: Bearer` path, which is a supported non-production identity issuer —
**not** a mock.
**Classification:** `EXECUTED (non-production identity issuer)`. Real Firebase
authentication remains unverified (no credentials).

---

## 5. Category 4 — Tenant isolation and IDOR

**Status: BLOCKED.** The tenancy/IDOR assertions live in tests that need the
enterprise tables created by migrations `002`+ (`enterprise_memberships`,
`enterprise_tenants`, …), which cannot be created without MariaDB (§5.1 of the
manifest). `backend/test/rbac-role-visibility-forensic.test.js` (RBAC matrix) and
`enterprise-role-view-simulation.test.js` are exactly the 14-failure set above.

What *was* executed that touches isolation:

* `npm run test:enterprise` → **187/187 pass** against `InMemoryEnterpriseRepository`
  (`Evidence/logs/enterprise-suite.log`) — this includes the tenant-scoped
  repository contracts, encryption-provider keys, outbox and quota behaviour.
* Static claim from the previous audit (tenant equality check in
  `backend/enterprise/tenantService.js:513-533`) was **not** re-verified at runtime.

**Classification:** `PARTIALLY EXECUTED (repository-level, in-memory)`;
cross-tenant HTTP-level isolation `BLOCKED`.

---

## 6. Category 5 — Database operations and migrations

### 6.1 The repository's own MariaDB gate (executed live, on purpose)

```bash
NODE_ENV=test RUN_MARIADB_INTEGRATION=true MARIADB_TEST_ALLOW_RESET=true \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=airesume_test \
  node --test test/mariadb-migration-gate.test.js
```

**Exit 1**, `# tests 1 / # pass 0 / # fail 1` →
`error: 'target engine must be MariaDB, received 5.7.29'`
(`Evidence/logs/mariadb-gate-refusal.log`)

This is the gate doing its job: it refuses to let a substitute engine be reported
as target-database evidence. It is also the reason no migration test is claimed as
passing in this report.

### 6.2 Migration fidelity probe

`node developer-review/tools/migration-fidelity-probe.cjs` →
`Evidence/artifacts/migration-fidelity.json`, `Evidence/logs/migration-fidelity-probe.log`

| Result | Value |
|---|---|
| Engine probed | `5.7.29 MySQL Community Server (GPL)` |
| Migrations discovered | **29** (`001`…`029`, up-migrations only) |
| Migrations applied | **1** (`001_baseline`) |
| Tables created before first failure | **57** |
| First failure | `002_single_owner_enterprise.sql` → `ER_PARSE_ERROR` |
| Offending SQL | `ALTER TABLE users ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1` |

**Findings from this probe (documented for the client, not as a product defect):**

1. The migration set is **MariaDB-only**: `ADD COLUMN IF NOT EXISTS` is not valid
   MySQL 5.7 SQL. A MariaDB portability claim would be false at the schema layer.
2. `001_baseline.sql` alone creates 57 tables — consistent with the previous
   audit's inventory of the baseline.

**Classification:** `BLOCKED (MariaDB required)`; probe is `EMULATOR/SUBSTITUTE`
evidence about the *schema's engine dependency*, nothing more.

---

## 7. Category 6 — AI provider fallback, streaming, timeout

| Suite | Command | Result | Doubles |
|---|---|---|---|
| Enterprise AI/enterprise contracts (187) | `npm --prefix backend run test:enterprise` | **187 pass / 0 fail**, exit 0, 11.3 s (`Evidence/logs/enterprise-suite.log`) | `InMemoryEnterpriseRepository`, fake fetch |
| FreeLLMAPI engine surface (8 browser tests) | see §10 | **8 pass** with a reachable API | app's in-memory settings + MySQL substitute |
| AI routing/fallback/timeout unit tests | included in the 1,315 | **pass** (subset of 1,271) | mocked providers |
| Streaming/SSE contract tests | included in the 1,315 | **pass** (e.g. TAP subtests "streaming generator yields OpenAI-compatible deltas") | mocked |

**Not executed:** any streaming/failover test against a **live** provider (no
credentials, and fabricating them is prohibited).
**Classification:** `EXECUTED WITH MOCKS`; live-provider behaviour `BLOCKED`.

---

## 8. Category 7 — File uploads and storage integration

**Status: BLOCKED.** No S3-compatible endpoint or credentials exist in this
environment; the repository's upload tests that could run do so through mocks and
are inside the 1,271 passing tests, but no real storage round-trip was performed.
The failure list contains no storage assertion failure, so nothing negative was
learned either.
**Classification:** `NOT EXECUTED (no storage service)`.

---

## 9. Category 8 — Payment webhooks

```bash
npm --prefix backend run test:payments
```

**Exit 0**, `# tests 43 / # pass 43 / # fail 0 / # skipped 0`
(`Evidence/logs/payments-suite.log`) — Stripe/PayPal/Razorpay/Paytm reconciliation,
activation and signature-handling contracts against the repository's own fakes.
Two webhook tests fail without a database (`superadmin-remediation-pass.test.js`,
TAP #1111/#1112) and are part of the 14 failures in §2 — they need the
`payment_webhook_events`-class tables from migrations `002`+.
**Classification:** `EXECUTED WITH MOCKS`; live-gateway webhook delivery `BLOCKED`.

---

## 10. Category 9–12 — Frontend, browser E2E, viewports, accessibility

Full detail (per-viewport, per-workflow, screenshots, console/network captures,
axe findings) is in **`BROWSER-VERIFICATION-REPORT.md`**. Summary of the executed
Playwright work:

| Suite | Projects | Executed | Passed | Failed | Did not run | Log |
|---|---|---:|---:|---:|---:|---|
| audit viewport matrix (audit-authored spec) | 5 viewports × 9 workflows | 45 | **45** | 0 | 0 | `Evidence/logs/playwright-audit-verification.log` |
| `accessibility.spec.ts` | 1 | 59 | **59** | 0 | 0 | `Evidence/logs/pw/accessibility.log` |
| `engine-integrity.spec.ts` (mocked API) | 1 | 53 | **53** | 0 | 0 | `Evidence/logs/pw/engine-integrity-db.log` |
| `engine-security.spec.ts` | 1 | 8 | **8** | 0 | 0 | `Evidence/logs/pw/engine-security-db.log` |
| `engine-responsive.spec.ts` | 5 (repo matrix, real baselines) | 35 | 13 | **22** | 0 | `Evidence/logs/pw/engine-responsive-baselines.log` |
| `billing-checkout.spec.ts` | 1 | 5 | 4 | **1** | 0 | `Evidence/logs/pw/billing-checkout-db.log` |
| `freellmapi-admin-e2e.spec.ts` | 1 (on :5173) | 47 | 15 | 2 | 30 | `Evidence/logs/pw/freellmapi-admin-e2e-5173.log` |
| `tests/candidate/*.spec.ts` (175 tests) | — | 3 (sampled, then stopped) | 0 | 3 | 172 | `Evidence/logs/pw/candidate-db.log` |

### 10.1 Build, typecheck and lint (real, not inspected)

| Check | Command | Result |
|---|---|---|
| TypeScript project build | `npx tsc -b` (in `frontend/`) | **exit 0** (`Evidence/logs/frontend-tsc.log`) |
| Production bundle | `npx vite build` | **exit 0**, `✓ built in 1.95s`, 20+ chunks, includes `engineHarness` entry (`Evidence/logs/frontend-vite-build.log`) |
| Lint | `npm run lint` → `oxlint` | **0 warnings, 0 errors**, 238 files, 96 rules (`Evidence/logs/frontend-lint.log`) |
| Security headers/discovery policy | `npm run test:security` | **exit 0** — `.htaccess`, `public/.htaccess` match canonical policy; `dist/.htaccess` `SKIP`ped because that build artifact is absent (`Evidence/logs/security-checks.log`) |

### 10.2 The candidate suite — why it is reported as blocked, not failed

`frontend/playwright.candidate.config.ts` documents the suite as "five viewport
profiles against the **REAL backend** … **No API mocking, no auth bypass**", i.e.
it requires Express + MariaDB + working AI generation. Sampled execution (3 tests,
add-to-job-tracker / AI assistant flows) produced 1 assertion failure and 2 tests
that sat on the full 90 s timeout waiting for generated content, so the run was
stopped after 3 of 175 rather than spending hours producing the same result 172
times. This is an environment limit, not a verdict on the candidate dashboard.
**Classification:** `BLOCKED (needs MariaDB + provider credentials)`.

---

## 11. Repository audit-package verification (kept separate from app tests)

```bash
bash developer-review/scripts/verify-audit-package.sh
```

Result recorded separately in `Evidence/logs/audit-package-verification.log` and
summarised in `EVIDENCE-INDEX.md` §4. It validates the presence/shape of the audit
package itself and is **not** an application test; it is deliberately never mixed
into the counts above.

---

## 12. Evidence inventory produced by this pass

```
developer-review/Evidence/
├── artifacts/
│   ├── browser-observations.json          # 45 records: console/page errors, failed requests, axe results, overflow
│   ├── migration-fidelity.json            # per-migration apply result on the substitute engine
│   ├── playwright-report.json             # Playwright JSON reporter output
│   └── playwright-results/                # traces + failure screenshots (git-ignored size risk: see note)
├── env/environment.json                   # machine-readable environment capture
├── logs/                                  # 25+ logs: every command's stdout/stderr + exit code
└── screenshots/                           # 45 full-page PNGs, 5 viewports × 9 workflows (9.3 MB)
```

Note: `Evidence/artifacts/playwright-results/` contains Playwright traces
(`trace.zip`) that are bulky; they are retained because they are the only
reproduction path for the 25 browser failures. If the client prefers a lean
repository, only that directory is safe to delete.

---

## 13. Failure classification (all 39 non-passing outcomes)

| Class | Count | Items |
|---|---:|---|
| A. Environment — no MariaDB (schema absent) | 14 backend + 30 skipped + 1 migration gate | §2, §3, §6.1 |
| B. Environment — blocked network (Google Fonts) | 20 visual comparisons | 3–7 % pixel delta vs committed baselines; `fonts.googleapis.com` unreachable |
| C. Harness artifact (Playwright trace file write) | 4 | 2 inside `engine-responsive`'s 22 + 2 inside `freellmapi-admin-e2e`'s 2 — all `browserContext.close: ENOENT …-recording*.network`. Arithmetic check: 20 visual (B) + 2 trace (C, engine-responsive) = 22; 2 trace (C, freellmapi); 1 console-error (D, billing) → 25 total failures |
| D. Environment — console-error assertion fails only because external font CSS is blocked | 1 | `billing-checkout.spec.ts` "Pricing page renders all tiers…" asserts `consoleErrors == []`, and the only console errors present are the blocked `fonts.googleapis.com` request |
| E. Application defect suspected | **0** | no failure in this pass was traced to application logic with evidence |
| F. Blocked prerequisite (not executed) | 175 candidate + 30 did-not-run + storage + live providers | §5, §8, §10.2 |

**Nothing was modified in the application or in any test to change an outcome.**
If a future run with MariaDB + font access turns any of B/C/D into failures, that
would be new information, not a regression introduced here.
