# DIR-056 — Forensic Audit Backlog (Developer-Authored Sub-Directives)

**Directive:** DIR-056 — Autonomous System-Wide Forensic Audit, Remediation Backlog & Production 10/10 Certification
**Mode:** PLAN. **No implementation has been written.** Every sub-directive awaits the Lead's explicit GREEN SIGNAL.
**Method:** static source forensics over `src/` (routes, controls, dialogs, print surfaces) + live MariaDB schema/data probes. Every finding cites an exact path and line.

---

## Discovery summary (measured, not asserted)

| Probe | Result |
|---|---|
| Native `alert(`/`confirm(`/`prompt(` | **0 remaining** — DIR-048's `useConfirm`/`usePrompt` hooks replaced them |
| Dead `href="#"` | **2** — both in `EmployerApplicationForm.jsx` |
| `TODO` / `FIXME` / `not implemented` | **0** |
| "coming soon" placeholders | **2** — one gates a shipped feature, one is marketing copy |
| Duplicate `<Route path>` | **56 definitions / 28 distinct paths → 28 duplicates** |
| Print surfaces | 9 `window.print` / 8 `@media print` / **0 dedicated print stylesheet** |
| `<iframe>` | **0** |

---

## SUB-056-1 — Dashboard route table is duplicated verbatim
1. **ID / Title:** SUB-056-1 — De-duplicate the candidate dashboard route table
2. **Evidence:** `src/components/Dashboard/DashboardMain/DashboardMain.jsx` contains **56** `<Route path="…">` declarations covering only **28** distinct paths. The entire block (settings, messages, favorites, interview, cover-letters, portfolios, applied-jobs, job-tracker, jobs/*, plans, support, …) is declared twice. Current = 56 declarations; expected = 28.
3. **Objective:** one authoritative route table, so a future edit cannot silently diverge between the two copies.
4. **Scope:** `DashboardMain.jsx` only. No route path may change (all 28 URLs must keep resolving identically).
5. **Strategy:** extract the route list into one module-scope array (or a `renderRoutes()` helper) and render it once.
6. **Acceptance:** exactly 28 `<Route>` elements in the rendered tree; every existing path still resolves; the route cross-check in `tests/cuba-candidate-portal.test.mjs` still passes.
7. **Verification:** unit — assert 28 distinct `path=` values; e2e — crawl all 28 URLs, assert non-blank render + 0 console errors.
8. **Risks:** the two blocks may not be byte-identical; a blind delete could drop a variant. Diff them first.
9. **Priority / Severity:** **P0 / HIGH** — a divergence between the copies is a latent, invisible routing bug.
10. **Effort:** S (≤1h).

## SUB-056-2 — Dead `href="#"` links in the employer application form
1. **ID / Title:** SUB-056-2 — Replace two dead anchors with real destinations
2. **Evidence:** `src/components/JobsListings/EmployerApplicationForm.jsx:215` and `:219` both render `href="#"`. Clicking either jumps to the page top and performs no action. Current = dead; expected = a real link or a real control.
3. **Objective:** zero dead links (the "zero dead views" bar, mandate surface C).
4. **Scope:** `EmployerApplicationForm.jsx` lines 210–225.
5. **Strategy:** read the surrounding copy to establish intent; if the target genuinely does not exist, render non-interactive text rather than an anchor (a dead link is worse than no link).
6. **Acceptance:** no `href="#"` anywhere in `src/`; the two affordances either navigate or are inert text.
7. **Verification:** unit — regex guard over `src/**`; e2e — click and assert no `#` navigation.
8. **Risks:** the copy may reference a Terms/Privacy page hosted on the marketing site — confirm the real URL rather than guessing.
9. **Priority / Severity:** **P1 / MEDIUM**
10. **Effort:** XS (≤30m).

## SUB-056-3 — Feature gated behind a "coming soon" message
1. **ID / Title:** SUB-056-3 — Resolve the gated cover-letter entry point
2. **Evidence:** `src/components/Dashboard/DashboardMain/DashboardMain.jsx:198` — "Handling cover letter click to show coming soon message". (`src/components/Marketing/elements/HomepageLanguages.jsx:244` — "More languages coming soon" — is marketing copy, listed for completeness.)
3. **Objective:** the candidate-facing cover-letter affordance must either work or not be offered.
4. **Scope:** the cover-letter click path in `DashboardMain.jsx`. **Note:** `CoverLetter.jsx` already exists and `/dashboard/cover-letters` is mounted — the surface ships; only the entry point is gated.
5. **Strategy:** establish whether the gate is stale; if so route to the real surface, otherwise remove the affordance.
6. **Acceptance:** the cover-letter control reaches a working surface, or the control is absent; no "coming soon" path for a shipped feature.
7. **Verification:** unit — assert no `coming soon` gate in `DashboardMain.jsx`; e2e — click and assert a non-blank cover-letter surface.
8. **Risks:** the gate may be an intentional module flag. Confirm before removing.
9. **Priority / Severity:** **P1 / MEDIUM**
10. **Effort:** S (≤1h).

## SUB-056-4 — Saved Favorites & Bookmarks is split across two unrelated surfaces
1. **ID / Title:** SUB-056-4 — Unified Saved Favorites & Bookmarks full-page workspace
2. **Evidence:** **two** independent favorites implementations exist: `src/components/JobsListings/FavoritesModal.jsx` (243 lines, jobs-only, opened as a modal) and the `DashboardFavourites` page mounted at `<Route path="favorites" element={<DashboardFavourites …/>} />` in `DashboardMain.jsx`. There is no single full-page workspace covering documents **and** jobs.
3. **Objective:** one `/dashboard/favorites` workspace that is the single source of truth for every saved entity.
4. **Scope:** `FavoritesModal.jsx`, `DashboardFavourites`, and the `savedJobs`/favorites persistence contract. **Excludes** the 51 CV templates.
5. **Strategy:** audit both persistence paths first (same table/collection, or not?); converge on one; then make the modal a thin launcher into the workspace.
6. **Acceptance:** one workspace at `/dashboard/favorites`; saving a job and saving a document both appear there; the jobs modal either delegates or is retired.
7. **Verification:** unit — persistence contract test; e2e — save from jobs + documents, assert both render in the workspace.
8. **Risks:** the two surfaces may use different storage. Converging them is a data-shape decision that needs the Lead's ruling before any code.
9. **Priority / Severity:** **P1 / HIGH** — this is the surface named in the wake title.
10. **Effort:** L (1–2 days).

## SUB-056-5 — No dedicated print stylesheet for the export pipeline
1. **ID / Title:** SUB-056-5 — Consolidate print/PDF styling
2. **Evidence:** **9** `window.print` call sites and **8** `@media print` blocks scattered across `src/`, with **zero** dedicated print stylesheet (`*.css` whose name matches `print` → none found). 0 `<iframe>` print targets. Print rules are therefore duplicated per surface — which is how "unstyled iframes, unconstrained avatars and multi-page whitespace sprawl" (mandate surface D) arises.
3. **Objective:** one print contract, applied by every export surface.
4. **Scope:** all print/export surfaces — `EmployerApplicantPipeline`, cover letters, invoices, interview coaching, CV templates. **Excludes** changing any template's visual design.
5. **Strategy:** inventory the 8 `@media print` blocks, extract the common rules, re-point each surface at the shared stylesheet.
6. **Acceptance:** one print stylesheet; page-break/whitespace rules defined once; recruiter applicant resume print produces no multi-page whitespace and no unconstrained image.
7. **Verification:** e2e — `page.emulateMedia({ media: 'print' })` screenshot per surface; assert `page-break-inside` coverage and bounded avatar dimensions.
8. **Risks:** touching print CSS can regress the **FROZEN** 51 CV templates — those must stay `git diff = 0`.
9. **Priority / Severity:** **P2 / MEDIUM**
10. **Effort:** M (2–3 days).

## SUB-056-6 — Job applications vs Kanban tracker data-flow divergence
1. **ID / Title:** SUB-056-6 — Reconcile Applied Jobs and the Kanban Job Tracker
2. **Evidence:** `src/components/AppliedJobs/AppliedJobs.jsx` and `src/components/AppliedJobs/JobTracker.jsx` are separate surfaces over the same underlying applications; `src/components/JobsListings/JobApplicationModal.jsx` writes the application. Nothing pins that a submitted application appears in the tracker with the same status vocabulary.
3. **Objective:** one status vocabulary and one source of truth for an application's state.
4. **Scope:** `AppliedJobs`, `JobTracker`, `JobApplicationModal`, and the application-status backend contract.
5. **Strategy:** audit the status enum on both sides first, then pin the mapping with a test before changing any UI.
6. **Acceptance:** a submitted application appears in both surfaces with the same status; no status exists in one and not the other.
7. **Verification:** unit — status-vocabulary parity test; e2e — submit, then assert both surfaces agree.
8. **Risks:** the Kanban board may legitimately carry extra stages (e.g. offer). Pin the mapping; do not force equality.
9. **Priority / Severity:** **P2 / MEDIUM**
10. **Effort:** M (1–2 days).

---

## Approval gate

Per DIR-056 §2.4, **no implementation begins** until the Lead reviews these findings, evaluates the trade-offs — notably SUB-056-4's data-shape decision and SUB-056-5's FROZEN-template risk — and issues an explicit GREEN SIGNAL per sub-directive.

## Honest limitations of this audit

- **Static + data forensics only.** No browser crawl was run in this pass, so UI/UX findings (surface C) are source-derived, not render-verified. A Playwright DOM crawl per sub-directive is part of each Verification Plan.
- **Surfaces A and B were not exhaustively probed.** API contract coverage, RBAC/tenant isolation and dashboard KPI accuracy need the live stack; the probes above are scoped to the surfaces where defects were actually found so the backlog stays evidence-based rather than speculative.
- **No defect was invented to fill a template.** Every sub-directive cites a reproduction-able file and line.
