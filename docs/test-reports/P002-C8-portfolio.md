# P002 · C8 — Portfolios: the real API, the shared Web CV contract, an honest module state

- **Surface:** candidate queue #13.
  - Builder: `/dashboard/portfolio[/:portfolioId]` (`frontend/src/pages/portfolio/builder.tsx`).
  - Gallery: `/portfolios` (`gallery.tsx`).
  - Public page: `/portfolio/:slug` (`public-portfolio.tsx`).
  - Legacy `/dashboard/portfolios` and `/portfolio/builder` now redirect to the builder.
- **Base:** `d50c4e82fb30e56a3370f5ef7a01864805d985d9` (C7). Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306. There is no AI and no stub in this surface.
- **Module gate:** `public_config.modules.enablePortfolioModule` is **off by default** (seeded by migration 009). While it is off, owner routes answer 403 `PORTFOLIO_MODULE_DISABLED`; public routes always answer.

## 1. What the candidate saw before C8

Evidence:
- `docs/ui-audit/screenshots/portfolio/before/` (5 routes × 5 profiles, plus `capture-report.json`).
- The C7 endpoint-contract audit.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| PF-1 | P0 | **Every request went to `/api/api/portfolios…`** (the pages prefixed `/api` on top of the client's base URL), so all of them returned 404. The builder could not load or save; the gallery and the public page could not load anything. | `before/capture-report.json`: 2× `404 GET /api/api/portfolios…` per page, 2 console errors; the 6 unmatched calls in the C7 contract audit |
| PF-2 | P0 | **The calls didn't match the real API even without the prefix.** Load expected `{ portfolio }`, but the API returns `{ portfolios: [] }`. The slug was used as the record id. The page called `PUT /:id`, `POST /` and `POST /:id/publish`, none of which exist (the API is a revision-checked `POST /:id` upsert). | `backend/routes/portfolios.js` |
| PF-3 | P0 | **Incompatible document model.** The page stored a flat object (`fullName`, `projects`, `skills`…). Real portfolios use the shared Web CV document (`renderer: 'webcv'`, `canonical`, `templateKey`) that the legacy studio writes and the public projection reads. Once the paths were fixed, a save would have replaced existing portfolios' content (silent data loss), and published pages would have rendered nothing. | `MySQLRepository._publicPortfolioProjection`, legacy `src/utils/portfolioData.js` (read only) |
| PF-4 | P1 | **False status.** A brand-new, unsaved portfolio was badged "● Live & Published" (`isPublished` started as `true`). | `before/*dashboard_portfolio*` |
| PF-5 | P1 | **The module-off state wasn't handled.** The shipped default (403 `PORTFOLIO_MODULE_DISABLED`) would have surfaced as a raw error; the prefix bug meant candidates only ever saw "API route not found". | `curl` as account A: 403; migration 009 |
| PF-6 | P1 | **Gallery and public page read fields that don't exist.** Both read `fullName`, `headline`, `skills`, `projects`, `links`…, which are absent from the public projection. `p.fullName.toLowerCase()` and `portfolio.projects.length` would have thrown as soon as any portfolio was published. The gallery's category chips filtered on skill categories that never exist, and it showed its error and its empty state at the same time. The public page showed "Error: API route not found" to visitors. | Code review; `before/*portfolios*` |
| PF-7 | P2 | **Invented content as real values.** "Add project" filled real fields ("New Featured Project", a stock description, `TypeScript`/`React`, `https://github.com`) that would be saved and published as the candidate's own. | Code review |
| PF-8 | P2 | **Fake address.** The address preview was a hard-coded `https://ime365.com/p/{slug}`. There is no `/p/` route, and the real address is issued by the server. The copy link used a slug the server never issued. | Code review |
| PF-9 | P2 | **Deep links.** The legacy `/dashboard/portfolios` (8 links in legacy) showed the 404 page, and `/portfolio/builder` was a second URL for the same builder. | `before/*dashboard_portfolios*` |
| PF-10 | P3 | **Layout.** The page had no padding (the title sat against the sidebar), and the header actions were clipped at 1366. | `before/laptop-1366__dashboard_portfolio.jpg` |

## 2. Changes

### 2.1 Client — `frontend/src/lib/portfolio.ts` (new)

- **Typed calls to the seven real routes,** through the shared `apiClient`: list, get, revision-checked save (`expectedRevision` 0 creates), revision-checked delete, address availability, published list and published page. It also lists resumes as a starting point.
- **Errors.** `PortfolioApiError` carries the server's code and message, plus `remoteRevision` on 409, with helpers for module-off, conflict and not-found.
- **Ids.** The record id is minted by the client before the first save (`portfolio_<uuid>`), as the legacy studio does. The server derives the address suffix from that id.

### 2.2 Document model — `frontend/src/lib/portfolio-document.ts` (new)

- **Reads every legacy shape, writes the shared one.** Native TypeScript for the shared Web CV contract. It reads `canonical`, `data.canonical` or bare objects with the legacy field aliases, and writes the top-level document the legacy studio writes and both backend projections read.
- **Nothing is silently dropped.** `buildDocument` is read-modify-write: sections this builder doesn't edit (certifications, achievements, languages, references, interests, custom sections) and unknown document fields are carried through. Fields the server derives (`id`, `revision`, `data` echo, `metadata`, issued `slug`…) are never written back.
- **Visibility-only saves.** `documentWithVisibility` changes only `isPublished` (and passes the address base on first publication). It is used for portfolios built with the earlier page editor, whose blocks are kept exactly as stored.
- **Starting from a resume.** `canonicalFromResume` maps a stored resume row. The heading is mapped explicitly, because on resume rows `title` is the resume's name.
- **Safe links.** `safeHttpUrl` / `safeMailto` mean only http(s) and mailto links are rendered. `normalizeSlugBase` mirrors the server's normaliser for an instant preview; the server stays authoritative.

### 2.3 Builder — `builder.tsx` (rewritten), `components/portfolio/portfolio-editor-fields.tsx`, `portfolio-dialogs.tsx` (new)

- **Module off (403):** "Portfolios are turned off" with a link to the published portfolios. There are no editing controls and no false badge.
- **List:**
  - status (Published / Draft), template or "Earlier page editor", the real public address, and the last save time;
  - Open and Delete, with a confirmation that names the portfolio and its public address; a 404 counts as already deleted, and a 409 is explained;
  - empty state.
- **New portfolio dialog:**
  - title (required, with inline validation and focus);
  - template (4 radio cards);
  - start from one of my saved resumes (real `GET /resumes`) or empty.
  - It saves a private draft (`expectedRevision` 0) and opens `/dashboard/portfolio/:id`, so every editor URL is a stored record that survives reload.
- **Editor:**
  - Sections: Details (title, template), Profile (11 identity and contact fields, a tagline, and About), Experience, Projects, Skills and Education. Repeatable entries are fieldsets named "Experience 2"; their remove buttons name the entry; Add moves focus to the new entry and Remove returns focus to Add, both announced. "Also included" lists the sections that are kept but not edited.
  - Truthful save state ("Unsaved changes" / "All changes saved") with a `beforeunload` guard.
  - Edit / Preview toggle (`aria-pressed`). The preview is the same renderer visitors get.
- **Conflict (409 `PORTFOLIO_CONFLICT`):** "This portfolio changed elsewhere" with **Reload latest version**. Nothing is overwritten. The alert is scrolled into view.
- **Publishing:**
  - First time: a dialog to choose the address. The server's availability probe runs as the candidate types (debounced, with stale requests cancelled) and shows the exact address it will issue. Publish is enabled only when that address is available; a race (`PORTFOLIO_SLUG_CONFLICT`) is explained.
  - Afterwards the address is permanent. "Publish again" confirms the same address, and "Unpublish" confirms what visitors will lose, including that browser-cached copies can take a few minutes to clear (public responses carry `max-age=60`). The real link has **Copy link**.
- **Earlier page editor portfolios** (`renderer: 'puck'` blocks) are read-only here, but can be published, unpublished or deleted with their blocks untouched.
- **Dialogs** open without a trigger and return focus explicitly to the control that opened them. Long titles get padding so they stay clear of the shared close button on phones.

### 2.4 Public page and gallery (rewritten)

- **`components/portfolio/portfolio-view.tsx` (new) renders the canonical Web CV:**
  - 4 template palettes, each meeting AA contrast;
  - empty sections omitted;
  - city and country only (never the street address or postal code);
  - safe links and images;
  - configurable heading levels.
- **`/portfolio/:slug`** handles loading, not found (404, or a malformed address, 400), a retryable error, and the page title from the SEO fields. Earlier-editor pages show their title and description and say the layout can't be displayed yet.
- **`/portfolios`** works only on fields the summaries contain (title, description, tags, template, date).
  - Search and the template filter (only templates that appear) live in the URL (`?q=`, `?template=`).
  - Loading, error and empty are mutually exclusive, and the result count is announced.
  - "No portfolios match" offers **Clear search and filter**.

### 2.5 Routes — `frontend/src/app/router.tsx`

- `/dashboard/portfolios/*` → `/dashboard/portfolio` (legacy plural).
- `/portfolio/builder` → `/dashboard/portfolio`.
- `/dashboard/portfolio/*` now serves both the list and `/:portfolioId`.

### 2.6 Tooling

- **`scripts/dev-db/set-public-module.mjs` (new, test environment only):**
  - sets one allowed module flag in `system_settings.public_config`, the row the admin settings screen writes;
  - refuses non-loopback hosts and database names without "sandbox", "test" or "acceptance";
  - prints before and after.
- **`scripts/audit/candidate-endpoint-contract.mjs`:** type arguments are now skipped as balanced brackets up to three levels deep. Calls such as `get<{ resumes?: Array<Record<string, unknown>> }>('/resumes')` were silently missed before. The fix surfaced 2 calls the C7 audit could not see (ATS Score `GET /resumes`, Cover Letters `GET /covers`); both match real routes.

## 3. Tests

### 3.1 `frontend/tests/candidate/portfolio.spec.ts` (new) — 9 tests × 5 profiles

The module gate is real server configuration. Each group sets the state it needs with `scripts/dev-db/set-public-module.mjs`, and the shipped default (off) is restored afterwards. Before each module-on test, both accounts' portfolios are cleared through the API.

**Module off (the shipped default):**

1. **Builder:** `/dashboard/portfolio`, both legacy paths and an editor deep link all get a real 403 with code `PORTFOLIO_MODULE_DISABLED` and show "Portfolios are turned off". There is no New button, no text field and no false badge. The legacy paths redirect. Also covered: axe, overflow, and the link to the published portfolios.
2. **Public routes still answer:** the gallery gets 200 and announces its count; an unknown address gets 404 and shows "Portfolio not found", with no internal error text. Axe and overflow are checked.

**Module on:**

3. **Create, edit, save:**
   - Empty state.
   - New dialog: title validation with focus; Escape returns focus to New; the resume option is disabled when there are no resumes.
   - Executive template → `POST` 201 → editor URL `/dashboard/portfolio/portfolio_…`.
   - Profile, experience, project, skill and education edits. Add moves focus into the entry; Remove returns focus to Add.
   - "Unsaved changes" → Save 200 → "All changes saved".
   - **The stored document is checked field by field:** `renderer: 'webcv'`, `templateKey: 'executive'`, revision 2, `slug: null`, heading, experiences, `technologyList`, skills.
   - Reload keeps every value. Preview shows the technologies list. Back and forward move between list and editor. Axe on the dialog, the editor and the preview.
4. **Publish:**
   - The dialog shows the **exact address the server will issue**: the test computes `<base>-<sha256(id)[0..8]>` independently. "ab" is rejected and Publish disabled. Publish → focus moves to Unpublish.
   - **Copy link** puts exactly that URL on the clipboard, and the stored record has `isPublished` and that slug.
   - An **anonymous visitor** sees the page, with axe and overflow checked. The public API response has only the allowlisted keys: no `userId` and no revision.
   - The gallery lists it. Search lives in the URL and survives reload; a non-matching search shows "No portfolios match" with Clear; the card link opens the page.
   - **Unpublish** confirmation: Cancel is focused, Escape returns focus. After unpublishing, uncached reads get 404 and a new visitor sees "Portfolio not found".
   - **Publish again** confirms and reuses the same address.
5. **Conflict:** "another tab" saves first through the API. The UI save gets 409, and "This portfolio changed elsewhere" is fully on screen. The server keeps the other tab's title. **Reload latest version** shows it, with no alert left. Axe.
6. **Delete and isolation:**
   - Account B gets 404 for GET, POST and DELETE of A's portfolio; anonymous gets 401 on the list; A's record is unchanged. B's browser on A's editor URL shows "Portfolio not found".
   - A's Delete dialog names the portfolio; Cancel returns focus to that row's Delete button. Delete → 200, with a visible notice and the empty state; the API then answers 404.
7. **Start from a resume:** a resume seeded through the real API is chosen in the dialog. The draft has its first name, occupation, employer and skill, plus the "Started from the resume …" note.
8. **Kept sections:** a portfolio with certifications, languages and interests is renamed in the UI and saved. The stored canonical still has all of them and the project, and the preview renders them.
9. **Earlier page editor:**
   - A `renderer: 'puck'` portfolio is read-only here (no Preview, no Save).
   - It publishes at the chosen address (exact slug).
   - Its stored blocks are byte-for-byte unchanged.
   - Visitors see its title and the earlier-editor notice.

Checks that the tests catch regressions:
- **Mutation:** restoring the earlier-editor publish without the address base makes test 9 fail (the stored slug differs from the promised address).
- **Red → green:** in the first run the unpublish check failed because the visitor's browser served its cached copy. That led to the dialog copy about cached copies and to checking with uncached observers.

The `guard` fixture fails any test on an unexpected console error, page error or `/api` status. Expected statuses (403, 404, 409) are declared per test.

### 3.2 Modal checklist (§10.2)

| # | New portfolio | Publish (first) | Publish again | Unpublish | Delete |
|---|---|---|---|---|---|
| 1 Trigger opens | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 Visible/positioned (5 profiles) | ✅ | ✅ (title clear of the close button at 320) | ✅ | ✅ | ✅ |
| 3 Real data | ✅ the real resumes list | ✅ the address the server will issue | ✅ the reserved address | ✅ the real public URL | ✅ the title and public URL |
| 4 Inputs/validation | ✅ required title, focus | ✅ ≥ 3 characters; only an available address enables Publish | n/a | n/a | n/a |
| 5 Primary/secondary actions | ✅ create → editor; Cancel | ✅ Publish; Cancel | ✅ | ✅ | ✅ |
| 6 Cancel/close | ✅ | ✅ | ✅ | ✅ | ✅ (focus back on the row's Delete button) |
| 7 Escape | ✅ (tested, focus returns) | Radix default | Radix default | ✅ (tested, focus returns) | Radix default |
| 8 Focus in and back to trigger | ✅ Title focused; back to New | ✅ Address focused; to Unpublish after publishing | ✅ Cancel focused | ✅ Cancel focused | ✅ Cancel focused |
| 9 Focus contained | Radix focus trap | same | same | same | same |
| 10 Background scroll | Radix scroll lock | same | same | same | same |
| 11 Failed API never reported as success | ✅ error shown inside; dialog stays | ✅ conflict / address race / server message inside | ✅ | ✅ | ✅ 409 explained; 404 counts as already deleted |
| 12 Usable at 390/320 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 13 Destructive actions confirmed | n/a | public exposure is confirmed | ✅ | ✅ | ✅ |
| 14 Reopen shows fresh state | ✅ the form resets and resumes reload | ✅ the address is re-checked | ✅ | ✅ | ✅ |

## 4. Gates

All numbers are from the final code unless a row says otherwise.

| Gate | Result | Baseline (C7) / note |
|---|---|---|
| `npx tsc -b` (frontend) | exit 0, about 14 s | exit 0 |
| Spec type-check (`npx tsc --noEmit --ignoreConfig … tests/candidate/portfolio.spec.ts`) | exit 0 | Test files are not included in `tsc -b` |
| `npx oxlint` (frontend) | 314 warnings, 0 errors; none in C8 files | 327. The rewritten portfolio pages dropped their old warnings |
| Full candidate regression (7 specs × 5 profiles) | **342/342 passed** in 24.0 min: 340 tests + 2 setup; 0 failed, 0 flaky, 0 skipped | 297/297 in 20.1 min. +45 = the portfolio spec; the six earlier specs still pass unchanged |
| Endpoint contract audit | **75 calls (48 unique), 694 routes, 0 unmatched, exit 0.** This is the first fully matched candidate contract. All 7 portfolio calls plus `GET /resumes` and `GET /resumes/:id` match real routes | C7: 6 unmatched (the portfolio `/api/api` calls). The improved scanner also sees 2 calls the C7 audit missed (§2.6) |
| `npm run build` (`tsc -b` → `vite build` → sync-dist) | exit 0, 16.2 s wall. Entry chunk 670.98 kB (+0.26 kB: the redirect routes); builder 33.92 kB, gallery 5.96 kB, public page 3.83 kB. sync-dist: 309 files, 5 superseded chunks pruned | 16.1 s, entry chunk 670.72 kB, only the pre-existing >500 kB chunk warning |
| Backend | No backend file changed in C8, so the suite was not re-run | Last full run (C7): 939 / 902 / 37, failure set identical to C6 |
| axe (WCAG 2.0/2.1 A + AA) | 0 violations in every scanned state at 5 profiles: module-off page, gallery, not found, list, New dialog, editor, preview, Publish dialog, public page, conflict alert, Delete dialog | Asserted in the spec |
| Authorization and isolation | Account B gets 404 for GET, POST and DELETE of A's portfolio; anonymous gets 401; the public projection has only allowlisted keys | Spec |
| Persistence | The stored document is checked field by field after a UI save. Reload keeps every value; publish state and the issued slug are stored; unpublish gives 404 to uncached readers; sections this builder doesn't edit survive a save | Spec |
| Screenshots | before: 25 (5 routes × 5); after: 50 (module off: 3 routes × 5; module on: list, editor, preview, Publish dialog, New dialog, public page and gallery × 5) | `capture-report.json` in each folder. The module-on captures used data seeded through the real API, removed afterwards |

## 5. Remaining (recorded, not hidden)

- **Legacy parity, P2.** Certifications, achievements, languages, references, interests and custom sections are kept and published but can't be edited in this builder yet. The legacy studio edits them.
- **Earlier page editor portfolios, P2.** The public page can't render their blocks; it shows the title, the description and a notice. The builder only publishes, unpublishes or deletes them.
- **Templates, P3.** The four templates are native palettes on one layout, not pixel copies of the legacy templates. The legacy studio's device-width preview switcher isn't reproduced.
- **Photo, P3.** Photos are set by URL only (http(s), or inline raster data); there is no upload in this builder.
- **Unsaved-changes guard, P3.** It covers reload and tab close (`beforeunload`) only. The app uses `BrowserRouter`, which has no in-app navigation blocker (same as C3).
- **Public caching.** Public responses carry `Cache-Control: public, max-age=60, stale-while-revalidate=300`, so a browser that already viewed an unpublished page may keep its copy for a few minutes. The Unpublish dialog says so; the backend policy is unchanged.
- **Shared dialog primitive, P3.** In the default header layout, long titles collide with the close button at ≤ 390 px. The portfolio dialogs pad their titles. A shared fix needs a review of the consumers with custom headers (preview modal, billing checkout, employer drawer), so it isn't patched here.
- **Shared shell, P3.** The sidebar shows "Portfolios & Web CV" while the module is off, because the shell doesn't read module flags. The page explains the state.
- **Server rules surfaced in the UI.** The address can't be changed after first publication, and the gallery's category filter was removed because summaries carry no categories.
