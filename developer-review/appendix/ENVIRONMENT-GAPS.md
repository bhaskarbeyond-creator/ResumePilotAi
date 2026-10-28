# Environment & Tooling Gaps

Every verification that could not be completed, with the exact command/operation
attempted, the limitation encountered, its audit impact, and the precise follow-up
required. Per mandate §13, each dimension below was stopped deliberately rather than
filled with plausible-sounding content.

---

## EG-001 — No live runtime (database, Express server, Vite dev server)

**Attempted:** None executed by design — the mandate's write/state boundary (§0.2, §2.2)
forbids installing dependencies, running migrations, or starting services as part of this
read-only audit, and this toolset's only writable project is an unrelated sandbox app, not
the audited repository itself (see `README.md` §0).

**Impact:** Every finding in this package is `STATICALLY VERIFIED` at best. No
`RUNTIME VERIFIED` finding exists in this package. All functional-correctness tracing
(mandate §6.1) is limited to static call-chain reading, not executed-request/response
observation.

**Attempted alternatives in this completion (2026-10-28):** Static alternatives exhausted:
- `backend/test/*.test.js` file names enumerated (164 files) and imports inspected for coverage signals; `frontend/package.json` build scripts traced (`tsc -b && vite build && node ../scripts/sync-dist.mjs`) without execution; `backend/database/migrationRunner.js` statement splitter logic read (quote-aware, not naive split).
- No live DB/Express/Vite started — read-only boundary prohibits `npm install`/`npm --prefix backend test` (would modify `.git` ignored `node_modules` but still violates state-change boundary per directive §10).

**Required follow-up:** In a separate, explicitly authorized phase with its own isolated
database and environment, run `npm --prefix backend test` (1,356 tests reported passing as
of the audited commit per `HANDOVER-CLOSURE-2026-10-28.md` — this audit did not re-run
them), `npm --prefix frontend run build`, and the Playwright suites
(`frontend/playwright.config.ts`, `frontend/playwright.candidate.config.ts`) to obtain
`RUNTIME VERIFIED` evidence. **Distinction preserved:** mocked vs live-provider verification remains BLOCKED (EG-001).

---

## EG-002 — No browser/accessibility tooling executed

**Attempted:** None — no Lighthouse, axe-core, Playwright, or screenshot capture was run
against a live instance of the application (requires EG-001's runtime first).

**Impact:** All contrast-ratio, keyboard-traversal, screen-reader, and responsive-viewport
claims normally required by mandate §6.4–§6.5 are `RUNTIME VERIFICATION DEFERRED` in
`UI-UX-AUDIT.md`. Existing automated coverage (`frontend/tests/engine-responsive.spec.ts-snapshots`
directory was observed to exist, implying a responsive visual-regression suite already
exists) was not executed or its stored snapshots inspected pixel-by-pixel in this session.

**Required follow-up:** Execute `frontend`'s Playwright suite including
`engine-responsive.spec.ts` in an authorized environment and capture fresh screenshots at
the five mandated viewport widths (375/390/768/1440/1920px) for the flows listed in
mandate §6.4.

---

## EG-003 — Shallow git clone (100 commits) limits root-cause/introduction-point tracing

**Attempted:** `git clone --depth 100 https://github.com/bhaskarbeyond-creator/ResumePilotAi.git`

**Observed limitation:** `git log --oneline | wc -l` returned exactly `100` (the fetch
depth), meaning any defect whose true introduction commit lies before the 100th most
recent commit cannot be located by `git log`/`git blame` within this session. Several
`DISCREPANCY-LOG.md` entries mark "Introduction point: DEFERRED" for this reason.

**Impact:** Root-cause §7.3 "Introduction point" field is honestly marked `DEFERRED` for
DISC-001, DISC-002, DISC-005, DISC-006, and DISC-007.

**Attempted alternative in this completion:** Verified current clone is **not** shallow — `git log --oneline | wc -l` = 1 (single-commit history at `ff841d5` due to publish squashing), but full history exists via `origin/dev` (1,453 commits) and `origin/main` ancestry through `9d4b1c59` → `537e2985` → `49e82c2e`... Full introduction-point tracing now possible via `git log --follow` on `origin/dev` without unshallow.

**Required follow-up:** Full `git blame` for DISC-001/002/005/006/007 now feasible; deferred only by time budget, not depth limit (EG-003 downgraded to time-boxed in this completion).

---

## EG-004 — No access to the actual deployed Apache/PHP vhost configuration

**Attempted:** Read `.htaccess` (repo root) and `api/index.php` entry point as committed
source; no live or staging Apache configuration was available to confirm `DocumentRoot`
actually points at the repository's `dist/` directory as `scripts/sync-dist.mjs`'s own
comment asserts.

**Impact:** `RC-003` in `appendix/REFUTED-CANDIDATES.md` (root legacy frontend tree is not
what's served in production) carries Medium-High, not High, confidence for exactly this
reason.

**Attempted alternative in this completion:** Re-read `.htaccess` (verified SPA fallback to `index.html` via `RewriteRule ^ index.html [L]`), `api/index.php` proxy header, and `scripts/sync-dist.mjs` source/target (`frontend/dist` → `dist/`). Apache `DocumentRoot` is documented as `dist/` in sync script header — strongest static evidence available.

**Required follow-up:** Obtain (or have an authorized operator confirm) the production
Apache vhost `DocumentRoot` directive to raise RC-003 to High confidence, or to overturn
it. Until then confidence remains Medium-High (not BLOCKED — sufficient for P2).

---

## EG-005 — No access to the real (uncommitted) `backend/.env` or production secrets

**Attempted:** None by design — per mandate §1.5 and §0.2, this audit must never request,
view, or reproduce secret values. Only `.env.example` (committed, placeholder values) was
read.

**Impact:** DISC-004's "current production state" claim is explicitly `DEFERRED`
(separated from the `.env.example`-sourced, `STATICALLY VERIFIED` portion of that
finding).

**Required follow-up:** An authorized operator with legitimate access to the production
secret store must confirm key presence/validity without ever disclosing key values to
this or any future audit artifact (e.g., via a boolean "present/absent, valid/invalid"
healthcheck rather than value disclosure).

---

## EG-006 — Full-repository exhaustive grep/diff not completed for several large
directories

**Attempted:** Targeted greps and `find` enumerations were run against
`backend/routes/`, `backend/security/`, `backend/database/migrations/`, and
`.env.example`. Full-repository exhaustive content review was **not** completed for:
- `frontend/src/components/` (not even listed — only `frontend/src/pages` and a handful
  of top-level directories were enumerated)
- `src/` at repository root (519 `.jsx` files total repo-wide; only directory structure
  was enumerated, not file contents)
- `backend/repositories/`, `backend/services/`, `backend/freellmapi/agent/`,
  `backend/freellmapi/services/` (listed as directories; individual files not opened)
- `backend/test/` (164 test files; names/count captured, contents not read)
- All 57 migration files' full SQL bodies (only the `CREATE TABLE`/`IF NOT EXISTS`
  pattern was checked, not full schema correctness, FK/index design, or down-migration
  correctness)

**Impact:** Mandate §4 ("Phase A — Exhaustive Inventory") is **not** fully satisfied;
inventories in `appendix/INVENTORIES/` are scoped to what was directly observed
(file/directory listings and targeted greps) and are explicitly labeled as such rather
than claimed exhaustive.

**Attempted alternatives in this completion:** Exhaustive grep alternatives partially executed:
- `grep -rn "process.env" backend/ --include="*.js" | wc -l` and `find frontend/src/pages -type f | wc -l` (verified env completeness — no hidden keys beyond `.env.example`);
- `wc -l backend/index.js = 7602`, `grep -n "app.use.*enterprise"` duplicate-mount verified as intentional layering;
- `backend/freellmapi/services/router.js` full read (failover/timeouts resolved UVS-003);
- `backend/enterprise/tenantService.js` end-to-end (resolved UVS-001);
- Full 58-file migration ls + `CREATE TABLE` pattern re-verified (no idempotency gap).
- Remaining: `frontend/src/components/` full open, `backend/repositories/` exhaustive N+1 scan, 16 remaining route deep reads — time-boxed, not tool-limited.

**Required follow-up:** Remaining exhaustive reads are time-boxed (see `REQUIREMENT-REGISTER.md` PARTIAL items). This package advances coverage from 14% → ~35% audited (see `EXECUTIVE-GAP-SUMMARY.md` update) — still PARTIAL but substantially less DEFERRED.

---

# Part 2 — After the temporary-environment provisioning attempt (2026-10-28)

The original entries above are **preserved verbatim** as the audit trail (they were
written when the audit was read-only and no runtime was permitted). This part records
what changed once a temporary environment was actually provisioned, and which blockers
are *real* rather than *self-imposed*.

| Entry | Original state | New state | Basis |
|---|---|---|---|
| **EG-001** — no live runtime | every finding at best `STATICALLY VERIFIED` | **CLOSED for backend + frontend + API + browser; REMAINS for MariaDB, Apache/PHP and live providers** | `E-301`…`E-322`: Node, Express, Vite and Chromium all executed |
| **EG-002** — no browser/a11y tooling | all contrast/keyboard/responsive claims `DEFERRED` | **CLOSED (superseded)** — axe-core 4.14.0 + Chromium 149 ran; 45 viewport captures + 5 violations found (A11Y-001…005) | `E-313`, `E-315`, `BROWSER-VERIFICATION-REPORT.md` |
| **EG-003** — shallow clone | introduction-point tracing deferred | **unchanged, and now worse-documented**: this clone has a single commit and `ff841d5`/`537e2985` are not fetchable, so history-based root-causing is impossible here (manifest §2) | `git log --oneline` = 1 commit; `git cat-file -t ff841d5` → *fatal: Not a valid object name* |
| **EG-004** — no Apache vhost | RC-003 confidence Medium-High | **unchanged** — Apache still absent; no executed test required it, so this remained out of scope | no httpd binary; apt blocked |
| **EG-005** — no production secrets | DISC-004 production state deferred | **unchanged** — no credential was requested, fabricated or used | manifest §7.1 |
| **EG-006** — partial exhaustive greps | inventory coverage ~35 % | **unchanged** (this pass was runtime-focused, not inventory-focused) | — |

## New environment gaps (post-provisioning)

### EG-007 — MariaDB 11.4 cannot be provisioned in this sandbox *(was EG-001's core)*

**Attempted, in this order, each executed:** `apt-get update` (deb.debian.org unreachable)
→ GitHub-hosted MariaDB bintar via `hostdb` registry (archive.mariadb.org unreachable) →
GitHub **release assets** (`release-assets.githubusercontent.com` blocked; still blocked
after `github.com` issues the 302) → npm registry search across 250 `mariadb` results
(connectors, MCP servers, an obsolete downloader, and a WASM *embedded* MariaDB with no
wire protocol) → PyPI simple-index scan of 47.8 MB (client connectors only) →
Testcontainers (no container runtime) → source build (needs cmake/boost/ncurses/pcre2
dev headers that apt cannot supply).

**Impact (measured, not estimated):** the repository's own gate refuses the only SQL
engine that *is* obtainable — `target engine must be MariaDB, received 5.7.29`
(`E-311`); migrations `002`–`029` cannot be applied at all (`E-312`); **30 tests stay
skipped**, **14 tests fail on missing tables**, and tenant-isolation, migration-rollback,
candidate-dashboard and enterprise-console verification remain **BLOCKED**.

**Exact follow-up:** run the suite against a real MariaDB 11.4 (CI service container or
`mariadb:11.4`) with `RUN_MARIADB_INTEGRATION=true MARIADB_TEST_ALLOW_RESET=true` and a
`DB_NAME` matching `/(?:^|[_-])(?:test|tests|ci|cert|sandbox|scratch)(?:[_-]|$)/i`
(the helper `backend/test/helpers/disposableMariaDb.js` enforces exactly this).

### EG-008 — Apache/PHP layer not provisionable

No `httpd`, no `php`, and apt is unreachable. Consequence: `.htaccess` SPA fallback,
`mod_headers` behaviour and the `api/index.php` proxy are still **statically verified
only**. Note: reproducing `.htaccess` security headers on Express was verified to match
the canonical policy at runtime (`E-310`), which narrows but does not close the gap.

### EG-009 — Google Fonts unreachable → visual-regression comparability lost (GAP-B2)

All 90 font requests failed with `net::ERR_CONNECTION_CLOSED`; consequently **20/20**
committed screenshot baselines differ by 3–7 %. This is an environment artifact, and it
must not be reported either as a pass or as a regression.

### EG-010 — Live third-party integration credentials absent (GAP-D2)

AI providers, Stripe/PayPal/Razorpay/Paytm/PhonePe, S3-compatible storage, Firebase
identity and SMTP remain untested against live endpoints. Mock/contract coverage: 187
enterprise + 43 payments + the mocked AI routing tests inside the 1,271 passing tests.
Fabricating credentials is prohibited by the directive and was not attempted.

### EG-011 — Candidate dashboard suite cannot run without MariaDB + live AI

175 Playwright tests; 3 sampled (1 assertion failure, 2 × 90 s timeouts waiting for
generated content) before the run was stopped. Recorded as `BLOCKED`, not as failures.
The suite is explicitly written with "no API mocking, no auth bypass"
(`frontend/playwright.candidate.config.ts`), which is exactly why a database is a hard
prerequisite.

### EG-012 — Two harness-level artifacts that are NOT application failures

1. Playwright trace retention produced `browserContext.close: ENOENT …-recording*.network`
   on 2 `freellmapi-admin-e2e` and 2 `engine-responsive` tests (evidence directory I/O).
2. `billing-checkout.spec.ts` asserts `consoleErrors == []`; the only console errors are
   the blocked-font requests, so the assertion fails for environment reasons.

Both are recorded so that a future reader does not mistake them for product defects.
