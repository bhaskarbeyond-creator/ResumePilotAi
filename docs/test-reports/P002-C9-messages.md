# P002 · C9 — Messages: real conversations, an honest module state, no fake send

- **Surface:** candidate queue #5, `/dashboard/messages` (`frontend/src/pages/dashboard/messages.tsx`). Deep link: `/dashboard/messages?conversationId=<id>`, the legacy contract (`DashboardMessages`, read only). The `/dashboard/messages/*` route is unchanged.
- **Base:** work started on `a4d1de43dd818a668b756eef866fe790a501a0f1` (C8). Before committing, the branch was fast-forwarded to `origin/main` `b9e799cae61ec12015ee9108bbe24e1696db1d78`, where maintainers had merged C1–C8 (`7cc56e0`) together with admin, employer and enterprise portal work. No file overlapped C9; the gates in §4 were re-run on the integrated tree. Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306. There is no AI and no stub in this surface.
- **Module gate:** `public_config.modules.enableMessagesModule` is **off by default** (migration 009) and counts as on only when it is exactly `true`. While it is off, every `/api/messages/*` route answers 403 `MODULE_DISABLED`; an unreadable settings document answers 503.

## 1. What the candidate saw before C9

Evidence: `docs/ui-audit/screenshots/messages/before/` (2 routes × 5 profiles, plus `capture-report.json`). The report is "clean" because the page never called the messaging API at all.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| MS-1 | P0 | **Fake send.** "Send Reply" waited 600 ms on a timer, cleared the text and showed `alert('Your message was sent successfully!')`. No request was made and nothing was stored. | `messages.tsx` before C9 (`handleSendReply`); no `/api/messages/*` request in `before/capture-report.json` |
| MS-2 | P1 | **Wrong data.** The page listed notifications (`useNotifications` → `/api/notifications-data`) under "Messages & Alerts", with Jobs, Interviews and AI Insights tabs. It never read `/api/messages/conversations`, so a message from an employer could not be seen or answered. "Mark all read" marked notifications. | Code; `before/*dashboard_messages.jpg` |
| MS-3 | P1 | **No module gate.** With messaging off (the shipped default, where every messaging route answers 403), the page still showed a working-looking inbox and reply box. | `before/` screenshots, taken with the module off |
| MS-4 | P1 | **Controls that did nothing.** Star and Delete had empty handlers ("would be an API call"). The API has no star or delete route. | Code |
| MS-5 | P1 | **Keyboard users could not open a message.** Rows were clickable `<div>`s with no role, no tab stop and no key handler; the row actions only appeared on mouse hover. | Code |
| MS-6 | P2 | **No deep link.** The legacy `?conversationId=` link was ignored. | `before/*conversationId_missing*` is identical to the list |

## 2. Changes

### 2.1 Client: `frontend/src/lib/messages.ts` (new)

- A typed client for the five messaging routes through the shared `apiClient` (Bearer token, refresh, `/api` base). It adds no second `/api` prefix.
- `MessagesApiError` exposes `moduleDisabled` (403 `MODULE_DISABLED`) and `notFound`. `normalizeError` labels every error response without a `code` as `NETWORK_ERROR`, and most messaging errors are `{ success: false, error }`, so the client names those by status (`HTTP_404`, …). A 404 is therefore never reported as a connection problem.
- Responses are normalised: the `participants` map becomes an id list, BIGINT timestamps become numbers, and a missing `unreadCount` (a conversation with no messages) becomes 0.
- Time labels use `Intl.DateTimeFormat`: the time today, "Yesterday", or a date for list rows; "Today", "Yesterday" or a long date for thread dividers.

### 2.2 Page: `messages.tsx` (rewritten) and `components/messages/*` (new)

**List** (`conversation-list.tsx`)
- Each row shows the other participant's name (`GET …/participant-profile`), the newest message ("You: " when it is the candidate's own), its server time, and the server's unread count. The header shows the server's `totalUnread`.
- Search filters by name or newest message on the client, over what the API returned (the API caps the list at 100). A polite status line reports "n of m conversations match"; no matches gives a message and a Clear search button.
- States: loading skeleton (`aria-busy`), load error with Try again, a refresh-failure banner that keeps the last list, and an empty state that points to Browse jobs.

**Thread** (`conversation-thread.tsx`)
- Shows the newest 100 messages (the API's maximum; a notice appears when the cap is reached), with day dividers. Bubbles are aligned by sender and carry a screen-reader sender label. Each bubble has a `<time datetime>` taken from the server timestamp.
- Re-reads every 10 s; the list re-reads every 15 s. This is the legacy cadence and fits the DIR-054 read budget. React Query pauses polling in background tabs and stops it after an error, and Try again restarts it.
- New incoming messages are announced in a polite live region that is always rendered.
- Opening a thread advances the candidate's read cursor to the newest message (`POST …/read` with `lastReadMessageId` and `lastReadAt`), and so does every later incoming message. If saving read status fails, a notice with Try again appears.

**Composer**
- Enter sends; Shift+Enter adds a line (IME composition is respected). A blank draft can't be sent.
- `maxLength` is 10 000, the server's limit, with a counter from 9 000 characters.
- A message appears only after the server has stored it and the thread has been re-read; there is no optimistic success. A failed send keeps the text and shows the server's reason in an alert that the textarea references through `aria-describedby`.
- A synchronous in-flight guard stops double sends. React Query only reports `isPending` on its next notify tick, so before the guard a double click stored the message twice (mutation M1, §3.2).
- The textarea is read-only while a send is in flight, so text typed then can't be wiped by the success handler. Drafts are kept per conversation when switching.

**Module off**
- The page explains the state in place: "Messages are turned off", a Check again button that asks the server again, and a link to notifications.
- A 403 from any messaging call mid-session (thread, profile, send) switches the page to this state.

**Navigation and focus**
- Deep link `?conversationId=` (the legacy contract). An unknown, foreign or malformed id shows "This conversation isn't available" without calling the API.
- Opening a conversation adds a history entry, so Back returns to the list. The in-app back button pops that entry, or replaces the URL after a direct load.
- In the single-pane layout, focus moves to the thread heading on open and returns to the originating row on close.

**Layout**
- Two panes from 1280 px and one pane below. At 1024 the sidebar leaves about 720 px, too narrow for two readable panes.

**Removed**
- The fake send, star, delete, the notification tabs, "Mark all read" for notifications, and the native `alert`.

**Deliberate differences from legacy**
- Legacy `MessagesModuleGate` redirected to `/dashboard` with a toast. The modern page explains the state in place, as the C8 portfolio page does: the URL stays, and nothing happens silently.
- Legacy "Load older messages" sent a `before` parameter the API ignores, so it fetched the same newest window again. It is not reproduced; the 100-message cap is stated instead.
- The legacy "Call" button had no backend and is not reproduced.

### 2.3 Tooling

- **`scripts/dev-db/arrange-messaging-job.mjs`** (new, test environment only; README section added). A conversation needs a job application, and a job needs an employer. Preview identities can't hold the `employer` claim. The sandbox probe signed in an allow-listed EMPLOYER identity: preview login returned role `EMPLOYER`, then `POST /api/employer/companies` and `POST /api/employer/jobs` both answered 403 "Approved employer access is required."
  - The helper therefore inserts exactly one active job row owned by a preview identity. Everything after it goes through the real API.
  - It refuses non-loopback hosts and database names without sandbox, test or acceptance (exit 3), malformed ids (exit 2) and owners without a user row (exit 4). All four guards were exercised.
  - `--remove` deletes the conversations, notifications, applications and jobs of every `job_e2e_msg_*` job, and keeps security audit records.
- **`scripts/audit/capture-candidate-screens.mjs`**: a `--profiles` filter, for states where each capture changes server data (such as a sent reply). Unknown names exit 2.
- **`frontend/tests/candidate/fixtures.ts`**: an additive `uidFor(account)` that reads the server-issued uid saved by the setup project. Existing specs don't use it; the full regression covers them.

## 3. Tests

### 3.1 `frontend/tests/candidate/messages.spec.ts` (new): 17 tests × 5 profiles

**Arrangement, per test, real stack only**
1. The job owner signs in through `POST /api/auth/preview-login`, the same non-production verifier the candidate form uses. The session is cached beside the candidates' storage states so repeated runs stay under the auth burst limit (5 sign-ins a minute per IP).
2. `arrange-messaging-job.mjs --create` adds one active job owned by that identity. This is the only step that is not an API call (§2.3).
3. Candidate A applies (`POST /api/jobs/:jobId/applications`, 201).
4. The owner opens the conversation (`POST /api/messages/conversations`, 201) and sends messages (`POST /api/messages/send`, 201).

Every test starts from `--remove`, so it is independent of earlier tests. Each group restores the module default (off) and removes its rows afterwards. Failure paths use labelled Playwright routes.

| # | Test | Proves |
|---|---|---|
| 1 | Module off: page and conversation link | 403 `MODULE_DISABLED` from the real gate gives "Messages are turned off", no list and no composer. A conversation link makes no thread request. axe; no overflow |
| 2 | Module off: Check again | A second 403 keeps the state. After the flag is turned on, Check again shows the real (empty) inbox |
| 3 | List | Participant, newest message, "2 unread messages" and the "2 unread" header match `totalUnread` from the server. Listing alone doesn't advance the read cursor (the API still reports 2). axe; no overflow |
| 4 | Open and read | Opening pushes `?conversationId=`, moves focus to the heading (single pane), and shows both messages aligned as received. The `<time datetime>` equals the stored timestamp. `POST …/read` returns 200, the API reports `totalUnread` 0, and a reload keeps it. axe |
| 5 | Reply | `POST /api/messages/send` returns 201. The bubble appears from the re-read thread, the composer clears, and "Message sent." is announced. No native dialog appears. The owner reads the same id, sender and text through the API. A reload keeps the reply; the list shows "You: …" |
| 6 | Enter / Shift+Enter / blank | A blank draft makes 0 requests. A multi-line message is stored with its line break and rendered with it |
| 7 | Failed send (labelled 503) | The alert shows the server's reason, the draft is kept and referenced through `aria-describedby`, there is no phantom bubble, and nothing is stored. Retrying stores it exactly once. axe on the error state |
| 8 | Double click | Exactly one `POST /api/messages/send` and one stored message |
| 9 | 10 000 limit | `maxlength` 10000 with the counter shown. 10 000 characters are stored (201); 10 001 are refused by the server (400). An unbroken 10 000-character word causes no horizontal overflow |
| 10 | Deep link | Direct load, refresh, Back (to the list, focus on the row), Forward, and the in-app back button after a direct load |
| 11 | Not available | An unknown id, an encoded path-traversal id and an empty id each show the state, with 0 API calls for them. axe; Back to conversations |
| 12 | Search | Two real conversations in server order (newest first). Search by name and by message text (case-insensitive), the match count status, no match, and Clear search |
| 13 | Live update | A message sent through the API while the thread is open appears within one poll, is announced, and is marked read (a second `POST …/read`; the API reports `totalUnread` 0) |
| 14 | Loading and load error (labelled 503) | Skeleton, then "Conversations could not be loaded" with the server reason. Try again recovers. axe on the error state |
| 15 | Module turned off mid-conversation | The page switches to the module-off state; the message is not stored |
| 16 | Keyboard | Enter on a row, focus (heading in single pane, the row in two panes), Tab to the history region, Tab to the composer, Enter sends, and back returns focus to the row |
| 17 | Candidate B | Empty inbox (axe). A link to A's conversation shows the not-available state with none of A's text. Through the API, B gets 404 for messages, participant-profile, read and send, and 403 for creating a conversation on A's application. A's thread and unread count are unchanged |

Profiles: desktop-1920, laptop-1366, tablet-1024, mobile-390, mobile-320. First runs: 17/17 at 1366 (1.8 min) and 68/68 on the other four profiles (6.6 min).

### 3.2 Mutation checks (the tests fail when the guarantee is removed)

Each mutation was applied to the final code, run against its test at 1366, and reverted (files restored from a backup and verified with `diff`).

| # | Mutation | Test | Result |
|---|---|---|---|
| M1 | Guard on `send.isPending` instead of the in-flight ref | 8 Double click | **Failed**: 3 bubbles instead of 2 (stored twice) |
| M2 | Fake send (no request, draft cleared) | 5 Reply | **Failed**: no `POST /api/messages/send` response (timeout) |
| M3 | Read cursor never advanced | 4 Open and read | **Failed**: no `POST …/read` (timeout) |
| M4 | Module-off answer ignored | 1 Module off | **Failed**: "Messages are turned off" not shown |
| M5 | Not-available state suppressed | 11 Not available | **Failed**: the heading is not shown |

M2 and M3 originally failed only at the 90 s test timeout. The send and read waits now have explicit 15 s timeouts.

An earlier M2 attempt failed for an unrelated reason (preview sign-in 429 from the auth burst limiter after back-to-back runs). It was discarded and re-run after adding the owner-session cache.

### 3.3 Modal checklist (§10.2)

Not applicable: Messages has no dialog. There is nothing destructive to confirm, because the API has no delete, archive or block route, and C9 adds no dialog. The checklist items that also apply to pages are covered by the tests above:
- focus moves in and returns (tests 4, 10, 16);
- a failed API call is never reported as success (tests 7, 14, 15);
- the page is usable at 390 and 320 (all tests at five profiles).

### 3.4 Accessibility

- **axe** (WCAG 2.0/2.1 A + AA, scoped to `#main-content`), 0 violations at five profiles in these states: module off, list with unread, thread, failed-send alert, not available, list load error, and the empty inbox (candidate B).
- **Keyboard review** (test 16 and manual checks):
  - rows are buttons with `aria-current` on the selected one;
  - the message history is a named, focusable scroll region;
  - the composer has a label, a hint and an error linked through `aria-describedby`;
  - the back button has the name "Back to conversations";
  - focus is managed on open and close in the single-pane layout;
  - announcements go through always-rendered polite live regions;
  - received/sent is conveyed in text ("You:" / the participant's name), not only by colour and position;
  - time text is ≥ 4.5:1 on both bubble colours (`brand-50` on `brand-600` ≈ 6.1:1).

## 4. Gates

All numbers are from the final code on the integrated tree (`origin/main` `b9e799c` + C9) unless a row says otherwise.

| Gate | Result | Baseline (C8) / note |
|---|---|---|
| `npx tsc -b` (frontend) | exit 0 (also the first step of the build) | exit 0 |
| Spec type-check (`npx tsc --noEmit --ignoreConfig --strict … tests/candidate/messages.spec.ts`) | exit 0 | Test files are not included in `tsc -b` |
| `npx oxlint` (frontend) | 324 warnings, 0 errors; 0 in C9 files | `origin/main` alone: 330 (the replaced page carried 6). C8: 314 |
| Full candidate regression (8 specs × 5 profiles) | **427/427 passed** in 32.8 min: 425 tests + 2 setup; 0 failed, 0 flaky, 0 skipped. Messages 85, Interview Coach 85, Cover Letters 75, Resume Builder 55, Portfolio 45, AI Assistant 30, ATS Score 30, auth session 20 | C8: 342/342 in 24.0 min. +85 = the Messages spec; the seven earlier specs still pass unchanged on the integrated tree (main's shell, router and API-client changes included). Interim runs before the integration: full 427/427 in 32.4 min (before the last path change in `lib/messages.ts`), then the Messages spec 87/87 in 8.2 min (after it) |
| Endpoint contract audit | **81 calls (54 unique), 694 routes, 0 unmatched, 0 unresolved, exit 0.** All 5 messaging calls match their real routes | C8: 75 calls (48 unique), 0 unmatched. +5 = the messaging client; +1 = main's shell `POST /api/platform/role-view-audit` (matched). The scanner now also reports calls whose path starts with an expression; before, it skipped them silently. With the earlier helper-built paths it found 2 of the 5 messaging calls, and a mutation re-introducing one is reported as `? POST :param/read` |
| `npm run build` (`tsc -b` → `vite build` → sync-dist) | exit 0, 18.0 s wall. Entry chunk 688.89 kB (C9 itself +0.14 kB, React Query's `useQueries`; main's portal and shell work +17.77 kB); Messages chunk 27.67 kB (was 11.92 kB). sync-dist: 303 files | C8: 16.2 s, entry chunk 670.98 kB; only the pre-existing >500 kB chunk warning |
| Backend | No backend file changed in C9. Targeted unit files for the messaging rules, `mariadb-query-budget` (list isolation, module gate) and `master-configuration-control` (module flags): **21/21 pass**. `routes.integration` needs a disposable migrated MariaDB and was not re-run | Last full run (C7): 939 / 902 / 37, failure set identical to C6 |
| axe (WCAG 2.0/2.1 A + AA) | 0 violations in every scanned state at 5 profiles (§3.4) | Asserted in the spec |
| Authorization and isolation | Candidate B: 404 for A's messages, participant-profile, read and send; 403 for opening a conversation on A's application; an empty inbox; A's link shows the not-available state. A's thread and unread count are unchanged | Spec test 17 and the API smoke run |
| Persistence | Replies (including multi-line and a 10 000-character message) are read back through A's and the owner's tokens; read state survives a reload (API `totalUnread` 0); a failed send stores nothing | Spec tests 4–9 and 13 |
| Screenshots | before: 10 (2 routes × 5, on the C8 base); after: 29, re-taken on the integrated tree (main's shell adds a portal switcher above the sidebar). Module off × 5, list with unread × 5, thread × 5, not available × 5, empty inbox (candidate B) × 5, search with no match × 2, reply sent × 2 (data re-arranged before each, so each shows one real reply) | `capture-report.json` in each folder. Module-off captures record the server's 403 `MODULE_DISABLED` and the browser's own console line for it. The data was arranged through the real API (plus the one helper job row) and removed afterwards; the module is back off |

## 5. Findings outside this surface (recorded, not fixed here)

| ID | Sev | Finding | Evidence | Why not fixed in C9 |
|---|---|---|---|---|
| F-1 | **P1 (security)** | **Any signed-in user can publish an active, featured job.** `POST /api/jobs-data/:id` (legacy route) stores the body with the caller as owner, and `MySQLRepository.saveJob` takes `status` and `featured` from the body. This bypasses the employer claim, the approved-company requirement and moderation; `POST /api/employer/jobs` creates jobs as `pending`. | Sandbox probe: candidate B (role USER) created a job with `status: active, featured: true` (200); candidate A could read it (`GET /api/jobs-data/:id` 200, active, featured); B then deleted it (200) and A got 404. `backend/test/jobs-data-authorization.test.js` covers key takeover and ownerless deletion only. | Job posting is employer functionality, and C9 is limited to the Candidate dashboard. Legacy `src/services/api/jobs.js` still calls the route. Restricting it (employer claim, server-set `draft`/`pending`, ignoring `featured`) needs a maintainer decision and an employer regression. The C9 tests don't depend on this hole. |
| F-2 | P2 | **The candidate's "Application submitted" notification is overwritten.** `resilientMutations.createApplication` writes the applicant's and the employer's notifications under the same id (the application's event id). Because `notifications.id` is the primary key, the employer's upsert replaces the candidate's row, including `user_id`. | Sandbox: after A applied, A had no notification naming the job and the owner had "New job application". The test cleanup removes both. | Belongs to Notifications (queue #6, next). The fix needs distinct per-recipient ids and a backend test. |
| F-3 | Environment | **The employer side can't be verified locally.** Preview identities never carry the `employer` claim (allow-listed EMPLOYER identity: 403 on the employer company and job routes). | §2.3 probe | Firebase custom claims are unavailable in the sandbox. The conversation was opened by the job owner through the messaging API instead. |
| O-1 | P3 (observation) | **The shared API client now rewrites a leading `/api/` in request paths** (maintainer commit `f9c31fd`, on `main`). A doubled prefix such as C8's `/api/api/portfolios` would now reach the right route at runtime instead of failing with 404, so this class of mistake no longer shows up in the browser. | `frontend/src/lib/api-client.ts` request interceptor | It is maintainer-owned shared code, and the rewrite is intentional per its commit. The contract audit still resolves paths as written and reports such calls as unmatched (0 today), so it should stay a gate. |

## 6. Remaining (recorded, not hidden)

- **Unread badge in the shell navigation, P3.** Legacy shows `MessagesNavBadge`. Adding it changes the shared shell for every candidate page and must handle the module-off 403 on every page. It needs its own consumer regression pass.
- **Shell navigation ignores module flags, P3.** The sidebar shows "Messages & Chat" while the module is off; the page explains the state (as recorded for portfolios in C8).
- **History beyond the newest 100 messages, P3.** The thread route has no cursor (legacy "Load older" never worked). The page states the cap.
- **Job context per conversation, P3.** The list returns only `applicationId`, and the candidate applications route returns raw rows without a stable job title, so the thread says "About one of your job applications" rather than naming the job.
- **Participant pictures.** An avatar is shown when the server returns an http(s) address. The test identities have none, so only the initials path is exercised.
- **Delivery is polling (10 s thread, 15 s list), not push.**
- **The employer messaging UI is outside the Candidate scope** and was not changed.
