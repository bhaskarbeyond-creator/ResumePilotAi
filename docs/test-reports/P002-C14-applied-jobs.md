# P002 · C14 — Applied Jobs: the candidate's real applications, a safe applications API, and notifications that lead somewhere

- **Surface:** `/dashboard/applied-jobs` (`frontend/src/pages/dashboard/applied-jobs.tsx`), legacy "Submitted Applications" (`src/components/AppliedJobs/AppliedJobs.jsx`, DIR-059; read only). Part of queue row 3 (Job Tracker family); recorded as O-3 since C10 and left open by C13, where the route still rendered the Job Tracker.
- **Base:** `b8f633c0487a65503108e4eb6c1fd5d5b34f9596` (C13), which contains `origin/main` `7ee109b483ec5aca71e5f1393261ce54f9a60790`. Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306. Preview identities only: candidates A and B, and the test employer `p002.employer@example.test`, all on the reserved `.test` domain.
- **Selection:** of the remaining candidate work (Applied Jobs, Favourites, Support), Applied Jobs carried the most open evidence: the ⚠ route in the C1 inventory, O-3 (application notifications without a destination, since C10), and three suspected backend defects on `/api/jobs-data/applications` noted in C13. Two of those turned out to be P0 (§1).
- **Backend contracts used:**
  - `GET /api/jobs-data/applications/list`: the caller's own applications. Since C14 each carries the job it was made for and none of the employer's columns (§2.1).
  - `DELETE /api/jobs-data/applications/:id`: owner-scoped withdrawal (existing; 403 for another applicant, 404 when missing).
  - `GET|POST /api/jobs-data/tracker` (C13 contract) for "Add to Job Tracker"; `GET /api/resumes` for the name of the attached resume.
  - Applying is unchanged: `POST /api/jobs/:jobId/applications` (open job, one application per job, notifications). The employer moves the status through `PATCH /api/job-applications/:id/status`.

## 1. What the candidate saw before C14, and what the API allowed

Evidence: `docs/ui-audit/screenshots/applied-jobs/before/`: 7 screens and `capture-report.json`. The `route` capture is at all five profiles and `application-notifications` at 1366 and 390. Both were taken as candidate A, after A had really applied to three jobs and the employer had invited A to one interview and turned down another. Scratch probes against the real stack (not committed) are cited as `app-probe`, `contact-probe` and `close-probe`.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| AP-1 | **P0** (backend, security) | **Any signed-in user could take over another candidate's application.** `POST /api/jobs-data/applications/:id` had no ownership check. Its upsert writes every column, including `applicant_id`, so a second user's POST moved the row to them, with their cover letter and any status they chose; the real applicant lost it. The same route created applications outside the apply workflow: no open-job check, no one-per-job id, no notification, and any status, rating, notes, job or employer. | `app-probe`: B's POST on A's id → 200; A's list then had 0 rows, and B's had the row with `status: accepted` and B's cover letter. Backend tests 2–3 red |
| AP-2 | **P0** (backend, security) | **An applicant could set the employer's decisions.** `PATCH /api/jobs-data/applications/:id` checked ownership, then merged the whole request body into the row. A candidate could accept their own application, give it a rating, write the employer's notes, re-point it to another job or employer (`jobId`, `employerId`), or replace the resume link the employer opens (`resumeUrl`). The response echoed every column. | `app-probe`: A's PATCH `{status: accepted, rating: 5, notes, employerId: B}` → 200, and all four were stored. Backend test 4 red |
| AP-3 | P2 (backend, privacy) | **The list returned every column** (`SELECT *`): the employer's `rating` and `notes`, the employer's user id, `extra_json` and `revision`. No current employer workflow writes rating or notes, so nothing private was exposed in this sandbox, but anything written there reached the candidate. | `app-probe` list shape; backend test 1 red |
| AP-4 | P1 | **No page showed the applications a candidate had sent.** `/dashboard/applied-jobs` rendered the Job Tracker (main's `f264fe2` alias), so the candidate could not see their applications or their status, and could not withdraw one. Application notifications linked nowhere (O-3). The legacy page did all of this (DIR-059). | `before/*__dashboard_applied_jobs__route.jpg`: "No tracked jobs yet" while A had 3 applications; `before/*__application-notifications.jpg`: no links |
| AP-5 | P2 (backend, data loss) | **The phone number entered when applying was stored empty.** `saveApplication` read only `applicantPhone`/`applicant_phone`, but the apply workflow sends `phone`. The employer's applicant view lacked it too. | `app-probe`: sent `+1 555 0100`, stored `""`. Backend test 9 red |
| AP-6 | P2 (legacy parity, not repeated) | **The legacy page could not name a closed job, and invented details.** It looked each job up through `GET /api/jobs-data/:id`, which answers 404 once a job is closed or expired, so such rows showed only "Job". It also showed "Full-time", "On-site" and a made-up job description when values were missing; offered filter options that never matched; computed a success rate that was always 0 %; and compared application ids with tracker ids to decide whether a job was already tracked. | `close-probe`: the employer closes a job → the candidate's GET → 404, while the new list still names it (`listed: false`). Legacy `AppliedJobs.jsx` |
| AP-7 | P2 (backend, non-production) | **The in-memory fallback ignored the applicant filter.** `InMemoryRepository.getApplications` filtered on `userId` but not `applicantId`, so in degraded or in-memory mode (never in production) the list showed every applicant's applications. | Backend test 10 red |

## 2. Changes

### 2.1 Backend: an applicant reads and corrects only their own submission (TDD)

New `backend/test/job-applications-candidate-api.test.js` (11 tests). Ten were red against the base code; test 6 (withdrawal stays owner-scoped) passed before and guards the behaviour that was already right.

| # | Test | Red before the fix because |
|---|---|---|
| 1 | The list shows only the caller's applications, with the job and none of the employer's columns | raw rows (`applicant_id`, `rating`, `notes`, …) |
| 2 | Another candidate cannot take over an application through POST | 200, row moved |
| 3 | POST cannot create an application outside the apply workflow | 200, row created |
| 4 | The owner cannot set status, rating, notes, job, employer, email, resume or cover letter (PATCH and POST) | 200 |
| 5 | The owner can correct name and phone, validated like the apply form; nothing else changes | an invalid phone → 200 |
| 6 | Withdrawal stays owner-scoped (403 / 404 / 200) | (guard) |
| 7 | MariaDB: one owner-scoped query joined to the job, no employer columns | method missing |
| 8 | MariaDB: a contact correction is one UPDATE scoped to the application and applicant | method missing |
| 9 | MariaDB: the phone entered when applying is stored | stored `""` |
| 10 | In-memory fallback: list and legacy filter are scoped to the applicant | B's row returned |
| 11 | The applicant list is a read: served while MariaDB refuses writes | method missing (and a write would be refused) |

Changes:

- **`routes/jobsData.js`.**
  - The list now answers a candidate-facing view: `id`, `jobId`, `status` (lower case, so the table default `PENDING` reads `pending`), `createdAt`, `updatedAt`, the applicant's own submission (`applicantName`, `applicantEmail`, `applicantPhone`, `resumeId`, `coverLetter`) and `job: { title, company, location, listed }`. `listed` applies the same rule as `GET /api/jobs-data/:id` for everyone else: active, not tombstoned, not expired.
  - POST and PATCH share one owner-only handler:
    - a missing id → 404 `APPLICATION_NOT_FOUND`, which points to `POST /api/jobs/:jobId/applications`;
    - another applicant's id → 403, and nothing is written;
    - on the caller's own application, only `applicantName`/`fullName` and `applicantPhone`/`phone` are accepted, validated as the apply form validates them;
    - any other field → 400 `APPLICATION_FIELD_NOT_EDITABLE` with the field's name;
    - the response is the same candidate-facing view.
  - DELETE is unchanged. `tests/dir059-applied-jobs.test.mjs` still pins it.
- **`repositories/MySQLRepository.js`.**
  - `getApplicantApplications({ applicantId })`: one query, `applications LEFT JOIN jobs`, `WHERE a.applicant_id = ?`, selecting named columns only (no `rating`, `notes`, `employer_id`, `extra_json` or `resume_url`).
  - `updateApplicantContact(id, applicantId, fields)`: `UPDATE … SET applicant_name/applicant_phone … WHERE id = ? AND applicant_id = ?`. It is atomic, so an employer's status change made in the same moment cannot be overwritten by a full-row upsert.
  - `saveApplication` also reads `phone` (AP-5).
- **`repositories/InMemoryRepository.js`.** `getApplications` honours `applicantId`, and the two new methods follow the same contract (AP-7).
- **`repositories/ResilientRepository.js`.** `getApplicantApplications` is a read (served while writes are refused); `updateApplicantContact` is a write.
- **Real stack after the fix** (`app-probe`, `contact-probe`):
  - B's POST on A's id → 403, and A keeps the application;
  - A's PATCH with `status` → 400 `APPLICATION_FIELD_NOT_EDITABLE`, and the stored status stays `pending`;
  - a phone correction → 200, and a no-op repeat → 200 (both mysql2 and the bridge count matched rows);
  - the employer's view shows the corrected phone;
  - a new application stores the phone it was sent with.

### 2.2 Client data layer

- **`frontend/src/lib/applications.ts`.**
  - The contract (`toApplication`, `listApplications`, `withdrawApplication`) and `APPLICATIONS_QUERY_KEY`.
  - Statuses use the words of the notifications the candidate receives: pending → **Submitted**, interview → **Interview**, accepted → **Accepted**, rejected → **Not selected**. A status no workflow here writes is shown as stored, not mapped to a guess.
  - A withdrawal that answers 404 is reported as already withdrawn. Any other failure leaves the application in place, with a message that says so.
  - `trackApplication` adds the job to the Job Tracker at the stage matching the status (Applied, Interviewing, Offer, Archived), with `dateApplied` set to the local day the application was sent. It re-reads the tracker first and matches title and company case-insensitively, the same rule as the C13 cover-letter sync, so a job tracked in another tab is reported, not duplicated.
- **`frontend/src/lib/application-display.ts`.**
  - Search covers the job title, company, location and status label.
  - The status filter and the sort (date applied newest or oldest, last updated, company A–Z) are parsed from the URL; unknown values fall back to the defaults.
  - Also: the status summary; dates ("Applied 20 Oct"; "Updated …" only when the application changed at least a minute after it was sent); and the cover letter as plain text. Older letters saved as HTML are reduced to their text with line breaks kept, and the result is rendered as text, never as markup.

### 2.3 Page and components

- **`pages/dashboard/applied-jobs.tsx`.**
  - **Header and summary:** the title, a Refresh button and a "Browse jobs" link to the job portal, then a summary by status.
  - **Toolbar:** search, Status and Sort selects, and a live count ("Showing 1 of 3 applications").
  - **URL state:** `?status=&q=&sort=` survives reload, direct links and Back/Forward (C13 pattern; changes start from the address bar, so two quick changes are not lost).
  - **Freshness:** employers change applications, so the list is read on every visit (`staleTime: 0`) and on Refresh.
  - **States:** loading; a failed first load (an alert with Try again); a failed refresh, which keeps the list shown earlier and says it may be out of date; empty ("No applications yet", with a link to the portal); no matches (with Clear filters).
- **`components/applications/application-entry.tsx`.**
  - Each application is an `<article>` named by its job title, showing the company, location, status badge (icon plus text, with a screen-reader "Status:" prefix), the date applied and "Not currently listed on the job board" when the job is closed, paused or expired.
  - **Details** is a disclosure (`aria-expanded`, `aria-controls`) showing what was sent: name, email, phone, the resume by name (or "A resume you have since deleted"), and the cover letter.
  - **Job Tracker control:** "Add to Job Tracker" becomes "Open in Job Tracker", which links to `/dashboard/job-tracker?q=<title>`, together with the tracked stage. It is offered only when the job has a title and a company.
  - **Withdraw** opens the dialog.
- **`components/applications/withdraw-dialog.tsx`** (Radix).
  - It names the job, the stored status and the date applied, and says what withdrawing does: the application is removed from the employer's list of applicants, which can't be undone.
  - It says whether the candidate can apply again: yes while the job is listed, otherwise no.
  - It says the Job Tracker isn't changed.
  - A failure keeps the dialog open with the reason. Escape and outside clicks are ignored while a request is in flight.
  - Each opening is a new session, so no old error carries over.
  - Focus returns to the Withdraw button, or after a withdrawal to the next application's Details button (the heading when none is left).

### 2.4 Around the page

- **Router:** `/dashboard/applied-jobs` renders the new page (it rendered `JobTrackerPage`).
- **Shared shell** (`cuba-app-shell.tsx`, two small additions): a candidate navigation item "Applied Jobs" after Job Tracker (the legacy order), and its breadcrumb. Consumers: every `CubaAppShell` route; only the candidate navigation group changes. Covered by the full candidate regression and spec test 11.
- **Notifications** (`lib/notification-display.ts`, C10): the candidate's own application rows (`job_application`, `application_status_update`, `application_accepted`, `application_rejected`) link to Applied Jobs as "View your applications", as legacy did (`resolveNotificationHref.js`). The interview invitation keeps its Interview Coach link, and the employer's own "New job application" row gets no candidate link.

### 2.5 Test tooling

- `frontend/tests/candidate/arrange-applications.ts` gained `APPLIED_JOBS`, `applyAs`, `setApplicationStatus`, `closeJob` and `arrangeAppliedJobs`. These are additive; the existing helpers are unchanged.
  - Every step uses the real API: the candidates apply, the employer changes the status and closes a job.
  - The one exception is the job rows, inserted by `scripts/dev-db/arrange-messaging-job.mjs` as in C10, because preview identities cannot hold the employer claim.
  - `removeArranged()` removes all of it.

## 3. Tests

### 3.1 `frontend/tests/candidate/applied-jobs.spec.ts` (new): 14 tests × 5 profiles

Each test arranges its own data through the real API (A applies to three jobs a second apart, B applies to one, the employer invites A to interview for one, does not select A for another and closes that job) and removes it afterwards, including any tracker entries and resumes it made.

1. **Reading.** Only A's three applications, newest first, with company, location, status and date applied (`datetime` equals the stored `createdAt`). The closed job is still named and marked not listed. B's application to the same job is absent, and the API rows carry no employer field. Breadcrumb `aria-current`, no overflow.
2. **URL state.**
   - Search, status filter and every sort, with Clear filters.
   - Reload; leaving through the navigation, Back, then Forward.
   - A direct link with all three parameters; unknown values fall back to the defaults.
3. **Details.** The exact name, email, phone (stored since AP-5), the resume by name, and the cover letter with its line break. "None attached" when no resume was sent. The disclosure works with Enter and Space and keeps focus. After the resume is deleted through the API, the page says "A resume you have since deleted".
4. **Withdraw dialog.**
   - Content for a closed job and for a listed one.
   - It fits the viewport, and the page behind it does not scroll.
   - Four Tab presses stay inside.
   - Escape, Keep application and Close each change nothing (checked through the API) and return focus.
5. **Withdrawal failure, then success.**
   - A 503 (fault injection) keeps the application and shows the reason in the dialog; reopened, the old error is gone.
   - The retry withdraws: notice, summary, count and focus are updated.
   - Gone after a reload, from A's list and from the employer's applicants. A can apply again because the job is still listed, as the dialog said.
6. **Already withdrawn in another tab.** The 404 is reported as "had already been withdrawn or removed" and the row is removed.
7. **Job Tracker.**
   - The designer application is added under Interviewing with the date it was sent, and focus moves to the new link.
   - It is still tracked after a reload.
   - A matching job added through the API in other letter case is reported, not duplicated.
   - The link opens the tracker filtered to the job.
8. **Job Tracker unavailable** (503, fault injection). An alert; nothing added; the button stays usable; the job can be added afterwards.
9. **States.** The loading state (a slowed real response); a failed load with Try again; a failed refresh that keeps the list; a successful refresh.
10. **Empty.** "No applications yet", no toolbar, links to the portal.
11. **Navigation and notifications.**
    - Sidebar or drawer (by profile) → Applied Jobs, with `aria-current` on the item and the breadcrumb.
    - The "Application submitted" notification links to the page and opens it; the interview invitation keeps its coach link.
12. **Labelled mock.** Rows the current workflows cannot produce: an unknown status ("Shortlisted", summary "1 Other"), a missing job ("Job details unavailable", no tracker action), a cover letter saved as HTML (plain text with line breaks), and an "Updated" date.
13. **Keyboard and axe.** The Tab order through search, filters and each application's controls; axe on the page, with details open, and on the dialog.
14. **Candidate B.**
    - B sees only their own application.
    - B gets 403 on DELETE, POST and PATCH of A's application.
    - A gets 400 `APPLICATION_FIELD_NOT_EDITABLE` for `status` and 404 `APPLICATION_NOT_FOUND` for a POST that would create an application, and A's data is unchanged.
    - B withdraws their own application; focus moves to the heading, and A's applications are untouched.

### 3.2 Specs reconciled

- `candidate-dashboard.spec.ts` (main's): the alias test now expects `/dashboard/applied-jobs` to show "Applied Jobs", the legacy meaning; `job-matching` still redirects to the tracker.
- `notifications.spec.ts` (C10):
  - the real "Application submitted" row now links to Applied Jobs (it was asserted to have no link);
  - the labelled-mock test adds an accepted row (links) and the employer's "New job application" row (no link);
  - the keyboard test steps through the row's new link before its toggle.
- `job-tracker.spec.ts` (C13), test 10: made deterministic. It arranges a second job outside its search, so the tracker is not empty after the removal and focus goes to the heading. It used to rely on other jobs happening to be in candidate A's tracker (§4, first regression).
- Root `tests/forensic-rc.test.mjs`: the pin on the applicant's list now requires the new owner-scoped call (§4, root sweep).

### 3.3 Mutation checks (each guarantee removed in turn; the named test must fail)

Scratch runner (not committed): it applies one change, runs the named test at 1366 against the real stack, records the result and restores the file. The final round ran all 14 frontend mutations against the final spec. Afterwards, `sha1sum -c` confirmed every source file matched its checksum from before the run.

| # | Mutation | Test that failed | Caught |
|---|---|---|---|
| A1 | A 404 on withdrawal is reported as a failure | 6 | yes |
| A2 | A withdrawn application stays listed | 5 | yes |
| A3 | Focus is not returned when the dialog closes | 4 | yes |
| A4 | The tracker stage ignores the application status | 7 | yes |
| A5 | A tracked job in other letter case is added again | 7 | yes |
| A6 | An unknown status in the URL is applied as a filter | 2 | yes |
| A7 | Cover-letter markup is shown raw | 12 | yes |
| A8 | An unknown status is shown as "Submitted" | 12 | yes |
| A9 | Collapsed details stay visible | 3 | yes |
| A10 | Application notifications link nowhere | 11 | yes |
| A11 | The navigation has no Applied Jobs item | 11 | yes |
| A12 | A failed tracker write is not reported as an error | 8 | yes |
| A13 | A failed load is shown as an empty list | 9 | yes |
| A14 | The dialog keeps an old error when reopened (no session key) | 5 (the reopened dialog's alert) | yes |
| B1 | Backend: the list query loses `WHERE a.applicant_id = ?` (real stack, API restarted) | 1 and 14 (A's summary counted B's application; B saw A's three) | yes |

### 3.4 Modal checklist (§10.2): "Withdraw your application?"

| # | Item | Evidence |
|---|---|---|
| 1 | The trigger opens the expected interface | Tests 4, 5, 6, 13 and 14 find the dialog by its accessible name |
| 2 | Visible and correctly positioned | Test 4: the box lies inside the viewport and the confirm button is in view, at five profiles. After-captures `withdraw-dialog` × 5 |
| 3 | Shows correct real data | Job title and company, the stored status, the date applied, and whether the job is still listed (tests 4, 5) |
| 4 | Inputs and validation | None: a confirmation without inputs |
| 5 | Primary and secondary actions | Withdraw application: success, a 503 failure and a 404 already-withdrawn (tests 5, 6, 14). Keep application and Close (test 4) |
| 6 | Cancel and close controls | Test 4: Keep application, Close (×), Escape |
| 7 | Escape dismisses | Tests 4 and 13. Escape and outside clicks are ignored only while the request is in flight |
| 8 | Focus enters and returns | Test 4: focus inside; back on the Withdraw button after Escape, Keep and Close. After a withdrawal it goes to the next application's Details button (tests 5, 6) or the heading (test 14). Mutation A3 |
| 9 | Focus stays inside | Test 4: four Tab presses stay in the dialog |
| 10 | Background scrolling | Test 4: `body` `overflow: hidden` while open, restored after closing |
| 11 | Failed operations never report success | Test 5: a 503 shows the reason in the dialog and the application stays, which the API confirms. Test 6: a 404 says it was already withdrawn |
| 12 | Usable at 390 and 320 | All tests at five profiles; after-captures at 390 and 320 |
| 13 | Destructive actions need confirmation | Withdrawal happens only through the dialog; test 4 shows that Escape, Keep and Close withdraw nothing (API count unchanged) |
| 14 | Reopening shows no stale state | Test 5: reopened after the failure, the dialog has no error; every opening is a new session (mutation A14) |

### 3.5 Accessibility

- **axe** (WCAG 2.0/2.1 A and AA): 0 violations on the page, with details open, and on the dialog, at five profiles (test 13).
- **Keyboard:**
  - Every control is a native button, select, input or link. The Tab order follows the page (test 13).
  - The disclosure works with Enter and Space (test 3).
  - The dialog traps and returns focus (test 4).
  - When a control disappears (Add → Open in Job Tracker, a withdrawn application), focus moves to its replacement, the next application or the heading.
- **Names:**
  - Each application is an `<article>` named by its job title.
  - Controls name the job ("Details for X at Y", "Add to Job Tracker: X at Y", "Withdraw application for X at Y", "Open in Job Tracker: X at Y"), and each name begins with the visible text.
  - The status badge is icon plus text with a screen-reader "Status:" prefix, never colour alone.
- **Announcements:** the always-rendered `NoticeRegions` (polite status, assertive alert); a live count of the shown applications; load and refresh failures as alerts.
- **Tokens:** Cuba M3 only (`bg-surface`, `bg-canvas-soft`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `border-border`, and the info, success and error 50/100/700 pairs).

### 3.6 Authorization, isolation and persistence

- **Reads:** the list stays scoped to `req.user.uid`, and the scope is now in the SQL itself (`WHERE a.applicant_id = ?`). Backend tests 1 and 7, spec tests 1 and 14 and mutation B1 prove it.
- **Writes:**
  - Withdrawal stays owner-only (backend test 6; spec test 14: 403 for B).
  - POST no longer creates or takes over applications (backend tests 2–3; spec test 14: 403 for B, 404 for A).
  - The applicant can change only their name and phone (backend tests 4–5; spec test 14: 400 for `status`).
  - The correction is one UPDATE scoped to the applicant (backend test 8).
- **Persistence:** spec tests 1–3, 5 and 7 re-read through the API and reload. Test 5 also checks the employer's list of applicants after a withdrawal.
- **The in-memory fallback** (non-production) is scoped too (backend test 10).
- **Auth** is unchanged: without a token, all four applications routes (GET list, POST, PATCH, DELETE) answer 401 `AUTH_REQUIRED` (real-stack probe). The two-segment paths are outside `isPublicApiPath`.

## 4. Gates

| Gate | Result |
|---|---|
| `cd frontend && npx tsc -b` | exit 0 (20.2 s). The new and changed source files also type-check under `strict` with `noUnusedLocals`/`noUnusedParameters`: 0 diagnostics |
| `cd frontend && npm run build` | exit 0 in 21.3 s wall (`tsc -b`, `vite build` 1.91 s, `sync-dist`: 323 files copied, 5 superseded entry chunks pruned). Entry chunk 671.56 kB (C13: 670.81 kB; +0.75 kB for the navigation item, its icon and the notification mapping). Applied Jobs is its own lazy chunk (22.14 kB, 7.16 kB gzip). The >500 kB chunk warning predates C14 |
| `cd frontend && npx oxlint` | 314 warnings, 0 errors (C13: 314); 0 in the eight changed source files |
| Candidate regression, 5 profiles, final code (`playwright.candidate.config.ts`, no filters) | **795 passed, 2 skipped, 0 failed, 0 flaky** in 67.6 min (`P002-C14-candidate-regression-playwright.json`). The 2 skips are C13's test 5 (drag and drop) at 390 and 320, by design. Per spec: applied-jobs 70, notifications 75, job-tracker 93 (+2 skipped), candidate-dashboard 35. C13: 725 passed and 2 skipped; added since: the 70 Applied Jobs tests |
| First full regression (before the two test fixes below) | 785 passed, 2 skipped, 10 failed in 68 min. The failures were two tests × 5 profiles, both test-side: **(1)** C10's keyboard test expected the "Application submitted" toggle right after the interview row, but the new "View your applications" link now comes first (an intended change; the test now steps through the link). **(2)** C13's test 10 expected focus on the heading after the last visible job is removed. The page does that only while the tracker still holds other jobs; when it becomes empty, focus correctly goes to "Track a job". C13's runs happened to have other jobs in candidate A's tracker; this run had none. The test now arranges a second job outside its search, so it is deterministic. Three checklist assertions were added to the C14 spec while that run was in progress |
| Applied Jobs spec | 70/70 during development (14 at 1366, then 56 at the other four profiles), and in the final regression above |
| Mutation checks | 15 of 15 caught: 14 frontend on the final spec and 1 backend through the real stack (§3.3). A first A14 run failed for the wrong reason: an assertion looked for the application on the page while the open modal hid it from the accessibility tree. The assertion now runs after the dialog closes, and the re-run fails exactly at the stale-error check |
| `cd backend && npm test` (fresh bridge :3307) | 970 tests: 933 pass, 37 fail. The 37 failures are identical by name to C13's (AI tenant/BYOK, AI route contract, enterprise role view, data lineage, MariaDB 11.4 integration); the 11 new tests pass. C13: 959/922/37 |
| Backend focused (12 files that touch applications, the repositories or jobs-data) | 107 tests: 101 pass, 6 skipped (MariaDB integration, off here), 0 fail |
| Endpoint contract (`scripts/audit/candidate-endpoint-contract.mjs`) | 80 calls, 56 unique, 694 routes, 0 unmatched, 0 unresolved (C13: 78 / 54; the two new calls are the list and the withdrawal) |
| Root sweep (all 229 `tests/*.test.*` files) | 34 failing files against 33 at C13. The extra one was `forensic-rc.test.mjs`: its pin required the literal call `getApplications({ applicantId: req.user.uid })` in `routes/jobsData.js`. The pin now requires the new owner-scoped call `getApplicantApplications({ applicantId: req.user.uid })`, which is equally strict, and the file passes 8/8. No other file has a failing subtest that it did not have at C13 |
| Root focused (39 files: C13's 31 plus 8 that read the touched code) | 2386 subtests, 2381 pass. The 5 failures are in 4 of the added files and are identical to C13's: repository factory selector, employer resume drawer, the dir056 route table and bridge ledger, and the AI requirements engine. C13's 31 files: 2300/2300. Note that `full-control-surface-execution.test.mjs` counts between 2007 and 2051 of its 2052 trivially true tests under the harness flag `--test-force-exit` (all pass; 2052/2052 without the flag). That explains the difference from C13's 2345 |
| `npm run test:security:static` (with the C14 files staged, so the credential sentinel scans them) | 68/68 |
| `tests/dir059-applied-jobs.test.mjs` (legacy DIR-059 pins, including the backend delete and list guards) | 7/7 |
| Screens | before 7 (`route` × 5, `application-notifications` × 2); after 23 (`list` × 5, `details` × 5, `withdraw-dialog` × 5, `filtered-not-selected` × 2, `tracked`, `tracked-after-reload`, `application-notifications` × 2, `empty` × 2). Every capture is clean: 0 console errors, 0 failed requests, 0 px overflow |
| Data left behind | None. After the final regression, candidates A and B have no applications, no tracker entries and no seeded resumes, and no arranged job, application or notification remains (checked through the API and the database) |

## 5. Findings outside this surface or this commit (recorded, not fixed here)

| ID | Sev | Finding | Status |
|---|---|---|---|
| O-9 | P2 | **The apply form's LinkedIn and GitHub links, the selected resume's name and `appliedAt` are dropped.** `saveApplication` writes fixed columns and never `extra_json`, so the employer never sees those fields either. Storing them needs a maintainer decision (new columns, or `extra_json`, which the employer views would then have to read). | Recorded. C14 fixed only the phone (AP-5), which has a column |
| O-10 | P3 | **A withdrawal leaves traces on the employer's side.** It deletes the application, but the employer's "New job application" notification and any conversation opened for it remain. The job's applicant count is not decremented, though the increment in `createApplication` is not persisted either (`saveJob` does not write `applicants_count`). | Recorded (employer scope) |
| O-11 | P3 | **`GET /api/jobs/:jobId/applications` returns raw rows**, including the employer's columns, to an applicant (their own row only). No candidate page uses it. The account data export (`repo.getApplications`) likewise includes raw rows. Whether an export should contain employer notes about the candidate is a policy question. | Recorded |
| F-4 | P3 | Status notifications still say "at Company" (employer route; open since C10, visible in the after-capture of Notifications) | Open |
| F-5 | P2 | The application revision is still never stored (open since C10; the arrangement helper documents it) | Open |

## 6. Remaining (recorded, not hidden)

- **No pagination.** Legacy had none either; search and the status filter narrow the list. A very long list was not measured.
- **No live updates.** The list is read on every visit and on Refresh; there is no polling or push.
- **No contact-details editor.** The API now lets an applicant correct their name and phone safely, but no page offers it (legacy had none).
- **"Updated" dates.** `updated_at` also changes when the applicant corrects their contact details, so "Updated" means the application changed, not necessarily its status.
- **The interview invitation still opens the Interview Coach** (C10 decision, legacy parity); Applied Jobs shows the same application with its Interview status.
- **Time zones.** The tracker's date applied uses the browser's time zone; it was verified with the sandbox browser in UTC only.
