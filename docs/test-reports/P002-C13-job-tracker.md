# P002 · C13 — Job Tracker: every stored field editable, honest dates, safe concurrent edits, and a cover-letter sync that invents nothing

- **Surface:** candidate queue #3, `/dashboard/job-tracker` (`frontend/src/pages/dashboard/job-tracker.tsx`). Legacy reference (read only): `src/components/AppliedJobs/JobTracker.jsx` and `src/utils/jobTracker.js` (DIR-020). `/dashboard/applied-jobs` still renders this page (main's alias); the submitted-applications view it stood for in legacy is the next commit (C14, recorded as O-3 since C10).
- **Base:** merge `4df113aa07d9c55bbc323c2e15e0cb4a7f21b654` (C12 `b36aa1224d087c078182cfd48edca388bcf0fd3f` + `origin/main` `7ee109b483ec5aca71e5f1393261ce54f9a60790`, cover-letter templates). Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306. Preview identities only. The sandbox clock and the backend process run in UTC; one backend probe ran in `Asia/Kolkata` (§2.1, JT-4).
- **Selection:** of the remaining candidate pages (Job Tracker, Favourites, Support), the Job Tracker had the most open evidence: C1 row 3 (P2), the O-3 note from C10, and main's `7ee109b`, which wired the cover-letter pages into it with invented fallback values. The before-captures then showed the 320 px menu clipped and the 390 px list broken, and the probe below showed the backend overwriting what the candidate entered.
- **Backend contracts used** (all existing, owner-scoped, revision-checked):
  - `GET /api/jobs-data/tracker` → `{ jobs: [...] }`, each with `revision`, `createdAt`, `updatedAt`.
  - `POST /api/jobs-data/tracker` → 201 `{ job }`.
  - `PATCH /api/jobs-data/tracker/:id` `{ ...changedFields, expectedRevision }` → `{ job }`; a stale revision → 409 `JOB_TRACKER_CONFLICT` with `remoteRevision`; another owner's or a missing id → 404.
  - `DELETE /api/jobs-data/tracker/:id` `{ expectedRevision }` → same 409/404 rules.
  - Fields (DIR-020): title, company, status (`wishlist | applied | interview | offer | rejected`), location, workMode, salary, url, notes, dateApplied, deadline, contactPerson, contactEmail, interviewRound, interviewFormat, interviewAt (wall-clock `DATETIME`), interviewLink.
- **Backend changes:** `backend/repositories/MySQLRepository.js` and `backend/routes/jobsData.js`, every change test first (§2.1).

## 1. What the candidate saw before C13

Evidence: `docs/ui-audit/screenshots/job-tracker/before/` (13 screens plus `capture-report.json`: `board` × 5, `list-view` × 2, `action-menu` × 2, `add-dialog` × 2, `delete-dialog` × 1, `applied-jobs-route` × 1), taken on the base code as candidate A with four arranged jobs; the old page is `git show 4df113a:frontend/src/pages/dashboard/job-tracker.tsx` (716 lines). Scratch probes: `tracker-probe` (API reads), `shape-probe` (create → GET → PATCH → GET), `ist-probe` (§2.1).

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| JT-1 | P1 | **A tracked job could not be edited.** Fields could only be set when the job was added; there was no edit action, and notes were stored but never shown again. | Old page: no edit path; `notes` only in the add form |
| JT-2 | P1 | **At 320 px the action menu was cut off.** The board scrolled sideways (`overflow-x-auto`) and the hand-made menu was positioned inside it, so its stage options were clipped and partly off screen. | `before/mobile-320__…__action-menu.jpg` |
| JT-3 | P1 (backend) | **The tracker stored values the candidate never entered, and ignored values they cleared.** (a) A job saved without a work mode was stored as "Remote". (b) An update merged the request onto the raw row (`{ ...rows[0], ...data }`, snake_case keys, `||` fallbacks), so clearing the date applied, contact name or email, work mode, or interview round, format or link kept the old value. (c) Notes lost their line breaks (every control character, including `\n`, became a space). | Unit tests red before the fix (§2.1); `shape-probe` |
| JT-4 | P1 (backend, found in C13) | **On a server that is not on UTC, every update moved the interview.** The pool reads `DATETIME` as UTC (`timezone: 'Z'`), but the update merge formatted the stored value with local-time getters, so a stage move on a server in India changed 15:45 to 21:15. Present on the base commit. | `ist-probe` on a base-commit worktree with `TZ=Asia/Kolkata`: 15:45 → 21:15 after `PATCH {status}`; same probe on UTC: unchanged |
| JT-5 | P2 | **"Track in Job Tracker" (cover letters, main `7ee109b`) invented data.** Missing values became "Target Position", "Target Company" and "Remote / Hybrid"; every job was filed as Applied; a second click added a duplicate; the list page used the letter title ("X at Y") as the job title. | `git show 4df113a:frontend/src/lib/cover-letters.ts` lines 163–178; main's sync test left two entries for A |
| JT-6 | P2 | **Dates were invented or missing.** A job without a date applied showed "Recently"; the stored created and updated times were never used. The create response's `createdAt` was always `null` (backend): `const [stamp] = await query(…)` took the rows array, not the row, although the code's comment promises the database's timestamps. | `before/mobile-390__…__list-view.jpg` ("Recently"); old `formatDateShort`; `shape-probe`: create → `createdAt: null` |
| JT-7 | P2 | **A change made in another tab broke the page.** A 409 showed only a toast and kept the stale revision, so every later action on that job failed until a reload. | Old `handleMoveStatus` / `confirmDelete` |
| JT-8 | P2 | **Weak dialogs, menu and announcements.** The menu had no Escape, arrow-key or focus handling; results appeared in a toast that disappeared after a few seconds; a background refetch replaced the page with a spinner, losing focus. | Old page |
| JT-9 | P2 | **The list view did not fit at 390 px** (titles cut to "BI De…" and "Analytics Co…", overlapping controls), and a stage could not be changed from the list. | `before/mobile-390__…__list-view.jpg` |
| JT-10 | P2 | **Most DIR-020 fields and legacy actions were missing:** apply-by date, date applied, work mode, contact, interview round, format, time and link, the calendar (.ics) export (legacy AC-11), the one-click advance (AC-2) and drag-and-drop between columns. | Legacy `JobTracker.jsx`; old page form |
| JT-11 | P3 | Search and view were not in the URL (lost on reload and Back), there was no sort, and a search with no results showed empty columns without saying so. | Old page |

Not a defect: the tracker works while `enableJobTrackerModule` is off. Legacy used the flag only to hide navigation cards, so the page keeps working.

## 2. Changes

### 2.1 Backend: store exactly what the candidate entered (TDD)

New `backend/test/job-tracker-field-integrity.test.js` (6 tests). Each was run red against the base code before the fix, except test 3, which guards the new merge:

| # | Test | Before the fix |
|---|---|---|
| 1 | A job created without a work mode stores none instead of "Remote" | red: `'Remote'` |
| 2 | Clearing optional fields in an update clears them | red: old values kept |
| 3 | An update that leaves fields out keeps every stored value | green (guards the merge) |
| 4 | Notes keep their line breaks; other control characters are removed (route and repository) | red: `'Questions to ask:  - team size - on-call  rota'` |
| 5 | A created job reports the timestamps the database recorded | red: `createdAt` `null` |
| 6 | An update keeps the stored interview time on a server that is not on UTC (the test switches the process to `Asia/Kolkata`) | red: `'2026-10-24 16:00:00'` for a stored 10:30 |

Fixes, in `backend/repositories/MySQLRepository.js` unless noted:

- `_trackedJobValues`: no work mode is stored as `NULL` (JT-3a). Notes go through a `multiline` sanitizer that keeps `\n` (CRLF and CR become `\n`) and still replaces every other control character (JT-3c). `routes/jobsData.js` `normalizeTrackerInput` uses the same rule.
- `_trackedJobInput(row)` (new): converts the stored row into the request shape. `updateTrackedJob` now merges `{ ...stored, ...request }` in that shape, so a field sent as `''` is cleared and a field left out is kept (JT-3b).
- `normalizeInterviewAt`: a `Date` can only come from the column here, and the pool reads `DATETIME` as UTC, so its UTC fields are used. Strings from requests are parsed as before (JT-4).
- `createTrackedJob`: `const [[stamp] = []] = await query(…)` reads the row, so the response carries the database's `createdAt` and `updatedAt` (JT-6).

**Real-stack probe for JT-4** (`ist-probe`: create with an interview at 15:45, move the stage, read back, delete):

| Backend | After the stage move |
|---|---|
| Base commit `4df113a` (worktree), `TZ=Asia/Kolkata`, :8083 | `2026-11-03T21:15:00.000Z`: moved by +5:30 |
| C13 code before the fix, `TZ=Asia/Kolkata`, :8082 | `2026-11-03T21:15:00.000Z` |
| C13 code after the fix, `TZ=Asia/Kolkata`, :8082 | `2026-11-03T15:45:00.000Z`: unchanged |
| UTC backend :8080 (either version) | unchanged |

Probe servers were stopped and the worktree removed afterwards; each probe deleted its own job.

### 2.2 Client data layer

- `frontend/src/lib/job-tracker.ts` (new, 238 lines):
  - the contract types and the five stages, labelled as in legacy: Wishlist, Applied, Interviewing, Offer, and Archived (stored as `rejected`);
  - `toTrackedJob`: reads dates as `YYYY-MM-DD` and the interview as a wall-clock `YYYY-MM-DDTHH:mm`, whatever form the server returns;
  - `validateTracker`, which mirrors the server: title and company required; http(s) links; email format; date formats; rounds and formats from the server's lists;
  - `changedFields`, so an edit sends only what changed;
  - API calls that turn failures into `TrackerError` kinds (`validation`, `conflict` with `remoteRevision`, `not-found`, `unavailable`);
  - `nextStage` (§2.3) and `TRACKER_QUERY_KEY`.
- `frontend/src/lib/job-tracker-display.ts` (new, 197 lines), pure functions:
  - dates as local calendar dates with no time-zone shift. A card says "Applied 5 Oct" when a date applied exists, otherwise "Added 20 Oct" from the server's `createdAt`, otherwise nothing;
  - the apply-by date, marked "(date passed)" only while the job is still on the wishlist;
  - interview time and "Upcoming";
  - search over title, company, location, notes, contact and salary;
  - five sorts (recently updated; date applied; apply-by; interview; company), with empty values last;
  - the stage summary;
  - the RFC 5545 calendar file: CRLF lines, escaped text, 75-octet folding, a floating local start and end (so the event stays at the time the candidate entered), a stable `UID` and a UTC `DTSTAMP`.

### 2.3 Page and components

- `frontend/src/pages/dashboard/job-tracker.tsx` (rewritten, 716 → 422 lines):
  - **Data:** React Query on `TRACKER_QUERY_KEY`. Loading, load error with Try again (never an empty tracker), empty state, and "No tracked jobs match “…”" with Clear search. A background refetch keeps the page.
  - **Views:** a five-column board on container queries (no sideways scrolling) and a list. View, search and sort live in the URL (`?view=list&q=&sort=`, replace entries). Changes start from the address bar, not the render's copy, so a quick second change cannot drop the first; the spec's first run caught exactly that.
  - **Moves:** shown at once. A failure rolls back and says the job stays in its stage. A conflict restores the job, reloads the latest version and says why. A job removed elsewhere is taken off the board.
  - **Focus:** returns to the control that opened a dialog. After a removal it moves to the next job's actions, or to the heading. After the first job is added from the empty state it moves to that job. After a move it stays on the control that was used.
  - **Announcements:** the shared `NoticeRegions` from C11, a polite status and an alert that are always rendered.
  - **Drag and drop** (board, pointer only, legacy parity): the target column is outlined, and a hint shows on fine pointers only. Keyboard and touch use the Stage control.
  - **Calendar:** the .ics download is built in the browser from the stored job.
- `frontend/src/components/job-tracker/tracker-entry.tsx` (new, 186 lines): one `<article>` per job, named by its title.
  - Radix actions menu (in a portal, so it is never clipped): Edit details, Schedule or Change interview, Add interview to calendar (.ics), Write a cover letter (the DIR-020 AC-11 deep link `/dashboard/cover-letters?role=&company=`), Open job posting, Remove from tracker….
  - Location and work mode, shown once when they repeat ("Remote", not "Remote · Remote"); salary; dates as `<time>`; the interview panel with an "Upcoming" badge and a "Join the meeting" link; contact with `mailto:`; notes in a `<details>` with line breaks kept.
  - A labelled Stage select ("Stage for {title} at {company}").
  - The one-click advance from legacy AC-2: "Move to {next}: {title} at {company}", for Wishlist → Applied → Interviewing → Offer. Offers and archived jobs have none, because archiving an offer is a decision, not progress. While a move is being saved the button is `aria-disabled` and dimmed.
- `frontend/src/components/job-tracker/tracker-form-dialog.tsx` (new, 244 lines): one Radix dialog for adding and editing.
  - All 16 fields, in four fieldsets (Job, Progress, Contact, Interview) plus notes with a character count.
  - Inline errors with `aria-invalid` and `aria-describedby`; a form-level alert with the count; focus moves to the first invalid field.
  - Edit sends only the changed fields with the revision it started from. An unchanged form closes with "No changes to save." and sends nothing.
  - On a 409 the edits stay, the newer revision is adopted, and the message explains that saving again applies them on top. On a 404 saving is disabled and the job leaves the board.
  - "Schedule interview" opens with focus on Round. The dialog cannot be dismissed while saving.
- `frontend/src/components/job-tracker/tracker-delete-dialog.tsx` (new, 99 lines): a Radix confirmation showing the title, company, stage and date. It states that removal cannot be undone and does not withdraw a sent application.
  - A failure keeps the dialog open with the error.
  - A job already removed elsewhere closes with "had already been removed in another tab or device".
  - A job changed elsewhere shows its latest stage and date and asks again.

### 2.4 Cover-letter sync (JT-5)

`frontend/src/lib/cover-letters.ts`, `cover-letters.tsx` and `cover-letter-builder.tsx`:

- `syncToJobTracker` requires the letter's job title and company; otherwise it says what to add and stores nothing.
- An existing entry with the same title and company (case-insensitive) is reported: "“X at Y” is already in your Job Tracker (Wishlist), so nothing was added."
- A new entry goes to Wishlist, not Applied, because writing a letter is not applying. Its location comes from the letter's company city, and its note is `Cover letter: <letter title>`.
- The list summary now carries `jobTitle` and `companyCity`, so the list page tracks the real job title, not "X at Y".
- Both pages invalidate `TRACKER_QUERY_KEY` after adding, so an open tracker refreshes.

### 2.5 Test and capture tooling

- `frontend/tests/candidate/fixtures.ts`: `ApiClient` gains `patch` and `del(path, data?)`; revision-checked deletes need a body.
- `scripts/audit/capture-candidate-screens.mjs`: a `menu-click:<item>` step (role `menuitem`) for states behind a menu.

### 2.6 Removed

The hand-made menu, the auto-hiding toast, "Recently", the sideways-scrolling board, the sync's invented fallbacks and duplicates, and the old page's test ids. Main's spec now uses accessible names (§3.2).

## 3. Tests

### 3.1 `frontend/tests/candidate/job-tracker.spec.ts` (new): 19 tests × 5 profiles

Every test arranges its own jobs through the API, with a unique tag in the title and company, opens the page filtered to that tag (`?q=`), and removes its jobs in `afterEach`. Candidate A's other jobs (the four capture jobs) are never touched. "Another tab or device" is the same candidate changing the job through the API while the page is open. Failure paths are labelled Playwright routes (FAULT INJECTION).

| # | Test | What it proves |
|---|---|---|
| 1 | Adds a job with every detail, checks the form first, and keeps it after a reload | Empty submit: "Check the 2 highlighted fields.", focus on the first, `aria-invalid`, descriptions; bad link and email; 0 requests while invalid. Escape discards and reopening is clean; the page behind does not scroll. All 16 fields stored exactly (API read-back, including the wall-clock interview time and the notes' line breaks), shown on the card, kept after reload |
| 2 | Edits a job, clears optional details, and skips a save with no changes | Unchanged → "No changes to save." with 0 PATCH. Clearing work mode, date applied, contact email, round, format and link really clears them (API), other fields and the interview time are kept, revision 2. The card falls back to "Added …", not "Recently" |
| 3 | Moves a job between stages on the board and in the list | Column, announcement, focus, API and reload; then the list view's Stage control |
| 4 | Moves a job to the next stage in one click | Wishlist → Applied → Interviewing → Offer with click, Enter and Space. Focus stays on the advance control; none for Offer; revision 4 |
| 5 | Drags a job to another stage (pointer) | HTML5 drag from Applied to Offer, announcement, API and reload. Skipped at 390 and 320, where touch uses the Stage control (tests 3 and 4) |
| 6 | A failed move leaves the job where it was | Aborted PATCH → rolled back, alert names the stage, focus kept, server unchanged |
| 7 | A move after another tab changed the job | 409 → alert, latest version (the other tab's notes) shown, the retry succeeds on revision 3 |
| 8 | An edit saved after another tab changed the job | 409 keeps the typed location; saving again merges it with the other tab's salary (API) |
| 9 | Removes a job only after confirming | Description and stage in the dialog; Cancel, Escape and four Tab presses keep focus inside; removal announced; focus to the next job; gone after reload |
| 10 | A failed removal; a job removed elsewhere | 503 → the error stays in the dialog and the job is still stored. Cancel restores scrolling and reopening is clean. After another tab removes it → 404 → "had already been removed…", focus to the heading |
| 11 | Removing a job changed in another tab | 409 → the dialog shows the latest stage (Offer) and asks again; the second confirmation removes it |
| 12 | Search, sort and view in the URL | List and sort in the URL, order by company and by apply-by date, kept after reload; multi-word search; Back and Forward restore all three; no results → Clear search |
| 13 | Empty state (candidate B) | B's tracker is empty (API), no search or summary; "Track your first job" adds one; focus moves to the new job; "1 job tracked." |
| 14 | The tracker can't be loaded | 503 on GET → alert with Try again, no empty-state claim; Try again loads the job |
| 15 | Calendar file | File name; `DTSTART:20261103T154500` and `DTEND` 1 hour later; `UID`; escaped `SUMMARY` and `DESCRIPTION`; `LOCATION`; CRLF; every line ≤ 75 octets; the summary counts all of A's upcoming interviews from the API |
| 16 | Write a cover letter | Opens `/cover-letter/new?role=…&company=…` with both fields filled, 0 POST to `/api/covers`; Back returns to the filtered tracker |
| 17 | Isolation | B cannot see A's job; B's PATCH and DELETE → 404; no token → 401 for list, PATCH and DELETE; A's job unchanged at revision 1 |
| 18 | Keyboard and axe | Menu with Enter, arrows and Escape (focus back to the trigger); "Change interview" opens with focus on Round; axe WCAG 2.0/2.1 A+AA: 0 violations on the page, the form and the removal dialog |
| 19 | Layout | No horizontal overflow for the board, the list and the form with a very long title and email; the menu and the dialog lie inside the viewport; the form's Save button can be scrolled into view |

Results on the final code: §4.

### 3.2 Main's specs reconciled with the rebuilt page

- `candidate-dashboard.spec.ts`, "tracks a job, verifies stage column, tests Cover Letter link, moves stage, and deletes with Radix Dialog": main's test id, `Options for X`, "Tailor Cover Letter", `#job-status` and "Delete Tracked Job" no longer exist. The same seven steps now use accessible names (dialog "Track a job", the Applied column, menu item "Write a cover letter" with the same `href` checks, Stage control, List, "Remove from tracker…" and "Remove job"). An `afterEach` removes the test's job through the API if a step fails. The alias test (`/dashboard/applied-jobs`, `/dashboard/job-matching`) is unchanged.
- `cover-letters.spec.ts` test 17, "Job Tracker sync": main's version accepted the invented behaviour, checked only a toast prefix, and left two tracker entries for A on every run. It now proves that:
  - the builder adds exactly one job (title, company, Wishlist, empty location, the `Cover letter:` note, read back through the API);
  - a second click and the list page's button report the existing entry without adding another;
  - a letter without a company is refused with the reason, and nothing is stored;
  - its tracker entries are removed in `finally`.

### 3.3 Mutation checks (each guarantee removed in turn; the named test must fail)

Frontend (scratch runner `/tmp/c13/mut/run.py`: apply, run the named test at 1366, revert; the source hashes were verified identical afterwards):

| # | Mutation | Caught by | Result |
|---|---|---|---|
| M3 | A failed move is not rolled back | test 6 | caught |
| M4 | An edit conflict keeps the stale revision | test 8 | caught |
| M5 | A job already removed elsewhere is reported as a failure | test 10 | caught |
| M6 | The view is not read from the URL | test 12 | caught |
| M7 | Focus is not restored after a dialog closes | test 9 | caught |
| M8 | Calendar lines are not folded | test 15 | caught (`DESCRIPTION` line > 75 octets) |
| M9 | The cover-letter sync adds a duplicate | cover-letters test 17 | caught |
| M10 | The cover-letter sync invents "Target Company" | cover-letters test 17 | caught |
| M11 | An unchanged edit is still sent | test 2 | caught |
| M12 | A load failure is shown as an empty tracker | test 14 | caught |
| M14 | The one-click advance skips a stage | test 4 | caught |
| M15 | The one-click advance drops focus to the Stage control | test 4 | caught |
| M16 | A drop on another column does nothing | test 5 | caught |
| M17 | The form dialog keeps its state between openings | test 1 | caught (the abandoned title reappears) |
| M18 | The removal dialog keeps an old error | test 10 | caught |

Backend:

- **M13:** owner scoping removed from `deleteTrackedJob` (both the `SELECT … FOR UPDATE` and the `DELETE`), backend restarted. Test 17 failed: B's DELETE answered 200 instead of 404. The file was restored from a copy and the server restarted.
- The six backend tests in §2.1 were each run red against the unfixed code.

### 3.4 Modal checklist (§10.2): "Track a job" / "Edit …" and "Remove this job from your tracker?"

| # | Item | Evidence |
|---|---|---|
| 1 | The trigger opens the expected interface | Tests 1, 2, 9, 13 and 18: each dialog is found by its accessible name |
| 2 | Visible and correctly positioned | Test 19: the form dialog's box lies inside the viewport at five profiles. After-captures `add-dialog` (1366, 390), `edit-dialog` (320), `delete-dialog` (1366) |
| 3 | Shows correct real data | Edit is prefilled from the stored job, including the wall-clock interview time (test 2). The removal dialog shows the stored stage, and after a conflict the latest one (tests 9, 11) |
| 4 | Inputs and validation | Test 1: required, link and email errors; `aria-invalid`; descriptions; focus to the first invalid field; 0 requests |
| 5 | Primary and secondary actions | Add, Save (with and without changes, after a conflict), Remove job (success, 503, 404, 409), Cancel (tests 1, 2, 8–11) |
| 6 | Cancel and close controls | Tests 9 and 10: Cancel |
| 7 | Escape dismisses | Tests 1, 9 and 18. Escape and outside clicks are ignored only while a request is in flight |
| 8 | Focus enters and returns | Tests 1 and 2 (focus on Job title), 18 (Round for "Change interview"); return to the trigger (tests 1, 2, 9, 18), or to the next job, the heading or the new job when the trigger is gone (tests 9, 10, 13); M7 |
| 9 | Focus stays inside | Test 9: four Tab presses stay in the removal dialog |
| 10 | Background scrolling | Test 1: `body` `overflow: hidden` while open; test 10: restored after closing |
| 11 | Failed operations never report success | Tests 6, 10, 14 (aborted, 503); conflicts and 404s say what happened (tests 7, 8, 10, 11) |
| 12 | Usable at 390 and 320 | All tests at five profiles; test 19 checks the fit |
| 13 | Destructive actions need confirmation | Removal only through the dialog (test 9: Cancel and Escape remove nothing, API) |
| 14 | Reopening shows no stale state | Test 1 (empty fields, no errors) and test 10 (no old error); each opening is a new dialog session (M17, M18) |

### 3.5 Accessibility

- **axe** (WCAG 2.0/2.1 A + AA): 0 violations on the page, the form dialog and the removal dialog at five profiles (test 18).
- **Keyboard:**
  - every action is a native button, select or link, or a Radix menu item (arrow keys, Escape, focus return);
  - the Stage control is a native select; the advance control is a button (Enter and Space, test 4);
  - drag and drop has these single-pointer and keyboard equivalents.
- **Names:**
  - each card is an `<article>` named by its title;
  - columns are regions named "{Stage} (n jobs)";
  - controls carry the job ("Actions for X at Y", "Stage for X at Y", "Move to Applied: X at Y"), and their names begin with the visible text;
  - required fields read "Job title (required)".
- **Announcements:** an always-rendered polite status and an alert (`NoticeRegions`); messages are text, never colour alone.
- **Contrast and tokens:** Cuba M3 tokens (`bg-surface`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `border-border`, the warning and error pairs).

### 3.6 Authorization, isolation and persistence

- Every tracker query is scoped by `req.user.uid` (existing). Test 17 proves B's list, PATCH and DELETE cannot reach A's job, and that every route answers 401 without a token. M13 shows the test catches a lost owner check.
- Every write is revision-checked (existing). The page and dialogs now handle 409 and 404 without overwriting or losing work (tests 7, 8, 10, 11).
- Persistence: tests 1–5 and 9 re-read through the API and reload the page; test 2 proves cleared fields are really cleared.
- Cover letters: the sync writes only through the same owner-scoped API (test 17 in `cover-letters.spec.ts`).

## 4. Gates

| Gate | Result |
|---|---|
| `cd frontend && npx tsc -b` | exit 0 |
| `cd frontend && npm run build` | exit 0 in 20.2 s wall time (`tsc -b`, `vite build` 1.92 s, `sync-dist`). Entry chunk 670.81 kB (C12: 693.05 kB), but this is a split, not a saving: the bundler now puts `useQuery` (22.56 kB) in its own chunk, which `index.html` preloads. Initial JavaScript is 739.04 kB in 4 files, against 738.29 kB in 2 files on the base commit (+0.75 kB; base measured with a worktree build). The only warning, chunks over 500 kB, predates C13 |
| `cd frontend && npx oxlint` | 314 warnings, 0 errors (C12: 314). None in the C13 files |
| Candidate regression, 5 profiles (`playwright.candidate.config.ts`, no filters) | **725 passed, 2 skipped, 0 failed, 0 flaky** in 57.7 min (`P002-C13-candidate-regression-playwright.json`). The 2 skips are test 5 (drag and drop) at 390 and 320, by design. C12: 612/612; added since: 20 cover-letter tests from main's `7ee109b` and 95 Job Tracker tests |
| Job Tracker spec on the final code (backend restarted with the JT-4 fix, final spec) | 93 passed, 2 skipped, 0 failed in 6.4 min (`P002-C13-job-tracker-spec-final-playwright.json`). The regression above ran an earlier version of the spec: the reopening and scroll checks in tests 1 and 10 (§3.4 items 10 and 14) were added after it started |
| Mutation checks | 16 of 16 caught (15 frontend, 1 backend, §3.3); the 6 new backend tests were each red before their fix |
| `cd backend && npm test` (fresh bridge :3307) | 959 tests: 922 pass, 37 fail. The 37 failures are exactly C12's (AI tenant/BYOK, AI route contract, enterprise role view, data lineage, MariaDB 11.4 integration); the 6 new tests pass. C12: 953/916/37 |
| Backend focused | `job-tracker-field-integrity` and `jobs-data-authorization`: 13/13; `job-tracker-field-integrity` with the whole process in `Asia/Kolkata`: 6/6 |
| Endpoint contract (`scripts/audit/candidate-endpoint-contract.mjs`) | 78 calls, 54 unique, 694 routes, 0 unmatched, 0 unresolved (C12: the same) |
| Root sweep (all 229 `tests/*.test.*` files, run while C13 was being finished) | 33 failing files against 34 in the C12 sweep; the difference is `dir008-demo-data-guard`, fixed in C12. No file has a failing subtest that it did not have at C12. The 33 are environment-bound (browsers, servers, AI providers, MariaDB 11.4), plus `dir024-geo-seo` and `dir008-employer-resume-access` (recorded in C12) |
| Root focused (31 files that read the touched code, final code) | 2345/2345 subtests, including `job-tracker.test.mjs`, `dir059-applied-jobs.test.mjs` and `security-static.test.mjs` |
| `npm run test:security:static` (with the C13 files staged, so the credential sentinel scans them) | 68/68 |
| Screens | before 13, after 16 (`board` × 5, `list-view` × 2, `action-menu` × 2, `add-dialog` × 2, `delete-dialog`, `applied-jobs-route`, `edit-dialog` at 320, `no-results`, B's `empty-state` at 390). Every capture is clean: 0 console errors, 0 failed requests, 0 px overflow |
| Data left behind | none. Every test removes its jobs; the four capture jobs were removed after the last capture; B's tracker is empty |

## 5. Findings outside this surface or this commit (recorded, not fixed here)

| ID | Sev | Finding | Status |
|---|---|---|---|
| O-6 | P3 | **The API returns the interview time in two shapes.** `GET /api/jobs-data/tracker` serializes `interviewAt` with a `Z` suffix (`2026-11-03T15:45:00.000Z`, from `ResilientRepository`'s canonicalization), although the column is a floating wall-clock time; create and update answer `2026-11-03 15:45:00`. The modern client reads only the date and time digits, so both display the stored time. Changing the representation is an API contract decision | Recorded |
| O-7 | P3 | **Update responses carry no `createdAt` or `updatedAt`.** The client keeps the known `createdAt` and refetches in the background | Recorded |
| O-8 | P3 | **An interview time sent with an explicit zone is converted to the server's local time.** `normalizeInterviewAt` parses strings with `new Date()`, so `…Z` or `+05:30` input becomes server-local wall time. The modern client sends zone-less `YYYY-MM-DDTHH:mm`, and legacy did the same | Recorded |
| O-3 | P2 | `/dashboard/applied-jobs` still renders this page (main's alias); legacy showed submitted applications there | Next commit (C14), together with three suspected issues on `/api/jobs-data/applications` to verify test-first: `POST /applications/:id` without an ownership check (upsert over another user's row), `PATCH` accepting `status`, `rating`, `notes` and `employer_id`, and the list returning `SELECT *` |

## 6. Remaining (recorded, not hidden)

- **Drag and drop is for pointers only, by design.** Keyboard, touch and screen-reader users have the Stage control and the one-click advance. HTML5 drag events are not fired by touch.
- **No order within a column.** Legacy appended a moved job at the end of its new column and offered no reordering either. The page orders by the chosen sort; `sort_order` is kept on update and not exposed.
- **No pagination.** Legacy had none either; every tracked job is rendered. The board and list keep working with the four capture jobs plus test data, but a very large tracker was not measured.
- **The backend for the full regression ran the code from before the JT-4 fix.** It was started before that change. On a UTC server the old and new `normalizeInterviewAt` give the same result (§2.1), and the spec was re-run on a restarted backend afterwards (§4).
