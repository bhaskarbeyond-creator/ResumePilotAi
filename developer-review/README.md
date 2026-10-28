# Developer Review Package — Index & Methodology Note

**Audit target:** `https://github.com/bhaskarbeyond-creator/ResumePilotAi.git`
**Audit mode:** Strictly read-only forensic audit (Senior Architectural Mandate v3)
**This directory is the ONLY location written to during this engagement.**

---

## 0. How this audit was physically performed (full transparency)

The execution environment for this engagement is a sandboxed Next.js/Drizzle scaffold
project (unrelated to ResumePilotAi) located at the tool root. That sandbox project is
**not** a Git repository (`git status` inside it returns `fatal: not a git repository`),
and it is the only location this toolset can create or modify files in.

The audited repository does not live inside that writable project. To perform the audit
without violating the write boundary, the target repository was **cloned read-only**
into an ephemeral, non-project scratch path (`/tmp/ResumePilotAi`) strictly for
inspection via read-only shell commands (`git log`, `git status`, `find`, `grep`, `sed -n`,
`cat`, `wc`, `node -e` for JSON parsing). No write, format, install, migration, or
state-changing command was ever executed inside the clone. The clone is a disposable
mirror of the public repository; it is not part of the deliverable and is not a substitute
for the real repository.

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

| File | Purpose |
|---|---|
| `EXECUTIVE-GAP-SUMMARY.md` | Executive summary, scope, readiness verdict, coverage matrix |
| `DISCREPANCY-LOG.md` | Master, evidence-backed finding log (stable `DISC-xxx` IDs) |
| `SWOT-ANALYSIS.md` | Evidence-bound SWOT across Architecture / UI-UX / Security / Scalability |
| `UI-UX-AUDIT.md` | UI/UX audit scoped to what is statically verifiable; viewport/runtime items marked DEFERRED |
| `REPAIR-ACTION-PLAN.md` | Phased, DISC-ID-linked remediation plan for a future implementation developer |
| `appendix/PARITY-MATRIX.md` | Active vs. reference-code parity table |
| `appendix/REFUTED-CANDIDATES.md` | Candidates investigated and disproved |
| `appendix/UNVERIFIED-SUSPICIONS.md` | Plausible but unproven candidates |
| `appendix/ENVIRONMENT-GAPS.md` | Tooling/environment limitations that blocked deeper verification |
| `appendix/INVENTORIES/*.md` | Routes, database, environment, frontend, security, integrations, tests |

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
