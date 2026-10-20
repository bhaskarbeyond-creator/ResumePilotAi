# P002 · C10 — Notifications: the real feed, read state that persists, and the applicant's notification no longer overwritten

- **Surface:** candidate queue #6, `/dashboard/notifications` (`frontend/src/pages/dashboard/notifications.tsx`), plus the notification bell in the shared shell (`frontend/src/components/layout/cuba-app-shell.tsx`), which reads the same query. Legacy reference (read only): `src/components/Dashboard/DashboardNotifications/DashboardNotifications.jsx` and `src/components/cuba/resolveNotificationHref.js`.
- **Base:** `aa7aabc517a08db74ad7a3c770b901fe195df4c5` (C9), which sits on `origin/main` `b9e799cae61ec12015ee9108bbe24e1696db1d78`. Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306. No AI or stub is involved.
- **Backend contract** (`backend/routes/notificationsData.js`, unchanged): `GET /api/notifications-data` returns the caller's rows, newest first, with no paging or cap; `PATCH /api/notifications-data/:id` accepts exactly `{ read: boolean }` and is owner-scoped (404 otherwise; 400 for any other field); `POST /api/notifications-data/mark-all-read` returns `{ updated }`. A row is a MariaDB `notifications` record: `id, user_id, event_id, type, title, message, data, is_read, state, delivery_state, created_at, updated_at` plus a derived `read`. The table has no sender, priority, category, star or action column, and there is no create or delete route.
- **Backend change:** `backend/services/resilientMutations.js` (`createApplication`), test first (§2.1).

## 1. What the candidate saw before C10

Evidence: `docs/ui-audit/screenshots/notifications/before/` (17 screens plus `capture-report.json`), taken on the C9 code. Candidate A had one real notification: the job owner had moved A's application to interview. Candidate B had none.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| NT-1 | **P0** | **No real notification could ever be shown.** The client parsed `/api/notifications-data` against an invented schema (`sender`, `subject`, `preview`, `body`, `timestamp`, `starred`, `category`, `actions`). The backend returns none of those fields, so Zod rejected every row. With one or more notifications, the page showed "Failed to load notifications. Please check your connection and try again." next to "No notifications yet", and every count was 0. The copy blamed the user's connection for a client-side parse failure. | `before/*real-row-settled.jpg` (5 profiles); `before/*real-row.jpg` shows the skeleton during the retry |
| NT-2 | P1 | **The shell bell hid unread notifications on every dashboard page.** It shares the failing query, so it showed no count and "No notifications at this time." while A had an unread notification. The sidebar badge was missing for the same reason. | `before/*bell-popover.jpg` (1366, 390) |
| NT-3 | P1 | **The applicant's "Application submitted" notification was overwritten (finding F-2 from C9).** `createApplication` wrote the applicant's and the employer's rows under one id. `notifications.id` is the table's only key, so the employer's upsert replaced the applicant's row, owner included. | API probe (summary in §2.1): after applying, A had 0 rows for the job and the owner had "New job application" under the applicant's id `7eb482ae…` |
| NT-4 | P2 | **Fabricated UI.** Priority badges (`getPriorityConfig(undefined)` would have thrown during render once parsing passed), categories (AI Insights, Job Opportunities, Interviews, System Alerts) and "Starred" had no backing data. "From: … (role)" showed an invented sender, and action buttons used `href || '#'`. The subtitle promised "Real-time updates" with no realtime or polling. | Code |
| NT-5 | P2 | **Interaction and accessibility.** Cards were clickable `<div>`s (no role, no tab stop, no key handler), and selecting one silently marked it read. There was no way to mark a notification unread. The detail panel was `lg:hidden`, so on 1024 px and wider selecting a card showed nothing; below that it was a hand-rolled `role="dialog"` with no focus move, trap, Escape or focus return. Filter chips had no `aria-pressed`. The unread dot was colour-only (an `aria-label` on a `<span>`). The error had no retry (`refetch` was unused). "Mark all read" was hidden rather than shown as unavailable. | Code |
| NT-6 | P2 | **No way to the related page.** Legacy derives a destination from `type` (for example, a message row opens its conversation). The modern page had none. | Code; legacy resolver |
| NT-7 | P3 | **No page padding.** The heading touched the sidebar edge at 1024 px and wider. | `before/*` |

## 2. Changes

### 2.1 Backend: one notification per recipient, with the job's company (TDD)

`backend/test/application-notification-recipients.test.js` (new, 5 tests) drives `createApplication` with an in-memory repository. The double models the `notifications` table as MySQLRepository writes it: `id` is the only key and the write is an upsert, so a second write with the same id replaces the row and its owner.

- **Red** on the C9 code: 4 of 5 failed (the applicant's row was gone, and the message said "at Company").
- **Green** after the fix: 5 of 5.

The fix:
- The employer's row now gets its own deterministic id, `sha256('job_application_received' ⧺ applicationId)`.
- The applicant's id is unchanged, `sha256('job_application_submitted' ⧺ applicationId)`, so rows already written for applicants stay idempotent.
- The applicant's message takes the company from `company_name`. `MySQLRepository.getJob` returns the raw row, so `job.company` was always undefined and every message said "at Company".

Verified on the real stack (probe through the API, sandbox data removed afterwards):
- after A applied, A had "Application submitted", "Your application for Platform Engineer at Example Test Co was submitted.", under the unchanged id `7eb482ae…`;
- the owner had "New job application" under its own id `0b5c527a…`.

The employer's status-change message still says "at Company"; that route is employer code (F-4 in §5).

### 2.2 Client: `frontend/src/lib/notifications.ts` and `frontend/src/lib/notification-display.ts` (new)

- **`lib/notifications.ts`:** a typed client through the shared `apiClient`, with inline paths so the contract audit resolves them.
  - `toNotification` maps a row to `{ id, type, title, message, read, createdAt, data }`.
  - A row without a usable id (the table's primary key) or a response without a `notifications` array is reported as an error. It is never skipped quietly or half-rendered.
  - `NotificationsApiError` names failures by status, and only a real network failure says "check your connection".
- **`lib/notification-display.ts`:** presentation only, kept out of the shell's entry chunk.
  - **Kind:** application, interview, message, billing or update, derived from the `type` values backend producers actually write.
  - **Destination:** a mounted route, only where an honest one exists. Message rows (written before DIR-072) open `/dashboard/messages?conversationId=<id>`, or `/dashboard/messages` without an id. An interview invitation opens `/dashboard/interviews` ("Prepare with Interview Coach").
  - **No destination for application rows:** `/dashboard/applied-jobs` renders the Job Tracker, which lists manually tracked jobs, not applications (O-3).
  - **Search:** matches title, message and kind.

### 2.3 Hooks (`frontend/src/hooks/use-api-hooks.ts`)

- The invented `NotificationMessageSchema` is removed; `useNotifications` returns the client's items.
- `useSetNotificationRead` (replacing `useMarkNotificationRead`) and `useMarkAllNotificationsRead` are optimistic and roll back row by row on failure. They never restore a whole-list snapshot, which could undo a concurrent successful change.
- Every write ends with a refetch of the server's truth. The refetch is not awaited, so a control is free as soon as the server confirms its write; a later write cancels a pending refetch before applying its own change.

### 2.4 Page (`notifications.tsx`, rewritten, 369 lines) and `components/notifications/notification-row.tsx` (new)

- **Header:** "Notifications", an "N unread" badge, and "Mark all as read". When nothing is unread or a write is in flight, the button is `aria-disabled` rather than `disabled`, so keyboard focus is never dropped.
- **Filters:** All and Unread, each with a count and `aria-pressed`. The Unread filter lives in the URL (`?filter=unread`, replace navigation), so it survives reload and Back. An unknown value falls back to All.
- **Search:** a labelled search field with a clear button that returns focus to the field. The match count is announced in a polite live region.
- **Rows:** title (with screen-reader text "Unread:"), message, kind, and a `<time>` with an ISO `dateTime` and the full date as a tooltip. The optional destination link marks the row read when followed. A read/unread toggle stays focusable and `aria-busy` while its write is in flight, and focus stays on it after it changes.
- **Unread view:** a row you mark read stays in place until the view changes, so the focused toggle never vanishes.
- **Paging:** 20 rows at a time with "Show N more". Focus moves to the first newly shown row, and the count is announced. Paging and kept rows reset whenever the filter or search changes, Back and Forward included.
- **States:**
  - loading: a skeleton with `aria-busy`;
  - load error: the reason plus "Try again", which returns focus to the heading on success;
  - background refresh failure: the last loaded list stays, with a warning and "Try again";
  - write failure: an alert with the reason and "Dismiss";
  - empty: "No notifications yet" and "Browse jobs";
  - no unread: "You're all caught up" and "Show all notifications";
  - no search match: "Clear search".
- **No dialog:** the old hand-rolled one is gone, because a row already shows its whole message.
- **Live regions:** the status, search-count and alert regions are always rendered.
- **Tokens:** Cuba M3 throughout (`bg-surface`, `text-ink`, `text-ink-secondary`, `border-border`, brand scale). The page has its own padding, and its wrapper is `relative`, so screen-reader-only text cannot make the document scroll (§3.2, M9). The decorative kind icon is hidden below 640 px; the kind is also given in text.

### 2.5 Shared shell bell (`cuba-app-shell.tsx`, 3 small edits)

The bell reads the real `title` and `message`. Unread items carry screen-reader text "Unread:" (the dot is now `aria-hidden`). When the query fails, the popover says "Notifications couldn't be loaded. Open the Notification Center to try again." instead of "No notifications at this time."

Consumers: every `CubaAppShell` route. The full candidate regression (§4) renders the shell on every candidate page at five profiles. The bell is also tested directly (count, real items, Escape and focus return, live update, error text).

### 2.6 Test tooling

- `scripts/dev-db/arrange-messaging-job.mjs` gains `--count n` (1 to 30) to insert `<job-id>_01 … _nn` in one run, so a test can submit more applications than one list page shows. A count outside 1–30, or an id that would exceed the pattern, exits 2. The loopback and sandbox-name guard (exit 3) and `--remove` are unchanged. Documented in `scripts/dev-db/README.md`.
- `frontend/tests/candidate/arrange-applications.ts` (new):
  - real-stack arrangement for application workflows: the owner signs in (cached session shared with `messages.spec.ts`) and the helper inserts the job;
  - A applies and the owner changes the status, both through the API;
  - `removeArranged()` deletes the jobs, applications and notifications naming them.

## 3. Tests

### 3.1 `frontend/tests/candidate/notifications.spec.ts` (new): 15 tests × 5 profiles

Every notification a test reads is written by the backend for a real workflow:
- candidate A applies to a job through the API ("Application submitted");
- the job owner invites A to interview through `PATCH /api/job-applications/:id/status` ("Interview invitation").

Read changes are checked after reload and again through the API. Failure paths are labelled Playwright routes. One test replays legacy row shapes, also labelled, because current producers no longer write `message` rows. Every test ends by removing what it arranged. The auto `guard` fixture fails a test on any console error, page error or unexpected `/api` status.

| # | Test | Covers |
|---|---|---|
| 1 | Empty feed (candidate B) | Empty state, "Browse jobs" link, no mark-all / filters / search, bell without count, overflow, axe |
| 2 | Real rows, newest first | Both rows from the API, created a second apart (`created_at` has 1 s resolution); F-2 fix visible (A keeps "Application submitted", named company); kind and `<time dateTime>`; destination link only on the interview row; counts in page, filters and bell; overflow; axe |
| 3 | Mark one read / unread | `PATCH {read:true}` 200; focus stays on the toggle; badge, bell and announcement update; reload and API both show read; back to unread persists |
| 4 | Mark all as read | `POST` 200 `updated: 2`; announcement; button `aria-disabled` and still focused; reload all read; an unavailable button sends nothing; API all read |
| 5 | Rejected read change (failure path) | Injected PATCH 500 **and** list 503: row rolls back, focus kept, alert with the server's reason, refresh-failure warning, Dismiss; after unroute + reload the server still has it unread |
| 6 | Rejected mark all (failure path) | Injected 500: every row rolls back, alert, button available again, server unchanged |
| 7 | Failed load and recovery | Two injected 503s (the query retries once); reason shown; no mark-all; the bell popover says it couldn't load (Escape returns focus to the bell); "Try again" loads the rows and focuses the heading |
| 8 | Unread filter | `?filter=unread` written and read; reload keeps it; a row marked read stays in place; All/Unread round trip; "You're all caught up" → "Show all notifications"; unknown filter falls back to All |
| 9 | Search | Message match (company, case-insensitive), title and kind match; no-match region with announced count; both Clear search buttons empty the field and return focus to it |
| 10 | Destination and history | From `?filter=unread`, "Prepare with Interview Coach" opens `/dashboard/interviews` and sends `PATCH {read:true}`; Back returns to the same filtered view without that row; Forward |
| 11 | Destinations for other types (labelled mock) | Legacy message row → `/dashboard/messages?conversationId=…`; message without id → `/dashboard/messages`; payment → "Billing", no link; moderation → "Update", no link; a row without an id → error state, nothing half-rendered |
| 12 | Paging | 21 real applications: 20 rows + "Show 1 more"; then 21, button gone, focus on row 21, announcement; switching the filter resets to 20; overflow |
| 13 | Keyboard | Tab order (filters → search → link → toggle → next toggle); Space/Enter on filters and toggles; focus stays on a toggle through its write |
| 14 | Shell bell | "2 unread notifications"; menu items "Unread: …" with real titles; Escape closes and returns focus; marking a row read on the page updates the bell to 1 and the sidebar badge (desktop) |
| 15 | Isolation (API) | B's feed has none of A's rows; B's PATCH on each of A's ids → 404; B's mark-all leaves A's rows unread; no token → 401; an extra field in PATCH → 400 |

Runs:
- 1366 alone: 17/17 (with the two setup sign-ins);
- the other four profiles: 62/62;
- after the module split (§4, build): 1366 again 17/17;
- on the final code, after the document-scroll fix (§3.2): all five profiles 77/77 in 5.7 min (`docs/test-reports/P002-C10-notifications-spec-final-playwright.json`).

### 3.2 Mutation checks (the tests fail when the guarantee is removed)

Each mutation was applied to the final code, run against its test at 1366 (`--no-deps`, reusing the fresh storage states, so no extra sign-ins), and reverted. Files were restored from a backup and verified with `cmp`.

| # | Mutation | Test | Result |
|---|---|---|---|
| M1 | Require the invented `sender` field again | 2 Real rows | **Failed**: 0 rows (error state) |
| M2 | Fake read toggle (no request) | 3 Mark one read | **Failed**: no `PATCH` response (timeout) |
| M3 | No per-row rollback | 5 Rejected read change | **Failed**: the row stayed read while the server and the refresh were down |
| M4 | Filter written to another parameter | 8 Unread filter | **Failed**: URL is not `?filter=unread` |
| M5 | Link application rows to `/dashboard/applied-jobs` | 2 Real rows | **Failed**: the application row has a link. Re-run after the display module split, on `lib/notification-display.ts`: failed again |
| M6 | Bell shows a placeholder title | 14 Shell bell | **Failed**: "Unread: Interview invitation" not in the menu |
| M7 | No paging | 12 Paging | **Failed**: 21 rows instead of 20 |
| M8 | Native `disabled` on the toggle while saving | 3 Mark one read | **Failed**: focus is lost from the toggle |
| M9 | Remove `relative` from the page wrapper | 12 Paging | **Failed**: "the document does not scroll vertically", 2032 px > 769 |

M9 guards a defect found during the after-captures. On a long list the paging screen showed the document itself scrolling into blank space below the shell. The per-row screen-reader spans are absolutely positioned and had no positioned ancestor inside the `main` scroll container, so on a long list they extended the document (`scrollHeight` 2032 px in a 768 px viewport).
- Fix: `relative` on the page wrapper.
- New assertion: tests 2 and 12 check that the document never scrolls vertically.
- Other pages: the other candidate pages, measured at 1366, had no document overflow.

Test 5 was strengthened before the mutation run: with only the PATCH failing, the follow-up refetch restored the row by itself, so a missing rollback would not have been noticed. It now also fails the list request, so only the client rollback can restore the truth.

### 3.3 Modal checklist (§10.2)

Not applicable to the page: C10 removes the old hand-rolled detail "dialog" (no focus move, trap, Escape or focus return) and adds none, because each row already shows its whole message. The bell popover in the shared shell is a Radix dropdown menu, not a modal. Test 14 checks it opens from its button, lists real items, closes with Escape and returns focus to the bell. The checklist items that also apply to pages are covered:
- focus never drops to the page during writes (tests 3, 4, 8, 13);
- a failed write is never reported as success, and the state rolls back (tests 5, 6);
- the page is usable at 390 and 320 (all tests at five profiles).

### 3.4 Accessibility

- **axe** (WCAG 2.0/2.1 A + AA, scoped to `#main-content`): 0 violations at five profiles for the real feed and the empty feed (tests 1 and 2).
- **Keyboard review** (test 13 and manual checks):
  - filters are toggle buttons with `aria-pressed`;
  - the search field has a label;
  - rows are list items in a named list;
  - links and toggles are real `<a>` and `<button>` elements with names that include the notification's title;
  - writes keep focus where it was (`aria-disabled`/`aria-busy` instead of `disabled`);
  - "Show more" moves focus to the first new row;
  - a successful retry focuses the heading.
- **Not colour-only:**
  - unread state is given in text ("Unread:", the badge, the counts);
  - kind is given in text, not only by icon.
- **Announcements:**
  - write results, paging and search counts go through always-rendered polite live regions;
  - write errors use an always-rendered alert region.
- **Contrast:** row text uses `text-ink` / `text-ink-secondary` on `bg-surface` or `bg-brand-50/70`.

## 4. Gates

All numbers are from the final code on `origin/main` `b9e799c` + C9 + C10, unless a row says otherwise. `origin/main` did not move during C10.

| Gate | Result | Baseline (C9) / note |
|---|---|---|
| `npx tsc -b` (frontend) | exit 0 (also the first step of the build) | exit 0 |
| Spec type-check (`npx tsc --noEmit --ignoreConfig --strict … tests/candidate/notifications.spec.ts tests/candidate/arrange-applications.ts`) | exit 0 | Test files are not included in `tsc -b` |
| `npx oxlint` (frontend) | 317 warnings, 0 errors; 0 in C10 files | 324. The replaced page carried 7. The only warning in a touched file (unused `normalizeError` import in `use-api-hooks.ts`) is pre-existing |
| Full candidate regression (9 specs × 5 profiles) | **502/502 passed** in 40.1 min (500 tests + 2 setup; 0 failed, 0 flaky, 0 skipped). By spec: Notifications 75, Messages 85, Interview Coach 85, Cover Letters 75, Resume Builder 55, Portfolio 45, AI Assistant 30, ATS Score 30, auth session 20. Run on the code just before the last page change (`relative` on the page wrapper, plus the document-scroll assertion); `docs/test-reports/P002-C10-notifications-playwright.json` | 427/427 in 32.8 min. +75 = the Notifications spec. The Messages spec ran with the F-2 fix live (A now keeps "Application submitted" from its arrangement) and passed unchanged. That last change touches only `notifications.tsx`; the only other spec that mentions the route (Messages) checks a link's `href` |
| Notifications spec on the final code | **77/77** in 5.7 min (75 + 2 setup); `docs/test-reports/P002-C10-notifications-spec-final-playwright.json` | — |
| Mutation checks | 9 of 9 caught (M1–M9; M5 caught again after the module split), all files restored (`cmp`) | §3.2 |
| Endpoint contract audit | **81 calls (54 unique), 694 routes, 0 unmatched, 0 unresolved, exit 0.** The 3 notification calls match their real routes, now in `lib/notifications.ts`; `docs/test-reports/P002-C10-endpoint-contract.json` | 81 / 54, 0 / 0. Same count: the 3 calls moved from the hooks file into the client |
| `npm run build` (`tsc -b` → `vite build` → sync-dist) | exit 0, 21.7 s wall (Vite's own render stage: 2.08 s). **Entry chunk 691.03 kB** (gzip 207.94 kB): +2.14 kB for the notification client and optimistic hooks the shell needs. Moving the presentation helpers into a lazy module (`lib/notification-display.ts`) saved 1.05 kB of an initial +3.19 kB. Notifications chunk 15.27 kB (was 11.60 kB). `lib/messages` time helpers are now a shared 3.80 kB chunk (the Messages chunk is 24.15 kB). sync-dist: 305 files | 18.0 s; entry 688.89 kB; only the pre-existing >500 kB chunk warning |
| Backend unit test (new) | `application-notification-recipients.test.js`: red 4/5 on the C9 code → green 5/5 | §2.1 |
| Backend full suite (`cd backend && npm test`) | 944 tests, 907 pass, 37 fail, 78 s. **The failure set is identical to C7's** (26 top-level + 11 nested, compared by name) | C7: 939 / 902 / 37. +5 = the new test file. The same 37 failed in C6 and C7, before any C10 change: AI tenant/BYOK routing, AI route contract, enterprise role view, data lineage and MariaDB 11.4 integration suites |
| Root source-contract tests that read notification code | `notification-lifecycle`, `admin-workflow`, `custom-pages-lifecycle`, `dir055-notifications`, `dir072-notifications-messages-decoupling`: **51/51** | They pin `notify()`'s state labels and the route contract, all unchanged |
| axe (WCAG 2.0/2.1 A + AA) | 0 violations for the real feed and the empty feed at 5 profiles | Asserted in the spec |
| Authorization and isolation | B: 404 when patching each of A's ids; B's mark-all leaves A unchanged; B's feed has none of A's rows; no token: 401; an extra PATCH field: 400. The route's own contract test (`candidate-notification-recovery.test.js`) passes in the full suite | Spec test 15 |
| Persistence | Read, unread and mark-all re-read after reload and through the API (tests 3, 4, 8, 10). Failed writes leave the server unchanged (tests 5, 6) | — |
| Deep links | `/dashboard/notifications`: direct load and reload. `?filter=unread`: direct load, reload, Back/Forward; an unknown value falls back to All. Destinations: `/dashboard/interviews` (test 10, real) and `/dashboard/messages?conversationId=` (test 11, labelled mock) | No new route. The query parameter is page state, like `?tab=` in Settings |
| Screenshots | before: 17, on the C9 code (`real-row` × 5 during the query retry, `real-row-settled` × 5, `bell-popover` × 2, `empty-candidate-b` × 5). after: 20, on the final code (`real-feed` × 5, `empty-candidate-b` × 5, `bell-menu` × 2, `search-no-match` × 2, `marked-read` × 2, `unread-filter` × 2, `paging` × 2) | `capture-report.json` in each folder; all clean. The data was arranged through the real API (plus the helper's job rows) before each state and removed afterwards |

## 5. Findings outside this surface (recorded, not fixed here)

| ID | Sev | Finding | Evidence | Why not fixed in C10 |
|---|---|---|---|---|
| F-1 | **P1 (security)** | Unchanged from C9: any signed-in user can publish an active, featured job through `POST /api/jobs-data/:id`. | C9 report §5 | Employer domain; needs a maintainer decision and an employer regression. |
| F-2 | — | **Fixed in C10** (§2.1): the applicant's "Application submitted" row is no longer overwritten by the employer's. | `backend/test/application-notification-recipients.test.js`; spec test 2 | — |
| F-4 | P3 | **Status-change notifications say "at Company".** `PATCH /api/job-applications/:id/status` builds the candidate's message from `job.company`. `MySQLRepository.getJob` returns the raw row (`company_name`), so the field is undefined. The application's `jobSnapshot` fallback is never persisted, because `saveApplication` writes no `extra_json`. | Sandbox: "You have been invited to interview for Platform Engineer at Company." for a job whose company is "Example Test Co" | The route is the employer's action (employer code). The candidate-initiated `createApplication` message is fixed. The same `job.company || job.companyName || job.company_name` resolution would fix it. |
| F-5 | P2 | **The stored application revision never advances, so status notifications replace each other.** The `applications` table has `revision INT NOT NULL DEFAULT 1`, but `MySQLRepository.saveApplication` never writes it. Two effects: (a) the employer gets `revision: 2` back but the database keeps 1, so a second change sent with the returned revision fails with 409 `APPLICATION_CHANGED` until a reload; (b) every status notification for one application gets the id `sha256('job_application_status' ⧺ app ⧺ '2')`. Each new status therefore overwrites the previous one: "Interview invitation" became "Application accepted" under the same id, and the history is lost. | Sandbox probe: stored revision 1 before and after a change that returned 2; A's row `2f206f2e…` changed from "Interview invitation" to "Application accepted"; chaining with the returned revision → 409 | The fix belongs in the shared applications repository and changes the employer's optimistic-concurrency behaviour. It needs a maintainer decision and an employer regression, like F-1. Proposed: write `revision` in `saveApplication`, with a CAS-checked `UPDATE`. |
| O-2 | P2 (Settings, #9) | **Notification preferences are not functional.** The Settings "Notifications" tab shows five `defaultChecked` checkboxes and a "Save Preferences" button with no handler; nothing is read or stored. | `frontend/src/pages/dashboard/settings.tsx` (`activeTab === 'notifications'`) | Belongs to Settings (queue #9). The Notifications page deliberately does not link to it. |
| O-3 | P2 | **No candidate page lists the user's real job applications.** `/dashboard/applied-jobs` renders the Job Tracker, which lists manually tracked jobs (`/api/jobs-data/tracker`), and `/jobs/portal/:jobId` ignores the id. Application notifications therefore have no honest destination and render without a link. | Router; `job-tracker.tsx`; `pages/jobs/portal.tsx` | Belongs to Job Tracker (#3) and Browse Job Portal (deferred). Legacy linked these rows to its applied-jobs view. |
| O-4 | P3 | **Notifications created in the same second have no defined order.** `created_at` is a `TIMESTAMP` with one-second resolution, and the list is ordered only by it. | Probe: "Application submitted" and "Interview invitation" shared `14:34:55` | A schema change (fractional seconds or a sequence) is outside the candidate surface. The page keeps the server's order; the tests space such rows a second apart rather than assuming one. |

## 6. Remaining (recorded, not hidden)

- **No push or polling.** The feed refreshes when a page that shows it mounts (30 s stale time) and after every write, not while you watch. The old subtitle's "Real-time updates" claim is gone.
- **No delete or archive.** The API has neither, so the page offers neither.
- **Payments and other rows without a candidate page link nowhere.** There is no candidate billing page (`/dashboard/plans` redirects to the public `/pricing`).
- **Legacy `message` rows are covered by a labelled mock only.** No current producer writes them (DIR-072); their link targets the Messages deep link verified in C9.
- **The employer's view of its own notifications is outside the Candidate scope.** The same page shows them if an employer opens it, as kind "Application" or "Update", without links.
