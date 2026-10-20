# P002 · C7 — Interview Coach: real AI paths, honest practice, server-authoritative live interview

- **Surface:** candidate queue #4, `/dashboard/interviews/*` (`frontend/src/pages/dashboard/interview-coach.tsx`). Legacy `/dashboard/interview` and `/dashboard/interview/*` redirect here (verified).
- **Base:** `c29596cc94c530a9d795ec0c5ad3976da259ff0b` (C6). Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306, as for C3–C6. A second backend on :8081 uses the labelled acceptance stub provider (§5).

## 1. What the candidate saw before C7

The baseline is the unmodified C6 code. Evidence:

- `docs/ui-audit/screenshots/interview-coach/before/`: 5 states × 5 profiles, plus `capture-report.json`.
- `docs/test-reports/P002-C7-baseline-cbt-timeout-probe.json`.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| IC-1 | P0 | **The CBT timeout auto-submit scored a stale snapshot.** The timer captured `handleCBTSubmit` from the render that started the timer. With all 10 answers given and correct, an expired timer reported **0/10 answered, 0 correct**; the manual submit of the same answers reported 10/10. | Probe JSON (Playwright clock, 1366) |
| IC-2 | P0 | **Fabricated practice and mock evaluation.** The score was answered ÷ count (one answer gave a "10% Score"). Strengths ("Engaged throughout the session", "Provided thoughtful answers"), improvements and feedback were fixed strings shown regardless of the answers. | `before/*practice-report*` |
| IC-3 | P0 | **Broken AI contract.** Questions and "feedback" posted `/api/generate-content` with `type` and no `operation`, so every call returned 400 (two per exchange, at every profile). The UI then showed "⚠️ I had trouble processing that" plus a bank question, and on that path the session never ended. | `before/capture-report.json` (`400 POST /api/generate-content` ×2, 2 console errors) |
| IC-4 | P0 | **The Live "Face-to-Face Studio" was a static mock.** It made no API call. The question was hard-coded and the "Voice Synthesizer Active" badge and "Real-time STT & Speech Synthesis" claim were false. Camera and mic buttons were disabled, the captions were fake, and the role defaulted to "Software Professional". Meanwhile the real server-authoritative live interview API (`/api/live-interview/*`, migration 017), which legacy uses, was not wired. | `before/*live-studio*` (no network activity) |
| IC-5 | P1 | **Padding.** CBT and practice cycled small banks (`i % length`), so a 10-question CBT showed 3 distinct questions. Count options went up to 30, while the banks hold 3–10 questions and the AI endpoint accepts 5–20. | Probe JSON (`distinctStems: 3`) |
| IC-6 | P1 | **The mock timeout had the same stale closure,** so the summary counted 0 answers. | Code review; covered by the new clock test |
| IC-7 | P1 | **False copy.** Claims included "Instant feedback", "real-time AI feedback after each answer", "Session scorecard", "Webcam video, Speech-to-text, AI avatar, Closed captions" and "Navigate freely between questions" (no navigation existed). | `before/*mode-select*`, `before/*practice-answered*` |
| IC-8 | P2 | **Accessibility.** Icon-only Send and close buttons had no names. Single-key shortcuts listened on `window` (A–D, 1–4, F): WCAG 2.1.4, and **Ctrl+F was swallowed** (browser Find broken). Selection state of options, topics and modes was not exposed. "Interview Topic" was a label without a control, and the selects were unlabelled. Raw `**markdown**` showed in messages, the timer pulsed, and emoji rendered as tofu in the sandbox. | Code review, screenshots |
| IC-9 | P2 | **Irreversible exam actions without confirmation.** Submit and leave acted immediately. | Code review |
| IC-10 | P3 | **Backend message.** A failed live start said "Your session is still saved" although nothing had been created. The guide reused the same message. | `curl` on :8080, red test |

## 2. Changes

### 2.1 Data layer — `frontend/src/lib/interview-coach.ts` (new)

- **Typed clients for the real contracts,** all through the shared `apiClient` (Bearer token and refresh): `POST /generate-interview`, `POST /live-interview/guide`, and `POST|GET|DELETE /live-interview/sessions[/:id[/turns|/complete]]`.
- **Error handling.** Failures become `InterviewApiError {status, code, message, session?}`, carrying the backend's own message. Cancellation and timeouts are told apart from server errors.
- **Timeouts match the backend.** The client default is 30 s, but the backend allows its provider 90 s plus bounded correction passes. Assessments get 180 s, live calls 120 s and guidance 45 s, and every pending state offers **Cancel**.
- **Assessment validation.** Questions are kept only if the client can score them exactly as the server defined them. Options are never filtered or reordered, because that would shift `correctAnswer`.
- **Live answers are idempotent.** Retrying the same answer to the same turn reuses its idempotency key.
- **Reload pointer.** Only the opaque session id is stored, in `sessionStorage`, per tab and per user id. The server returns a session only to its owner.

### 2.2 Practice and mock

- **Questions.** Built-in, labelled "Built-in question set". Counts are capped at the topic's bank (5 or 10, with the size shown), with no repeats.
- **Navigation.** Free navigation via a numbered question list plus Previous and Next, and answers are kept per question. Each answer has a labelled textarea.
- **Persistence, stated honestly.** "Answers stay in this tab for your review at the end; they are not saved to your account." No backend stores practice answers.
- **Practice only: "Get answer guidance".** This calls the real guide endpoint and shows its goal, example answer and tip, labelled as AI-generated, with Regenerate. Failures show the server message, never invented guidance.
- **Mock.** A countdown with pause and resume. Pausing hides the question and moves focus to Resume, and resuming returns focus to Pause. A timeout ends the session with the answers actually given (IC-6). Hints are off.
- **Summary.** Answered N of M, time used, and whether it ended by the candidate or by timeout. A "not scored" note, and every question with the candidate's answer or "Not answered". No score, no canned strengths. Actions: **Practise again** and **New session**.

### 2.3 CBT examination

- **With a target role:** AI-calibrated questions from `/generate-interview` (topic → interview type, experience level, difficulty, 5/10/15/20 questions), labelled with the assessment title.
- **Without a role, or when the AI is unavailable and the candidate chooses it:** the labelled built-in set (3–5 items), with no repeats (IC-5).
- **Timer.** A strict timer whose timeout scores the real answers (IC-1). There is no pulse animation, and 5-minute and 1-minute warnings are announced through a polite live region.
- **Palette.** On every screen size; a horizontal row on mobile, where it used to be hidden.
- **Options and flag** expose `aria-pressed`.
- **Shortcuts.** Active only while focus is inside the exam (WCAG 2.1.4). Modifier combinations pass through untouched, so Ctrl+F works.
- **Confirmations (IC-9).** Submit shows answered, unanswered and flagged counts. Leave asks before discarding answers.
- **Results.** Score = correct ÷ total, with correct, incorrect and unanswered counts, time used, a timeout note, the question source, and a review with each correct answer and explanation. The canned feedback is gone. Actions: **Retake these questions** and **New session**.

### 2.4 Live AI interview — `frontend/src/components/interview/live-interview-panel.tsx` (new)

A text client of the server-authoritative session. The server owns questions, turn order, evaluation, completion (`targetTurns`) and the report.

- **Start.** The role is required, with inline validation that matches the backend's rule. Topic maps to interview type; experience, difficulty and duration show "About N questions", mirroring the server's rule. Failures show the server message with **Try again**; there is no fallback.
- **Answers.** A labelled textarea with a 6,000-character limit and validation. Each answer shows the server's evaluation: the score only when it isn't `null`, plus observations and the coaching tip. Hints (tip, talking points, starters, example answer) come from the interviewer payload behind a disclosure. Previous answers sit in a `<details>`.
- **Another tab (409).** The panel adopts the server's latest session. Most conflicts carry it; when one doesn't (e.g. the interview was finished elsewhere), the panel reloads it with GET. A visible notice (`role=status`) says "This interview changed in another tab, so its latest state is shown. Your unsent answer was cleared." The server records only the other tab's answer (verified via API).
- **Cancel.** Cancelling a pending answer or report shows a visible notice ("Request cancelled. Your answer is still in the box."). A response that a newer action has superseded is ignored, so it can no longer clear the newer action's busy state.
- **Report.** "Get my report" once the server closes the interview. The report shows the overall score, readiness, summary, strengths, focus areas, practice plan, evidence, competencies and the transcript.
- **Ending.** "End interview" sits behind a confirmation and calls DELETE. A 404 means the session is already gone (ended in another tab), so the panel simply returns to the modes.
- **Failures name the action.** The alert title depends on what failed: "Your answer was not processed", "The report could not be created" or "The interview could not be ended". **Try again** repeats that same action, and a retried answer reuses its idempotency key. Validation failures (400/413) offer no retry. When the session no longer exists (404/410), the alert says "This interview is no longer available", shows the server's message and offers **Start a new interview** instead of a retry that cannot succeed.
- **Always on screen.** The alert and notice render above the question, while Send answer and Get my report can be a full screen lower on phones. Both are scrolled into view when they appear (`scrollIntoView({block: 'nearest'})`; `main` is the scroll container and the top bar does not overlap it).
- **Reload.** The mode screen offers "Resume interview", or "View report" with Dismiss.

### 2.5 Removed

- `frontend/src/components/Dashboard/DashboardInterviews/LiveInterviewSession.tsx`, the static mock. It had no other consumer. The only other reference is a legacy test that names legacy `src/…/LiveInterviewSession.jsx`.
- The broken `/generate-content` interview calls, the fabricated report fields and the false marketing copy.

### 2.6 Backend — `backend/routes/ai.js` (IC-10)

- `sendLiveInterviewError` takes an optional `unavailableMessage`. Start now says "No interview was started; please try again in a moment", and the guide says "AI answer guidance is temporarily unavailable". Routes acting on an existing session keep "Your session is still saved".
- The new test in `backend/test/live-interview-routes.test.js` was red first, then green. It covers start and guide with no provider, and a provider failure mid-interview on an existing session, which stays saved at the same revision.

### 2.7 Tooling

- **`scripts/dev-ai/openai-acceptance-stub.mjs` and `README.md`:** the labelled acceptance provider (§5).
- **`scripts/audit/capture-candidate-screens.mjs`:**
  - `--steps`: a `|`-separated sequence (`click`, `dialog-click`, `fill`, `press`, `text`, `wait`) for multi-step states;
  - `--label`, which names each captured state;
  - `--route-ai-to`, recorded per entry as `aiRoutedTo`. The route is registered on the browser context, so tabs opened during a capture are routed too;
  - `open-tab` opens a real second tab with `window.open`, which copies `sessionStorage` as a browser does, and `tab:<n>` switches tabs. Listeners record console and network problems in every tab, the screenshot is taken of the active tab, and the report records `tabs`. The conflict and "no longer available" states were captured this way, entirely through the UI.

### 2.8 Found by the new tests before commit (fixed)

- **Error alert unreadable at 320 px.** The alert row was `flex flex-wrap` with the message in a `min-w-0 flex-1` column. The action button never wrapped, so the message got about 24 px and wrapped letter by letter, and the alert grew taller than the screen. It now stacks title, message and actions, matching the coach page's alerts.
- **Error and notice off screen on phones.** Both rendered above the question while the candidate was at the bottom pressing Send. They are now scrolled into view.
- **Red → green.** `toBeInViewport({ ratio: 1 })` assertions failed at mobile-320 before the fix (the notice was partly off screen; the alert ratio was 0.48) and pass at all five profiles after it.
- **Mutation check.** With the 404-on-end handling removed, the "removed elsewhere" test fails; the file was then restored byte-identical (`cmp`).

## 3. Tests

### 3.1 `frontend/tests/candidate/interview-coach.spec.ts` (new) — 17 tests × 5 profiles

**Real stack** (no AI provider, so the real 503s are asserted):

- mode selection carries no false claims, every mode opens, axe;
- practice: caps, free navigation that keeps answers, a factual summary with no score and zero `/generate-content` calls, Practise again;
- guidance: the request body is exact, the real 503 shows the server's message, and nothing invented appears;
- mock: the fake clock shows pause freezes time and hides the question, focus moves Resume ↔ Pause, and the **timeout keeps the answers**;
- CBT built-in:
  - 3 distinct questions;
  - shortcuts select, Ctrl+F is not swallowed, and keys outside the exam do nothing;
  - the submit dialog shows real counts, Escape closes it with focus return, and the score is 100% with review;
- **CBT timeout regression:** 1 correct, 1 incorrect, 1 unanswered gives 33%;
- CBT with a role: the exact request body, the real 503 explained, the built-in fallback labelled;
- CBT leave confirmation with focus return;
- practice leave: with no answers it leaves without asking; with an answer, "Leave this session?" names what will be discarded, Stay and Escape both keep the answer and return focus to "Leave session", Leave goes to the modes; axe on the dialog;
- live: required topic and role (focus, `aria-invalid`); the real 503 says "No interview was started" and stores nothing;
- deep links: legacy redirects, nested path, reload, back and forward.

**Acceptance stack** (§5):

- **AI exam:** the questions rendered are exactly the served ones, and scoring against the server answer key gives 80% with the explanations;
- **live interview:**
  - empty-answer validation;
  - 4 evaluated answers (Score 74/100), and **reload → Resume** at the right turn;
  - **server-side completion** → report;
  - reload → View report → New session clears the pointer;
  - stub counters prove 1 open, 4 turns and 1 report calls;
- **End interview:** the confirmation, Escape with focus return, DELETE 200, and a session that is then 404 for its owner;
- **isolation:** B gets 404 for GET, turn and DELETE, anonymous gets 401, A gets 200;
- **another tab (409):** the same account answers the displayed question via the API first. The UI's answer gets 409, and the UI adopts the next question, clears the box and shows the notice fully on screen, with no error alert. The server transcript holds only the other tab's answer. The next answer succeeds and clears the notice;
- **session gone (404):**
  - answering after the session was deleted elsewhere shows "This interview is no longer available" with the server's message, fully on screen, with no Try again; **Start a new interview** returns to the modes and clears the pointer;
  - ending a session that was already deleted gets DELETE 404, and the UI returns to the modes with no error;
- **guidance:** the server's guidance is rendered.

The `guard` fixture fails any test on an unexpected console error, page error or `/api` status. Expected statuses (503/502 on the real stack, 409 and 404 in the conflict and gone tests) are declared per test.

**Full candidate regression** on the final code, all six specs at all five profiles: **297 / 297 passed** (20.1 min; 0 flaky, 0 skipped). It covers auth session, cover letters, AI assistant, ATS scoring, the resume builder and the interview coach. Per-test results are in `docs/test-reports/P002-C7-interview-coach-playwright.json`. An earlier full run was stopped deliberately at test 57 of 282 (0 failures) so that the recorded run reflects the final code.

### 3.2 Modal checklist (§10.2)

| # | Submit exam | Leave exam | Leave practice | End interview |
|---|---|---|---|---|
| 1 Trigger opens | ✅ | ✅ | ✅ only when an answer would be lost; with none, Leave session leaves directly (tested) | ✅ |
| 2 Visible/positioned (5 profiles) | ✅ | ✅ | ✅ | ✅ |
| 3 Real data | ✅ answered/unanswered/flagged counts | n/a | ✅ the real answer count ("Your answer will be discarded.") | n/a |
| 4 Inputs/validation | n/a | n/a | n/a | n/a |
| 5 Primary/secondary actions | ✅ submit → results; keep reviewing | ✅ leave; stay keeps answers | ✅ Leave session → modes; Stay keeps the answer | ✅ DELETE 200 → modes |
| 6 Cancel/close | ✅ | ✅ | ✅ Stay | ✅ |
| 7 Escape | ✅ | Radix default | ✅ keeps the answer (tested) | ✅ |
| 8 Focus in and back to trigger | ✅ | ✅ | ✅ Stay focused on open; focus returns to "Leave session" after Stay and after Escape | ✅ |
| 9 Focus contained | Radix Dialog focus trap | same | same | same |
| 10 Background scroll | Radix scroll lock | same | same | same |
| 11 Failed API never reported as success | n/a (no API) | n/a | n/a | ✅ 404 (already ended elsewhere) leaves to the modes, which is the true outcome (tested). Any other failure closes the dialog and shows "The interview could not be ended" with Try again (code path; the real backend cannot be made to fail DELETE without fault injection, so it is not exercised) |
| 12 Usable at 390/320 | ✅ (spec runs at both) | ✅ | ✅ | ✅ |
| 13 Destructive actions confirmed | irreversible → confirmed | ✅ | ✅ | ✅ |
| 14 Reopen shows fresh state | ✅ counts recomputed per open | ✅ | ✅ the count is recomputed on each open | ✅ |

## 4. Gates

All numbers are from the final code unless a row says otherwise.

| Gate | Result | Baseline (C6) / note |
|---|---|---|
| `npx tsc -b` (frontend) | exit 0, about 15 s | exit 0 |
| Spec type-check (`npx tsc --noEmit --ignoreConfig … tests/candidate/interview-coach.spec.ts`) | exit 0 | `tsc -b` does not include test files |
| `npx oxlint` (frontend) | 327 warnings, 0 errors; none in C7 files | 341. The 14 fewer warnings come from the rewritten coach page; none are new |
| C7 spec, 5 profiles | 85/85 (17 tests × 5; setup 2/2) | New spec. After the final panel change, the two affected tests passed again at mobile-320 (2/2); the full regression below re-runs everything |
| Full candidate regression (all 6 specs × 5 profiles) | **297/297 passed** in 20.1 min: 295 tests + 2 setup; 0 failed, 0 flaky, 0 skipped (acceptance group included) | 212/212 in 14.7 min. +85 = the new spec; the five earlier specs still pass unchanged |
| Backend suite, full (`cd backend && npm test`, fresh test database) | 939 tests: 902 pass, 37 fail | C6 tree on a fresh database: 938 / 901 / 37. The failure sets are identical (26 top-level, 11 nested; WASM bridge DDL limits recorded in C2). The one extra test is the new IC-10 test, which passes. The full suite ran, so the shared-handler change is covered beyond the live routes |
| Backend AI-route test files (8) | 105/105 | — |
| Endpoint contract audit | 70 calls (47 unique) against 694 routes. All 7 interview calls match a real route; 6 unmatched (exit 1) | The same 6 pre-existing portfolio `/api/api/*` calls (queue #13) |
| `npm run build` (`tsc -b` → `vite build` → sync-dist) | exit 0, 16.1 s wall. Entry chunk 670.72 kB; coach chunk 72.21 kB. sync-dist: 301 files, 5 superseded chunks pruned | 16.9 s; 670.71 kB. Only the pre-existing >500 kB chunk warning |
| axe (WCAG 2.0/2.1 A + AA) | 0 violations in every scanned state (modes, configuration, practice, summary, exam, results, live, report, unavailable states, conflict and gone states, Leave/End dialogs) at 5 profiles | Asserted in the spec, not sampled |
| Authorization and isolation | Account B gets 404 for GET, turn and DELETE on A's session; anonymous gets 401; A gets 200 | Spec, acceptance group |
| Persistence | Live sessions persist in `live_interview_sessions` (existing migration 017; C7 adds no migration). Reload → Resume returns to the right turn; the report survives a reload | Spec, plus a row check during the smoke test |
| Screenshots | before: 25 (5 states × 5); after: 65 (13 states × 5, 6 of them labelled `acceptance-`) | `capture-report.json` in each folder records console, network and overflow per screen |

## 5. Acceptance stack (labelled test provider)

- **Why it exists.** The sandbox cannot reach any AI provider. The backend explicitly supports operator endpoint overrides "for acceptance testing" (`aiRuntime.js`). A second backend (:8081, same MariaDB and auth configuration) points `OPENAI_BASE_URL` at `scripts/dev-ai/openai-acceptance-stub.mjs`: deterministic, localhost-only, key-gated, five interview operations, HTTP 422 for anything else.
- **What it proves.** UI → API → Express → service → MariaDB → UI for the success contracts, including persistence (`live_interview_sessions` rows), reload and resume, completion rules and owner isolation.
- **What it does not prove.** Nothing about AI quality. Every stub text labels itself ("Acceptance stub …", "Stub observation …"), and screenshots taken this way carry an `acceptance-` label and `aiRoutedTo` in `capture-report.json`.
- **The main stack stays untouched,** so the honest unavailable paths stay under test.

## 6. Remaining (recorded, not hidden)

- **AI quality** cannot be verified without a real provider (environment-blocked). Only contracts and states are proven.
- **Practice and mock answers** are not persisted, by design and stated in the UI; no backend for practice history exists.
- **The built-in banks are small** (3–10 questions per topic). Counts are capped honestly; more content is a content task.
- **Live mode is text-only.** Legacy had a voice engine (`LiveVoiceEngine.js`, Web Speech API). Voice is a P2 parity gap, not faked.
- **Interview context.** `resumeFacts` and `jobDescription` are accepted by both AI endpoints but not yet sent from the modern UI (legacy sent resume facts). P2.
- **A non-404 DELETE failure is not exercised end to end.** The real backend cannot be made to fail DELETE without fault injection, and the suite uses no mocked responses. The code path (alert, Try again) is described in §3.2, row 11.
- **Shared shell, pre-existing, not changed here.** At 320 px the header breadcrumb clips the page name ("Dashboard / Int…"); it does so in the before captures too. The fix belongs in `cuba-app-shell.tsx`, which every dashboard page uses, so it is logged for a shell pass with consumer regression tests rather than patched per surface. P3.
