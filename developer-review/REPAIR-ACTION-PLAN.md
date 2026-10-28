# Repair Action Plan

For a future implementation developer. These are **instructions for later execution**,
not actions taken during this audit. No task below has been implemented.

---

## Phase 1 — P0 blockers

**None confirmed in this audit's scope.** No P0 (auth bypass, cross-tenant data access,
exposed secret, confirmed data-loss path, crash on a primary journey) was confirmed with
direct evidence during this session. This is **not** a claim that no P0 exists anywhere
in the application — see `UVS-001` (potential tenant-isolation issue, unverified) which,
if confirmed in a follow-up session, would immediately become the single Phase-1 task.

**Conditional Task P0-0 (contingent):**
- **Task ID:** P0-0
- **Related DISC ID:** None yet — tied to `UVS-001` pending confirmation
- **Problem statement:** IF `authenticateServiceApiKey` (location: search
  `backend/enterprise/` for its definition) is found to use a client-supplied
  `x-tenant-id`/`x-workspace-id` value as anything other than a restrict-only equality
  check against the API-key-derived tenant, THEN this is a cross-tenant data access P0.
- **Affected files:** `backend/enterprise/enterpriseAuth.js`, and the
  as-yet-unlocated file defining `authenticateServiceApiKey` (likely under
  `backend/enterprise/tenantService.js` or similar, per the `createTenantService` import
  seen in `backend/index.js`).
- **Owner lane:** Security + Backend
- **Estimated effort:** S (to trace and confirm/refute), L (if confirmed and a fix is
  required)
- **Acceptance criteria:** A new automated test proves a mismatched `x-tenant-id` header
  is rejected (`403`/`404`), not honored.
- **Verification recipe:** Add/locate a test that calls the M2M-authenticated endpoint
  with a valid API key for Tenant A and an `x-tenant-id` header for Tenant B; expect
  rejection.
- **Do-Not-Restore warning:** N/A — not a reference-baseline issue.

---

## Phase 2 — P1 critical and P2 high-priority issues

### Task 2.1 — Close the three human-gated release bars and provision AI provider credentials

- **Task ID:** P1-1
- **Related DISC ID:** DISC-003, DISC-004
- **Problem statement:** The project's own governance trail declares a 9.3/10 ceiling
  (explicitly not a freeze declaration) with three unexecuted human-gated verification
  packages (H.1 security drill, H.2 mesh-alias promotion, H.3 production observation) and
  unprovisioned production AI-provider credentials (Groq, Gemini, OpenRouter).
- **Affected files:** `developer-review/packages/h1-security-drill/`,
  `developer-review/packages/h3-production-observation/` (inside the audited repo),
  target-environment `backend/.env` (not in source control).
- **Owner lane:** Infrastructure + Security (named "Project Lead"/"Database
  Administrator" per the project's own closure doc)
- **Estimated effort:** L (coordination/scheduling), though the project's own estimate
  for the technical execution itself is "<30 min each for H.1-H.3"
- **Dependencies:** Requires a target staging/production-like environment and named
  human owners, per `HANDOVER-CLOSURE-2026-10-28.md` §4.
- **Implementation risks:** Running a live security drill against a real environment
  carries inherent operational risk; follow the committed runbook
  (`developer-review/packages/h1-security-drill/runbook.md`) exactly.
- **Acceptance criteria:** Dated, signed evidence artifacts exist matching each
  package's `expected-transcript.md`/`evidence-template.md`; all three AI provider keys
  resolve to a healthy status.
- **Verification recipe:** See DISC-003/DISC-004 verification recipes.
- **Rollback considerations:** N/A — these are verification activities, not code changes;
  no rollback needed unless the drill itself triggers an unexpected side effect (follow
  the runbook's own rollback section).
- **Do-Not-Restore warning:** N/A.

### Task 2.2 — Trace and confirm/refute the M2M tenant-restriction implementation (UVS-001)

- **Task ID:** P1-2
- **Related DISC ID:** None (currently `UVS-001`) — promote to a DISC entry immediately
  upon confirmation either way.
- **Problem statement:** See Phase 1 Task P0-0 — this is the investigation step that
  precedes it.
- **Affected files:** `backend/enterprise/enterpriseAuth.js`,
  `backend/enterprise/` (tenant service module, to be located).
- **Owner lane:** Security
- **Estimated effort:** S
- **Dependencies:** None.
- **Implementation risks:** None (read-only investigation).
- **Acceptance criteria:** A written, evidence-backed conclusion (REFUTED or CONFIRMED)
  is added to either `appendix/REFUTED-CANDIDATES.md` or `DISCREPANCY-LOG.md`.
- **Verification recipe:** Full read of `authenticateServiceApiKey` plus a targeted test
  as described in Task P0-0.
- **Rollback considerations:** N/A.
- **Do-Not-Restore warning:** N/A.

### Task 2.3 — Resolve the dual-frontend-tree ambiguity (DISC-001)

- **Task ID:** P2-1
- **Related DISC ID:** DISC-001
- **Problem statement:** See DISC-001 in full.
- **Affected files:** `index.html`, `vite.config.js`, `src/` (repo root).
- **Owner lane:** Frontend
- **Estimated effort:** M (mostly verification before a one-line deletion commit)
- **Dependencies:** Must run the cross-reference-safety grep from DISC-001's verification
  recipe first.
- **Implementation risks:** Low if the cross-reference check passes; if it fails, this
  becomes an extraction task instead (estimate would change to L).
- **Acceptance criteria:** `npm --prefix frontend run build` still succeeds after
  deletion/archival; `git grep` for cross-tree imports returns zero matches.
- **Verification recipe:** See DISC-001.
- **Rollback considerations:** Trivial — `git revert` the deletion commit if an
  unexpected dependency surfaces post-merge.
- **Do-Not-Restore warning:** Do not restore the root `src/` tree as "the frontend" in any
  future rewrite without first confirming which tree (root vs. `frontend/`) is intended
  to be canonical going forward — this ambiguity is exactly what created DISC-001 in the
  first place.

### Task 2.4 — Complete the backend route-level parity comparison (UVS-002 and the 19
deferred rows in `appendix/PARITY-MATRIX.md`)

- **Task ID:** P2-2
- **Related DISC ID:** None yet (UVS-002); may produce new DISC entries.
- **Problem statement:** Only 1 of 20 active route files (`resumes.js`) received a
  file-existence + line-count comparison against `reference-code/backend/routes/`; none
  received a full behavioral diff.
- **Affected files:** All files in `backend/routes/` vs. `reference-code/backend/` (and
  any files `reference-code/backend/` contains that have no active counterpart).
- **Owner lane:** Backend + QA
- **Estimated effort:** L (20 files, full behavioral comparison each)
- **Dependencies:** None.
- **Implementation risks:** None (read-only comparison); risk lies in whatever is found,
  to be assessed per-finding once discovered.
- **Acceptance criteria:** `appendix/PARITY-MATRIX.md` reaches 20/20 = 100% coverage with
  an explicit divergence classification per route.
- **Verification recipe:** For each route, compare request validation, response shape,
  status codes, and side effects per mandate §5.1; write the result as a new row.
- **Rollback considerations:** N/A (documentation task).
- **Do-Not-Restore warning:** For any row classified `REFERENCE-DEFECT`, explicitly note
  it in the resulting documentation so no future "restore from reference-code" action
  accidentally reintroduces it.

### Task 2.5 — Trace AI provider failover/timeout/retry behavior (UVS-003)

- **Task ID:** P2-3
- **Related DISC ID:** None yet (UVS-003).
- **Problem statement:** The HEAD commit itself just fixed one code/status contradiction
  in this exact subsystem (`backend/freellmapi/`), raising the prior probability of
  adjacent issues; the subsystem was not traced in this session.
- **Affected files:** `backend/freellmapi/agent/`, `backend/freellmapi/services/`,
  `backend/freellmapi/providers/`, `backend/services/aiRuntime.js`.
- **Owner lane:** Backend
- **Estimated effort:** M
- **Dependencies:** None.
- **Acceptance criteria:** A documented fallback-order, timeout, and retry-policy table
  exists per provider, cross-referenced against `backend/test/` files that assert this
  behavior.
- **Verification recipe:** Static trace + review of corresponding tests under
  `backend/test/` (filenames referencing `ai-routing`/`freellmapi` — not enumerated in
  this session, search for them first).
- **Rollback considerations:** N/A (investigation task).
- **Do-Not-Restore warning:** N/A.

### Task 2.6 — Reconcile the two differing test-pass-count figures found in the
repository's own prior documentation (see `appendix/INVENTORIES/tests.md`)

- **Task ID:** P2-4
- **Related DISC ID:** None yet.
- **Problem statement:** `HANDOVER-CLOSURE-2026-10-28.md` states 1,356/1,356 backend
  tests passing; `ceiling-table-r17.md` (two days earlier) states 1,334/1,334. Both are
  inside the audited repo's own `developer-review/` folder.
- **Affected files:** N/A (documentation reconciliation) — actionable step is to actually
  run `npm --prefix backend test` on the current `main` tip and record the real number.
- **Owner lane:** QA
- **Estimated effort:** S
- **Acceptance criteria:** A single, current, reproducible pass-count figure is recorded
  for the exact commit under test.
- **Verification recipe:** `npm --prefix backend test` in an authorized environment;
  record exit code and summary line.
- **Rollback considerations:** N/A.
- **Do-Not-Restore warning:** N/A.

---

## Phase 3 — P3 improvements

| Task ID | Related DISC ID | Problem | Owner lane | Effort |
|---|---|---|---|---|
| P3-1 | DISC-002 | Reconcile "my-app"/"IME365"/"ResumePilotAi"/"resumepilot" naming across `package.json`, `CLAUDE.md`, `frontend/index.html`, `.env.example` | Frontend/Docs | S |
| P3-2 | DISC-005 | Add `engines.node` to all three `package.json` files | Infrastructure | S |
| P3-3 | DISC-006 | Inventory inline `style=` usage in `frontend/src`, then tighten CSP `style-src-attr`/`style-src-elem` away from `'unsafe-inline'`, adding `report-uri`/`report-to` first to observe safely | Frontend/Security | M |
| P3-4 | DISC-007 | Remove compiled bundles and the `.zip` archive from `reference-code/`, keeping source only (or clearly label a dated snapshot directory) | Backend/Docs | S |
| P3-5 | (UVS-004 follow-up) | Build the state-completeness matrix (loading/empty/error/disabled/success) for the 11 screens listed in `UI-UX-AUDIT.md` §2 | Frontend/QA | L |
| P3-6 | (UVS-005 follow-up) | Audit `backend/repositories/` for N+1 query patterns and missing pagination, starting with `GET /api/resumes` | Backend/Database | M |
| P3-7 | (§3 `routes.md` observation) | Confirm whether the duplicate `/api/enterprise`, `/api/enterprise/m2m`, `/api/platform` mount calls in `backend/index.js` are intentional layering or dead duplication | Backend | S |


---

## Phase 4 — Actions created by the runtime verification pass (2026-10-28)

These are new, evidence-backed items discovered by **executing** the application
(`BROWSER-VERIFICATION-REPORT.md`, `TEST-EXECUTION-REPORT.md`). Nothing here was
implemented — the audit remains read-only with respect to application code.

### P4-1 — Fix five WCAG 2.1 AA violations on landing + pricing (DISC-008 / A11Y-001…005)

| Sub-task | File:line | Change | Effort |
|---|---|---|---|
| A11Y-001 | `frontend/src/pages/landing.tsx:239` | give the star row `role="img"` + `aria-label="5 out of 5 stars"`, or `aria-hidden` the icons and add visually-hidden text | S |
| A11Y-002 | `landing.tsx:79`, `:296` | include the visible brand text in the accessible name (or drop `aria-label` and rely on the visible text) | S |
| A11Y-003 (**critical**) | `pages/billing/pricing.tsx:264-272` | add `aria-label="Annual billing"` (or `aria-labelledby` pointing at the "Monthly Billing"/"Annual" label) to the `role="switch"` button | S |
| A11Y-004 | `pricing.tsx:285`, `:335` | raise contrast: `#009966`→ darker emerald (≥ 4.5:1 on the badge background) and `text-ink-muted/60` → `text-ink-muted` (2.45:1 → target ≥ 4.5:1) | S |
| A11Y-005 | `pricing.tsx:384` | `tabIndex={0}` + `role="region"` + `aria-label` on the `overflow-x-auto` wrapper, or provide the table in a keyboard-navigable form | S |

Verification after fix: re-run `developer-review/tools/audit-browser-verification.spec.ts`
and require zero violations in `Evidence/artifacts/axe-violation-details.json`.

### P4-2 — Stop the accessibility suite from silently testing the login page (DISC-012)

`frontend/tests/accessibility.spec.ts` sets `localStorage.ime_dev_user`, which the router
guard does not honour; every "Candidate Dashboard / Employer Portal / Admin Console /
Enterprise Console" scan therefore runs against `/login`. Fix: authenticate via
`POST /api/auth/preview-login` (the app's own non-production issuer, already used by
`engine-security.spec.ts`) and assert `expect(page).not.toHaveURL(/\/login/)` before
scanning. Effort: M. **This is the highest-value QA fix in the package** — it converts
green-but-empty coverage into real coverage.

### P4-3 — Remove the hardcoded port in `freellmapi-admin-e2e.spec.ts` (DISC-011)

The spec navigates to `http://localhost:5173` while `playwright.config.ts` starts the app
on `:4000` with `baseURL` set. Use `baseURL`-relative navigation (or read
`process.env.E2E_BASE_URL`). Effort: S. Until fixed, this 47-test suite cannot pass under
the repository's documented command in **any** environment.

### P4-4 — Make the test-count claim reproducible (DISC-009)

Delete/replace the "1,356 tests" claim with the reproducible figure produced by
`cd backend && node scripts/run-tests-with-annotations.js` (1,315 discovered / 1,271 pass
at this revision) and publish the command next to the number. Effort: S.

### P4-5 — Correct the "MySQL / MariaDB compatible" claim in the baseline migration (DISC-010)

`001_baseline.sql`'s header claims MySQL compatibility; `002`+ use `ADD COLUMN IF NOT
EXISTS` (MariaDB-only). Either amend the header to state MariaDB ≥ 11.4 as the sole
supported engine, or make later migrations portable. Effort: S (documentation) / L (portability).

### P4-6 — Establish a repeatable MariaDB-backed verification lane (GAP-D1)

The single largest remaining evidence gap. Requirement: a disposable MariaDB 11.4
instance (CI service container or a `mariadb:11.4` ephemeral job) with
`RUN_MARIADB_INTEGRATION=true`, `MARIADB_TEST_ALLOW_RESET=true`, a `DB_NAME` containing
`test|ci|cert|sandbox|scratch`, then:

```bash
npm --prefix backend test                 # un-skips 30 tests, converts 14 failures
npm --prefix backend run test:enterprise
cd frontend && npx playwright test        # unblocks engine-responsive/authenticated + candidate suites
```

Expected outcome: 30 skips become executions, the 14 DB-gated failures resolve or turn
into real defects, and the candidate dashboard suite (175 tests) becomes runnable.
Effort: M (infrastructure), no application change.

### P4-7 — Restore font parity for visual regression (GAP-B2)

`fonts.googleapis.com` was unreachable in the verification sandbox, so 20/20 screenshot
comparisons differ by 3–7 %. Either self-host the fonts (removes a third-party runtime
dependency and a CSP source) or pin the baselines to an environment with font access.
Effort: S–M.

### Revised sequencing with the runtime evidence in hand

1. **P4-2** (DISC-012) and **P4-3** (DISC-011) first — they repair trust in existing test
   results and cost hours, not days.
2. **P4-1** (A11Y-003 is axe-critical) — small diffs, user-visible, gate-able in CI with
   axe.
3. **P4-6** — infrastructure lane so the 30 MariaDB-gated tests stop being dark.
4. **P4-4 / P4-5 / P4-7** — cheap documentation/environment hygiene.
5. Then re-enter Phase 1 (P0/P1) items from the original plan, which this pass neither
   confirmed nor refuted.

---

## Sequencing recommendation for the next developer

1. Start with **Task P1-2 / P0-0** (tenant-isolation trace) — highest possible severity if
   confirmed, lowest cost to investigate.
2. Then **Task P1-1** (release-gate closure) — this is largely a scheduling/coordination
   task for named human owners, so it can run in parallel with engineering work.
3. Then **Task P2-4** (re-run the test suite once, get one authoritative number) — cheap,
   unblocks confidence in every other claim in this package that referenced test counts.
4. Then **Task P2-2** (full route parity) and **Task P2-3** (AI provider tracing) in
   parallel if two engineers are available.
5. **Task P2-1** (dual-frontend cleanup) can happen any time — it is low-risk and
   independent of everything else.
6. Phase 3 items are backlog-appropriate and do not block any release decision.
