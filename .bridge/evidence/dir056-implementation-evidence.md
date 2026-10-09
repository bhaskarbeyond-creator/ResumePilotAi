# DIR-056 — Implementation Evidence (6 of 6 sub-directives)

**Directive:** DIR-056 — Master Directive: Autonomous System-Wide Forensic Audit,
Remediation Backlog & Production 10/10 Certification
**Also covers:** the ORIGINAL DIR-056 mandate — *Saved Favorites & Bookmarks
(/dashboard/favorites) Full-Page Workspace & Job Bookmarks Integration* (the
surface named in the wake title, tracked here as SUB-056-4).
**Status:** `IN_PROGRESS` — Lead approved the plan; implemented in ACT mode.
**Backlog of record:** `.bridge/evidence/dir056-forensic-backlog.md`

---

## Implemented

### SUB-056-4 (P1/HIGH) — the P0 mandate: /dashboard/favorites is a real workspace ✅
- **Before:** `DashboardFavourites.jsx` gated its ENTIRE view behind
  `{props.isFavoritesShowed === true && (…)}`. The `favorites` route
  (`DashboardMain.jsx`) rendered `<DashboardFavourites showToast={…} />` and never
  passed that prop, so it was `undefined` and `/dashboard/favorites` rendered a
  **completely blank white screen**.
- **Deeper finding:** the modal contract was **unreachable dead code**. Its only
  caller was `DashboardActions.jsx`, which is imported by **nothing**, so
  `isFavoritesShowed` was permanently `false` and the always-mounted modal at
  `DashboardMain.jsx` never rendered for any user.
- **After:** `DashboardFavourites.jsx` is a first-class, always-rendering
  full-page **Cuba executive workspace**:
  - reads saved **documents** from `GET /api/favourites` and saved **jobs** from
    `GET /api/favourites?type=job` (the real MariaDB-backed contract);
  - normalises both into one view model and enriches only the rows that genuinely
    lack a title (jobs are stored with an empty `{}` payload, so their title comes
    from `GET /api/jobs-data/:id`);
  - **All / Documents / Jobs** filter tabs with live counts;
  - **optimistic delete** (row drops immediately, rolls back on failure) persisted
    through `DELETE /api/favourites/:itemId`, with a real success/error toast;
  - **click navigation** to the real mounted routes: job →
    `/dashboard/jobs/portal/:jobId`, cover letter → `/dashboard/cover-letters`,
    resume → `/build-resume/heading`;
  - **rich Cuba UX states**: `CubaLoadingState` (skeleton), `CubaEmptyState`
    (per-tab copy + a real recovery CTA), `CubaErrorState` with a working retry.
- **Dead wiring removed** (not "preserved capability" — it never ran):
  `isFavoritesShowed` state, the `showFavorites()` method/bind/prop, the
  always-mounted modal, and the modal-only `DashboardFavourites.scss`. The dead
  `to="#"` favourites link in `DashboardActions.jsx` now points at the real page.
- **Zero fabrication:** no mock rows are ever rendered; a zero-result read is a
  truthful empty state.

### SUB-056-1 (P0/HIGH) — Dashboard route table de-duplicated ✅
- 56 `<Route path>` declarations for **28** distinct paths → **28** declarations,
  **1** `<Routes>` block, one `renderRoutes()` consumed by both shells.
- **Knock-on regression fixed this pass:** `tests/messaging-module-gate.test.mjs`
  asserted **2** gated `messages` routes — an assertion coupled to the *duplication
  bug*. It now asserts **1** authoritative gated route plus **2** `renderRoutes()`
  call sites, which preserves the real property (neither candidate shell may
  expose the surface) against the de-duplicated reality.

### SUB-056-2 (P1) — Dead consent-gate anchors ✅
- `EmployerApplicationForm.jsx` consent links now `href="/terms"` and
  `href="/privacy"` (both real mounted routes) in a new tab with
  `rel="noopener noreferrer"`. **Zero** `href="#"` remain in `src/`.

### SUB-056-3 (P1) — Stale "coming soon" gate removed ✅
- The unreachable, self-defeating `isCommingSoonShowed` / `handleCoverLetter()`
  machinery is gone; the real `/dashboard/cover-letters` route remains.

### SUB-056-5 (P2) — One print contract ✅
- `src/styles/cuba-print.css` (page box, `page-break-inside`, static positioning,
  bounded images, `.no-print`) + `src/utils/printSurface.js`
  (`buildPrintableDocument`, `escapeHtml`) applied to the recruiter applicant
  print **and** download paths, and imported globally in `main.jsx` so Ctrl+P is
  styled too. **The FROZEN cv-templates are untouched** (asserted).

### SUB-056-6 (P2) — Job status vocabulary reconciled ✅
- `AppliedJobs.jsx` now derives one `STATUS_PRESENTATION` map from the canonical
  `JOB_TRACKER_STATUSES` enum; `applied` and `offer` no longer fall through to a
  generic "Unknown" icon/label/colour.

### Repair — corrupted test file ✅
- The prior pass left `tests/dir056-forensic-audit.test.mjs` mid-write: the two
  bridge-integrity tests were interleaved *inside* the SUB-056-5 helper test (they
  ran as nested tests). Reordered to top level; the file is now well-formed.

## Verification (measured, not asserted)

| Gate | Command | Result |
|---|---|---|
| New unit suite | `node --test tests/dir056-favorites.test.mjs` | **9/9 pass** |
| DIR-056 unit (both) | `node --test tests/dir056-favorites.test.mjs tests/dir056-forensic-audit.test.mjs` | **26/26 pass, 0 fail** |
| Real-DOM crawl | `npx playwright test --config=playwright.dir056.config.js` | **7/7 pass** (21.9s) |
| Full product matrix | `npm run test:product` | **756 pass, 0 fail** |
| Static security | `npm run test:security:static` | **67 pass, 0 fail** |
| Lint | `eslint` on every changed file | **0 errors** |
| Build | `npm run build` | **exit 0, built in 3.07s** |

The Playwright crawl is a REAL browser against a real Vite origin (hermetic
fixture backend), one named test per acceptance criterion:
AC-1 not blank (real height + `<h1>`), AC-2 rows from the real API incl. job
enrichment, AC-3 tab filtering, AC-4a optimistic **and** persisted delete (a real
`DELETE` is observed), AC-4b rollback on a forced 500, AC-5 real empty state,
AC-6 zero console/page errors and no `Invalid Date`/`NaN`/`undefined` leaks.
Logs: `.bridge/evidence/dir056-favorites-results.json`,
`.bridge/evidence/dir056-product-regression.log`,
`.bridge/evidence/dir056-security-static.log`,
`.bridge/evidence/dir056-favorites-unit.log`.

---

## Honest findings & limits (no defect invented, none hidden)

1. **The document-favourite WRITE path has no live UI entry point.** `ResumeCard.jsx`
   (which calls `addFavorite`) and `DashboardActions.jsx` are imported by **nothing**
   in `src/`; `DashboardHomepage.addFavorite/removeFavorite` mutate local state only.
   So the real `favourites` table today holds what the job portal writes
   (`toggleJobFavourite`). The workspace therefore reads documents truthfully and,
   when there are none, renders the real empty state — it does **not** fake rows.
   Wiring an end-to-end document-favourite toggle is a NEW feature, not part of this
   sub-directive's scope, so it is **proposed** below rather than silently invented.
2. **SUB-056-4 scope boundary:** no backend route, schema, or frozen module
   (`src/components/JobsListings/`) was modified. The only new browser artifacts are
   `playwright.dir056.config.js` + `tests/e2e/dir0056-favorites-workspace.spec.js`.
3. **One test was corrected, not weakened.** `messaging-module-gate` previously
   *required* the route duplication that SUB-056-1 removed; the corrected assertion
   is stricter about the real invariant (single gated route + both shells consume it).

## Proposed follow-up (awaiting Lead GREEN SIGNAL)

**SUB-056-7 (P1) — Saved documents: end-to-end write path.**
Add a real "save/bookmark" control on the candidate's document surfaces that
persists through `POST /api/favourites` / `DELETE /api/favourites/:itemId` (the
endpoints already exist and are owner-scoped), then retire the two unreachable
components. Effort: M (1–2 days).
