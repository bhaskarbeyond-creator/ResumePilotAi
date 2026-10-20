# P002 · C3 — Surface 1: Cover Letters & Builder

Branch `arena/994d7b67-resumepilotai`, parent commit `b63b5f662dd51cc241bc10c90bdc992a6f13310b` (C2).
Scope: Candidate Dashboard only (directive scope boundary, commit 98f3449). No backend, Employer, Admin
or Enterprise code changed in this commit.

**Surface verdict: done within the environment's limits.** Every planned behaviour works on the real
data path and is covered by behavioural tests at all five profiles. One path cannot be verified
here: a *successful* AI draft (the sandbox has no AI provider or network). The honest
"unavailable" path is verified instead; nothing is simulated.

## 1. Files

| File | Change |
|---|---|
| `frontend/src/lib/cover-letters.ts` | **New.** Data contract: legacy-compatible record (`cl_<ts>_<rand>` ids, `candidate*`/`job*`/`company*`, `letterBody`, `templateId`), list/get/save/delete/duplicate on `/covers`, AI draft on `/generate-ai-cover-letter` with typed unavailable errors, profile prefill, deterministic keyword coverage. |
| `frontend/src/pages/dashboard/cover-letters.tsx` | **Rewritten.** List with URL-backed search and sort, loading / empty / no-results / error-with-retry states, Open, Duplicate, Delete through an accessible confirmation dialog, live status region, legacy `?role=&company=` deep link. |
| `frontend/src/pages/dashboard/cover-letter-builder.tsx` | **Rewritten.** Loads `/cover-letter/:id` from the splat route; new letters start empty (profile contact details and deep-link context only); validation; save with canonical URL; dirty indicator, `beforeunload` guard, Ctrl/Cmd+S; not-found and error states; AI draft with input check, replace confirmation and explicit unavailable message; Edit/Preview toggle below `lg`; Copy, Download .txt, Print / Save as PDF; keyword-coverage aid. |
| `frontend/src/app/router.tsx` | One legacy alias restored: `/dashboard/cv` → `/dashboard/cover-letters` (legacy `DashboardMain.jsx`: `path="cv"`). |
| `frontend/tests/candidate/cover-letters.spec.ts` | **New.** 15 behavioural tests (×5 profiles). |
| `scripts/audit/capture-candidate-screens.mjs` | **New.** Before/after capture at the five profiles with console, failed-request and failed-API records. |
| `docs/ui-audit/screenshots/cover-letters/{before,after}/` | 15 + 15 screenshots with `capture-report.json`. |
| `docs/test-reports/P002-C3-cover-letters-playwright.json` | Per-test results of the full run. |

## 2. C1 defects resolved

| # | Sev. | Defect (C1 audit) | Resolution | Verified by |
|---|---|---|---|---|
| 1 | P0 | Builder opened with a fictional candidate, employer, recipient and a complete letter with invented metrics | Removed. New letters start empty except the candidate's own profile contact fields | `create` asserts empty job/letter fields and Avery's profile prefill; B gets Blake's details |
| 2 | P0 | Builder could not load: `useParams().id` is undefined under the splat route, `/api/api` prefix, wrong response shape | Reads `params['*']`; calls `/covers/:id` through `api-client`; normalises `cover` | `edit` loads by direct link and the `/coverletter/:id` alias |
| 3 | P0 | Builder could not save: `/api/api` prefix and a nonexistent `PUT` | Upsert via `POST /covers/:id` (the ownership-guarded endpoint) | `create`, `edit` (Ctrl+S), `save failure` |
| 4 | P0 | List "create" posted to `POST /covers/create`: every user shared the id `create` | Client ids `cl_<timestamp>_<8 random hex>`; creation happens in the builder | `create`, `duplicate` (distinct ids) |
| 5 | P1 | AI call double-prefixed, wrong field names | `POST /generate-ai-cover-letter` with the server's field names; 503 → explicit message, text untouched | `AI draft` |
| 6 | P1 | List read `name`/`updatedAt`; backend returns `title`/`updated_at` | Normalised (job title + company; `updated_at`) | `list` (titles, recipient, date order) |
| 7 | P2 | Edit/Download buttons without handlers | Removed; every control performs a real action | all tests |
| 8 | P2 | Overlay without dialog semantics, focus trap, Escape or focus return; native `confirm`/`alert` | Radix dialog with explicit focus management; live region instead of alerts | `delete dialog`, `delete failure`, `AI draft` |
| 9 | P2 | Labels not bound to inputs; phone/address shown but not editable | Every field labelled (`htmlFor`/`id`, `autocomplete`) and editable | axe, `create` |
| 10 | P2 | "Export PDF" printed the whole application | Print layout of the letter only (hidden iframe, title = default PDF file name), plus Download .txt and Copy | `export` |
| 11 | P2 | No search, sort, duplicate, profile prefill or `?role=&company=` deep link | Implemented | `list`, `duplicate`, `deep links` |

Found and fixed during verification (caught by the new tests):

- The print document's `<title>` was removed by a later `head.replaceChildren(...)`, so the
  default PDF file name would have been blank.
- The status live region was `display:none` while empty. Live regions inserted that way are not
  reliably announced, so the region is now always present.
- Save and Generate disable themselves while busy, which dropped keyboard focus to `<body>`.
  Focus now returns to the button when the work ends, unless the user moved it.

## 3. Routes and deep links

No routes were invented. Every path below existed in the legacy app or the modern router.

| URL | Behaviour | Test |
|---|---|---|
| `/dashboard/cover-letters` | List | `list` |
| `…?q=<text>&sort=updated-asc\|title-asc` | Search and sort restored on load, refresh, back and forward (default sort omitted from the URL) | `list` |
| `…?role=<r>&company=<c>` | Replaces history with `/cover-letter/new?role=&company=`; job title and company prefilled, nothing saved (legacy DIR-020 AC-11) | `deep links` |
| `/dashboard/cv` | Redirects to `/dashboard/cover-letters` (legacy alias restored) | `deep links` |
| `/cover-letter`, `/cover-letter/new`, `/coverletter[/new]` | New letter | `create`, `AI draft`, `export` |
| `/cover-letter/:id`, `/coverletter/:id` | Open letter; HTTP 404 → "Cover letter not found" | `edit`, `not-found`, `isolation` |
| After the first save | `navigate('/cover-letter/<id>', { replace: true })`, so Back does not return to an unsaved "new" form | `create` |

## 4. Data path, persistence and isolation

UI → `lib/cover-letters.ts` → `lib/api-client.ts` (Bearer token) → Express `routes/covers.js` →
`MySQLRepository.saveCover` / `deleteCover` (owner-scoped) → MariaDB `covers` → UI.

- Persistence after reload: `create`, `edit`, `delete dialog`, plus API reads with the account's
  own token.
- Isolation (account B against A's letter): not listed; `/cover-letter/<A-id>` → HTTP 404 and
  not-found UI; `GET` → 404; `POST` (overwrite attempt) → 404 from the ownership guard; `DELETE` →
  A's letter still exists, unchanged.
- Test data: created through the public API with `cl_e2e_` ids or captured from the UI URL, and
  deleted in `afterEach`. After the full run, A held only the audit seed letter and B held none.

## 5. Modal checklist (directive §10.2)

| # | Delete confirmation (list) | AI "Replace your letter text?" (builder) |
|---|---|---|
| 1 Trigger | Row "Delete <title>" opens it | "Generate draft" with existing text opens it |
| 2 Visible and positioned | Bounding box inside the viewport at all 5 profiles | Same |
| 3 Real data | Shows the selected letter's title | States that typed text will be replaced |
| 4 Inputs and validation | N/A (no inputs) | Input check runs *before* the dialog (job title or description required) |
| 5 Actions | "Delete permanently" → `DELETE` 200 → row gone, API 404 | "Replace with AI draft" → request; 503 handled |
| 6 Cancel and close | Cancel and the × button close without deleting | "Keep my text" closes |
| 7 Escape | Closes | Closes, no request sent |
| 8 Focus in and back | Focus starts on Cancel (safe default), returns to the trigger; after a delete, to the page heading (the trigger no longer exists) | Starts on "Keep my text", returns to "Generate draft" |
| 9 Focus containment | Tab ×4 and Shift+Tab ×3 stay inside | Not separately tested (same Radix primitive) |
| 10 Background scroll | `body` overflow `hidden` while open, restored after | Not separately tested (same Radix primitive) |
| 11 Failure is not success | Aborted `DELETE` (fault injection): error inside the dialog, dialog stays open, no success message, letter remains | 503: error message, text unchanged |
| 12 390 / 320 px | Whole test runs at both | Same |
| 13 Destructive confirmation | No `DELETE` without explicit confirmation | Replacing typed text needs confirmation |
| 14 No stale state | Reopening for another letter shows that letter; reopening after a failure shows no old error | — |

## 6. Accessibility

- axe-core (`@axe-core/playwright`), tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, scoped to
  `#main-content` and the open dialog: **0 violations** on the list, the delete dialog and the
  builder (plus the Preview view below `lg`) at all five profiles.
- Keyboard (automated): radio group arrow keys; Ctrl/Cmd+S; Enter in a field submits the form;
  Escape; focus entry, return and containment in the delete dialog; focus back on "Generate
  draft" after the busy state. Tab order was reviewed in the DOM order of the form, not asserted
  control by control.
- Structure: one `h1`; fieldsets with visible `legend > h2`; keyword panel `h3`; `role="status"`
  live regions; field errors linked with `aria-describedby` and `aria-invalid`; native radios in a
  `fieldset`.
- Not verified: actual screen-reader output (no NVDA or VoiceOver in the sandbox).

## 7. Playwright results

`npx playwright test -c playwright.candidate.config.ts tests/candidate/cover-letters.spec.ts tests/candidate/auth-session.spec.ts`

**97 / 97 passed** in 5.2 min (2 setup + 15 cover-letter tests × 5 profiles + 4 auth-session
regression tests × 5), 0 flaky, retries disabled. Two targeted re-runs at all five profiles
followed small later edits: `list` after a placeholder text change (7 / 7), and `save failure`
after its final save switched to the Enter key (7 / 7). Per-test results of the full run:
`docs/test-reports/P002-C3-cover-letters-playwright.json`.

| Test | What it proves |
|---|---|
| list | Real records, search, sort, URL state, refresh, back/forward, no-results, clear |
| create | Empty start + real profile prefill; two validation failures (no request sent); save; canonical URL; reload persistence; DB fields |
| edit | Direct link, legacy alias, preview content, radio arrow keys, Ctrl+S save, reload persistence, stored tone |
| duplicate | Independent copy with a new id; original unchanged |
| delete dialog | Checklist items 1–3 and 5–14 |
| delete failure | Fault injection: aborted `DELETE` never reports success; no stale error |
| deep links | `?role=&company=` prefill without saving; refresh; `/dashboard/cv` |
| not-found | HTTP 404 → not-found state, no form |
| AI draft | Input check, confirmation, Escape, 503 path keeps text, focus back on the button |
| list load failure | Fault injection: error with Retry, not mistaken for an empty account |
| save failure | Fault injection: edits kept, URL unchanged, no success message; then a successful save submitted with Enter |
| export | Empty-letter guard; .txt content and file name; clipboard equals download; print layout as text (markup-like input is never parsed) and title |
| accessibility | axe on list, dialog and builder; keyword panel from the job description |
| empty state (B) | Guidance, working create action, B's own profile details |
| isolation (B) | Not listed, cannot open, overwrite or delete A's letter |

Every test runs with the shared guard: unexpected console errors, page errors and failed `/api`
responses fail the test. Expected statuses are declared per test (404, 503, and `net::ERR_FAILED`
for the fault-injection tests only).

## 8. Screenshots

`docs/ui-audit/screenshots/cover-letters/before/` and `…/after/`: the same three routes at five
profiles. In *before*, the saved letter shows the fabricated persona letter instead of the stored
one. In *after*, it shows the stored record. After `capture-report.json`: 15 / 15 clean (0 px
horizontal overflow, 0 console errors, 0 failed requests, 0 failed API calls).

## 9. Gates

| Gate | Result |
|---|---|
| `npx tsc -b` (frontend) | 0 errors, 13.9 s |
| `npm run build` (frontend) | Exit 0, ~15.4 s wall (`tsc -b` + Vite 1.50 s + sync-dist: 299 files copied, 5 superseded chunks pruned) |
| Build warnings | Only the pre-existing Vite chunk-size advisory. Entry chunk 670.46 kB; C2 670.35 kB (measured in a temporary detached worktree, since removed); C0 667.67 kB. C3 adds 0.11 kB (the redirect route). New page chunks: list 9.4 kB, builder 22.0 kB, data layer 5.8 kB. |
| `npx oxlint` | 347 warnings, 0 errors (C0 baseline 363); 0 warnings in the changed files |
| Root tests (templates + sync-dist boundary) | 24 / 24 |
| Endpoint contract (`scripts/audit/candidate-endpoint-contract.mjs`) | Unmatched calls 11 → **8**. The cover-letter calls are resolved; the remaining 8 belong to queued surfaces (AI Assistant, Resume Builder suggestions, Portfolio ×6) |
| Backend `npm test` | Not re-run (no backend change in C3). C2 classification stands: 892 / 935, 43 classified failures |

## 10. Test environment notes (local sandbox only)

- **Rate limits.** The sandbox backend runs with `GLOBAL_RATE_LIMIT_MAX=20000` and
  `GENERAL_API_MINUTE_LIMIT=5000`, both existing environment settings (`backend/index.js`,
  `backend/security/abuse.js`). The suite runs as one account from one loopback IP, so the
  production defaults (2,500 requests per 15 min per user/IP, and 120 per minute per account) ran
  out and unrelated endpoints returned HTTP 429. Code and production defaults are unchanged.
- **Dev-server cache fault.** Vite answered `504 Outdated Optimize Dep` for
  `@radix-ui/react-dialog` after new imports appeared mid-session, which made all 15 tests fail
  in the first run. Restarting the dev server fixed it. Production builds are unaffected.
- **Fonts.** Google Fonts is unreachable (`net::ERR_CONNECTION_CLOSED`); only those two hosts are
  ignored.
- **AI provider.** None is configured, so the AI success path is **blocked by the environment**.
  Every profile recorded that the 503 path was exercised.
- **Engines.** MariaDB through the lite4mariadb bridge (not native 11.4); Chromium 153.

## 11. Remaining gaps

| Sev. | Gap | Why it is not done |
|---|---|---|
| P2 | Template choice (legacy offered Cover1–Cover4) | The shared renderer's `Cover1Layout`–`Cover4Layout` (`components/resume/smart-resume-document.tsx`) are gallery samples with a hard-coded recipient, company, address, subject and body ("Acme Innovations Corporation…"). Using them would bring back fabricated content. They need data-bound layouts in a shared component whose consumers include the template gallery, the export renderer and the employer drawer. `templateId` is preserved on every record. |
| P3 | "Sync to Job Tracker" from a letter (legacy) | Not in the C3 plan; needs a tracker-entry flow and duplicate handling |
| P3 | Share via WhatsApp, Telegram or email (legacy client-side links) | Copy text and Download cover sharing; long `mailto:` bodies are truncated by some clients |
| P3 | In-app navigation guard for unsaved edits | `useBlocker` needs a data router; the app uses `BrowserRouter`. Tab close and reload are guarded |
| P3 | Rate-limit headroom | Measure real per-account request rates (e.g. Overview's sequential loads) against the 120/min default |
