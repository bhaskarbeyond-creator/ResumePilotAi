# Developer Review Package — Index & Methodology Note

**Audit target:** `https://github.com/bhaskarbeyond-creator/ResumePilotAi.git`
**Audit mode:** Strictly read-only forensic audit (Senior Architectural Mandate v3)
**This directory is the ONLY location written to during this engagement.**

---

## 0. How this audit was physically performed (full transparency)

**Runtime verification pass (2026-10-28):** A temporary environment was provisioned
(Node 22 + lockfile `npm ci`, Express live, Vite live, Chromium 149 via the repo's own
`@sparticuz/chromium`, MySQL 5.7.29 as a declared *substitute* for MariaDB) and the real
suites were executed: 1,545 Node tests (1,501 pass) and 252 Playwright executions
(197 pass) plus 45 viewport captures. Result: verdict unchanged at
`PARTIAL — BLOCKED`, but five accessibility defects and two test-efficacy defects were
found by execution. See `TEST-EXECUTION-REPORT.md`, `BROWSER-VERIFICATION-REPORT.md`,
`FINAL-ACCEPTANCE-REPORT.md`.

**Partial audit (original):** Executed from a sandboxed Next.js/Drizzle scaffold at the tool root (not a Git repo) via a read-only clone at `/tmp/ResumePilotAi`.

**v3 completion (this update):** Executed directly inside the real repository checkout on branch `arena/7c4b5db0-resumepilotai` at `/home/user/ResumePilotAi`. All writes remain **strictly under `developer-review/`** (verified via `git diff --name-only` outside `developer-review/` = empty). No application source, config, schema, migration, or dependency was modified — read-only boundary preserved (Gate G). See `PROVENANCE.md` §5 and `HANDOVER.md` §12.

This document, and every other file in `/developer-review/`, is the only material created
or modified during this engagement. Nothing in `frontend/`, `backend/`, `reference-code/`,
`scripts/`, `docs/`, or any other path of the audited repository was changed.

## 1. Repository identity

| Field | Value |
|---|---|
| Remote | `https://github.com/bhaskarbeyond-creator/ResumePilotAi.git` |
| Clone depth | `--depth 100` (last 100 commits only — see §4 Scope Limitations) |
| Branch inspected | `main` (`origin/main`, up to date, working tree clean at clone time) |
| HEAD commit | `537e2985cddc6b60666d948f199cf5526ed179ec` (`537e298`) |
| HEAD commit date | 2026-10-28 19:46:23 +0530 |
| HEAD commit subject | `fix(freellmapi): classify HTTP 402 as PAYMENT_REQUIRED with status 402 to resolve code-status contradiction` |
| Initial `git status` | `On branch main / Your branch is up to date with 'origin/main' / nothing to commit, working tree clean` |
| Total commits reachable in the 100-commit window | 100 (full project history is longer; see §4) |
| Repository size on disk | 328M total, 179M `.git` |
| Total tracked files (excluding `node_modules`, `.git`) | 3,570 |

## 1.1 Provenance (v3 completion)

See `PROVENANCE.md` for full remote/branch/SHA verification. `origin/main` and `origin/dev` are at the directive's supplied SHAs (`ff841d5` / `6e4929cf`), neither has advanced, and `537e2985` is verified as the underlying application revision with `ff841d5` as publication wrapper (no app source delta).

## 2. Active vs. reference implementation locations (verified, not assumed)

Per mandate §2, the active/reference split was **verified**, not assumed:

- **`backend/`** — Node/Express API (CommonJS, MariaDB/MySQL via `mysql2`), entry point
  `backend/index.js`. Confirmed active: `package.json` root script
  `"test:backend": "npm --prefix backend test"` and `backend/index.js` is the only
  Express app with live route mounts (20 files in `backend/routes/`).
- **`frontend/`** — Active frontend. Confirmed active via build-chain evidence: root
  `package.json` → `"build": "npm --prefix frontend run build"` → `frontend/package.json`
  → `"build": "tsc -b && vite build && node ../scripts/sync-dist.mjs"`. TypeScript,
  entry `frontend/src/main.tsx`, own `vite.config.ts`, own Playwright test suites.
- **Root `src/` + root `index.html` + root `vite.config.js`** — A **second, parallel**
  JavaScript/JSX frontend tree (entry `/src/main.jsx`) that is **not** referenced by any
  root `package.json` script. See `DISC-001` in `DISCREPANCY-LOG.md`.
- **`reference-code/`** — Explicit legacy/reference baseline directory, containing
  `reference-code/backend/` (older Express/MariaDB backend) and
  `reference-code/public_html/` (a built static bundle, including a committed
  `resumepilot-media-companion.zip`). Used as the parity baseline where comparable.
- **`developer-review/` (inside the audited repo itself)** — Pre-existing prior
  self-audit material produced by earlier engagements (Claude Code / "Antigravity"
  governance process described in `CLAUDE.md`). This pre-existing material was **read
  and cited as corroborating evidence** (see `EXECUTIVE-GAP-SUMMARY.md` §Baseline
  Validity) but was **never modified** — it lives inside the audited repository, which is
  outside this engagement's write boundary.

## 3. Deliverables in this package

## 3.0 Latest audit publication (Mandate 8, 2026-10-29) — **read this first**

**Branch:** `arena/393531fe-resumepilotai` · **Audited revision:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9`
(parent `c292159`; the M7 publication `2def3e5` audited `8a6e03bb`) · **Publication series:** `d849137` (the package) → `8fce715` (records the SHA) → `dec42e3` (key-level counts,
DISC-055) → `416fda3` (runtime artefact, secret-scan log) → `e3e8d6f` (provenance corrections). The series
head is whichever commit last touched this file; recover it with
`git log -1 --format=%H -- developer-review/README.md`, and `Evidence/logs/m8-toolchain.log` §0 lists every
member with what it changed. Nothing in the series was force-pushed, reset or rewritten.

**Verdict:** **`PARTIAL — BLOCKED`** — *not* COMPLETE. Audit work complete; runtime gate blocked on
dependencies this environment cannot supply (MariaDB, a browser, provider credentials); one gate fails on
the **product** (false-success sites), which this mandate is not authorised to fix. Production readiness is
**NOT ESTABLISHED**. Six dimensions stay separate: audit completeness · static coverage · parity · test
execution · runtime · production readiness.

Start here:

| Artifact | What it settles |
|---|---|
| [`M8-INDEPENDENT-ACCEPTANCE-REPORT.md`](M8-INDEPENDENT-ACCEPTANCE-REPORT.md) | gates A–K scored one by one, scope proof, verdict, blockers and next actions |
| [`M8-REGISTRATION-COUNT-RECONCILIATION.md`](M8-REGISTRATION-COUNT-RECONCILIATION.md) | the `397` vs `413` question, closed arithmetically: **413 = 405 + 6 + 2**, **405 = 397 + 8** |
| [`M8-PARITY-REVALIDATION.md`](M8-PARITY-REVALIDATION.md) | all 112 rows re-adjudicated at `a2ecb96`; three classifications moved, prior verdicts retained |
| [`M8-SUBFEATURE-CLOSURE.md`](M8-SUBFEATURE-CLOSURE.md) | the 20 M7 leads closed `preserved` / `replaced` / `missing` with call→route→persistence→authz→test chains |
| [`M8-RUNTIME-VERIFICATION.md`](M8-RUNTIME-VERIFICATION.md) | what was actually executed (backend suite, typecheck, 43 HTTP probes), what is blocked and the exact gate |
| [`M8-VERIFIER-QUALITY-REVIEW.md`](M8-VERIFIER-QUALITY-REVIEW.md) | what each verifier check proves and, more importantly, what it does not |
| [`Evidence/logs/m8-toolchain.log`](Evidence/logs/m8-toolchain.log) | every M8 command, raw exit code, tool versions and the reconciliation result |
| [`DISCREPANCY-LOG.md`](DISCREPANCY-LOG.md) | **DISC-049 … DISC-055** added (53 distinct findings / 55 IDs): DISC-049 corrects an M7 provenance claim, DISC-054 a broken enterprise team chain, DISC-055 duplicated route blocks with divergent guards |

**Current reported M8 results** (all measured at `a2ecb96`, none carried forward): **393** route call sites /
**397** alias registrations / **393** unique `METHOD+path`; independent contract parser **405** after repair;
agreement in scope **0** disagreements; reachability **156 / 10 / 27 / 11 / 2 / 176 / 11** (live **42.2 %**);
parity **13 FULL / 51 PARTIAL / 28 MISSING / 0 STUB / 12 MOCK / 5 REPLACED / 3 UNVERIFIED = 112**;
contract **212 sites → 190 matched / 8 mismatch / 14 no-operation**, **15** gap paths, **12** false-success
sites across **7** paths; backend suite **1,315 / 1,269 pass / 46 fail** (exit 1, all DB-caused);
`tsc -b` exit 0; runtime scenarios **4 PASS / 4 PARTIAL / 2 BLOCKED**. Verifiers: **61/61**, **20/20**, exit 0.

**Three things M7 published that M8 does not repeat:** (1) `a7d08a2` is **not** byte-identical to `8a6e03bb`
(264 files differ; **0** outside `developer-review/`) and `refs/audit-preserved/base-a7d08a2` does not exist
(DISC-049); (2) the **413** was two different counting units plus 2 false positives and 6 duplicate alias
literals, not a backend disagreement; (3) a "70 path-shape collisions" figure in an M8 draft could not be
reproduced and is **withdrawn** — the measured value over the 393 operations is **0**.

## 3.1 Mandate 7 publication pointer (2026-10-29) — superseded by §3.0

**Publication commit:** [`2def3e5`](https://github.com/bhaskarbeyond-creator/ResumePilotAi/commit/2def3e524654e24fc9ebd658f0be78045aeb7ae1) on `arena/393531fe-resumepilotai`.
**Audited source checkpoint:** `8a6e03bbc279cfb7e3a62519659fa3fe770ad1be` (the publication commit's parent).
**Verdict:** `PARTIAL — INCOMPLETE`. The audit package was updated; no application files changed in Mandate 7.

Start with these current Mandate 7 artifacts:

| Artifact | Purpose |
|---|---|
| [`M7-CAPABILITY-CLOSURE.md`](M7-CAPABILITY-CLOSURE.md) | 112 capability rows / 487 subfeature rows, adjudication status, residual leads and confirmed losses |
| [`CLIENT-BACKEND-CONTRACT-REGISTER.md`](CLIENT-BACKEND-CONTRACT-REGISTER.md) | Independent client-to-backend contract trace, 212 call sites, 15 distinct gap paths / 22 sites and false-success analysis |
| [`CAPABILITY-SUBFEATURE-REGISTER.md`](CAPABILITY-SUBFEATURE-REGISTER.md) | Machine-generated subfeature inventory and status |
| [`RUNTIME-TEST-HARNESS-M7.md`](RUNTIME-TEST-HARNESS-M7.md) | R-01…R-10 runtime test specification; specified, **not executed** |
| [`Evidence/logs/m7-toolchain.log`](Evidence/logs/m7-toolchain.log) | Captured M7 tool outputs, verification summaries and provenance/count-reconciliation notes |
| [`Evidence/adjudications-m7.json`](Evidence/adjudications-m7.json) | Machine-readable M7 adjudications |
| [`EVIDENCE-INDEX.md`](EVIDENCE-INDEX.md) | Evidence IDs and artifact map |
| [`METRIC-DEFINITIONS.md`](METRIC-DEFINITIONS.md) | Metric definitions and revised denominators |
| [`REPAIR-ACTION-PLAN.md`](REPAIR-ACTION-PLAN.md) | Prioritized repair phases, including contract retargeting before build-out |
| [`FINAL-AUDIT-HANDOVER.md`](FINAL-AUDIT-HANDOVER.md) | Consolidated handover and remaining acceptance gates |

**M7 results as published (superseded by §3.0; kept for the record):** 397 route registrations → 393 unique `METHOD + path` operations; reachability cross-check 393/393; client contract scan 190 matched, 8 mismatches, 14 with no operation; parity 12 FULL / 49 PARTIAL / 30 MISSING / 12 MOCK / 6 REPLACED / 3 UNVERIFIED. The verifier reports were 61/61 and 16/16 at that revision. These were source/static audit results, not proof of runtime behavior. **M8 re-measured every one of them; the parity mix moved to 13 / 51 / 28 / 0 / 12 / 5 / 3.**

**Toolchain reconciliation caveat:** the captured independent client-contract output reports 413 backend registrations while the canonical reachability report records 397 registrations. The toolchain log preserves both observations and flags the 16-registration difference for source-level reconciliation; do not interpret 393/393 unique-operation agreement as proof that raw registration counts match.

**Runtime remains blocked for this mandate:** no browser tests, MariaDB-backed tests or live-provider calls were executed. Do not promote the verdict or describe a workflow as runtime-verified until the harness has been executed in an environment with the required dependencies and credentials.


> **Added 2026-10-29 (Mandate 7 — V7 capability closure + contract forensics, revision `8a6e03bb`):**
> `M7-CAPABILITY-CLOSURE.md` (all 112 rows: 40 hand-adjudicated, 21 signal-clean, 10 M6 deep reads, 41 with
> leads recorded, 10 rows / 20 items explicitly open; the 15 gap paths / 22 sites; the 12 false-success sites
> traced click → request → response → state → notification; the 46 distinct findings; coverage arithmetic);
> `CLIENT-BACKEND-CONTRACT-REGISTER.md` + `tools/client-contract-audit.cjs` (an **independent** backend parser
> and client scanner — the disagreement between it and the canonical register exposed DISC-041);
> `CAPABILITY-SUBFEATURE-REGISTER.md` + `tools/capability-subfeature-audit.cjs`; `RUNTIME-TEST-HARNESS-M7.md`
> (R-01 … R-10, **specified not executed**); `Evidence/adjudications-m7.json`; findings **DISC-041,
> DISC-043 … DISC-048** with **DISC-025 and DISC-029 revised in place** and DISC-042/046 merged into DISC-030.
> The operation register was re-derived (**397 registrations → 393 unique**, was 499 → 385) and the parity mix
> moved to **12 FULL / 49 PARTIAL / 30 MISSING / 12 MOCK / 6 REPLACED / 3 UNVERIFIED**. Verdict stays
> **`PARTIAL — INCOMPLETE`**; application diff = 0.

> **Added 2026-10-29 (Mandate 6 — V6 feature-depth re-audit, base `a5835ff6`):**
> `FEATURE-DEPTH-EVIDENCE-REGISTER.md` (56 subfeature rows traced legacy → modern UI → backend →
> persistence → test, the eight allegation dispositions, the fixture table, the 19 dead client paths,
> detector false positives and metrics M13–M20); `tools/parity-depth-checks.cjs` (**10** automated checks,
> 4 PASS / 6 LEAD, artifact `Evidence/artifacts/parity-depth-checks.json`); findings **DISC-027 … DISC-040**;
> allegations **RA-36 … RA-48**; parity re-measured at **12 FULL / 47 PARTIAL / 32 MISSING / 12 MOCK /
> 6 REPLACED / 3 UNVERIFIED** of 112. Verdict stays **`PARTIAL — INCOMPLETE`**; application diff = 0.

> **Added 2026-10-29 (V4 coverage reconciliation, revision `0adad00`):** nine reconciliation artifacts —
> `V4-COVERAGE-RECONCILIATION.md` (1,492/1,492 items dispositioned), `V4-FINAL-ACCEPTANCE-REPORT.md`
> (verdict `PARTIAL — INCOMPLETE`), `ALLEGATION-RESOLUTION-REGISTER.md` (35 allegations),
> `OAUTH-PROBE.md` (subfeature decomposition), `BACKEND-OPERATION-REACHABILITY.md` (**385** operations in seven
> classes), `EG-REVALIDATION-REGISTER.md` (EG-007…012 + accessibility re-tested),
> `RUNTIME-VERIFICATION-V4.md` (executed evidence), `AUDIT-CHECK-PROVENANCE.md` (what the 61 checks really
> prove), `METRIC-DEFINITIONS.md` + `AUDIT-CHANGE-HISTORY.md`. The parity register is now **112
> capabilities** with **650/650 legacy and 206/206 modern files attributed** and **385 path anchors
> stat-verified** by `scripts/verify-v4-reconciliation.py` (9 checks, separate from — and stricter than —
> the original 61-check script, which is unchanged).

> **Added 2026-10-29 (Mandate 5 — independent verification of V4, revision `cccd35a5`):**
> `INDEPENDENT-VERIFICATION-REGISTER.md` (20 checks classified by what they prove — 13 PASS, 3
> FAIL-found, 1 blocked, 1 inconclusive), `FINAL-AUDIT-HANDOVER.md` (verdict + ordered next steps),
> `REGRESSION-TEST-SPEC-DISC-020.md` + `specs/disc-020-application-feedback.test.js` (safe, MariaDB-gated,
> outside the runner glob). Three new tools: `tools/reachability-crosscheck.cjs` (385/385 agreement),
> `tools/client-call-existence.cjs` (the missing direction: **23 client paths served by no operation**),
> `tools/parity-endpoint-audit.cjs` (19/19 surviving `FULL PARITY` rows supported, and all 112 rows
> endpoint-resolved). New findings **DISC-024/025/026**. Verifier is now **16 checks**; the original
> 61-check script is still unchanged.

> **Added 2026-10-29 (forensic re-audit of the legacy→modern transition):**
> `LEGACY-MODERN-FEATURE-INVENTORY.md` (domain inventory, 34 allegation adjudications, backend-without-UI
> analysis, verdict) and `FEATURE-PARITY-MATRIX.md` (**109 capability verdicts** with backend
> traceability, machine-checked by `tools/parity-matrix.cjs`). Supporting generators:
> `tools/legacy-modern-inventory.cjs`, `tools/parity-matrix.cjs`, `tools/backend-ui-coverage.cjs`;
> artifacts under `Evidence/artifacts/`. Every prior document now carries a dated amendment section
> rather than edited history — see `DISCREPANCY-LOG.md` DISC-001 (superseded in part) and DISC-013…018.

| File | Purpose |
|---|---|
| `PROVENANCE.md` | **NEW (v3 completion):** Remote/branch/SHA verification, source-of-truth revision, publish proof |
| `REQUIREMENT-REGISTER.md` | **NEW (v3 completion):** 47 requirements with PASS/PARTIAL/BLOCKED, evidence-linked |
| `EVIDENCE-INDEX.md` | **NEW (v3 completion):** Stable E-xxx evidence anchors for every PASS |
| `SECURITY-ASSESSMENT.md` | **NEW (v3 completion):** Expanded security & tenant-isolation, UVS-001 resolved |
| `INTEGRATIONS-INVENTORY.md` | **NEW (v3 completion):** 13 integrations + AI failover resolved (UVS-003) |
| `DATABASE-INVENTORY.md` | **NEW (v3 completion):** 29 migrations, ledger integrity, parity |
| `PARITY-MATRIX-V2.md` | **NEW (v3 completion):** 20/20 presence 100% (was 1/20 5%), 3/20 deep |
| `HANDOVER.md` | **NEW (v3 completion):** Final verdict, gates A-H, blockers & closure |
| `EXECUTIVE-GAP-SUMMARY.md` | Executive summary, scope, readiness verdict, coverage matrix (updated) |
| `DISCREPANCY-LOG.md` | Master, evidence-backed finding log (stable `DISC-xxx` IDs) — re-validated |
| `SWOT-ANALYSIS.md` | Evidence-bound SWOT across Architecture / UI-UX / Security / Scalability |
| `UI-UX-AUDIT.md` | UI/UX audit scoped to what is statically verifiable; viewport/runtime items marked DEFERRED |
| `REPAIR-ACTION-PLAN.md` | Phased, DISC-ID-linked remediation plan for a future implementation developer |
| `appendix/PARITY-MATRIX.md` | Original parity table (preserved) |
| `appendix/REFUTED-CANDIDATES.md` | Candidates investigated and disproved (RC-002 updated High) |
| `appendix/UNVERIFIED-SUSPICIONS.md` | Plausible but unproven candidates (UVS-001,003 resolved, others scaffolded) |
| `appendix/ENVIRONMENT-GAPS.md` | Tooling/environment limitations (alternatives attempted) |
| `appendix/UI-STATE-MATRIX.md` | **NEW (v3 completion):** UI state matrix scaffold 6/34 pages |
| `appendix/INVENTORIES/*.md` | Routes, database, environment, frontend, security, integrations, tests |
| `TEMP-ENVIRONMENT-MANIFEST.md` | **NEW (runtime pass):** exactly what was provisioned, how, what could not be, and how to reproduce |
| `TEST-EXECUTION-REPORT.md` | **NEW (runtime pass):** every test category executed with command, exit code, counts, failure classification |
| `BROWSER-VERIFICATION-REPORT.md` | **NEW (runtime pass):** 5 mandated viewports, screenshots, console/network captures, axe-core findings, untested areas |
| `FINAL-ACCEPTANCE-REPORT.md` | **NEW (runtime pass):** directive §10 delivery report |
| `Evidence/` | **NEW (runtime pass):** 45 screenshots, 25+ logs, `environment.json`, `browser-observations.json`, `axe-violation-details.json`, `migration-fidelity.json` |
| `tools/` | **NEW (runtime pass):** audit-only Playwright configs, viewport spec, migration probe, secret scanner |
| `scripts/verify-audit-package.sh` | **NEW (v3 completion):** Automated package verification (61 checks, passing) |
| `scripts/verify-v4-reconciliation.py` | **NEW (V4):** stricter, separate verifier — stats all 385 register anchors, re-derives class sums, cross-checks documents against their JSON |

## 4. Scope limitations declared up front (see also `appendix/ENVIRONMENT-GAPS.md`)

1. **Shallow clone.** `git clone --depth 100` was used. The repository's full history
   (232+ commits per `git log --oneline | wc -l` after fetch) exceeds the 100-commit
   window in places; some "introduction point" root-causing for older code paths is
   therefore `DEFERRED` rather than fabricated.
2. **No live runtime.** No database, Express server, or Vite dev/preview server was
   started (doing so would require installing dependencies / running migrations, both
   forbidden by the write/state boundary for this read-only audit). All findings are
   `STATICALLY VERIFIED` unless explicitly marked otherwise. No browser, Lighthouse,
   axe-core, or screenshot tooling was executed against a running instance of this
   application; all viewport/accessibility claims in `UI-UX-AUDIT.md` are explicitly
   scoped to source-code inspection and marked `RUNTIME VERIFICATION DEFERRED`.
3. **Time/step-boxed depth.** This is a ~3,570-file, 232-commit, multi-service
   application with an unusually large pre-existing internal audit corpus (R-series
   "rulings", probe transcripts, a 35KB governance document). A full line-by-line
   audit of every route, every migration, every component, and every test, as described
   exhaustively in the mandate, is not achievable inside this engagement's tool-call
   budget. This package is therefore an honest **PARTIAL** audit: deep-verified in the
   areas documented below, explicitly enumerated-but-not-deep-verified elsewhere, and
   transparent about every boundary. See `EXECUTIVE-GAP-SUMMARY.md` §"Audit status."
