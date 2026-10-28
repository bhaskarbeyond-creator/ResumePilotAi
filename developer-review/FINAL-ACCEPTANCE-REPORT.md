# Final Acceptance Report — Temporary Environment & Runtime Verification

**Directive:** "Temporary Test Environment Provisioning — Enable Real Runtime Verification
and Close Blocked Audit Requirements"
**Executed:** 2026-10-28, 19:29–20:25 UTC
**Verdict:** **PARTIAL — BLOCKED** (unchanged, but the blocked set is now *measured*: it
shrank from "almost everything" to "everything that needs MariaDB, Apache/PHP or live
credentials")
**Final source revision:** `a7d08a2fa67b44aefe4692405b470fa6b174d29f`, branch
`arena/393531fe-resumepilotai`, working tree clean outside `developer-review/`
**Scope integrity:** no application source, test, config, schema, migration or dependency
was modified (§8)

---

## 1. Environment actually provisioned (not planned — provisioned)

| Layer | What ran | Version | Note |
|---|---|---|---|
| OS | Debian 12 (bookworm), 2 vCPU, 3.9 GB | kernel 6.1.158+ | no systemd, no container runtime |
| Node | `node` | **v22.22.3** | repository-compatible |
| npm | `npm` | 10.9.8 | `npm ci` used, lockfiles untouched |
| Backend deps | 346 packages | lockfile-exact | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` |
| Frontend deps | 280 packages | lockfile-exact | same |
| API runtime | `backend/index.js` (Express 5.2.1) | live on `:8080` | run A: in-memory repository; run B: SQL substitute |
| Frontend runtime | `npx vite` | Vite 8.3.4, live on `:4000` (+`:5173`) | `allowedHosts: ['.e2b.app']` already in repo config |
| Browser | Chromium (from the repo's own `@sparticuz/chromium@149.0.0`) | **149.0.7827.0** | Playwright CDN blocked; npm tarball + AL2023 libs worked |
| Playwright | `@playwright/test` | 1.64.1 | specs unmodified |
| axe-core | `@axe-core/playwright` | 4.14.0 | WCAG 2.1 A/AA tags |
| SQL engine | `mysqld` (npm `mysql-server-5.7-lin-x64`) | **5.7.29** | **substitute — not MariaDB evidence**; `libaio.so.1` from PyPI `libaio-bins` |
| Migration probe | 29 migrations attempted | — | 1 applied, 57 tables, stop at `002` |

**Services stopped at the end of the pass:** Vite (:4000, :5173), Express (:8080),
`mysqld` (:3306) — see §7.

## 2. Tools and services successfully started

`mysqld --no-defaults … --port=3306` (disposable datadir under `/tmp/tempenv`) →
`node index.js` (Express, two modes) → `npx vite --host 0.0.0.0 --port 4000` →
Chromium through Playwright. Four services co-resident on 2 vCPU, all loopback/disposable,
none published to a public origin.

## 3. Test categories executed and their results

| Category | Executed | Pass | Fail | Skip | Verdict |
|---|---:|---:|---:|---:|---|
| Backend unit/integration (repo runner) | 1,315 | 1,271 | 14 | 30 | executed; failures are DB-substitution |
| Backend DB-recheck subset | 71 | 57 | 14 | 0 | `SUBSTITUTE-ENGINE`, blocked by schema |
| Enterprise contracts | 187 | 187 | 0 | 0 | pass |
| Payments/webhooks (contract) | 43 | 43 | 0 | 0 | pass |
| Security header & discovery policy | 1 script | ✔ | 0 | 0 | pass (static policy check) |
| Frontend typecheck / build / lint | 3 | 3 | 0 | 0 | pass |
| API runtime probes (auth/RBAC/headers) | 10 | 10 | 0 | 0 | pass |
| Browser matrix (audit spec) | 45 | 45 | 0 | 0 | pass |
| Repo `accessibility.spec.ts` | 59 | 59 | 0 | 0 | pass (see DISC-012 caveat) |
| Repo `engine-integrity.spec.ts` | 53 | 53 | 0 | 0 | pass |
| Repo `engine-security.spec.ts` | 8 | 8 | 0 | 0 | pass |
| Repo `engine-responsive.spec.ts` (real baselines) | 35 | 13 | 22 | 0 | 20 font-attributable + 2 harness artifacts |
| Repo `freellmapi-admin-e2e.spec.ts` | 47 | 15 | 2 | 30 not-run | 2 harness artifacts; DISC-011 |
| Repo `billing-checkout.spec.ts` | 5 | 4 | 1 | 0 | console-error assertion vs blocked fonts |
| Repo `tests/candidate/*` | 3 of 175 (sampled) | 0 | 3 | 172 | **BLOCKED** (needs MariaDB + live AI) |
| MariaDB migration gate | 1 | 0 | 1 | 0 | **correct refusal**: "target engine must be MariaDB" |
| Audit-package verifier (kept separate) | 34 checks | 34 | 0 | 0 | pass |

Aggregate application-test executions: **Node suites 1,545 tests → 1,501 pass / 14 fail**
(plus 30 MariaDB skips); **Playwright 252 executions → 197 pass / 25 fail / 30 not-run**;
**175 candidate tests not executable**.

## 4. Browser and viewport verification results

* **45/45** executions across **375×667, 390×844, 768×1024, 1440×900, 1920×1080** × 9 routes.
* **0 px horizontal overflow** in every capture (measured `scrollWidth - clientWidth`).
* **0 uncaught page errors**; 45 full-page screenshots in `Evidence/screenshots/`.
* Auth guard verified: 5 protected routes → `/login?next=…` at all widths.
* Console/network: only blocked `fonts.googleapis.com` (90×) and a pre-API-start 502 (5×).
* Repository engine matrix additionally exercised at 360/768/1280/1920/**3840**.
* Visual regression: 20/20 comparisons differ by 3–7 % → **not comparable** here (fonts
  blocked), reported as inconclusive, not as a defect and not as a pass.

## 5. Requirements that changed status, with evidence

| Requirement | Before | Now | Evidence |
|---|---|---|---|
| R-034 accessibility/responsiveness/forms | BLOCKED | **PARTIAL** | 45 captures + 5 axe violations (`E-313`, `E-315`) |
| R-035 viewport testing (5 mandated widths) | BLOCKED | **PARTIAL** | 45 executions, 0 overflow (`E-313`) |
| R-081 test execution / 1,356 claim | BLOCKED | **PASS (execution) / claim REFUTED** | `E-301`…`E-305`, DISC-009 |
| R-080 test inventory counts | PASS | PASS, **reconfirmed** 164/25/21 | `E-301` |
| R-043 schema↔query consistency | NOT VERIFIED | **BLOCKED** (demonstrated) | `E-312` |
| R-110…R-115 (new) | — | **PASS** | `E-301`…`E-316` |
| R-116 visual-regression fidelity (new) | — | **PARTIAL** | `E-319` |
| R-117 tenant isolation over HTTP (new) | — | **BLOCKED** | needs migrations 002+ |
| R-118 live integrations (new) | — | **BLOCKED** | no credentials |
| R-119 MariaDB migration/rollback (new) | — | **BLOCKED** | `E-311`, `E-312` |

Register summary recomputed: **38 PASS / 12 PARTIAL / 4 BLOCKED / 1 NOT VERIFIED / 0 FAIL**
out of 55 `R-xxx` requirements (the previously published tally of 47 was itself
inconsistent by 2 — disclosed in `REQUIREMENT-REGISTER.md` §1).

## 6. Failures discovered and their severity

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| **DISC-008 / A11Y-001…005** | 5 WCAG 2.1 AA violations on landing + pricing; **axe-critical** unlabelled billing switch; contrast 2.45:1 and 3.16:1; non-keyboard-scrollable comparison table; `aria-label` on role-less `div`; logo accessible-name mismatch | **P2** | `Evidence/artifacts/axe-violation-details.json` |
| **DISC-011** | `freellmapi-admin-e2e.spec.ts` hardcodes `:5173`, contradicting `playwright.config.ts` (`:4000`) → 47/47 fail by construction | **P2** | two logs (47 fail → 15 pass after adding a `:5173` server) |
| **DISC-012** | `accessibility.spec.ts` "authenticated surface" scans silently cover `/login` because `ime_dev_user` is not an auth credential | **P2** (test efficacy) | `browser-observations.json` finalUrl fields |
| **DISC-009** | Claimed 1,356 tests not reproducible (1,315 discovered / 1,271 pass) | P3 | TAP footer |
| **DISC-010** | "MySQL / MariaDB compatible" claim in `001_baseline.sql` contradicted by MariaDB-only DDL in `002`+ | P3 | `migration-fidelity.json` |

**No application defect was inferred from a failure that had an environmental cause**, and
no failure was suppressed, retried into passing, or excluded from the counts above.

## 7. Remaining blocked or unverified criteria

1. **MariaDB 11.4-dependent everything** — 30 skipped tests, 14 failing tests, migrations
   `002`–`029`, tenant isolation at HTTP level, migration rollback/upgrade, candidate
   dashboard (175 Playwright tests), enterprise consoles.
2. **Apache/PHP served layer** — `.htaccess` routing/headers behaviour and
   `api/index.php` proxy (Express-side headers *were* verified).
3. **Live integrations** — AI providers (streaming, failover, timeout against a real
   provider), payment gateways, S3-compatible storage/upload parsing, Firebase identity,
   SMTP. Mock/contract only.
4. **Visual-regression comparability** — fonts unreachable.
5. **Assistive-technology verification** — axe is a rule engine; no NVDA/JAWS/VoiceOver
   session was possible.

## 8. Scope integrity (verified, not asserted)

```
$ git -C /home/user/ResumePilotAi status --porcelain | grep -v '^.. developer-review/'
(no output)
```

* `package.json`, `package-lock.json` (×3), migrations, routes, components, configs:
  **unmodified** (verified by the empty result above).
* `frontend/dist/` build output is git-ignored (`dist` in `.gitignore`).
* One methodology error was corrected rather than hidden: a first `engine-responsive`
  run wrote 5 new Playwright baselines into
  `frontend/tests/engine-responsive.spec.ts-snapshots/` because the audit project name
  differed; those 5 files were **deleted**, the config was rewritten to reproduce the
  repository's project matrix, and only the corrected run is reported
  (`BROWSER-VERIFICATION-REPORT.md` §5.1).
* `developer-review/tools/node_modules` is an ephemeral symlink to `frontend/node_modules`
  (git-ignored) created so the audit configs can resolve `@playwright/test`; removed at
  cleanup.
* No git history rewrite, no force-push, no production service/DNS/vhost/credential
  touched. No public exposure of any test service was configured.

## 9. Temporary resources cleaned up

| Resource | Action |
|---|---|
| Vite dev server :4000 | stopped |
| Vite dev server :5173 | stopped |
| Express API :8080 | stopped (both modes) |
| `mysqld` :3306 | stopped |
| `airesume_test` database + synthetic rows | dropped with the disposable server's datadir |
| `/tmp/tempenv`, `/tmp/mysql57`, `/tmp/libaio*`, `/tmp/hostdb`, probe databases | deleted |
| `developer-review/tools/node_modules` symlink | removed |
| Playwright `test-results/` inside `frontend/` | not created (output redirected to `developer-review/Evidence`) |
| **Preserved** | all audit evidence: 45 screenshots, 25+ logs, 6 JSON artifacts, 4 new reports, 5 tool scripts |

**Left in place for follow-up:** none outside `developer-review/`. The evidence required to
reproduce the environment is the manifest + the four report files + `Evidence/`.

## 10. How to reproduce

Follow `TEMP-ENVIRONMENT-MANIFEST.md` §8 verbatim (create → start → test → stop/clean).
For the one thing this pass could not do — MariaDB — follow
`REPAIR-ACTION-PLAN.md` P4-6 and `appendix/ENVIRONMENT-GAPS.md` EG-007.

## 11. Final statement

The audit moved from *"no runtime evidence exists"* to *"runtime evidence exists for
everything that does not require MariaDB, Apache/PHP or live third-party credentials"* —
and, importantly, that execution **found real defects** (five accessibility violations,
two broken test-harness assumptions, plus two reporting/documentation inaccuracies) that
thirteen static passes had not found.

It did **not** reach `COMPLETE`, and it does not claim to:
- 30 tests were skipped, 14 failed, 175 were not executable, and 25 browser tests failed
  for documented environmental reasons;
- every mandatory criterion involving a real MariaDB, the served Apache/PHP layer, or a
  live external provider remains **unverified**.

**Verdict retained: `PARTIAL — BLOCKED`.**
