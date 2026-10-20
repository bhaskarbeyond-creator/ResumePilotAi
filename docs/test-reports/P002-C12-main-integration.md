# P002 C12: integration of `origin/main` (`f264fe2`)

- **Branch:** `arena/994d7b67-resumepilotai`.
- **Base:** C11 `01a3c546944fdc3f2e1fb88fbed0dc31e85eba15`.
- **Merge commit:** `08acd0bb3101a3a5e654ea9dc9b60a8f18a7898e`. Its parents are C11 and `origin/main` `f264fe2053ee345f90703be3e18071690e240b2a`.
- **This commit (C12)** fixes what the merge brought in. It changes no surface behaviour except the two fixes in §3.1 and §3.2.

Main moved while C11 was in progress. It now holds C9 and C10 plus two maintainer commits:

| Commit | Time (UTC) | Files |
|---|---|---|
| `b39b671` "fix(security): sanitize mock key prefixes and expand test fixture scope for candidate tests" | 16:57 | `AdminSettingsTab.tsx`, `EnterpriseSecurityTab.tsx` (mock key literals), `login.tsx` (preview sign-in for test addresses), `tests/security-static.test.mjs` (fixture folders, three allow-listed literals) |
| `f264fe2` "feat(candidate): complete 10/10 polish on candidate surfaces…" | 18:01 | `settings.tsx`, `job-tracker.tsx`, `router.tsx` (eight legacy aliases), new `candidate-dashboard.spec.ts` (7 tests), `backend/index.js` and `backend/security/abuse.js` (rate-limit skips), `.bridge/state.json` |

## 1. Merge (`08acd0b`)

The merge commit only resolves conflicts. Everything else merged cleanly and was kept as main has it.

| File | Resolution | Why |
|---|---|---|
| `frontend/src/pages/dashboard/settings.tsx` | **Kept C11's page** | Main's version still binds the invented profile keys (`firstName`, `location`, `website`, `bio`). Stored names therefore show blank, and editing one of those fields adds a key that the backend rejects with 400 `UNSUPPORTED_PROFILE_FIELD` (ST-1, P0). A failed load still fills the form from the sign-in name (ST-2). Notification preferences are written to `localStorage`, where nothing reads them. The duplicate support desk stays. The password form still ignores the current password (no re-authentication), and in a preview session it hands the preview user object to Firebase's `updatePassword` (ST-5). C11 fixes or removes each of these, with tests (`P002-C11-settings.md`) |
| `frontend/src/app/router.tsx` | **Union** | Both sides added `/dashboard/profile`, `/dashboard/security` and `/dashboard/account`. The `account` alias keeps C11's target, `?tab=account`, because the shell's "Account Settings" means that section; main's own spec accepts it. Main's five other aliases are kept. `tickets`, `help`, `billing`, `my-resumes` and `job-matching` are each a legacy `DashboardMain` alias (`src/components/Dashboard/DashboardMain/DashboardMain.jsx`, lines 332–341) |

## 2. What else main changed, and what happened to it

| Change | Outcome |
|---|---|
| `job-tracker.tsx`: Radix dialogs, status banners, cover-letter link, test ids | Kept as is. The cover-letter link uses C3's `?role=&company=` deep link, which works. The page gets its own review as the next surface (queue #3) |
| `candidate-dashboard.spec.ts` (new) | Kept. The two Settings cases are rewritten (§3.3); the other five run unchanged |
| `backend/index.js`, `backend/security/abuse.js`: rate-limit skips | **Removed** (§3.1) |
| `login.tsx`: preview sign-in for `.test` and `p002.` addresses | **Narrowed** to `.test` (§3.2) |
| `tests/security-static.test.mjs`: `frontend/tests/` and `scripts/` count as fixture folders; `dist-legacy-backup/` is skipped; three literals allow-listed | Kept; maintainer decision. It also covers the two fixture passwords that C9 and C10 added under `frontend/tests/` (recorded in C11 §4). A new guard test is added to this file (§3.1) |
| `AdminSettingsTab.tsx`, `EnterpriseSecurityTab.tsx` | Kept; outside the P002 scope |
| `.bridge/state.json` | Kept; maintainer tooling |

## 3. Fixes in C12

### 3.1 F-8 (P1, security): rate limits lifted by signals the client chooses

Main's `f264fe2` added two kinds of skip:

- `authBurstLimiter` and `authHourlyLimiter` on `/api/auth` and `/api/email` got `skip: NODE_ENV === 'test' || body email ends with '.test' || header x-e2e-test === '1'`;
- `accountRateLimit` returned early for the same three signals, or for a `.test` email on the caller's identity. Every durable per-account budget is built from it: AI, notifications, exports, scraper, contact, messaging, public browse, general API.

**Evidence**

1. **Existing security tests failed.** On the merge commit, `ai-abuse.test.js` and `dir040-zero-trust.test.js` gave 21/27; they gave 27/27 on C11. The six failures:
   - burst limiter cannot be bypassed by changing source address for one account;
   - burst limiter fails closed when the durable counter store is unavailable;
   - limiters emit the RFC RateLimit family with a sane reset;
   - brute force past the threshold yields 429 with Retry-After;
   - the limiter fails CLOSED with 503 when the counter store is unavailable;
   - a spend budget still fails CLOSED when the counter store is unavailable.
2. **Outside the test environment, the header alone lifts the auth limit (real stack).** A scratch backend ran the merge commit's code on :8082 with `NODE_ENV=development` and the default limits. `POST /api/auth/preview-login` (invalid email, so nothing was created) gave:

   | Requests | Result |
   |---|---|
   | 8 with `x-e2e-test: 1` | `400` × 8 (never limited) |
   | 8 without the header | `400` × 5, then `429` × 3 |
   | 3 more with the header, after the limit was reached | `400` × 3 |

3. **The durable limiter, on the merge commit's code with `NODE_ENV=development`.** A limit of 2, four requests each:

   | Client signal | Result |
   |---|---|
   | none | admitted, admitted, 429, 429 |
   | `x-e2e-test: 1` header | admitted × 4 |
   | `.test` email in the body | admitted × 4 |
   | `.test` email on the identity | admitted × 4 |

   Anyone can register a `.test` address with a public identity provider, and anyone can send the header or a body field.

**Fix**

- Both files are back to their C10 content; `git diff 42ce4c9 -- backend/index.js backend/security/abuse.js` is empty.
- The test environment keeps its existing lifts, which are configuration: the auth limiters default to 10000 when `NODE_ENV=test`, and every limit has an environment variable.
- `scripts/dev-db/README.md` gains a "Rate limits in local end-to-end runs" table. It lists those variables, their production defaults and the values this sandbox uses.

**Tests**

- New `backend/test/rate-limits-no-client-bypass.test.js`, 4 tests. Three check the durable limiter, one per client signal; one checks the auth burst limiter through the app with `AUTH_BURST_RATE_LIMIT_MAX=2`, the header and a `.test` email.
  - Merge commit: **red 4/4**. C12: **green 4/4**.
  - With the two existing limiter files: 31/31.
- New guard in `tests/security-static.test.mjs`: neither file mentions `x-e2e-test` or trusts a `.test` suffix.
- Mutation check: a header-only `skip` re-added to `authBurstLimiter` fails both the static guard and the behavioural test.

### 3.2 F-9 (P3): any address starting with `p002.` was diverted to the preview identity

**Defect.** Main's `b39b671` changed the sign-in condition to `usePreviewIdentity || email.endsWith('.test') || email.startsWith('p002.')`. The preview endpoint answers 404 in production (`testVerifierEnabled()`), so a real user whose address starts with `p002.` could not sign in.

**Fix**

- The prefix test is removed.
- The `.test` test stays, with a comment explaining why: `.test` is a reserved domain (RFC 2606), so no real address can match, and it keeps main's local test runs working, since every P002 account is `…@example.test`.

**Tests**

- New static guard in `tests/security-static.test.mjs`: the sign-in form does not route addresses by prefix or substring.
- Mutation check: re-adding the prefix fails the guard.

### 3.3 Main's `candidate-dashboard.spec.ts`, reconciled with the real Settings page

The two Settings cases asserted main's version of the page:

- test ids;
- a "Danger Zone" heading under Security;
- an MFA button for every session;
- a deletion button disabled until DELETE is typed;
- a notification-preferences tab whose "saved" message came from `localStorage`;
- Light/Dark buttons;
- a support tab inside Settings.

They now walk the same path on the C11 page:

1. **Profile:** the real fields; the sign-in email is read-only.
2. **Security:** a preview session has no password form and no factor control.
3. **Deletion dialog:** refuses `NO` with the inline error and closes on Cancel. Any `POST /api/account/delete` is answered by the test with 418 and fails it, so candidate A cannot be deleted.
4. **Appearance:** theme radio buttons.
5. **Moved sections:** `?tab=notifications` and `?tab=support` open the pages that own those sections.

The legacy-alias case now expects `/dashboard/account` → `?tab=account` and the Account & Data heading. The other five cases (Job Tracker × 2, Support × 2, Favourites) are unchanged. 14/14 at 1366 and 320 before the full run; all five profiles in §5.

### 3.4 Correction: a C8 regression in `tests/dir008-demo-data-guard.test.mjs`

**Defect.** Test 2, "the portfolio builder starts from an empty, honest scaffold", has failed since C8 (`a4d1de4`). C8 moved the empty scaffold from `builder.tsx` into `lib/portfolio-document.ts`, which the builder and the public view share, so the test's text slice came back empty. The C8 root-test selection did not include this file.

**Fix.** The test now checks the same guarantees where they live:

- the builder starts from `emptyCanonical()`;
- the empty heading has no name, headline or photo;
- the scaffold has no bio, hero image, projects or skills;
- the preview says "Unnamed portfolio" and "This portfolio has no content yet.";
- the editor says "No projects added.".

**Tests.** 3/3. Mutation checks: an invented default name fails ("portfolio default still invents a name"), and removing the empty-content message fails.

## 4. Root test sweep: every root test file, against C0

Every `tests/*.test.{mjs,cjs,js}` file (229) ran separately, with a 120 s cap each, on two trees:

- **current:** the merge plus the C12 backend, login and spec changes, before the two test-file edits;
- **C0:** a detached worktree of `ef0bdc7`.

| | Failing files |
|---|---|
| Current | 34 of 229 |
| C0 | 33 of 229 |

- **Failing now, passing at C0:**
  - `dir008-demo-data-guard.test.mjs`: C8, fixed in §3.4.
  - `dir008-employer-resume-access.test.mjs` test 2: maintainer commit `0a4d910` removed "authorised through this application" from `CandidateReviewDrawer.tsx`. The commit reached this branch with the C9 fast-forward; employer code is outside the P002 scope. Recorded.
- **Failing at C0, passing now:** `security-static.test.mjs`, after main's `b39b671`.
- **The other 32 failing files fail in both trees,** with no additional failing test in the current tree (no file hit the time cap). They are environment-bound (live servers, browsers, bridge tooling, missing configs) or pre-existing. One example is `dir024-geo-seo`: `playwright.dir024.config.js` has been absent since `8102750`.

After the C12 edits:

| Check | Result |
|---|---|
| `dir008-demo-data-guard` | 3/3 |
| `security-static` | 15/15 |
| `npm run test:security:static` | 68/68 |
| `test:product`, main list | 735/736; the one failure is `dir024`, pre-existing |
| `test:product`, chained files | 27/27 |
| 15 focused files that read the touched code, including `job-tracker.test.mjs` and every reader of `login.tsx` | 146/146 |

## 5. Gates

All numbers are from the final C12 tree.

| Gate | Result | Baseline (C11) / note |
|---|---|---|
| `npx tsc -b` (frontend) | exit 0, also as the first build step | exit 0 |
| `npx oxlint` | 314 warnings, 0 errors | 317. Main's job-tracker edit removed three unused imports |
| `npm run build` | exit 0, 20.7 s wall (Vite 1.69 s). Entry chunk **693.05 kB** (gzip 208.37 kB), +0.51 kB from main's five alias routes. Job tracker chunk 17.02 kB; Settings chunk 33.60 kB | 692.54 kB. Only the pre-existing >500 kB chunk warning |
| Endpoint contract audit | 78 calls (54 unique), 694 routes, 0 unmatched, 0 unresolved, exit 0. No call added or removed: main's job-tracker edit kept its four tracker calls. `docs/test-reports/P002-C12-endpoint-contract.json` | 78 / 54 |
| Backend full suite (fresh bridge on :3307) | **953 tests, 916 pass, 37 fail**, 87.5 s. The failure set is identical by name to C11's | 949 / 912 / 37. +4 = the new test file |
| Backend rate-limit tests | Merge commit: 21/27 on the two existing files, new file 0/4. C12: 31/31 | §3.1 |
| Full candidate regression (11 specs × 5 profiles) | **612/612 passed** in 50.2 min (610 tests + 2 setup; 0 failed, 0 flaky, 0 skipped). By spec: candidate dashboard (main's) 35, Settings 75, Messages 85, Interview Coach 85, Cover Letters 75, Notifications 75, Resume Builder 55, Portfolio 45, AI Assistant 30, ATS Score 30, auth session 20. It started at 18:52 UTC, after the last source and spec edit (18:47). `docs/test-reports/P002-C12-candidate-regression-playwright.json` | 577/577 in 46.4 min. +35 = main's spec |
| Credential sentinel | 15/15 | Failing at C10 and C11 (16 findings); passes after main's `b39b671` |

The running backends (:8080, :8081) were started on C11 and were not restarted: the tracked backend files in C12 are identical to C11's (`git diff 01a3c54 -- backend/` lists only the new test file). The frontend dev server serves the working tree.

## 6. Recorded, not changed

- **Job Tracker (next surface).** Main's `f264fe2` rebuilt parts of the page. Two points to check in that review:
  - the page and its API work while `public_config.modules.enableJobTrackerModule` is `false`;
  - `/dashboard/applied-jobs` still renders the tracker (O-3).
- **Main's sentinel widening.** `scripts/` and `frontend/tests/` are now fixture folders, so the hardcoded-password rule no longer covers them. Maintainer decision.
- **`dir008-employer-resume-access` test 2** (employer, `0a4d910`) and **`dir024-geo-seo`** (missing config) still fail.

## 7. Evidence

- `docs/test-reports/P002-C12-main-integration.md` (this file)
- `docs/test-reports/P002-C12-candidate-regression-playwright.json`
- `docs/test-reports/P002-C12-endpoint-contract.json`
- `backend/test/rate-limits-no-client-bypass.test.js`
- `tests/security-static.test.mjs`, `tests/dir008-demo-data-guard.test.mjs`
- `frontend/tests/candidate/candidate-dashboard.spec.ts`
- `scripts/dev-db/README.md` ("Rate limits in local end-to-end runs")
