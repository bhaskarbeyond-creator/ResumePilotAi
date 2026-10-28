# Allegation Resolution Register

**Revision:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62`
**Scope:** every allegation supplied to this audit, plus the four the V4 mandate names explicitly
(`RA-31` … `RA-34`), plus allegations this audit raised against itself.
**Narrative version:** `LEGACY-MODERN-FEATURE-INVENTORY.md` §5 (kept for the prose evidence trail).
This document is the authoritative register: one row per allegation, one disposition, no silent drops.

## 0. ID reconciliation (documented, not silent)

The 2026-10-29 pass seeded four internal hypotheses as `RA-31` … `RA-34`. The V4 mandate defines
`RA-31` … `RA-34` as OAuth security, employer rejection reasons, portfolio-gallery capabilities and OAuth
provider breadth. Three of the four topics coincide.

| Conflict | Resolution |
|---|---|
| Old `RA-31` = "employer dashboard analytics are server-derived" vs mandate `RA-31` = OAuth flow/security | Old item **renumbered to `RA-35`**; mandate definition takes `RA-31`. Mapping recorded in `AUDIT-CHANGE-HISTORY.md` §3. The item is not deleted and its disposition is unchanged (`UNVERIFIED`). |
| RA-32 / RA-33 / RA-34 | Topics already matched the mandate; these rows were **deepened** (see §3). |

No other IDs were renumbered. `RA-01` … `RA-30` are unchanged.

## 1. Disposition summary

| Disposition | Count | IDs |
|---|---:|---|
| `CONFIRMED` | **32** | RA-01, 05, 06, 07, 08, 09, 10, 14, 15, 16, 17, 18, 19, 20, 24, 26, 28, 29, 34, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48 |
| `CONFIRMED — CORRECTED` (right conclusion, wrong number) | **1** | RA-04 |
| `PARTIALLY CONFIRMED` | **4** | RA-12, RA-21, RA-31, RA-32 |
| `REFUTED` | **10** | RA-02, 03, 11, 13, 22, 23, 25, 27, 30, 33 |
| `UNRESOLVED` | **1** | RA-35 |
| **Total** | **48** | RA-01 … RA-48 |

Every row carries evidence. A `REFUTED` verdict is never based on "a file with a similar name exists" —
each cites the call site, endpoint, or measurement that disproves the claim.

## 2. Full register

| ID | Allegation | Disposition | Decisive evidence | Feature row |
|---|---|---|---|---|
| RA-01 | The running application is `frontend/`, not root `src/` | `CONFIRMED` | every root npm script uses `--prefix frontend`; `scripts/sync-dist.mjs` publishes `frontend/dist` | — (build/packaging, no capability row) |
| RA-02 | Root `src/` is dead code and can be deleted | `REFUTED` | **8** `backend/test/*.test.js` name legacy `src/` paths (`ai-remediation-phase3`, `email-deliverability-honesty`, `free-download-upsell-contract`, `interview-contextual-quality`, `p1-gap-source-contract`, `payment-settings-rbac`, `session-reauth-lifecycle`, `ux-entitlement-alignment`); `scripts/candidate-workspace-inventory.mjs:4` imports `../src/components/cuba/candidateNavigation.js`; `src/` is the only implementation of the 30 `MISSING` capabilities; deleting it breaks the suite and the census script | — |
| RA-03 | The modern frontend is a thin shell / mostly mock | `REFUTED` | 206 source files, 68,812 lines, 100 routes, 161 endpoints; `tsc --noEmit` exit 0 | — |
| RA-04 | Portfolio builder collapsed 82 files → 3 | `CONFIRMED — CORRECTED` | `src/components/PortfolioBuilder` = 82 files; modern portfolio surface = **6** files (3 components + 3 pages), not 3 | FP-C01..C04 |
| RA-05 | Puck drag-and-drop editing was dropped | `CONFIRMED` | no `@puckeditor` import under `frontend/src`; legacy `LegacyPuckEditor.jsx` | FP-C01 |
| RA-06 | Saved portfolios can no longer be edited | `CONFIRMED` | `builder.tsx:347` `editable = isWebCvDocument(stored)`; `:477` "Built with the earlier page editor"; `portfolio-document.ts:412` rejects block content | FP-C04 |
| RA-07 | 71 modular portfolio blocks removed | `CONFIRMED` | `PortfolioComponents/` = 71 files, no modern equivalent | FP-C02 |
| RA-08 | Voice interview removed | `CONFIRMED` | `LiveInterviewSession.jsx` 1,691 + `LiveVoiceEngine.js` 233 + `LiveAudioWaveform.jsx` 254 + `useInterviewMedia.js` 254 = 2,432 lines across the four voice-path files (`wc -l`, verified); 0 `getUserMedia`/`SpeechSynthesis`/`AudioContext` references under `frontend/src` | FP-D01, FP-D02 |
| RA-09 | Command palette removed | `CONFIRMED` | `CubaCommandPalette.jsx` 787 + `portalCommands.js` 109 + `AdminCommandPalette.jsx` 239 + `adminEntitySearch.js` 141 + `candidateEntitySearch.js` 95 = 1,371 lines (`wc -l`, verified); 0 ⌘K/palette handlers in modern. Earlier figure of 1,527 was not reproducible and is withdrawn | FP-D04 |
| RA-10 | Candidate HUD removed | `CONFIRMED` | `CubaHud.jsx` (46 lines) has no counterpart | FP-D06 |
| RA-11 | 51 CV templates reduced to ~8 | `REFUTED` | `TEMPLATES` array scanned with a string-aware bracket parser: **100** entries, `Cv1`…`Cv100`, against 51 legacy `cv*` dirs; `router.tsx` registers per-template export routes. Earlier "104" was a raw `grep -c "id: '"` artefact that also counted the 8 filter chips; corrected | FP-E02 |
| RA-12 | Template design diversity reduced | `PARTIALLY CONFIRMED` | 100 entries carry only **5** distinct `archetype` values and **6** distinct `headerStyle` values; variation is palette/font/timeline/divider/density over a shared engine, vs 51 hand-built legacy directories. Earlier "9 archetypes / 24 families" not reproducible, withdrawn | FP-E03 |
| RA-13 | Per-section ATS health lost | `REFUTED` | `ats-score.tsx:311` maps `result.sections`; JD targeting `:202-225` | FP-E04 |
| RA-14 | Profile-photo cropping removed | `CONFIRMED` | 0 `crop` matches in `frontend/src` | FP-E06 |
| RA-15 | QR-code generation removed | `CONFIRMED` | 0 `qrcode` matches | FP-E07 |
| RA-16 | Google Maps / location autocomplete removed from job discovery | `CONFIRMED` | 0 map-SDK loads in `frontend/src` (`maps.googleapis.com`, `mapbox-gl`, `leaflet` → 0; the only 2 "Google Maps" hits are an admin API-key field at `AdminSettingsTab.tsx:1059` and an unused `VITE_GOOGLE_MAPS_API_KEY` type) vs legacy `JobsListings/GoogleMapsProvider.jsx`; job location filter is a plain `<input>` (`jobs/portal.tsx:124`); `AutocompleteInput` has exactly one consumer, `pages/dashboard/resume-builder.tsx`, so autocomplete survives only in the editor, never in discovery | FP-F07, FP-G17 |
| RA-17 | Admin audit-log viewer missing or faked | `CONFIRMED` | `useAdminAuditLogs` = 0 consumers; `AdminSecurityTab` seeds 4 arrays; `GET /admin/audit-logs` is real, guarded and tested but has **no UI call site** (OP register: `UNREACHABLE`, rule R2) | FP-A05, FP-A22 |
| RA-18 | Admin security / operator / announcement panels fabricated | `CONFIRMED` | `AdminSecurityTab.tsx:68` `INITIAL_EVENTS`; `:201-209` `handleRevokeSessions` → toast "Next request will return 401" with no fetch | FP-A05..A08 |
| RA-19 | Marketing-content administration removed | `CONFIRMED` (worse: fabricated) | `AdminContentMarketingTab.tsx` seeds 16 records (5 of them real third-party brands: Google Cloud Partner, NVIDIA Inception, Microsoft for Startups, AWS Activate, Stripe Climate) with 0 API references | FP-A09 |
| RA-20 | Tenants / coupons / refunds / invoices / webhooks have no admin UI | `CONFIRMED` | all four endpoint families classified `UNREACHABLE` in the operation register | FP-A12, A14, A15 |
| RA-21 | SMTP/IMAP administration removed | `PARTIALLY CONFIRMED` | `AdminEmailSmtpTab.tsx` exists and is wired: `GET /email/admin/settings`, `GET /email/admin/deliverability`, `POST /email/admin/save-smtp`, `POST /email/admin/test-connection` are all `UI-REACHABLE` (rule R1). Not reachable: `POST /email/admin/test-imap`, `GET/POST /email/admin/custom-templates`, `POST /email/admin/save-template-customization`, `POST /email/admin/reset-circuit-breaker`, `GET /email/admin/circuit-breaker-status`, `GET /email/logs`, `POST /email/resend`, `POST /email/send-email` — all `SERVER-ONLY` (rule R4). So SMTP settings survive; IMAP testing, custom template editing, circuit-breaker control and mail logs do not | FP-A16 |
| RA-22 | Enterprise talent-cloud features missing | `REFUTED` | 19 modern enterprise files vs 27 legacy (mostly infra); tab-for-tab parity; archive/restore, suspend/reactivate, AI provider admin are modern additions | FP-B01..B11 |
| RA-23 | Enterprise CSV/audit export dropped | `REFUTED` | `EnterpriseUsersTab.tsx:287`, `EnterpriseAuditTab.tsx:85-90` | FP-B08 |
| RA-24 | Enterprise bulk member operations dropped | `CONFIRMED` | legacy `src/enterprise/components/EnterpriseUsersTab.jsx:250-300` `handleBulkAction` loops `selectedRows` issuing per-member `DELETE`/`PATCH /api/enterprise/memberships/{id}` with a success counter and partial-failure message, plus a bulk bar at `:454`; modern `components/enterprise/EnterpriseUsersTab.tsx` has no selection state and only single-target `deleteMembership` (`:263`) | FP-B03 |
| RA-25 | Candidate/employer messaging dropped | `REFUTED` | `pages/dashboard/messages.tsx` + 4 components + `lib/messages.ts` | FP-D11 |
| RA-26 | Employer onboarding wizard dropped | `CONFIRMED` | `EmployerOnboarding.jsx` legacy-only | FP-F04 |
| RA-27 | Notification centre dropped | `REFUTED` | bell in `cuba-app-shell.tsx` + `pages/dashboard/notifications.tsx` | FP-D07 |
| RA-28 | Internationalisation dropped (found by this audit) | `CONFIRMED` | 16 locales, 1,011 keys, 131 legacy consumers → 0 modern i18n references | FP-G03 |
| RA-29 | GA4 / per-route SEO / service worker / consent dropped (found by this audit) | `CONFIRMED` | 0 gtag init; one static `<title>`; 0 service-worker registrations; 0 consent UI | FP-G04..G06, G12 |
| RA-30 | DOCX export dropped (this audit's own first reading) | `REFUTED` (self-correction) | `preview-modal.tsx:151` → `POST /api/export-docx` → `backend/index.js:5167`, entitlement test at `adversarial-certification.test.js:338` | FP-E11 |
| RA-31 | OAuth flow/security equivalent between legacy and modern | `PARTIALLY CONFIRMED` | see §3.1 — backend flow is stronger than legacy; the modern client cannot reach it | FP-G08 |
| RA-32 | Employer-side rejection reasons still captured end-to-end | `PARTIALLY CONFIRMED` | see §3.2 — captured, persisted and notified, but as free-text `employerNotes` and exposed to the applicant in the API payload | FP-F11 |
| RA-33 | The portfolio gallery retained its capabilities | `REFUTED` (i.e. no capability loss found in the gallery itself) | see §3.3 — legacy and modern both route `/portfolios`; search, filter, count, loading, error+retry, empty state all present and improved; the loss is in the editor, not the gallery. **FP-C07 moved `UNVERIFIED` → `FULL PARITY`**, correcting a prior note that wrongly claimed legacy never routed the gallery | FP-C05, FP-C06, FP-C07 |
| RA-34 | OAuth provider breadth unchanged | `CONFIRMED` (breadth regressed) | see §3.4 — Google only; Facebook provider instantiated but unwired; LinkedIn/GitHub backend alive, 0 client references; X and Apple never implemented | FP-G08 |
| RA-35 | Employer dashboard analytics are server-derived | `UNRESOLVED` | `portal.tsx` header claims "real-time pipeline metrics"; no analytics endpoint call traced in the operation register | FP-F09 |
| RA-36 | Teams member drawer removed (allegation 1) | `CONFIRMED` | legacy drawer `EnterpriseTeamsTab.jsx:9-145` (GET `:13`, add `:36`, remove `:62`, permission `:12`); modern tab has `t.memberCount` only (`EnterpriseTeamsTab.tsx:223`); members API alive but UNREACHABLE (`enterprise.js:720/729/738`). **FP-B05 `FULL PARITY` → `PARTIAL PARITY`** | FP-B05 |
| RA-37 | Audit JSON export / cursor / deep links removed (allegation 2) | `CONFIRMED` | legacy JSON export `EnterpriseAuditTab.jsx:174-178`, deep link `:184-200`, cursor + Load more `:140/159/165`; modern single `limit:100` fetch (`EnterpriseAuditTab.tsx:42`), client-side filter `:55-63`, CSV only `:85-92`, while `enterprise.js:652-662` still serves cursor/severity/actor/since/until. **FP-B08 → PARTIAL** | FP-B08 |
| RA-38 | Employer messaging is fixture data (allegation 5) | `CONFIRMED` (scoped) | threads hardcoded `pages/employer/portal.tsx:145-185`; send is state-only `:233-247`; the real client `lib/messages.ts` is used only by `pages/dashboard/messages.tsx`. Candidate-side messaging unaffected. **FP-F03 `PARTIAL` → `MOCK`** | FP-F03 |
| RA-39 | 51 CV templates collapsed to 5 archetypes (allegation 4) | `CONFIRMED` | 51 `cvN` dirs + 4 covers / 55 SCSS / 13,041 JSX / 19,655 SCSS → 100 catalogue ids over 5 archetypes, 19 families (`template-layouts.ts:155-161`), 6 `SPECIAL_SPECS` (`:233`); 3,254 modern template lines. **FP-E02 → PARTIAL** | FP-E02 |
| RA-40 | SMTP/IMAP/template editors/bounce logs removed (allegation 7) | `CONFIRMED` | 1,839 lines / 5 tabs (`EmailSmtpSettings.jsx:29`, IMAP `:52-68`, 20 toggles `:69-92`, preview modes `:100-104`) → 348 lines / 4 operations (`AdminEmailSmtpTab.tsx:75-114`); 8 email operations SERVER-ONLY. Classification stays `PARTIAL PARITY`; evidence rewritten | FP-A16 |
| RA-41 | Voice interview coach removed (allegation 8) | `CONFIRMED` | 2,432 legacy audio lines (`LiveVoiceEngine.js` 233, `LiveAudioWaveform.jsx` 254, `LiveInterviewSession.jsx` 1,691, `useInterviewMedia.js` 254); modern audio-API hits in `frontend/src`: 0. **FP-G21 → PARTIAL** | FP-G21 |
| RA-42 | Queue jobs hardcoded + errors swallowed (allegation 3) | `CONFIRMED` | real list (`platform.js:465-495`) but fixtures `AdminQueuesTab.tsx:48,55-105` survive `catch { /* Keep baseline */ }` `:158-160`; DLQ purge/retry POST to unregistered paths then report success `:204-212/262-268/285-290`. Classification stays `PARTIAL PARITY`; evidence rewritten | FP-A20 |
| RA-43 | Employer Team Seats are real (sweep of FULL rows) | `CONFIRMED` (opposite of the earlier V5 note) | `TeamSeats.tsx:36/74` seeds `INITIAL_TEAM`; the invite flow appends to state and shows `inviteSuccess` with no HTTP call. **FP-F06 → PARTIAL** | FP-F06 |
| RA-44 | Shell a11y and command palette retained (sweep) | `CONFIRMED` (regressed) | legacy `CubaCommandPalette.jsx` 787 lines, Cmd/Ctrl+K `CubaAppShell.jsx:227`; zero `CommandPalette`/`cmdk` hits in `frontend/src`; mobile drawer lost Escape + focus trap + focus restore (`:12`). **FP-G01 → PARTIAL** | FP-G01 |
| RA-45 | Help desk present (sweep) | `CONFIRMED` (not present) | `DEFAULT_TICKETS` `AdminHelpDeskTab.tsx:47`; GET `:128` on `/admin/support/tickets` — **zero** registrations in `backend/`; replies/status dead + success. **FP-A19 `PARTIAL` → `MOCK`** (DISC-029) | FP-A19 |
| RA-46 | Applicant pipeline real (sweep) | `CONFIRMED` (with two dead side-actions) | pipeline + stage PATCH real (`use-api-hooks.ts:304`); drawer email POSTs unregistered `/notify/email` with success (`CandidateReviewDrawer.tsx:159-180`); hiring preferences state-only (`portal.tsx:251`). **FP-F02 → PARTIAL** | FP-F02 |
| RA-47 | Moderation decisions applied (sweep) | `CONFIRMED` (not applied) | fixtures `AdminModerationTab.tsx:58/108`; `POST /admin/employer-applications/{id}/verify` `:152/167` and `POST /admin/jobs/{id}/moderate` `:184` unregistered, `.catch(()=>{})` + success. **FP-A11 `PARTIAL` → `MOCK`** (DISC-030) | FP-A11 |
| RA-48 | Blog authoring equivalent (allegation 6) | `CONFIRMED` | 1,631-line TipTap editor with 12 extensions (`BlogEditor.jsx:3-15`) → 461-line Markdown `<textarea>` (`pages/blog/editor.tsx:268/290-293/352`); the whole `/blog/posts*` path is unregistered. Classification stays `MISSING`; evidence confirmed at source (DISC-039) | FP-G09 |

## 3. Deep investigation of the four mandated allegations

### 3.1 RA-31 — OAuth flow and security architecture

**Hypothesis.** Legacy OAuth is weaker than the modern implementation (or the modern implementation
regressed the security properties).

**Legacy path** — `src/hooks/useOAuthSignIn.js` (206 lines): Firebase popup for Google/Facebook, and
`window.location.href = '/api/auth/linkedin' | '/api/auth/github'` for the server flow
(`src/components/auth/login/Login.jsx:389,396`, `src/components/auth/register/Register.jsx:254,261`). Provider launch is gated on admin module settings and
**fails closed** when the settings projection is unavailable or stale.

**Backend path** (`backend/index.js:7273-7460`, `backend/security/oauth.js`, `backend/database/oauthStore.js`):

| Control | Implementation | Assessment |
|---|---|---|
| `state` generation | `crypto.randomBytes(32).toString('base64url')` | strong |
| `state` storage | SHA-256 hash only, in MariaDB, with TTL (`OAUTH_STATE_TTL_MS`) | strong — raw state never at rest |
| `state` validation | cookie binding compared with `crypto.timingSafeEqual`; then atomic single-use consume (`SELECT … FOR UPDATE`, row deleted) | strong |
| PKCE | S256 challenge from a 32-byte verifier, verifier stored with the state row | strong |
| Redirect URI | server-constructed from `protocol` + `websiteName`, not client-supplied | strong |
| Identity | `emailVerified === true` required; provider/email shape validated | strong |
| Account linking | `assertAccountLinkSafe` → `OAUTH_IDENTITY_CONFLICT` / `OAUTH_ACCOUNT_LINK_REQUIRED` instead of silent takeover | strong |
| Code exchange | separate hashed, single-use, TTL-bounded exchange code redeemed by the SPA | strong |

This is materially **better** than a typical implicit-flow or token-in-URL implementation.

**Modern path** — `frontend/src/pages/auth/login.tsx`: Google via Firebase `signInWithPopup` only.
Token acquisition is Firebase-native (`api-client.ts:54,70` `user.getIdToken()`), with a compatibility
fallback at `:82` to `localStorage.getItem('token') || localStorage.getItem('auth_token')`, and a
non-production preview token at `:81`.

**Call-path evidence that the server flow is unreachable from the modern client:**
`grep -rn 'auth/github\|auth/linkedin\|oauth/exchange' frontend/src` → **0 matches**;
the same grep over legacy `src/` → **11 matches**.

**Verdict: `PARTIALLY CONFIRMED`.**
- Security *architecture* improved (state+PKCE+single-use+timing-safe+cookie binding).
- Security *coverage* regressed: two whole providers (LinkedIn, GitHub) and their hardened flow are
  dead code from the modern app's perspective.
- Residual modern consideration, stated without inflation: the `localStorage` token fallback is a
  legacy-compatibility path; Firebase's own persistence already places credentials in browser storage,
  and the backend verifies every bearer token, so this is a hygiene note (P3), not a vulnerability.
**Confidence:** high (static call-chain complete). **Limitation:** no live provider credentials, so no
runtime proof of a successful exchange in either tree (EG-010).
**Closure condition:** wire an OAuth initiation button + exchange redemption in the modern login, then
run a sandbox-provider test asserting `state` binding failure and replay rejection.
**Recorded as** `DISC-019` (breadth) — see also `DISC-022` in §3.4 for the unwired Facebook provider,
which is a distinct defect from the missing LinkedIn/GitHub surface.

### 3.2 RA-32 — Employer-side rejection reason capture

Traced the full chain end to end, rather than checking that a modal exists:

| Leg | Evidence | Status |
|---|---|---|
| 1. Employer UI | `components/employer/CandidateReviewDrawer.tsx:84` `rejectionFeedback` state; confirmation dialog gating `targetStatus === 'rejected'`; textarea rendered at `:821` | present |
| 2. Form validation | feedback is **optional** free text; no required-reason rule, no length rule beyond the server cap | weak |
| 3. API request | `:245-258` builds `combinedNotes` = `` `[Feedback: ${feedback}] • ${internalNotes}` `` and sends `{ status, notes: combinedNotes, expectedStatus, expectedRevision }` | present |
| 4. Backend validation | `backend/index.js:1689-1703` — status whitelist `interview\|accepted\|rejected`, transition map, control-character stripping, 1,000-char cap, `expectedRevision` integer check | strong |
| 5. Authorization | `resilientMutations.updateApplicationStatus:307-312` — job must exist and `job.employerId === req.user.uid`; otherwise `404 NOT_FOUND` (no enumeration) | strong |
| 6. Persistence | `resilientMutations.js:321-328` writes `{...current, status, employerNotes: notes, revision, statusUpdatedAt}` via `saveApplication` | **broken in MySQL — see below** |
| 7. Applicant notification | `jobApplicationNotification()` `:1629-1635` embeds the notes text in the applicant-facing message | present |
| 8. Applicant-facing rendering | `pages/dashboard/applied-jobs.tsx` renders status only; no feedback field | **absent** |
| 9. Audit | `JOB_APPLICATION_STATUS_UPDATED` with previous/next status, revision, requestId | present |

**New V4 finding (not in the source report): the feedback is not persisted by the production
repository.**

`resilientMutations.js:321` calls `r.saveApplication(applicationId, { …current, employerNotes: notes, revision })`.
`MySQLRepository.saveApplication` (`backend/repositories/MySQLRepository.js:1600-1637`) does not write its
argument through — it maps **13 fixed columns** (`id, job_id, employer_id, applicant_id, applicant_name,
applicant_email, applicant_phone, resume_id, resume_url, cover_letter, status, rating, notes`) and
`notes` is taken from `data.notes`, which — because `...current` is spread first — is the **pre-update**
value echoed back from `getApplication`. Consequences:

1. `employerNotes` has no column (`001_baseline.sql:180-204`; no `employer_notes` anywhere in `backend/`)
   and is silently discarded. The rejection feedback never reaches the database.
2. `revision` is likewise not in the column map, so the counter stays at its default `1`; the
   `expectedRevision` CAS at `index.js:1720` therefore never detects a concurrent change in production
   (it passes only because the client re-reads revision `1` from `getApplications`).
3. The behaviour *appears* to work under `InMemoryRepository.saveApplication`
   (`:529-534` spreads all data) — so any test exercising this path is evidence about the in-memory
   double, not the deployed store. There is in fact **no test** referencing `employerNotes`
   (`grep -rn employerNotes backend/test frontend/src` → 0 hits), i.e. the path is untested and
   untestable end-to-end without a database.
4. The notification text still reaches the applicant (leg 7 is in the request path, not the store), so
   the applicant learns the verdict *and* the feedback via the notification while the record says
   nothing — a state divergence, not a data loss the user can see.

**Verdict: `PARTIALLY CONFIRMED`.** Reason capture, validation, authorization, transition
enforcement, audit and notification exist. Structured capture, durable persistence of the reason,
applicant-facing rendering, and a working optimistic-concurrency counter do not.
**Confidence:** high for legs 1-5, 7-9 (static call chain); high for leg 6 on the MySQL adapter (the
write path is a closed, readable function). **Limitation:** no live database, so the discarded-column
behaviour is proven by code reading rather than by an executed write (EG-009/EG-010 conditions apply).
**Closure:** add `employer_notes` (or persist `notes` from the payload, not from `current`), map
`revision` in `saveApplication`, render feedback on the applicant application card, and add a
repository-contract test that runs against MySQL, not only `InMemoryRepository`.

### 3.2.1 Adjacent finding: applicant-scoped reads are not field-projected

`GET /api/jobs/:jobId/applications` (`backend/index.js:1728-1743`) authorizes correctly — the owner
sees all rows, everyone else only their own (`app.applicant_id === req.user.uid`) — but returns
`repo.getApplications({ jobId })` **unprojected**. `MySQLRepository.getApplications` is `SELECT * FROM
applications` (`:1527-1536`), so the applicant's own row still carries `employer_id`, `rating` and
`notes`. The same repository deliberately avoids this elsewhere: `getApplicantApplications`
(`:1539-1548`) documents that "the employer's columns (rating, notes, employer_id, extra_json) … are not
selected". Two access paths to the same rows therefore apply different data-minimisation rules.

Exploitability today is low *because* of the persistence bug above: `notes` never receives the
feedback, so an applicant would read a stale or empty field. Fixing §3.2 without fixing this projection
would turn a latent disclosure into a live one — the two must be remediated together. Recorded as
`DISC-021`, priority P2, with that ordering dependency stated explicitly.

### 3.3 RA-33 — Distinct legacy portfolio gallery capabilities

| Legacy capability (`PortfolioGallery.jsx`, 239 lines) | Modern (`pages/portfolio/gallery.tsx`, 169 lines) | Status |
|---|---|---|
| Fetch published summaries (`getPublicPortfolios`) | `GET /portfolios/public?limit=100` via `lib/portfolio.ts:150` | preserved |
| Theme filter (6 options) | template filter derived from *present* templates, URL-persisted (`?template=`) | preserved, improved |
| Search over title / description / tags | same three fields, URL-persisted (`?q=`) | preserved |
| Result count ("N portfolios found") | `:105` "N of M portfolios match" | preserved, improved |
| Loading state | `state.status === 'loading'` | preserved |
| Empty state | explicit empty rendering | preserved |
| Error state | legacy comment `DIR-081` records that errors were **swallowed to console**; modern has `state.status === 'error'` with `PortfolioApiError` | improved |
| Static theme preview PNGs | palette-driven rendering (`portfolio-view.tsx:33 PALETTES`) | replaced, equivalent |
| Deep link to a portfolio | `public-portfolio.tsx` + `GET /portfolios/public/:slug` | preserved |

**Verdict: `REFUTED`** — as an allegation of *gallery capability loss*. The gallery did not regress; it
gained URL state and honest error handling. The adjacent loss is real but belongs to FP-C04: portfolios
created with the legacy editor open read-only. Recording the refutation prevents a reviewer from
"fixing" a gallery that is already correct.

### 3.4 RA-34 — OAuth provider catalogue breadth

| Provider | Legacy | Modern | Evidence |
|---|---|---|---|
| Google | Firebase popup + GIS fallback (`useOAuthSignIn.js`) | Firebase popup | `login.tsx:209-233` `signInWithPopup(auth, googleProvider)`; button `:429-444` |
| Facebook | Firebase popup + direct SDK fallback | **provider instantiated, no sign-in handler** | `lib/firebase.ts:17` imports `FacebookAuthProvider`, `:62` instantiates it; `login.tsx` has no `handleFacebookSignIn` and no Facebook button (only `googleProvider` is imported at `:16`) |
| LinkedIn | server OAuth (`auth/login/Login.jsx:389`, `auth/register/Register.jsx:254`) | **backend intact, 0 client references** | `grep auth/linkedin frontend/src` → 0 |
| GitHub | server OAuth (`auth/login/Login.jsx:396`, `auth/register/Register.jsx:261`) | **backend intact, 0 client references** | `grep auth/github frontend/src` → 0 |
| X / Twitter | never implemented (only `twitter:*` SEO meta tags and a profile field) | never implemented | legacy matches are OG/meta tags; no provider class |
| Apple | never implemented | never implemented (only `apple-touch-icon` and Apple Pay copy) | no provider class in either tree |

**Verdict: `CONFIRMED`** — breadth regressed from 4 working integrations to 1 (plus one unwired
provider constructor). Note the nuance the mandate warns about: Facebook *appears* in the modern
settings UI ("Facebook Single Sign-On (OAuth 2.0)" feature flag at `AdminSettingsTab.tsx:224`) and in
`firebase.ts`, yet **no code path can start a Facebook sign-in** in the modern app. A configuration
toggle is not support.
**Closure:** add provider buttons that call the existing server routes; verify `state`/PKCE round-trip
in a sandbox per provider, and either wire or delete the Facebook provider object.

### 3.5 V6 — the eight mandated feature-depth allegations

Read subfeature-by-subfeature; the full traceability tables live in `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §3.

| Allegation | Row | Disposition | One-line reason | Rows changed |
|---|---|---|---|---|
| Teams member drawer removed | FP-B05 | `CONFIRMED` | drawer absent; API alive; a count is not management | FULL → PARTIAL |
| Audit JSON export / cursor / deep links removed | FP-B08 | `CONFIRMED` | 100-row single page, CSV only, API supports more | FULL → PARTIAL |
| Queue jobs hardcoded + error swallowing | FP-A20 | `CONFIRMED` | real list, fabricated baseline, dead DLQ actions | unchanged (PARTIAL) |
| 51 templates → 5 archetypes | FP-E02 | `CONFIRMED` | 100 ids over 5 structures × 19 families | FULL → PARTIAL |
| Employer messaging fixtures | FP-F03 | `CONFIRMED` (scoped) | employer tab is state-only; candidate stack real | PARTIAL → MOCK |
| TipTap editor → Markdown textarea | FP-G09 | `CONFIRMED` | 12 extensions and every formatting control gone | unchanged (MISSING) |
| SMTP/IMAP/templates/logs reduced | FP-A16 | `CONFIRMED` | 5 tabs → 4 operations; 8 ops SERVER-ONLY | unchanged (PARTIAL) |
| Voice interview coach removed | FP-G21 | `CONFIRMED` | 2,432 audio lines → 0 audio APIs | FULL → PARTIAL |

**Governing rule applied:** behavioural equivalence, not component-name equivalence. Every row searches
for the equivalent elsewhere before being downgraded — e.g. workspace membership survives via
`enterpriseApi.updateMembership`, candidate messaging survives in `pages/dashboard/messages.tsx`, and
cover letters survive as four inline letter templates. Those equivalences are why `FP-B06`, `FP-G20`
and the cover-letter part of `FP-E09` were **not** downgraded.

**Additional sweep result (not alleged):** `FP-F06`, `FP-G01`, `FP-F02` moved FULL → PARTIAL and
`FP-A11`, `FP-A19` moved PARTIAL → MOCK; 13 further components were found rendering seeded data
(`FEATURE-DEPTH-EVIDENCE-REGISTER.md` §4); 17 client paths (27 call sites) resolve to no registered
operation (§5, DISC-027).

## 4. Integrity statement

- No allegation was marked `REFUTED` on the basis of a filename, a route declaration, or a settings
  toggle. Each refutation cites a call site, an endpoint with a resolved mount prefix, or a measurement.
- No allegation was deleted. `RA-31` was renumbered to `RA-35` with the mapping recorded above and in
  `AUDIT-CHANGE-HISTORY.md`.
- Four allegations remain `UNRESOLVED`/`UNVERIFIED` in total across the package (`RA-35` and three
  feature rows), each with a stated closure condition.
- This register contradicts two statements made by the earlier pass and says so rather than quietly
  editing them: FP-C07 ("no route in `main.jsx`") and FP-F11 ("no employer-side rejection-reason
  capture"). Both are corrected in the matrix with the corrected anchor cited. A third claim
  prepared for this register — that the deployed commit contains no `frontend/src` — was **withdrawn
  before publication** because `git ls-tree -r HEAD` shows 211 tracked `frontend/src` files. It was
  never released to any deliverable.

## 5. V6 additions to the integrity statement

- **No row was downgraded on a name, a missing file, or a detector lead alone.** Each of the 13 new
  adjudications cites a legacy line, a modern line, and (where a backend exists) the route that proves
  the server still supports the removed behaviour — i.e. the loss is a UI regression, not a retirement.
- **Four detector leads were investigated and rejected** rather than reported: the four check-8 keyword
  hits (`FEATURE-DEPTH-EVIDENCE-REGISTER.md` §6) all came from broad legacy attribution, and the
  favourites "swallow-then-success" lead is in fact a correct error path.
- **An error in the earlier package was found and fixed at its source:** the V4/V5 client scanner
  counted only literal `get/post/patch` verbs, which hid every `enterpriseRequest` call site. That is
  why V5 reported enterprise operations as UI-unreachable when the modern UI does call them.
- **Nothing was upgraded.** V6 produced no `UNVERIFIED` → `PASS` conversion; every classification
  movement is downward (FULL → PARTIAL, PARTIAL → MOCK).
