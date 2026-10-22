# TEST_AND_VERIFICATION_REPORT

**Source tree under test:** the original repository `bhaskarbeyond-creator/ResumePilotAi` at
`main` @ `01d9e5eb321c133d98c72143d016c1ad713f6286`, cloned read-only into an isolated working copy,
plus a **separate detached `git worktree` of that exact SHA** with only the delivered patch applied.

> No result in this report comes from the previously reported Next.js/Drizzle/PostgreSQL
> reconstruction. That reconstruction is not the subject of this work and contributed no evidence here.

## Environment
| Item | Value |
| --- | --- |
| Node.js | v22.23.2 |
| npm | 10.9.8 |
| OS | Linux sandbox, non-root |
| MariaDB/MySQL | **absent** (no `mysqld`/`mariadbd`; `apt-get` denied — dpkg lock, not root) |
| Playwright browsers | **absent** (headless shell executable not installed) |
| External credentials | none (Firebase, Stripe, Paytm, AI providers, Twilio, SMTP) |

## Commands executed and actual results
### A. Baseline (unmodified `01d9e5eb`)
| # | Command | Exit | Result |
| --- | --- | --- | --- |
| A1 | `npm ci` | 0 | 1,300 packages |
| A2 | `npm ci --prefix backend` | 0 | 346 packages |
| A3 | `npm ci --prefix frontend` | 0 | 280 packages; EBADENGINE warnings (`@firebase/*` want Node >=24.12.0) |
| A4 | `npm run build` | 0 | PASS — vite build + `sync-dist` (338 files → `dist/`) |
| A5 | `npm run test:security:static` | 0 | PASS — **71 tests / 71 pass / 0 fail** |
| A6 | `npm run test:product` | 0 | PASS — all chained `node --test` groups |
| A7 | `npm --prefix backend test` | 1 | **1035 tests / 1001 pass / 34 fail / 0 skipped**, 58.2 s |
| A8 | `npm audit --omit=dev` | 0 | 0 vulnerabilities |
| A9 | `npm audit --omit=dev --prefix backend` | 0 | 0 vulnerabilities |
| A10 | `npm audit --omit=dev --prefix frontend` | 1 | **3 moderate** (`sprintf-js` ← `argparse` ← `mammoth`) — ungated at baseline |

### B. After the change set (same working copy)
| # | Command | Exit | Result |
| --- | --- | --- | --- |
| B1 | `npm run build` (`tsc -b && vite build && sync-dist`) | 0 | **PASS** — typecheck clean, 340 files published |
| B2 | `npm --prefix frontend run lint` (oxlint) | 0 | **0 errors**, 308 warnings (pre-existing) |
| B3 | `npm run lint` (ESLint) | 0 | **0 errors**, 207 warnings (pre-existing) |
| B4 | `npm run test:security:static` | 0 | **PASS — 77 tests / 77 pass / 0 fail** (+6 new gates) |
| B5 | `npm run test:product` | 0 | **PASS** — unchanged |
| B6 | `npm --prefix backend test` | 1 | **1044 tests / 1010 pass / 34 fail** (+9 new passes) |
| B7 | failure-set diff A7 vs B6 | — | **IDENTICAL** (byte-for-byte same 34 names) → zero new regressions |
| B8 | `node --test backend/test/revision-contract.test.js` | 0 | 9/9 pass |
| B9 | `node --test tests/frontend-native-dialog-sentinel.test.mjs tests/frontend-revision-contract.test.mjs` | 0 | 6/6 pass |

### C. Against the **patched clean checkout** (disposable worktree at the exact base SHA, patch applied with `git apply`)
| # | Command | Exit | Result |
| --- | --- | --- | --- |
| C1 | `git apply --check <patch>` | 0 | **CLEAN** |
| C2 | `git apply <patch>` | 0 | **APPLIED** — 18 files changed, 867 insertions, 34 deletions |
| C3 | new-file presence check (7 files) | — | all present |
| C4 | `git status --porcelain \| wc -l` | — | **18** — no unrelated file touched |
| C5 | `node --test test/revision-contract.test.js` | 0 | **9/9 pass** |
| C6 | `node --test tests/frontend-*.test.mjs` | 0 | **6/6 pass** |
| C7 | `npm run build` | 0 | **PASS** — vite build + sync-dist (340 files) |

## Attribution of the 34 backend failures (every one inspected)
All 34 are caused by the absent database, not by application logic. Each failure record contains
either `error: 'connect ECONNREFUSED 127.0.0.1:3306'` or an assertion of the form `503 !== 200`
produced by the DB-unavailable code path. Examples:
`Enterprise Role View & Simulation Security Architecture` (ECONNREFUSED at `enterprise-role-view-simulation.test.js:49`),
`RBAC Forensic: Sensitive Credentials Redaction Contract` (`503 !== 200` at `rbac-role-visibility-forensic.test.js:177`),
and the 17 `CERTIFICATION: ... MySQL/MariaDB ...` suites.
The log contains **266** `ECONNREFUSED` occurrences in total.

## Checks that could NOT be executed (honest accounting)
| Check | Reason | Classification |
| --- | --- | --- |
| MariaDB schema/migration execution, `test:db-parity`, `test:db-failover`, `test:live-infrastructure` | No DB server, no root to install | **BLOCKED / NOT VERIFIED** |
| Playwright browser suites (`test:templates:browser`, `test:interview:browser`, `test:portfolio:browser`, `audit:visual`, `test:dir063:probes`) | Chromium headless shell not installed | **BLOCKED / NOT VERIFIED** |
| Live Firebase auth, Stripe/Paytm, AI providers, Twilio, SMTP | No credentials; chargeable/destructive actions prohibited | **BLOCKED / NOT VERIFIED** |
| Runtime HTTP smoke test of core workflows | Backend returns 503 without a DB, so workflows cannot complete | **BLOCKED / NOT VERIFIED** |
| `npm run audit:production` at `--audit-level=high` for frontend | Executed manually as A10/B-series; passes at `high`, the 3 **moderate** advisories remain open | Partially verified |

## Skipped / flaky / disabled tests
`# skipped 0` in both backend runs — no test is skipped or disabled by the suite. No flaky behaviour
observed: the failure set was byte-identical across two independent full runs (A7 and B6/B7).

## Independent QA challenge performed
1. **Was the CAS guard weakened?** Test 5 asserts `isSameRevision(5,4) === false` and `(5,6) === false`, and `(9,'8') === false`. A stale write still conflicts. ✔
2. **Did normalization hide a real conflict by collapsing distinct values?** Only values below the schema floor collapse; all stored revisions ≥ 1 are identity-mapped (test 3). ✔
3. **Collateral damage from the codemod?** Full backend suite re-run; failure set identical (B7). ✔
4. **False positives in the new sentinel?** Three legitimate `void confirm()` local callbacks and one comment line were initially flagged; the gate was corrected to discriminate rather than the code being bent to satisfy a bad gate (CDR-6). ✔
5. **Does the toast work outside React?** Imperative `toast()` bridge with a no-op guard before provider mount. ✔
