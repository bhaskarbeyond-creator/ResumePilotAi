# Runtime Verification — V4

**Revision verified:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62` (`arena/393531fe-resumepilotai`)
**Environment:** Node `v22.22.3`, npm `10.9.8`, Linux x86-64 sandbox. No MariaDB/MySQL server, no
browser binaries, no PHP/Apache, network egress limited to five package/GitHub hosts.
**Logs:** `Evidence/logs/v4/` — `backend-syntax.log`, `frontend-typecheck.log`, `backend-test-probe.log`,
`backend-full-suite.log`, `enterprise-suite.log`.

This report replaces the claim "no runtime evidence exists" for the parts that *can* run here, and it
keeps those results strictly separate from the parts that cannot. Nothing below is inferred from a
harness; every line cites an executed command.

---

## 1. What was executed, and what each run can prove

| # | Command | Result | What it proves | What it does **not** prove |
|---|---|---|---|---|
| 1 | `node --check` over all **364** backend `.js` files | **0 syntax failures** | every backend file parses under the pinned Node version | that any code path executes, that imports resolve, that a route mounts |
| 2 | `npx tsc --noEmit -p tsconfig.app.json` in `frontend/` | **exit 0, 0 errors** | the 206-file modern TypeScript surface type-checks against its own declarations | runtime behaviour, prop correctness, CSS/layout, a11y |
| 3 | `node --test` on 4 sampled backend files | **4/4 files pass** | the runner works and these files tolerate a missing DB | anything about DB-backed assertions — they log `ECONNREFUSED` and the file still exits 0 |
| 4 | Full backend suite (`node --test`, single concurrency) | **1,315 tests — 1,271 pass, 14 fail, 30 skipped**, 69.4 s, exit 1 | the suite's non-DB half genuinely runs and passes at this revision | anything requiring MariaDB (see §3) |
| 5 | Enterprise suite (25 files, `--test-concurrency=1 --test-force-exit`) | **187/187 pass, 0 fail, 0 skip**, exit 0 | the enterprise contract surface passes in isolation | the same surface against a live store |

Commands 4 and 5 are the first full-suite executions this audit has performed. Earlier passes reported
"1,356 tests passing" from a prior handover document without re-running anything; that number is
superseded by the measured **1,315 tests / 1,271 passing** at this revision (DISC-009 already flagged
the claim drift; V4 replaces the figure with an executed measurement).

## 2. Frontend type-check detail

`tsc --noEmit -p tsconfig.app.json` produced an empty log (`frontend-typecheck.log`, 0 bytes) and exit
code 0. This is a genuine zero-error result, not a suppressed run: the same project fails loudly on a
deliberate type error, and `tsconfig.app.json` includes `src/**/*.ts(x)`.

Consequence for the audit: **type-level defects are excluded as a plausible cause** for any of the
functional gaps below. Every gap reported in this package is therefore a design/coverage gap, not a
compile error.

## 3. The 14 backend failures — full triage

All 14 were reproduced in one run; all 14 trace to the absent MariaDB server. This **revises** the
pre-run triage recorded earlier in this session, which counted `Payment Webhooks Replay` as a
"logic-looking" failure. It is not: the handler's own `catch` turns the connection error into a 500.

| # | Test | Assertion | Root cause |
|---:|---|---|---|
| 450 | Enterprise Role View & Simulation Security Architecture | `connect ECONNREFUSED 127.0.0.1:3306` | DB absent |
| 486 | Forensic MariaDB ↔ API Data Lineage Validation Suite | `connect ECONNREFUSED 127.0.0.1:3306` | DB absent |
| 542 | FreeLLMAPI: mounts `/v1/models` + operator-gated `/v1/status` | `503 !== 200` | DB-derived 503 |
| 555 | FreeLLMAPI: `/v1/chat/completions` OpenAI-shaped completion | `503 !== 200` | DB-derived 503 |
| 557 | FreeLLMAPI: `/v1/chat/completions` SSE streaming | `503 !== 200` | DB-derived 503 |
| 558 | FreeLLMAPI: `/v1/messages` Anthropic format + SSE | `503 !== 200` | DB-derived 503 |
| 559 | FreeLLMAPI: `/v1/search` Tavily results | `503 !== 200` | DB-derived 503 |
| 560 | FreeLLMAPI: transparent 429 failover | `503 !== 200` | DB-derived 503 |
| 936 | RBAC Forensic: Super Admin authoritative access | `503 !== 200` | DB-derived 503 |
| 937 | RBAC Forensic: Auditor limited to Audit/Security/Read-only | `503 !== 200` | DB-derived 503 |
| 942 | RBAC Forensic: credential redaction contract | `503 !== 200` | DB-derived 503 |
| 1072 | Authentication, Token Lifecycle & Re-Authentication | `connect ECONNREFUSED 127.0.0.1:3306` | DB absent |
| 1111 | Payment Webhooks Diagnostic: sanitized event stream | `500 !== 200` | `getPool()` query fails → handler `catch` → `PAYMENT_WEBHOOKS_QUERY_FAILED` 500 |
| 1112 | Payment Webhooks Replay: SuperAdmin + event-ID validation | `500 !== 404` | same: `SELECT * FROM payment_webhook_events …` throws before the 404 branch (`backend/routes/platform.js:1986-1991`) |

Evidence for the DB-derived classification of 1111/1112: the handler catches any error and returns 500
(`platform.js:1974-1981`, `:1986+`), and the log records 215 `ECONNREFUSED 127.0.0.1:3306` occurrences
in the run. No failure is attributable to a product logic defect on the available evidence.

**Honest consequence:** this is *not* a clean suite. Fourteen tests cannot execute their assertions here,
so their subject areas — payment webhook diagnostics/replay, RBAC forensics, FreeLLMAPI transport,
session re-auth — remain **UNVERIFIED**, not "passing" and not "failing".

## 4. The 30 skips are the real coverage boundary

All 30 carry an explicit gate string. 29 are MariaDB integration certifications, e.g.:

- `clean MariaDB 11.4 ownership, concurrency, outbox, payment, and deletion integration`
  — `# SKIP set RUN_MARIADB_INTEGRATION=true against a disposable MariaDB 11.4 database`
- `CERTIFICATION: cross-user access is denied (multi-tenant zero-trust)` — same gate
- `CERTIFICATION: resume create → list → load → edit → publish → delete (MySQL persistence)` — same gate

The tests are polite about it: they skip rather than fail. For the audit this matters more than the 14
failures, because these 30 are precisely the tests that would substantiate the claims this package
cannot make — tenant isolation (R-117), persistence round-trips, optimistic-concurrency behaviour under
a real store (including DISC-020), and migration correctness (R-119).

## 5. Blocked: live database

`mariadb`, `mysqld`, `mysql` — all absent from `PATH`. No container runtime. The repo's own gate rejects
the only SQL engine previously obtainable (`target engine must be MariaDB, received 5.7.29`).
Provisioning attempts through `archive.mariadb.org`, GitHub release assets, npm and PyPI are documented
in `appendix/ENVIRONMENT-GAPS.md` EG-007 and were **not retried**, per the standing rule against
re-attempting blocked downloads without new diagnostics. New diagnostic obtained this pass: none of the
five reachable hosts serve a MariaDB server binary (npm registry carries connectors, a WASM embedded
engine with no wire protocol, and an obsolete downloader — re-confirmed from the index listing).

## 6. Blocked: browser / E2E

- `chromium`, `chromium-browser`, `google-chrome` — absent from `PATH`.
- `~/.cache/ms-playwright` — **does not exist** (the directory the runner expects:
  `…/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`).
- The backend suite itself logs the failure 11 times: `browserType.launch: Executable doesn't exist at
  /home/user/.cache/ms-playwright/…` (from the PDF-export path).

The Playwright suites are **enumerable but not executable**:

| Measurement | Value | Source |
|---|---:|---|
| Spec files on disk | **7** (`accessibility`, `billing-checkout`, `engine-authenticated`, `engine-integrity`, `engine-responsive`, `engine-security`, `freellmapi-admin-e2e`) | `frontend/tests/*.spec.ts` |
| Tests reported by `playwright test --list` | **3,675** | 21 files after fixture/project expansion |
| Projects (incl. `[4k]` viewport variants) | **42** | `playwright.config.ts` |

The gap between 7 spec files and 21 "files" is project expansion, and 21 × viewports is what produces
3,675. Reporting "3,675 tests" as coverage would be an artefact of configuration, so this package
reports the 7 spec files and states that **zero** of them executed.

## 7. Blocked: Apache/PHP and live providers

`httpd`, `apache2`, `php` — all absent. `fonts.googleapis.com` returns `000` (connection failure) with a
6-second timeout, which independently confirms EG-009's environment artefact: any visual-regression
baseline captured here differs for reasons unrelated to the product.

No provider credentials exist for Stripe/PayPal/Razorpay/Paytm/PhonePe, AI providers, S3-compatible
storage, Firebase identity or SMTP. None were fabricated. Mock/contract coverage is limited to the
1,271 passing tests, and a passing mock test is evidence only about the mock.

## 8. What this pass therefore claims

| Claim | Status |
|---|---|
| Backend parses; frontend type-checks | **VERIFIED (executed)** |
| 1,271 backend tests pass; 187/187 enterprise tests pass | **VERIFIED (executed)** |
| 14 backend tests fail — cause: no database | **VERIFIED (executed + code-read)** |
| 30 tests skipped — cause: DB gate | **VERIFIED (executed, gate strings captured)** |
| Anything requiring MariaDB | **BLOCKED (EG-007)** |
| Anything requiring a browser | **BLOCKED (EG-011/§6)** |
| Anything requiring a live third-party provider | **BLOCKED (EG-010)** |
| Anything requiring the Apache/PHP layer | **BLOCKED (EG-008)** |

No screenshot, credential, or successful-run claim in this package is fabricated; where an execution did
not happen, the row says so.
