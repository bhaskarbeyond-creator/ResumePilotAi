# P002 · C11 — Settings: a Master Profile that saves, honest security and account controls, and MFA removal behind a recent sign-in

- **Surface:** candidate queue #9, `/dashboard/settings` (`frontend/src/pages/dashboard/settings.tsx`), including the deferred-backlog areas "Master Profile" (`?tab=profile`) and "Security & 2FA Hub" (`?tab=security`) that the C1 audit placed in this row. Legacy reference (read only): `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` and `src/services/api/platform.js`.
- **Base:** `42ce4c921763471ade9e8fbd8cc18c13f825f5f6` (C10), which sits on `origin/main` `b9e799cae61ec12015ee9108bbe24e1696db1d78`. Branch `arena/994d7b67-resumepilotai`.
- **Environment:** UI :4000 → `lib/api-client` (Bearer) → Express :8080 → MariaDB bridge :3306. Preview identities only: no Firebase project is configured, and Firebase Admin runs without credentials.
- **Selection:** of the four remaining candidate pages (Settings, Job Tracker, Favourites, Support), Settings had the most native dialogs (6 `alert`, 1 `confirm`, 1 `prompt`), the only irreversible operations (account deletion, MFA removal), the decorative preferences recorded in C10 (O-2), and the legacy addresses recorded in C1 (aliases ❌). The probe below then showed the Master Profile could not save at all (P0).
- **Backend contracts used** (all existing):
  - `GET /api/users-data/profile`: `{ user: { revision, profile } }`. `profile` is `projectEditableProfile(user)` (`backend/services/profileSanitizer.js`).
  - `POST /api/users-data/profile`: `{ expectedRevision, profile }`, merged onto the stored profile. Only the sanitizer's keys are accepted; any other key → 400 `UNSUPPORTED_PROFILE_FIELD`; a stale revision → 409 `PROFILE_CONFLICT` with `remoteRevision` and `remoteProfile`.
  - `POST /api/account/export`: the owner-scoped archive `{ export: { userId, profile, resumes, …, exportWarnings } }`.
  - `POST /api/account/delete`: the deletion saga (`backend/services/accountDeletion.js`). Personal data is removed in one MariaDB transaction, then the Firebase identity is deleted. If the identity step fails → 503 `ACCOUNT_IDENTITY_DELETE_FAILED` (data gone, identity pending, retryable). The route policy requires a sign-in within `SENSITIVE_AUTH_MAX_AGE_MS` (10 min) using the token's verified `auth_time` → otherwise 403 `RECENT_AUTH_REQUIRED`.
  - `POST /api/users-data/mfa/disable`: removes every second factor and revokes refresh tokens.
- **Backend changes:** `backend/security/policy.js` and `backend/routes/usersData.js`, test first (§2.1).

## 1. What the candidate saw before C11

Evidence: `docs/ui-audit/screenshots/settings/before/` (27 screens plus `capture-report.json`: `profile-blank-names` × 5, `profile-save-rejected` × 5, `security-tab` × 5, `password-no-session` × 2, `decorative-preferences` × 2, `support-duplicate-modal` × 2, `appearance` × 2, `legacy-deep-links` × 4), taken on the C10 code as candidate A ("Avery Tester"), plus three scratch probes whose results are quoted here:

- `probe-profile`: the profile contract;
- `probe-native-dialogs`: every native dialog dismissed, so nothing ran;
- `probe-account-flows`: run only with disposable preview accounts.

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| ST-1 | **P0** | **The Master Profile could neither show nor save the real profile.** The form used invented keys (`firstName`, `lastName`, `location`, `website`, `bio`). The backend projects and accepts the legacy keys (`firstname`, `lastname`, `occupation`, `address`, `city`, `postalCode`, `country`, `websiteUrl`, `linkedinUrl`, `githubUrl`, `summary`), which the resume builder (`lib/master-profile.ts`) and cover letters also read. A's stored "Avery Tester" showed as two empty name fields, and every save answered 400 "Unsupported profile field: firstName." | `before/*profile-blank-names.jpg` (5 profiles); `before/*profile-save-rejected.jpg` (5, each with the 400 and 2 console errors); probe: `GET` → `{"firstname":"Avery","lastname":"Tester",…,"revision":2}`, `POST` with the page's shape → 400 `UNSUPPORTED_PROFILE_FIELD` |
| ST-2 | P1 | **A failed load showed invented data as the profile.** The `catch` filled the form from the sign-in display name and left Save enabled with revision 0. That would either overwrite the stored profile or produce a 409 the user could not explain. | Code (old `loadProfile`) |
| ST-3 | P1 | **Account deletion ran through native dialogs and mishandled both real outcomes.** (a) Confirmation was a native `prompt("… Type DELETE to confirm:")`. (b) This sandbox's real result, 503 `ACCOUNT_IDENTITY_DELETE_FAILED` (personal data deleted, identity pending), appeared as `alert("Account deletion failed: Application data was removed, …")`, with no retry and no sign-out. (c) A session signed in more than 10 minutes earlier got 403 `RECENT_AUTH_REQUIRED`, shown as "Account deletion failed: Please reauthenticate…" with no way to do so. (d) After a success it signed out through `lib/firebase.signOut`, which never clears a preview session (`ime_dev_user`). Because the tombstoned profile still answers 200, the reloaded app would have kept the deleted preview account signed in. | `probe-native-dialogs` (`prompt`); `probe-account-flows`: delete → 503, retry → 503, stale session → 403 |
| ST-4 | P1 (security) | **MFA removal had no recent-sign-in check and leaked provider internals.** (a) Every session saw a "Disable 2FA" button behind a native `confirm`, with `alert` results, even preview sessions that have no Firebase identity. (b) `POST /api/users-data/mfa/disable` only required a valid token. A session signed in an hour earlier reached the handler, which (with credentials) removes all factors and revokes every session; account deletion already had this rule. (c) Provider failures were returned verbatim: 500 `INTERNAL_ERROR` "Credential implementation provided to initializeApp() … failed to fetch a valid Google OAuth2 access token …". | `probe-native-dialogs` (`confirm`); `probe-account-flows`: fresh and 1-hour-old sessions both → 500 with the raw provider message |
| ST-5 | P2 | **The password form could not work.** It asked for the current password but never used it (Firebase only accepts a credential change after re-authentication). In preview sessions `auth.currentUser` is null, so every attempt by a signed-in user failed with "No active authenticated session." | `before/*password-no-session.jpg` (1366, 390) |
| ST-6 | P2 (O-2) | **The notification preferences were decorative.** Five `defaultChecked` checkboxes and a "Save Preferences" button with no handler. The backend does store `profile.preferences` (`language`, `emailNotifications`, `securityNotifications`, `productUpdates`, `profileDiscoverable`), but nothing reads it: the email notifier queues mail without checking it, and the modern UI has no translations. A working save would therefore still change nothing. | `before/*decorative-preferences.jpg` (1366, 390); backend search: no reader of these keys outside the sanitizer |
| ST-7 | P2 | **A second, broken support desk lived inside Settings.** It duplicated `/dashboard/support`, which the shell already links as "Help Desk & Support" and which uses the same ticket API. Its problems: a hand-rolled modal (no dialog role, Escape, focus trap or focus return; labels not tied to fields); clickable `<div>` ticket rows; an unnamed icon-only refresh button; raw ISO timestamps; `alert` errors; and a load failure shown as "You currently have no open support tickets." | `before/*support-duplicate-modal.jpg` (1366, 390) |
| ST-8 | P2 | **Addresses.** The legacy `/dashboard/profile`, `/dashboard/security` and `/dashboard/account` returned 404 (C1 deep-link inventory: aliases ❌). `?tab=account`, the shell's "Account Settings", showed the profile. Going Back to `/dashboard/settings` without `?tab=` kept the previous section on screen, because the effect ignored a missing `tab`. | `before/laptop-1366__dashboard_{profile,security,account}__legacy-deep-links.jpg`; `before/laptop-1366__dashboard_settings_tab_account__legacy-deep-links.jpg` |
| ST-9 | P2 | **Export.** The file downloaded, but the page never said so. Sections the server could not read (`exportWarnings`) were never mentioned. A failure appeared as `alert`. The object URL was revoked immediately after the click. | `probe-native-dialogs`: download `personal-data-export-2026-10-20.json` with A's uid and email, no on-page confirmation |
| ST-10 | P3 | **Accessibility.** Success messages used `role="alert"` and were rendered only when present. Password results were not announced at all. The theme choice used buttons without `aria-pressed` or radio semantics. Sections were buttons, not links (no open-in-new-tab). The `Button loading` prop dropped keyboard focus to `<body>` while saving. | Code |

## 2. Changes

### 2.1 Backend: MFA removal behind a recent sign-in, with controlled provider errors (TDD)

- **`backend/security/policy.js`:** the route policy's recent-sign-in rule now covers `RECENT_AUTHENTICATION_PATHS = {'/account/delete', '/users-data/mfa/disable'}`. Before, it covered only `/account/delete`.
  - The check itself is unchanged. It uses the token's verified `auth_time` (the last real sign-in), never `iat` (when the token was minted or refreshed). The window is `SENSITIVE_AUTH_MAX_AGE_MS`, 10 minutes by default.
- **`backend/routes/usersData.js` (`POST /mfa/disable`):** failures of the identity-provider calls (`getUser`, `updateUser`, `revokeRefreshTokens`) are answered with controlled codes:
  - 503 `IDENTITY_DIRECTORY_UNAVAILABLE`, "The identity service is unavailable, so two-factor authentication was not confirmed as changed. Try again later.";
  - 404 `IDENTITY_NOT_FOUND` for `auth/user-not-found`.
  - The provider's message is logged server-side only. Repository (audit-log) errors keep `replyRepoError`.
- **Test first:** `backend/test/self-service-sensitive-operations.test.js` (new, 5 tests) mounts `requireAuth` → `enforceApiPolicy` → the users-data router, as `index.js` does. Tokens come from the test verifier and carry `auth_time`; the stale token also has a recent `iat`, so a check on `iat` would not pass.
  - **Red on the C10 code, 4 of 5:**
    - a stale session reached the handler (200);
    - the policy let the stale MFA path through;
    - a provider failure returned 500;
    - `auth/user-not-found` returned 500.
  - The fifth test (fresh session: every factor removed, sessions revoked, both audit records written) passed before and after; it guards the success contract.
  - **Green after the change: 5/5.** With `users-data-profile.integration.test.js` and `security.test.js`: 19/19.
- **Real stack after restarting :8080 and :8081** (`probe-mfa-after`, disposable uids): a fresh session gets 503 `IDENTITY_DIRECTORY_UNAVAILABLE` with the generic message (Firebase Admin has no credentials here); a session signed in an hour earlier gets 403 `RECENT_AUTH_REQUIRED`.

### 2.2 Client: `frontend/src/lib/account-settings.ts` (new, 232 lines)

- **`PROFILE_FIELDS`:** the 12 contact fields the legacy settings edited, with the backend's own keys and limits (`profileSanitizer` `SIMPLE_LIMITS`), labels, input kinds and `autocomplete` tokens.
  - The fields are first name (required), last name, professional headline (`occupation`), phone, street address, city, postal code, country, website (`websiteUrl`), LinkedIn, GitHub and professional summary (`summary`).
  - `toProfileFields` maps the projection; `validateProfile` mirrors the server limits and requires a full `http(s)` URL for links.
  - A probe confirmed that every key round-trips through MariaDB, that cleared fields stay cleared, and that a stale revision answers 409 with `remoteProfile`.
- **`changedProfileFields` / `saveProfile`:** a save sends only the fields changed since the form loaded (trimmed, under the backend's keys) on top of the loaded revision. The backend merges them, so list sections, preferences and fields changed elsewhere are untouched.
- **`fetchProfile`.**
- **`requestDataExport`:** returns the file name, the server's JSON and its `exportWarnings`.
- **`requestAccountDeletion`, `disableTwoFactor`.**
- **`AccountApiError`:** carries `status`, `code`, `requestId` and, for 409, the remote snapshot. `needsRecentSignIn` is true for `RECENT_AUTH_REQUIRED`.

### 2.3 Client: `frontend/src/lib/session-security.ts` (new, 117 lines)

- `readSessionSecurity()` reports what the session can manage:
  - `preview`: no Firebase user, so no password and no second factor;
  - `firebase`: its sign-in methods, whether it has a password, and its enrolled second factors (`multiFactor(user).enrolledFactors`).
- `changePassword(current, next)` first calls `reauthenticateWithCredential(user, EmailAuthProvider.credential(email, current))`, then `updatePassword`.
  - Provider codes become plain messages (wrong password, weak password, too many attempts, network).
  - `requires-recent-login`, `multi-factor-auth-required` and `user-mismatch` become "sign in again".

### 2.4 Page (`settings.tsx`, rewritten, 925 → 103 lines) and `frontend/src/components/settings/` (new: `profile-panel.tsx` 295, `security-panel.tsx` 286, `account-panel.tsx` 298, `appearance-panel.tsx` 72, `notice-regions.tsx` 54 lines)

**Sections.** Four sections, each addressable by `?tab=`. Values are case-insensitive; legacy links use `?tab=Profile`.

| Section | `?tab=` | Content |
|---|---|---|
| Master Profile | `profile` (default; unknown values too) | the profile editor |
| Security & 2FA | `security`, `2fa` (legacy) | password and second factors |
| Account & Data | `account`, the shell's "Account Settings" | export and deletion |
| Appearance | `appearance` | theme |

**Navigation.**
- The section list is a `<nav>` of real links with `aria-current="page"`. Each choice is a history entry, so Back, Forward and refresh restore the section.
- Sections that left Settings keep their old links: `?tab=support` replaces itself with `/dashboard/support` and `?tab=notifications` with `/dashboard/notifications`.
- Every section stays mounted; inactive ones use `hidden`. Unsaved Master Profile edits therefore survive a section switch.
- The page wrapper is `relative`, so the sr-only radios and live regions cannot make the document scroll (lesson from C10).

**`profile-panel.tsx`, the Master Profile.**
- Loading state with `aria-busy`.
- If the load fails: an error card with the server's message, a Retry button, and no form, so nothing can be overwritten by mistake. Data already loaded wins over a failed background refetch, so an open draft is never replaced.
- The form:
  - a read-only sign-in email;
  - four fieldsets (Name and headline, Contact and location, Links, Summary), one column on phones and two from `sm`;
  - `maxLength` from the server limits, `aria-required`, and `aria-invalid` with `aria-describedby` for hints, the summary's character count and errors;
  - client validation focuses the first invalid field;
  - "Discard changes", "No changes to save", and an unsaved-changes indicator;
  - a `beforeunload` warning while edits are unsaved.
- Saving uses `aria-disabled` + `aria-busy` and a ref guard, so focus stays on the button.
- On 409 `PROFILE_CONFLICT` the form keeps the edits, adopts the newer revision and explains the choice:
  - save again: only the changed fields are sent, so the edits land on the newer version and another tab's changes to other fields survive;
  - "Load the newer version";
  - "Discard changes", which after a conflict also shows the newer version.
- While nothing is unsaved, the form follows newer saved data.
- The hook (`useMasterProfile`) stays in this lazy chunk; see the build gate.

**`security-panel.tsx`.**
- **Preview sessions:** both cards say plainly that there is no password and no second factor to manage. No password form and no MFA button are shown.
- **Firebase sessions:**
  - password users get a password form (current, new, confirm; at least 6 characters, matching the registration rule; must differ from the current password) using `changePassword`;
  - Google or Facebook users are told to manage their password with that provider;
  - enrolled factors are listed, and "Turn off two-factor authentication" opens a Radix dialog. It states the consequences, then shows the success state (every session was signed out; "Sign in again") or `RECENT_AUTH_REQUIRED` ("Sign in again") or the error.

**`account-panel.tsx`.**
- **Export:** "Download my data" saves the server's JSON as `personal-data-export-YYYY-MM-DD.json`, appending the anchor to the document and revoking the URL after 10 s. It says "Downloaded …", lists any sections not included, and reports failures inline without downloading anything.
- **Deletion:** "Delete account…" is a Radix `DialogTrigger`, so focus returns to it automatically.
  - The dialog lists exactly what the saga deletes and what it keeps (payment records, invoices, security audit logs).
  - It requires typing `DELETE`; a wrong word is an inline error and nothing is sent. Closing is blocked only while a request is in flight. Reopening starts clean.
  - Outcomes:
    - **success:** sign out through the auth provider (which clears preview sessions), then a full load of `/`, so no cached data of the account stays in memory;
    - **503 `ACCOUNT_IDENTITY_DELETE_FAILED`:** "Your personal data was deleted", with Retry identity removal and Sign out (a retry resumes the saga at the identity step);
    - **403 `RECENT_AUTH_REQUIRED`:** "Nothing was deleted. Sign in again, then return here." The sign-out lands on `/login?next=` the same section;
    - **other errors:** "Your account was not deleted." plus the server's message (the data step is a single transaction).
  - After each outcome, focus moves to the next action.

**`appearance-panel.tsx`.** Native radio inputs, named by the visible label and described by the hint. Arrow keys work natively. The provider applies the theme at once and keeps it on this device (`localStorage` `ime365_theme`); a status message confirms the change.

**`notice-regions.tsx`.** An always-rendered polite status and an assertive alert per card. They are empty until a message arrives, and `empty:m-0` keeps empty regions from adding space.

### 2.5 Router (`frontend/src/app/router.tsx`, +4 lines)

`/dashboard/profile`, `/dashboard/security` and `/dashboard/account` now redirect to the matching section. These are the legacy addresses from the C1 deep-link inventory, not invented routes.

### 2.6 Hooks (`use-api-hooks.ts`, +1 line)

Only `queryKeys.dashboard.profile` is added.

### 2.7 Removed

- **The decorative notification preferences (ST-6; C10's O-2).** Nothing honours `profile.preferences`, so any toggle would be a fake. The real gap is recorded in §6.
- **The duplicate support desk (ST-7).** The shell's "Help Desk & Support" and the old `?tab=support` link both open `/dashboard/support`, which is reviewed as its own surface (#10).

## 3. Tests

### 3.1 `frontend/tests/candidate/settings.spec.ts` (new): 15 tests × 5 profiles

**Data and safety.**
- Real stack. Master Profile tests run as candidate A. Each snapshots A's 12 fields first and writes them back afterwards through the same API. The cover-letter spec reads A's names, and the setup project re-saves A's names on every run.
- Only a disposable preview account, registered through the real form inside the test, is ever deleted.
- Wherever candidate A opens the deletion dialog, a labelled route answers any deletion request with 418 and the test asserts that none was sent.
- Failure paths are labelled Playwright routes. The real deletion outcome in this sandbox is the partial state, 503: there are no identity-provider credentials.

| # | Test | Verifies |
|---|---|---|
| 1 | loads the real profile, saves edits through the API and keeps them after reload | A's real names and read-only email load. Both live regions exist, empty, before any message. Seven fields edited, including the summary counter. The POST carries exactly those 7 backend keys; "Master Profile saved." is shown and focus stays on Save. The API shows every typed value stored; after reload the values are back. |
| 2 | validates before sending, focuses the first problem, and discards or skips unchanged saves | `maxlength` 120 / 5000 and `aria-required`. A blank first name and `example.com` give an alert, focus on First name, `aria-invalid`, and accessible descriptions with the messages, with **0 POSTs**. Discard restores the saved values and clears errors; an unchanged save says "No changes to save" (still 0 POSTs). |
| 3 | keeps the edits on a save conflict, merges them onto the newer version, or shows that version | "Another tab" writes city and country for real, leading to 409: the alert shows, the typed city is kept, and the API is untouched. Saving again sends **only** `{ city }`: the API stores this tab's city **and keeps the other tab's country**, which the form then shows. A second conflict, then "Discard changes", shows the newer city. A third, then "Load the newer version", shows it too and leaves the server unchanged. |
| 4 | shows a loading state, then a retryable error instead of an empty form | Opened from the shell's account menu (in-app navigation). Labelled: the page's first two profile reads (XHR; the query retries once) are answered slowly with 503, while the fetch-based session check is untouched. Shows "Loading…", then the error with the server's message and **no form**; Retry shows the real profile. |
| 5 | reports a failed save without claiming success and keeps the typed values | Labelled 500 on POST: the alert shows the server's message, the status region stays empty, the typed value is kept, the page still says "unsaved", and the API is unchanged. |
| 6 | keeps unsaved edits across sections and warns before a reload drops them | Edit, switch to Appearance: a `beforeunload` event is cancelled. Back: the draft is still there. After discard, no warning. |
| 7 | section links keep history and refresh, and every supported address opens its section | `aria-current`; Back, Forward and reload; the inactive section is hidden. 8 addresses: default, `?tab=Profile`, `2fa`, `ACCOUNT`, unknown, and `/dashboard/{profile,security,account}`. `?tab=support` goes to `/dashboard/support` and `?tab=notifications` to `/dashboard/notifications`. |
| 8 | the account menu and the sidebar open the matching sections | The account menu's "Account Settings", "Security & 2FA Hub" and "Your Profile", plus the sidebar link, which uses the drawer at 1024 px and below. |
| 9 | a preview session is told plainly that it has no password or second factor to manage | Both notices. No password input, no 2FA button, no native dialog. |
| 10 | downloads the real data export, holding this account's data only | The download event and file name; the JSON's `userId` is A's uid and its email A's. Neither B's uid nor B's email appears anywhere in the file. "Downloaded … .json" (or the list of missing sections); focus kept. |
| 11 | reports a failed export and downloads nothing | Labelled 500: the alert reads "Your data was not exported. …", focus kept, 0 downloads. |
| 12 | the deletion dialog needs DELETE typed, closes every way, returns focus and reopens clean | Candidate A, guarded. The dialog lists what is deleted and what is retained; focus starts in the confirmation field; the dialog fits the viewport; the body cannot scroll. An empty or wrong word gives an inline error with `aria-invalid` and a description. Cancel, Escape and Close each return focus to the trigger; reopening starts empty; Tab stays inside. **0 deletion requests.** |
| 13 | a stale sign-in deletes nothing; the real deletion removes the data, retries, then ends the session | Disposable account registered through the form, then: (1) labelled 403 `RECENT_AUTH_REQUIRED`: "Nothing was deleted", focus on "Sign in again", API shows the account intact; (2) **real deletion, 503 `ACCOUNT_IDENTITY_DELETE_FAILED`**: "Your personal data was deleted", focus on Retry; API shows the profile anonymised (`deleted+…@invalid.local`, empty names); (3) **real retry, 503**: "still pending"; (4) labelled 200 for the final identity removal: the session is cleared (`ime_dev_user` gone), `/` loads, and Settings now redirects to `/login?next=`. |
| 14 | the theme applies at once, survives a reload and works from the keyboard | Clicking the Dark card: the radio is checked and described, `html.dark` is set, and the status confirms. After reload it is still Dark. Arrow keys move to System, then Light, and `localStorage` holds `light`. |
| 15 | every section and the open deletion dialog pass axe, without document scroll or horizontal overflow | axe (WCAG 2.0/2.1 A + AA) on all four sections and on the open dialog. No horizontal overflow; `scrollHeight` ≤ `innerHeight` + 1. Guarded: 0 deletion requests. |

### 3.2 Mutation checks (each guarantee removed in turn; the named test must fail)

Run at 1366 with `-g` on the named test. Every file was restored from its backup, and a search for the mutation markers came back empty.

| # | Mutation | Caught by | Result |
|---|---|---|---|
| M1 | Old contract: `firstName` key | 1 | caught (names never load) |
| M2 | A failed save reported as "Master Profile saved." | 5 | caught |
| M3 | A failed load renders a blank editable form (the old fallback) | 4 | caught |
| M4 | A conflict replaces the typed edits | 3 | caught |
| M5 | Validation skipped | 2 | caught |
| M6 | Deletion without typing `DELETE` | 12 (guarded; the request hit the 418 guard, never the server) | caught |
| M7 | Partial deletion (503) reported as "not deleted" | 13 | caught |
| M8 | Completion does not end the session | 13 ("the session was cleared") | caught |
| M9 | Stale sign-in not recognised | 13 | caught |
| M10 | A failed export reported as downloaded | 11 | caught |
| M11 | The section ignores the address | 7 | caught |
| M12 | Moved sections no longer redirect | 7 | caught |
| M13 | Only the active section mounted (draft lost) | 6 | caught |
| M14 | No unsaved-changes warning | 6 | caught |
| M15 | The dialog does not return focus | 12 | caught |
| M16 | Live regions rendered only with a message | 1 | caught |
| M17 | A preview session shown the dead password form | 9 | caught |
| M18 | The save sends the whole form again (reverting another tab's changes) | 3 (and 1) | caught |
| M19 | "Discard changes" after a conflict shows the stale version | 3 | caught |

All 19 caught on the final code. Two notes on how the checks evolved:
- Test 1's "live regions exist before any message" assertion was added before the first mutation run, after review showed that M16 would otherwise go unnoticed.
- M18 and M19 cover the fix in §3.6.

### 3.3 Modal checklist (§10.2): the account-deletion dialog

| # | Item | Evidence |
|---|---|---|
| 1 | The trigger opens the expected interface | Tests 12, 13 ("Delete account…" → "Delete your account?") |
| 2 | Visible and correctly positioned | Test 12: the bounding box lies inside the viewport at all five profiles |
| 3 | Shows correct real data | The deletion scope matches the saga's tables and retained classes. The partial state is the server's real 503 (test 13) |
| 4 | Inputs and validation | Test 12: empty or wrong word gives an inline error, `aria-invalid` and a description; 0 requests (M6) |
| 5 | Primary and secondary actions | Test 13: delete (real), retry (real), completion (labelled 200), Cancel |
| 6 | Cancel and close controls | Test 12: Cancel and Close |
| 7 | Escape dismisses | Test 12. Escape and outside clicks are ignored only while a request is in flight, so the outcome is never lost |
| 8 | Focus enters and returns to the trigger | Tests 12, 13; M15 |
| 9 | Focus stays inside | Test 12: six Tab presses stay in the dialog |
| 10 | Background scrolling | Test 12: `body` has `overflow: hidden` while open |
| 11 | Failed operations never report success | Test 13: 503 is "data deleted, identity pending", never "deleted"; 403 is "nothing was deleted" (M7, M9) |
| 12 | Usable at 390 and 320 | All tests at five profiles; test 12 checks the fit |
| 13 | Destructive actions need confirmation | Typing `DELETE` (test 12, M6) |
| 14 | Reopening shows no stale state | Tests 12, 13: empty field, no old message |

The "Turn off two-factor authentication" dialog uses the same Radix pattern but appears only for a Firebase identity with enrolled factors. No such identity exists in this sandbox, so its checklist was not executed (§6).

### 3.4 Accessibility

- **axe** (WCAG 2.0/2.1 A + AA): 0 violations on all four sections and on the open deletion dialog, at five profiles (test 15).
- **Keyboard:**
  - sections are links in a named `<nav>`, with `aria-current`;
  - the theme is a native radio group (arrow keys, test 14);
  - the first invalid field receives focus (test 2), and Save keeps focus while saving (test 1);
  - dialog focus enters, is trapped and returns (test 12), and moves to the next action after each outcome (test 13).
- **Announcements:** each card has an always-rendered polite status and an alert (test 1, M16). Messages never rely on colour: errors are text, "(required)" is text, and the destructive card has a text title.
- **Forms:** every field has a visible `<label>`. Hints, the character count and errors are linked with `aria-describedby`, and the `autocomplete` tokens are set (`given-name`, `family-name`, `tel`, `street-address`, `postal-code`, `country-name`, `url`, …).
- **Contrast:** Cuba M3 tokens throughout (`text-ink`, `text-ink-secondary`, `text-ink-muted` on `bg-surface`; error and success token pairs).

### 3.5 Authorization, isolation and persistence

- **Export** is owner-scoped on the server (`req.user.uid`). A's downloaded archive contains neither B's uid nor B's email (test 10).
- **Profile:** the route writes only `req.user.uid`. A submitted `userId` mismatch → 403, server-owned fields → 403, and a missing revision → 400; these are existing route tests, passing in the full suite. Saved values are re-read through the API and after reload (tests 1, 3). A failed save leaves the server unchanged (test 5).
- **Deletion** acts only on the caller's uid and needs a recent sign-in (existing policy, unchanged). The spec deletes only disposable accounts and confirms the anonymised profile through the API (test 13).
- **MFA removal** now needs a recent sign-in, and provider errors are controlled (5 new backend tests, real-stack probe).
- **No token** → 401 (`requireAuth`, existing route tests).

### 3.6 A defect found in review, before commit

The first implementation sent all 12 fields on every save. After a conflict, "save again" would therefore have written this tab's stale values over fields that only the other tab had changed: a silent revert, despite the message promising "on top of the newer version". "Discard changes" after a conflict also went back to the stale version.

Both were fixed before commit (§2.2, §2.4) and are pinned by test 3, M18 and M19. The first full regression run was stopped at 71/577 (0 failures) so that the run of record covers the fixed code.

## 4. Gates

All numbers are from the final C11 code on its base, C10 `42ce4c9`, unless a row says otherwise.

**`origin/main` moved during C11.** The fetch before the commit found `f264fe2053ee345f90703be3e18071690e240b2a`. Main now contains C9 and C10 plus two maintainer commits, `b39b671` and `f264fe2`; the second also changes `settings.tsx` and `router.tsx`. C11 was built and verified on `42ce4c9` and is committed there. Main is integrated in the next commit, which gets its own verification (§6).

| Gate | Result | Baseline (C10) / note |
|---|---|---|
| `npx tsc -b` (frontend) | exit 0 (19.3 s on the final code; also the first step of the build) | exit 0 |
| Spec type-check (`npx tsc --noEmit --ignoreConfig --strict … tests/candidate/settings.spec.ts`) | exit 0 | Test files are not included in `tsc -b` |
| `npx oxlint` (frontend) | 317 warnings, 0 errors; 0 in C11 files | 317. The only warning in a touched file (unused `normalizeError` import in `use-api-hooks.ts`) is pre-existing |
| Full candidate regression (10 specs × 5 profiles) | **577/577 passed** in 46.4 min (575 tests + 2 setup; 0 failed, 0 flaky, 0 skipped). By spec: Settings 75, Messages 85, Interview Coach 85, Cover Letters 75, Notifications 75, Resume Builder 55, Portfolio 45, AI Assistant 30, ATS Score 30, auth session 20. Run on the C11 code before one later change, made after the run: `signInMethodName` in `lib/session-security.ts` became a `switch` with the same labels, because the repository's credential sentinel misread the old object map (a `password` key whose value is the label "email and password") as a hardcoded password (next row). `docs/test-reports/P002-C11-settings-playwright.json` | 502/502 in 40.1 min. +75 = the Settings spec. A first run was stopped at 71/577 (0 failures) when review found the defect in §3.6 |
| Settings spec on the final code | **77/77** in 6.4 min (75 + 2 setup; 0 failed, 0 flaky, 0 skipped). `docs/test-reports/P002-C11-settings-spec-final-playwright.json` | The only file changed after the full run is `lib/session-security.ts`, and only the Settings page imports it |
| Credential sentinel (`tests/security-static.test.mjs`, test 1) | C11 adds no finding: with the C11 files staged, the test reports the same 16 findings as on the C10 base | **Already failing on the C10 base** with 16 findings. Two are fixture passwords from C9 and C10 (`frontend/tests/candidate/arrange-applications.ts`, `messages.spec.ts`), outside the sentinel's fixture folders. The rest are older (`dist-legacy-backup/`, `scripts/`, an admin and an enterprise tab, a DIR-008 test). Main's `b39b671` widens the fixture folders; see the integration commit |
| Mutation checks | 19 of 19 caught (M1–M19), all files restored | §3.2 |
| Endpoint contract audit | **78 calls (54 unique), 694 routes, 0 unmatched, 0 unresolved, exit 0.** The five Settings calls now live in `lib/account-settings.ts` and match their routes. `docs/test-reports/P002-C11-endpoint-contract.json` | 81 / 54, 0 / 0. The −3 calls are the duplicate support desk's ticket calls (`GET` and `POST /api/support/tickets`, `POST …/:ticketId/messages`). The Support page still makes them, so the unique count is unchanged |
| `npm run build` (`tsc -b` → `vite build` → sync-dist) | exit 0 on the final code, 20.4 s wall (Vite's render stage: 1.80 s). **Entry chunk 692.54 kB** (gzip 208.32 kB), +1.51 kB: `firebase/auth` functions bundle into the entry chunk wherever they are used, and the password change and factor list need `reauthenticateWithCredential`, `EmailAuthProvider` and `multiFactor`. Keeping `useMasterProfile` out of `use-api-hooks.ts` saved 4.23 kB of an initial +5.74 kB. Settings chunk 33.60 kB (gzip 10.51 kB). sync-dist: 307 files | 21.7 s; entry 691.03 kB. Only the pre-existing >500 kB chunk warning |
| Backend unit tests (new) | `self-service-sensitive-operations.test.js`: red 4/5 on the C10 code → green 5/5. With `users-data-profile.integration.test.js` and `security.test.js`: 19/19, re-run on the final code | §2.1 |
| Backend full suite (`cd backend && npm test`, against a separate fresh bridge on :3307) | 949 tests, 912 pass, 37 fail, 83 s. **The failure set is identical to the C10 baseline's** (26 top-level + 11 nested, compared by name) | Baseline run from a detached worktree of `42ce4c9` on its own fresh bridge: 944 / 907 / 37, 84 s. +5 = the new test file. The same 37 failed in C6, C7 and C10: AI tenant/BYOK routing, AI route contract, enterprise role view, data lineage and MariaDB 11.4 integration suites |
| Root source-contract tests that read Settings, account or MFA code | **92/92**, re-run on the final code. The 10 files: `account-lifecycle-regression`, `admin-ai-settings`, `admin-settings-regression`, `admin-workflow`, `ats-module-toggle`, `auth-mfa-ui-adversarial`, `custom-pages-lifecycle`, `employer-lifecycle`, `public-discovery`, `user-product-completeness` | Selected by searching `tests/` for the touched files and routes |
| axe (WCAG 2.0/2.1 A + AA) | 0 violations on the four sections and the open deletion dialog at 5 profiles | Asserted in the spec (test 15) |
| Authorization and isolation | Export owner-scoped (A's file has no trace of B); profile writes only the caller's uid; deletion only the caller's, behind a recent sign-in; MFA removal now behind a recent sign-in; no token → 401 | §3.5 |
| Persistence | Profile saves re-read through the API and after reload (tests 1, 3). Failed saves leave the server unchanged (test 5). The theme survives a reload (test 14). The deletion result is checked through the API (test 13) | — |
| Deep links | `/dashboard/settings?tab=` `profile`, `security`, `2fa`, `account` or `appearance` (case-insensitive; unknown values open the profile): direct load, reload, Back/Forward. Legacy `/dashboard/{profile,security,account}` redirect to their sections. `?tab=support` → `/dashboard/support`; `?tab=notifications` → `/dashboard/notifications` (test 7) | Three legacy routes from the C1 inventory; no invented route |
| Screenshots | before: 27, on the C10 code (§1). after: 27, on the final code: `master-profile` × 5, `profile-validation` × 2, `profile-saved` × 2, `security-preview-session` × 5, `account-and-data` × 5, `delete-dialog` × 3, `appearance` × 2, `legacy-alias` × 1, `deletion-identity-pending` × 2 | `capture-report.json` in each folder. All after-screens are clean except the two `deletion-identity-pending` screens. Those record the expected 503 `ACCOUNT_IDENTITY_DELETE_FAILED` of a real deletion of a disposable account, plus Chromium's matching console line. A's profile was snapshotted before the `profile-saved` captures and written back after each one. Each profile ran separately, because a second save of the same value is correctly a no-op |

## 5. Findings outside this surface (recorded, not fixed here)

| ID | Sev | Finding | Evidence | Why not fixed in C11 |
|---|---|---|---|---|
| F-1 | **P1 (security)** | Unchanged from C9: any signed-in user can publish an active, featured job through `POST /api/jobs-data/:id`. | C9 report §5 | Employer domain; needs a maintainer decision and an employer regression. |
| F-4 | P3 | Unchanged from C10: status-change notifications say "at Company". | C10 report §5 | Employer workflow and repository mapping. |
| F-5 | P2 | Unchanged from C10: the stored application revision never advances, so status notifications replace each other. | C10 report §5 | Repository and schema work in the application workflow. |
| F-6 | — | **Fixed in C11** (§2.1): MFA removal now needs a recent sign-in, like account deletion, and identity-provider failures are controlled. | `backend/test/self-service-sensitive-operations.test.js`; `probe-mfa-after` | — |
| F-7 | P3 (hardening) | **`replyRepoError` echoes raw error messages on 500.** `backend/routes/errorResponder.js` returns `err.message` for every status, so an unexpected driver, provider or programming error reaches the client verbatim. ST-4(c) was one instance, now handled inside the MFA route. | Code; `probe-account-flows` | The responder is shared by every data route and pinned by their tests; changing what 500s say needs a review across routes. |
| O-1 | P3 | Unchanged: the API client strips a leading `/api/`. | C9 report | — |
| O-2 | — | **Resolved in C11** by removing the decorative controls (ST-6). The underlying gap is G-1 in §6. | — | — |
| O-3 | P2 | Unchanged: no candidate page lists the user's real job applications. | C10 report §5 | Job Tracker surface (#3). |
| O-4 | P3 | Unchanged: notifications created in the same second have no defined order. | C10 report §5 | Schema change. |
| O-5 | P3 | **After a partial deletion, the account keeps working as a tombstone.** While identity removal is pending, the session stays valid. `GET /api/users-data/profile` answers 200 with `displayName: "Deleted user"` and a `deleted+…@invalid.local` email, and other pages would show that. The Settings dialog explains the state and offers Retry and Sign out. | `probe-account-flows`; spec test 13 | A server rule (for example, refusing a tombstoned uid outside the deletion route) is a design decision for the deletion saga. |

## 6. Remaining (recorded, not hidden)

- **Firebase-only flows could not run here (environment-blocked: no Firebase project, no Admin credentials).** These are:
  - the password change (re-authentication, then update);
  - the list of enrolled factors and the "Turn off two-factor authentication" dialog;
  - a completed deletion (200).

  They are typed against `firebase/auth` and follow its documented API. The completed-deletion handling was exercised with a labelled response (test 13). Production verification needs a Firebase identity.
- **G-1: notification and other preferences.** The backend stores `profile.preferences` but nothing honours it. A real preferences section first needs the email notifier (and in-app producers) to read those flags. A language preference also needs translations, which the modern UI does not have.
- **Master Profile list sections are not editable anywhere in the modern UI** (deferred "Master Profile" backlog item). These are experience, education, skills, languages, certifications, projects, achievements, references, custom sections and hobbies. The editor here sends only the 12 contact fields, and the backend merges them, so those lists are never touched.
- **Two-factor enrolment (TOTP set-up) has no modern UI** (deferred "Security & 2FA Hub" backlog item). The card says so for Firebase users without factors.
- **Legacy parity not offered:**
  - changing the sign-in email (Firebase `updateEmail` plus verification; shown read-only here);
  - photo upload and crop;
  - the billing-history table;
  - the subscription modal ("Subscription & Plans" stays a deferred backlog item, and `/dashboard/plans` redirects to `/pricing`).
- **The theme is per device.** That is how the existing theme provider works, and the page says so.
- **Integration of `origin/main` (next commit).** Main moved to `f264fe2` during C11 (§4). That commit also edits `settings.tsx`, and three problems remain in its version:
  - the form still binds the invented keys (`firstName`, `location`, `website`, `bio`; ST-1), and a failed load still fills it from the sign-in name (ST-2);
  - notification preferences are kept in `localStorage`, where nothing reads them (ST-6);
  - the duplicate support desk stays (ST-7).

  It also adds the same three legacy aliases, but sends `/dashboard/account` to the profile. The next commit merges main, keeps this page, reconciles main's new `candidate-dashboard.spec.ts` with it, and is verified on its own.
