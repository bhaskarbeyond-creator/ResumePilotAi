# P002 · C15 — Saved Favorites: the candidate's real saved items, a favourites API that never lets a payload pose as the record, and a Dashboard bookmark that invents nothing

- **Surface:** `/dashboard/favourites` (alias `/dashboard/favorites`), `frontend/src/pages/dashboard/favourites.tsx`; legacy `src/components/Dashboard/DashboardFavourites/DashboardFavourites.jsx` (DIR-056 SUB-056-4; read only). Queue row 7.
- **Base:** `1078259244d2ef8f41ab626cdb4f28d586ae0d98` (C14), which contains `origin/main` `7ee109b483ec5aca71e5f1393261ce54f9a60790`. Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306 (MariaDB 13.1.0-embedded, see `scripts/dev-db/README.md`). Preview identities only, all on the reserved `.test` domain: candidates A and B, the test employer `p002.employer@example.test`, and two probe identities (`p002.c15.probe@example.test`, `p002.c15.probe2@example.test`) used by the scratch probes.
- **Sandbox recreation during C15.** Between the baseline captures and the implementation the sandbox was recreated. The workspace came back as uncommitted changes on top of `3be1dde`. Before any work it was verified, through a temporary index, to equal the C14 tree exactly plus the 8 untracked before-captures; the local branch was then moved to C14 with a mixed reset (the working tree was not touched, nothing was discarded). The tooling was reinstalled with `scripts/dev-db/setup-sandbox-tools.sh`, the bridge started on a fresh data directory (so the data arranged for the before-captures was already gone), and the backend got a new `TEST_AUTH_HMAC_SECRET`, so the Playwright setup project signed both candidates in again through the login form.
- **Selection:** Favourites and Support were the two queue rows left. Favourites went first because its baseline showed a P1 (FV-1: the page never showed a saved item) and the only control that writes favourites, the Dashboard bookmark, stored invented values (FV-4).
- **Backend contracts used:**
  - `GET /api/favourites` (`?type=` still filters): the caller's favourites. Since C15 each also carries `data` (the stored payload), `job` and `document` (§2.1).
  - `POST /api/favourites` `{ itemId, itemType, data }`: save, or save again (Undo).
  - `DELETE /api/favourites/:itemId`: owner-scoped removal. Since C15 it says whether anything was removed (`removed`).
  - `GET /api/favourites/:itemId/check`: unchanged.

## 1. What the candidate saw before C15

Evidence: `docs/ui-audit/screenshots/favourites/before/`: 7 screens and `capture-report.json`, taken as candidate A while A had three saved jobs (two saved by the legacy bookmark with an empty payload, one by the Dashboard bookmark with `{title, company, location}`, one of them closed by its employer). `GET /api/favourites` answered 200 with the three rows. `with-three-saved-jobs` is at all five profiles, `settled-after-retry` (5 s later, after the query's automatic retry) at 1366 and 390. The capture report lists them as clean because the page swallows the parse error without logging it; the screens show the failure.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| FV-1 | **P1** | **The page never showed a saved item.** `FavouriteItemSchema` (`hooks/use-api-hooks.ts`) required a client-side view model (`key`, `kind`, `documentType`, `title`, `badge`, `badgeTone`, …) that no endpoint returns, so zod rejected every non-empty list. The page then showed "Failed to load favourites. Please check your connection and try again." next to "No saved items yet" and "0 total saved", with every count at 0, no way to retry, and no page padding. Its "Browse Jobs" button led to the job portal, whose Save button does nothing (FV-6). | `before/*__with-three-saved-jobs.jpg`, `before/*__settled-after-retry.jpg` |
| FV-2 | P2 (latent behind FV-1) | **Removing could not have worked, and would have looked as if it had.** `useRemoveFavourite` put the id into the path without encoding it. The bulk action deleted one item after another without catching a failure (an unhandled rejection, no message). The backend answered `{ success: true }` whether or not anything matched, so the page could not tell a removal from a miss. | `favourites.tsx` (C14) `handleRemove`/`handleBulkRemove`; `use-api-hooks.ts` `useRemoveFavourite`; `routes/miscData.js` DELETE. Backend tests 5 and 12 red |
| FV-3 | P2 (backend, integrity) | **The saved payload could pose as the stored record.** `getFavourites` and `addFavourite` spread the client's `data` after `id`, `itemId`, `itemType` and `createdAt`, so a payload holding those keys replaced them in `GET /api/favourites`, in the save response, in the account data export and in the admin user view (both read `getFavourites`). The Dashboard then took such a forged `itemId` for the saved job, and removing by it missed the real row. A repeated save also answered with a newly generated id and the request's type instead of the stored row's. | Backend tests 2, 7 and 11 red |
| FV-4 | P2 | **The Dashboard bookmark stored invented details, and its activity text invented a company.** It saved `company: … \|\| 'Confidential'` and `location: … \|\| 'Remote'` as if the listing said so. "Recent Career Activity" read `f.data?.company \|\| 'Company'`, and the API never returned `data`, so every bookmark read "Bookmarked job at Company". The removal path did not encode the id, and every bookmark button had the same name ("Save job to favourites"). | `overview.tsx` (C14) `handleToggleFavourite`, the activity builder, the bookmark button |
| FV-5 | P3 (backend, non-production) | **The in-memory fallback lost favourites' content.** `InMemoryRepository` kept a set of ids per user: `getFavourites` returned bare strings, and the type and payload were dropped. It serves the E2E harness when MariaDB is unreachable (never production). | Backend tests 2–8 red against it |
| FV-6 | P3 (deferred with Browse Job Portal) | **A saved job cannot be opened, and the portal cannot save one.** The job portal's "Save" button (`pages/jobs/portal.tsx:320`) has no handler, and the portal ignores `/jobs/portal/:jobId` and `?id=`, so there is no page for a single job to link to. The Dashboard bookmark is the only control that saves a job. | Code reading; recorded with the deferred Browse Job Portal surface (§5) |

The legacy page (DIR-056) read documents and jobs separately, looked up each job, resume or cover letter whose payload had no title (one request per item), offered All / Documents / Jobs with counts, opened jobs at `/dashboard/jobs/portal/:id` and documents in their builders, removed optimistically with a rollback, and had Refresh. Its job lookups went through `GET /api/jobs-data/:id`, so a closed job showed only "Saved job".

## 2. Changes

### 2.1 Backend: one owner-scoped read with what each favourite points at (TDD)

New `backend/test/favourites-candidate-api.test.js` (13 tests). Requests carry signed `rptest.` tokens from the repository's own non-production verifier (`security/auth.js` `issueLocalTestToken`) and pass through the unchanged `requireAuth`; nothing is stubbed in the auth path. Twelve tests were red against the base code (`/tmp` output, not committed: 12 `not ok`, 1 `ok`); test 1 (every route needs a valid sign-in) passed before and guards what was already right.

| # | Test | Red before the fix because |
|---|---|---|
| 1 | Every favourites route answers 401 without a token and with a tampered one | (guard) |
| 2 | The list shows the stored columns over the saved payload, the payload as `data`, and the live job | the in-memory list returned bare ids; no `data`, no `job` |
| 3 | A saved job shows its details only while `GET /api/jobs-data/:id` would show it to the same caller, and both routes agree for six jobs (open, closed, draft, expired, missing, the caller's own closed listing) | no `job` |
| 4 | A saved document shows its title only while it is still the caller's (own resume, another account's resume, own cover letter, deleted resume) | no `document` |
| 5 | Removing is scoped to the owner and reports whether anything was removed | no `removed` |
| 6 | Ids with reserved characters round-trip when the client encodes them | the in-memory store |
| 7 | Saving the same item again (Undo) restores it with the same payload, keeps one row, and answers with the stored id and type | a new id and the request's type |
| 8 | `?type=` still filters; a payload that is not an object is stored as `{}`; `getFavourites` (export, admin) returns whole owner-scoped records | arrays were stored and spread |
| 9 | A database outage is a 503, never an empty list, and leaks no internal message | 500 |
| 10 | MariaDB: the list is one owner-scoped query joined to the job and to the owner's own documents | method missing |
| 11 | MariaDB: the stored columns win over the payload in `getFavourites` and in the save response | payload last |
| 12 | MariaDB: removing is one `DELETE … WHERE user_id = ? AND item_id = ?` that reports whether a row went | always `true` |
| 13 | The list is a read: it is served while MariaDB refuses writes | method missing (and unlisted methods were treated as writes) |

Changes:

- **`repositories/MySQLRepository.js`.**
  - `_favouriteFromRow`: the payload first, the stored columns last (FV-3). `_favouritePayload` turns anything that is not a plain object (including unreadable JSON and arrays) into `{}`.
  - `getFavouritesWithItems(userId)`: one query. `favourites f LEFT JOIN jobs j ON f.item_type = 'job' AND j.id = f.item_id`, `LEFT JOIN resumes r … AND r.user_id = f.user_id`, `LEFT JOIN covers c ON f.item_type IN ('cover', 'coverletter', 'cover-letter', 'cover_letter') … AND c.user_id = f.user_id`, `WHERE f.user_id = ?`, `ORDER BY f.created_at DESC, f.id DESC`. Named columns only (no `description`, salary or `extra_json`). The job's stored state comes back as it is; the route decides what the caller may see. The document joins are owner-scoped in the SQL, so saving someone else's resume id reveals nothing.
  - `addFavourite` stores `{}` for a non-object payload and answers with the stored row, read back by `user_id` and `item_id`: on a repeated save that is the original id and type.
  - `removeFavourite` returns whether a row was deleted.
- **`routes/miscData.js`.**
  - `favouriteView`: the payload first (older clients, including the legacy page, read its fields at the top level), then `id`, `itemId`, `itemType`, `createdAt`, then `data` (the payload exactly as stored, which Undo saves again), `job` and `document`.
  - `job` is `{ title, company, location, listed }` only while `GET /api/jobs-data/:id` would show that job to the same caller: open on the job board (`isPubliclyVisibleJob`, the same function, now exported from `routes/jobsData.js`) or the caller's own listing. A closed, draft, expired or missing job all answer `null`, so a favourite cannot tell a hidden job from no job. `POST /api/favourites` accepts any id, so without this rule a favourite would have been a way to read someone's draft listing.
  - `document` is `{ title }` for the caller's own resume or cover letter, otherwise `null`.
  - A database outage answers 503 `DATABASE_UNAVAILABLE` ("Saved items are temporarily unavailable") on all three routes, instead of a generic 500.
  - DELETE answers `{ success, isFavourite: false, removed }`. Removing again is not an error.
- **`repositories/ResilientRepository.js`.** `getFavourites`, `getFavouritesWithItems` and `isFavourite` are reads (served while writes are refused); `addFavourite` and `removeFavourite` are writes (they already were, by default).
- **`repositories/InMemoryRepository.js`.** Favourites follow the MariaDB contract: unique per user and item, a repeated save updates the payload only, the stored columns win, owner-scoped removal that reports what it did, and the same joins (FV-5).
- **Real stack after the fix** (scratch `real-probe.mjs`, MariaDB engine through the bridge; all arranged rows removed afterwards):
  - probe P saved eight items; the open job came back with its live details and `listed: true`; the closed job, the draft job (both owned by probe Q) and a missing job came back with `job: null`, and `GET /api/jobs-data/:id` answered 404 for the same two; P's resume and cover letter came back with their titles, Q's resume with `document: null`;
  - a payload holding `itemId`, `id`, `createdAt` and `job` stayed inside `data`;
  - Q's list was empty, and Q's DELETE of P's item answered `removed: false` and left it;
  - P's DELETE answered `removed: true`, a second one `removed: false`, and saving again restored it;
  - without a token: 401.

### 2.2 Client data layer

- **`frontend/src/lib/favourites.ts`.** The contract (`toFavourite`, `listFavourites`, `removeFavourite`, `restoreFavourite`) and `FAVOURITES_QUERY_KEY`.
  - A response without a list is an error, never an empty list.
  - Removing encodes the id and reports `removed` or `already-removed` from the server's answer.
  - Undo posts the same `itemId`, `itemType` and `data`. The item then counts as saved now: it gets today's date and moves to the top.
- **`frontend/src/lib/favourite-display.ts`.** What an entry shows, as pure functions:
  - a job: its live listing while the job board shows it ("Open on the job board"); otherwise the details saved with it, labelled ("No longer listed. … The details shown are the ones saved with it."), or "Saved job" when nothing was saved; the caller's own closed listing says so;
  - a resume or cover letter: its current title and a link into its builder (`/build-resume/:id`, `/cover-letter/:id`, ids encoded); otherwise "Not in your account" and no link;
  - another type: its stored type and saved title, counted under All only;
  - the type filter (All, Jobs, Documents), search over title, company, location and type, counts, and "Saved 21 Oct" from the server's timestamp.
- **`hooks/use-api-hooks.ts`.** The invented `FavouriteItemSchema`, `useFavourites`, `useRemoveFavourite` and the unused query key are gone; nothing else used them.

### 2.3 Page and component

- **`pages/dashboard/favourites.tsx`** (rebuilt; 478 → 295 lines, plus the 102-line entry component).
  - **Header:** "Saved Favorites", the name the navigation item and the breadcrumb already used; a short description; Refresh once the list has loaded.
  - **Toolbar:** All / Jobs / Documents as toggle buttons (`aria-pressed`) in a group named "Show", each with its count ("Jobs 3"), and a search box. Both live in the URL (`?type=&q=`) and survive a reload, direct links and Back/Forward; changes start from the address bar (C13 pattern), and an unknown type falls back to All.
  - **List:** newest saved first; a live count ("5 saved items", "Showing 1 of 5 saved items").
  - **Removing** takes effect at once. The notice says what was removed, and Undo (named "Undo: save X again") sits next to it and receives focus. Undo saves the item again and returns focus to its title. A removal that fails keeps the item and says so; an Undo that fails says so and stays available; an item already removed elsewhere is reported as such, without Undo, and focus moves to the next item.
  - **Freshness:** favourites are saved on other pages, so the list is read on every visit (`staleTime: 0`) and on Refresh.
  - **States:** loading; a failed first load (an alert with Try again, and never the empty state); a failed refresh that keeps the list and says it may be out of date; nothing saved ("Nothing saved yet", pointing to the bookmark in Top Job Matches on the Dashboard, with a link there); no matches (with "Show all saved items").
  - **Removed on purpose:**
    - the grid/list toggle: both views showed the same data, the table view's checkboxes had no labels and its dates were raw ISO strings; one responsive list serves every profile;
    - bulk selection: there is no bulk endpoint, the old loop had no error handling, and per-item removal with Undo covers a short list of bookmarks;
    - a confirmation dialog: removal is reversible at once with Undo, so a dialog would add a step without protecting anything (the directive also warns against unnecessary dialogs).
- **`components/favourites/saved-item.tsx`.** Each item is an `<article>` named by its title: the type, title, company and location, the saved date (`<time datetime>`), the state badge (icon and text) with its explanation, and the actions. Actions sit beside the text from 640 px up and below it on phones.

### 2.4 Around the page

- **Dashboard bookmark** (`overview.tsx`, FV-4):
  - it saves only what the listing says (`title`, plus `company` and `location` when they exist) and encodes the id when removing;
  - each bookmark is a toggle named after its job ("Save UX Researcher", `aria-pressed`);
  - "Recent Career Activity" uses the job's live details, then the saved ones: "Bookmarked a job at Northwind Test Labs", or "Bookmarked a job" when no company is known; saved documents read "Saved to your favorites".
- **Shared shell, router:** unchanged (the navigation item, breadcrumb and `/dashboard/favorites` alias already existed).

### 2.5 Test tooling

`frontend/tests/candidate/arrange-applications.ts` (additive): `createJob` is exported; new `SAVED_JOBS`, `arrangeSavedJobs` (three jobs owned by the test employer, who closes one through the job route), `updateJob` (an owner's edit through the same route) and `arrangeOwnClosedJob` (a job row owned by candidate A, closed through the route). Job rows are the only data inserted directly, as since C10.

## 3. Tests

### 3.1 `frontend/tests/candidate/favourites.spec.ts` (new): 15 tests × 5 profiles

Each test arranges its own data through the real API: A saves, oldest first, A's resume, a cover letter that is not in A's account (its id has a space and a slash), the closed reliability job and the engineer job with the details the Dashboard saves, and the researcher job with an empty payload as the legacy bookmark saved it. Every test removes what it saved, for A and B.

1. **Reading.** Newest first; counts; breadcrumb `aria-current`. Open jobs show the live listing (`datetime` equals the stored `createdAt`); the job saved with nothing still shows its title and company. The closed job shows its saved details, labelled, and the API row has `job: null`. The resume links into its builder; the cover letter is "Not in your account" with no link. No overflow.
2. **URL state.** Jobs filter, search, reload; Documents; no match and "Show all saved items"; a direct link; away, Back, Forward, Back; an unknown type.
3. **Remove and Undo.** The notice, the count, and focus on Undo; the API no longer lists it. Undo: the notice, focus on the item's title, the same payload stored, listed first; still there after a reload. A second removal stays removed after a reload, and the resume itself is still in the account. The cover letter's encoded id is removed too.
4. **A removal that fails** (503, fault injection): the alert, the item stays (API), focus stays, no Undo; the retry removes it.
5. **An Undo that fails** (503 on POST, fault injection): the alert, Undo still offered, nothing saved; the retry restores the item with its saved details.
6. **Already removed elsewhere:** the info notice, no Undo, focus on the next item.
7. **States:** loading (a slowed real response); a failed load with Try again, which never shows the empty state or a count (FV-1); a failed refresh that keeps the list; a successful refresh.
8. **Nothing saved:** the empty state, no toolbar, the link to the Dashboard.
9. **Labelled mock:** another item type, a resume with an empty title and no timestamp (its link encodes the id), and a job saved with nothing whose listing is gone; counts.
10. **Dashboard bookmark → Saved Favorites.** The employer removes the job's location first. The bookmark toggles (`aria-pressed`), stores `{ title, company }` only (no invented location), the activity names the real company, the page shows the live listing without a location, and removing it here clears the bookmark.
11. **Documents open in their builders:** the resume link opens `/build-resume/:id` with that resume's stored last name in the form; Back returns to the filtered list.
12. **The candidate's own closed listing** shows its details ("This is your own listing…"), and candidate B, saving the same job, gets `job: null` and nothing of it.
13. **Navigation:** sidebar or drawer → Saved Favorites with `aria-current`, the breadcrumb, and the `/dashboard/favorites` alias.
14. **Keyboard and axe:** axe on the page and with the removal notice and Undo shown; the Tab order through the filters, the search and each item's controls; Space presses a filter; Enter removes, Enter on Undo restores, and focus follows.
15. **Candidate B:** only B's items; B's saved copy of A's resume id shows "Not in your account" and never A's title; B's DELETE of A's item removes nothing; B removes their own item and A's five stay.

### 3.2 Specs reconciled

- `candidate-dashboard.spec.ts` (main's): its favourites test clicked the removed grid/list toggle and filter buttons named "all", "jobs" and "documents" on an empty page, and never looked at data, so it passed while the page could not show a single item. It now checks the heading, overflow and the `/dashboard/favorites` alias; behaviour is in `favourites.spec.ts`.

### 3.3 Mutation checks (each guarantee removed in turn; the named check must fail)

Scratch runner (not committed). It applies one change, runs the named spec test at 1366 against the real stack (F) or the backend file (B), records the result and restores the file. Afterwards `sha1sum -c` confirmed every touched source file matched its checksum from before the run.

| # | Mutation | Check that failed | Caught |
|---|---|---|---|
| F1 | The client drops the job's live details | spec 1 | yes |
| F2 | The empty state shows when the load fails (FV-1) | spec 7 | yes |
| F3 | Removing does not encode the id | spec 3 | yes |
| F4 | Undo saves an empty payload | spec 5 | yes |
| F5 | Focus does not move to Undo | spec 3 | yes |
| F6 | The type filter is not read from the URL | spec 2 | yes |
| F7 | `removed: false` is ignored | spec 6 | yes |
| F8 | The Dashboard bookmark invents "Remote" again (FV-4) | spec 10 | yes |
| F9 | Search ignores company and location | spec 2 | yes |
| F10 | A job that is no longer listed is shown as open | spec 1 | yes |
| F11 | The builder link does not encode the id | spec 9 | yes |
| B1 | The payload is spread after the stored columns (FV-3) | backend 11 | yes |
| B2 | The visibility rule is removed from the list | backend 3 | yes |
| B3 | The MariaDB DELETE is not owner-scoped | backend 12 | yes |
| B3b | The in-memory removal is not owner-scoped | backend 5 | yes |
| B4 | The resume join is not owner-scoped | backend 10 | yes |
| B4b | The in-memory document lookup is not owner-scoped | backend 4 | yes |
| B5 | DELETE always answers `removed: true` | backend 5 | yes |
| B6 | A database outage becomes a 500 again | backend 9 | yes |
| B7 | The visibility rule is removed, on the running API (restarted on the mutated file, then restored and restarted) | spec 1 (the closed job's details reached the candidate) and spec 12 (B received A's own closed listing) | yes |

**20 of 20 caught.**

### 3.4 Modal checklist

Not applicable: this surface has no dialog. Removal is immediate and undoable (§2.3). The checklist items that still apply to the inline flow are covered: real data (spec 1), failed operations never report success (specs 4, 5, 7), focus moves to what replaced the control (specs 3, 6, 14), usable at 390 and 320 (all tests at five profiles; after-captures).

### 3.5 Accessibility

- **axe** (WCAG 2.0/2.1 A and AA): 0 violations on the page and with the removal notice and Undo shown, at five profiles (spec 14). The first run flagged `label-content-name-mismatch` on the filter buttons (an `aria-label` "Jobs (3)" against the visible "Jobs3"); the buttons now take their name from the visible text, "Jobs 3".
- **Keyboard:** native buttons, links and inputs only; the Tab order follows the page (spec 14); the filters are toggle buttons that Space and Enter press; focus moves to Undo after a removal, to the item's title after Undo, and to the next item or the heading when an item disappears without Undo.
- **Names:** each item is an `<article>` named by its title; controls name the item and begin with their visible text ("Remove X from your saved items", "Undo: save X again", "Open in Resume Builder: X"); Dashboard bookmarks are toggles named after their job.
- **Announcements:** the always-rendered `NoticeRegions` (polite status, assertive alert), the live count, and load and refresh failures as alerts. Undo is rendered beside the notice, so only the message is announced.
- **Tokens:** Cuba M3 only (`bg-surface`, `bg-canvas-soft`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `border-border`, brand 50/600/700 and the success and error 50/100/700 pairs).

### 3.6 Authorization, isolation and persistence

- **Reads:** scoped to `req.user.uid` in the SQL (`WHERE f.user_id = ?`), with the document joins scoped to the same user and the job details filtered by the rule of `GET /api/jobs-data/:id` (backend tests 3, 4, 10; spec tests 1, 12, 15; mutations B2, B4, B4b, B7).
- **Writes:** removal is owner-scoped (backend tests 5, 12; spec test 15; mutations B3, B3b). A save can only add to the caller's own list.
- **Persistence:** spec tests 1, 3, 5 and 10 re-read through the API, and tests 2, 3 and 7 reload.
- **Auth:** unchanged; all four routes answer 401 without a token or with a tampered one (backend test 1, real-stack probe).
- **Migrations:** none. The `favourites` table, its unique key `(user_id, item_id)` and its foreign key are unchanged.

## 4. Gates

| Gate | Result |
|---|---|
| `cd frontend && npx tsc -b` | exit 0. The new spec, the arrangement module and the fixtures also type-check under `strict`: 0 diagnostics |
| `cd frontend && npm run build` | exit 0 in 20.2 s wall (`tsc -b`, `vite build` 1.93 s, `sync-dist`: 327 files copied, 0 superseded entry chunks pruned). Entry chunk 671.04 kB (C14: 671.56 kB; −0.52 kB because the invented favourites schema and its two hooks left the shared hooks module). Saved Favorites is its own lazy chunk (14.67 kB, 5.06 kB gzip). The >500 kB chunk warning predates C15 |
| `cd frontend && npx oxlint` | 308 warnings, 0 errors (C14: 314). The replaced `favourites.tsx` carried six unused imports; the changed files have none. A run made while the regression was in progress found one new warning (`del` left unused in `use-api-hooks.ts` by the removed hook). That import was removed after the regression; the production entry chunk is byte-identical before and after (same file name and hash, `index-BeJM4C-B.js`) |
| Candidate regression, 5 profiles, final behaviour (`playwright.candidate.config.ts`, no filters) | **870 passed, 2 skipped, 0 failed, 0 flaky** in 74.6 min (`P002-C15-candidate-regression-playwright.json`). The 2 skips are C13's drag-and-drop test at 390 and 320, by design. Per spec: favourites 75, candidate-dashboard 35. C14: 795 passed and 2 skipped; added since: the 75 Saved Favorites tests |
| Saved Favorites spec during development | 15/15 at 1366, then 75/75 at five profiles; 15/15 at 320 after the last spec change (the encoded cover-letter id and the bookmark without a location) |
| Mutation checks | 20 of 20 caught: 11 frontend on the final spec, 8 backend unit, 1 backend through the real stack (§3.3) |
| `backend/test/favourites-candidate-api.test.js` | 13/13 (12 red before the fix) |
| Backend files that touch the repositories, jobs-data or favourites | 10 files, 77 tests, all pass (AI audit isolation, export pipeline, geo-regional, interview multitenant, job applications, job tracker integrity, jobs-data authorization, live interview routes, resilient repository, DIR-008 resume CRUD) |
| `cd backend && npm test` (fresh bridge :3307) | 983 tests: 946 pass, 37 fail. The 37 failures are identical by name to the C14 code run the same way in this sandbox (AI tenant/BYOK, AI route contract, enterprise role view, data lineage, MariaDB 11.4 integration); the 13 new tests pass, and so does the real-MariaDB `CERTIFICATION: favourites are MySQL-backed and owner-scoped`. The C14 run reported 957/920/37 here because, under the runner's `--test-force-exit`, it dropped 13 trivially passing tests of `ai-remediation-phase3.test.js` (P3-19 to P3-31), which this run reported; C14 recorded 970/933/37 |
| Endpoint contract (`scripts/audit/candidate-endpoint-contract.mjs`) | 81 calls, 56 unique, 694 routes, 0 unmatched, 0 unresolved (C14: 80 / 56; the new call is Undo's `POST /api/favourites`, a path the Dashboard bookmark already used) |
| Root sweep (all 229 `tests/*.test.*` files, run on a scratch worktree of C14 and on the final tree) | 34 failing files in both, the same files, and the same 70 failing subtests (no new failure). Passing subtests: 3904 against 3870; the difference is in three files whose test counts vary under `--test-force-exit` (`full-control-surface-execution` 2031 against 2007, `dr-hardening` 88 against 75, `admin-settings-navigation` 32 against 35), all with 0 failures |
| Root files that read the touched code | `forensic-rc` 8/8, `dir059-applied-jobs` 7/7, `admin-workflow` 14/14, `dir058-dashboard-stats` 5/5, `cross-module-journeys` 4/4, `account-isolation` 2/2, `account-lifecycle-regression` 2/2. `dir056-favorites` 7/9: its 2 failures pin the legacy page and fail identically at C14 |
| `npm run test:security:static` (with the C15 files staged, so the credential sentinel scans them) | 68/68 |
| Screens | before 7 (`with-three-saved-jobs` × 5, `settled-after-retry` × 2); after 13 (`with-saved-items` × 5, `documents-filter` × 2, `jobs-search-fabrikam` × 2, `removed-with-undo` × 2, `empty` × 2). Every after-capture is clean: 0 console errors, 0 failed requests, 0 px overflow |
| Data left behind | None in the specs' or the captures' scope: after the regression the database held no `job_e2e_msg_*` job, no favourite for any account, no C15 resume or cover letter, no arranged application and no tracker entry for the `p002.*` accounts (checked with SQL through the bridge). The two probe identities remain as user rows without data |

## 5. Findings outside this surface or this commit (recorded, not fixed here)

| ID | Sev | Finding | Status |
|---|---|---|---|
| FV-6 | P3 | The job portal's Save button has no handler, and no route shows a single job, so saved jobs cannot be opened (§1). | Recorded with the deferred Browse Job Portal surface |
| O-12 | **P1** (security, employer scope) | **Any signed-in account can create and publish a job listing.** `POST /api/jobs-data/:id` creates the job when the id is new and stores the request's `status`; it checks ownership only for an existing id and requires no employer claim. A candidate (role USER) created an `active` listing that appeared in the public `GET /api/jobs-data` (scratch `o12-probe.mjs`; the listing was deleted again by its owner). Without a token the same POST answers 503 "Job data is temporarily unavailable" instead of 401, because the path is public and the handler reads `req.user.uid`. | Recorded for the maintainers: the route belongs to the employer workflow, which this directive leaves out of scope. The C15 tests use it only as the owner of rows they arranged |
| O-13 | P3 | **Undo creates a new row.** The restored item gets a new id and today's saved date, so it moves to the top. The page says it "is back in your saved items" and shows the new date; the original date is not kept. | Recorded (accepted; restoring a client-supplied timestamp would let any client backdate favourites) |
| O-14 | P3 | **`(user_id, item_id)` is unique regardless of type.** Saving a resume and a job with the same id is impossible, and a repeated save with another type keeps the stored type (now reported honestly in the save response). Ids differ in practice (`job_…`, resume and cover ids). | Recorded |
| F-4, F-5, O-9 – O-11 | | Unchanged since C14 | Open |

## 6. Remaining (recorded, not hidden)

- **Saved jobs have no "open" action** until the job portal gets a page for a single job (FV-6).
- **No pagination.** Legacy had none; the filter and search narrow the list.
- **No live updates.** The list is read on every visit and on Refresh.
- **Saved documents have no writer in the current product** (neither the legacy nor the modern frontend saves one); the page shows such rows honestly when older clients or the API created them.
- **Time zones.** "Saved 21 Oct" uses the browser's time zone; verified with the sandbox browser in UTC only.
