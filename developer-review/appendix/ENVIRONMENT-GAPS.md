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

**Required follow-up:** In a separate, explicitly authorized phase with its own isolated
database and environment, run `npm --prefix backend test` (1,356 tests reported passing as
of the audited commit per `HANDOVER-CLOSURE-2026-10-28.md` — this audit did not re-run
them), `npm --prefix frontend run build`, and the Playwright suites
(`frontend/playwright.config.ts`, `frontend/playwright.candidate.config.ts`) to obtain
`RUNTIME VERIFIED` evidence.

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

**Required follow-up:** `git fetch --unshallow` (a read-only, non-destructive operation)
in a follow-up session, then re-run `git log --follow -- <path>` and `git blame` for each
affected file.

---

## EG-004 — No access to the actual deployed Apache/PHP vhost configuration

**Attempted:** Read `.htaccess` (repo root) and `api/index.php` entry point as committed
source; no live or staging Apache configuration was available to confirm `DocumentRoot`
actually points at the repository's `dist/` directory as `scripts/sync-dist.mjs`'s own
comment asserts.

**Impact:** `RC-003` in `appendix/REFUTED-CANDIDATES.md` (root legacy frontend tree is not
what's served in production) carries Medium-High, not High, confidence for exactly this
reason.

**Required follow-up:** Obtain (or have an authorized operator confirm) the production
Apache vhost `DocumentRoot` directive to raise RC-003 to High confidence, or to overturn
it.

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

**Required follow-up:** A dedicated multi-session audit (this engagement's own internal
estimate, by analogy to the scale of its own prior audit corpus under
`developer-review/` and `docs/ai-settings/` inside the audited repo, suggests prior
audits of comparable depth took many dozens of individually-committed, multi-hour
sessions) is required to reach true exhaustive coverage. This package should be treated as
a structured starting point and risk triage, not a substitute for that effort.
