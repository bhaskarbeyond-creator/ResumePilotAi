# M8 §4 — Subfeature closure: the 20 open leads, adjudicated

**Revision:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` · **Scope:** FP-B05, FP-C02, FP-D07, FP-D12, FP-D13,
FP-F07, FP-G11, FP-G21, FP-G23, FP-G24 — the ten rows M7 left with open leads · **Machine-readable twin:**
`Evidence/adjudications-m8.json`

## 0. Result in one table

| Measure | Value |
|---|---:|
| Rows adjudicated | **10** |
| M7 open items covered | **20** (all of them) |
| Lead judgements recorded | **21** |
| — `EQUIVALENT_REPLACEMENT` | 4 |
| — `MISSING` | 14 |
| — `MIXED` | 1 |
| — `PRESERVED` | 2 |
| Row classifications changed | **0** |
| Open leads remaining | **0** |
| New findings raised | **DISC-054** |

`21 lead judgements cover the 20 items M7 left open; the extra is FP-C02 portfolio-site chrome. One lead that an earlier M8 draft marked PRESERVED (FP-B05 handleSaveLead) was downgraded to MISSING after tracing it past the route into the registry and the schema — the test that covers it runs against an in-memory double.`

Two things this table is **not**. It is not a claim that the modern app lost 14 capabilities: several
MISSING judgements are narrow (a dismiss button, a saved-snippet toggle) and are recorded at that size.
And it is not an aggregation: `PRESERVED` + `EQUIVALENT_REPLACEMENT` + `MISSING` do not sum to a parity
score, because `MIXED` means two different things are true of one lead.

## 1. Disposition vocabulary

- **PRESERVED** — the capability exists in the modern tree with the same effect; chain traced to persistence
- **EQUIVALENT REPLACEMENT** — different mechanism, same outcome; the mechanism difference is stated
- **MISSING** — no modern implementation at any contract; not closed by symbol similarity
- **INTENTIONAL_RETIREMENT** — requires decision evidence; none found for any M8 lead
- **UNRESOLVED** — insufficient evidence either way

A lead is closed only when the whole chain is traced: **call site → route → persistence → authorization →
test**. A symbol that exists in the modern tree is not evidence; a green test against an in-memory double
is evidence about the double.

## 2. Row by row

### FP-B05 — Enterprise workspaces & squads (incl. lead assignment)

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged classification, new subfeature loss recorded)

_Workspace/member management works; team create works; team update/archive/restore and lead assignment do not (production registry gaps + missing columns)._

**1. `handleSaveLead / handleCreateTeam / handleRestore` → `MISSING`**

- Legacy anchor: src/enterprise/components/EnterpriseTeamsTab.jsx:262-274 (edit mode writes team.lead via save)
- Modern search actually run: grep -n "lead" frontend/src/components/enterprise/EnterpriseTeamsTab.tsx → :40 leadPrincipalId state, :91/:98 sent on create/update, :219 `Lead: …`, :235 loaded, :302 input; then the whole chain was followed to the registry, not just the call site
- Qualifier: **the UI sends the field and reports errors honestly; the storage layer cannot accept it and three team verbs have no production implementation**
- Chain:
    - *call*: EnterpriseTeamsTab.tsx:91 (create) / :98 (update) → frontend/src/lib/enterprise-api.ts createTeam/updateTeam
    - *route*: POST /api/enterprise/teams (backend/routes/enterprise.js:684) and PATCH /api/enterprise/teams/:teamId (:693), plus POST …/archive (:702) and POST …/restore (:711) — all permission-guarded and registered
    - *persistence*: *** broken end of the chain ***: tenantService.updateTeam/archiveTeam/restoreTeam call this.registry.updateTeam/archiveTeam/restoreTeam (tenantService.js:890-932). The production registry is MySqlTenantRegistry (tenantService.js:7; the only registry wired by index.js) and it implements **none of the three** — only backend/test/helpers/inMemoryTenantRegistry.js:580+ does. enterprise_teams (backend/database/migrations/001_baseline.sql:823-831) has no lead column and no status column, so even the create path silently drops leadPrincipalId
    - *authorization*: requireAnyTenantPermission('workspace.manage','tenant.workspaces.manage') on all four verbs; scope asserts in tenantService
    - *test*: backend/enterprise-test/enterprise-completeness.test.js:116-139 asserts lead set/clear and passes — because it constructs InMemoryTenantRegistry at :40. A mock pass is evidence about the mock
- Note: This lead does NOT close as preserved. The call exists, the route exists, the test is green, and the capability still cannot work in production: with the MySQL registry the three verbs throw TypeError('…is not a function') and the route's catch turns that into 503 TENANT_TEAM_*_FAILED. Raised as DISC-054.

### FP-C02 — Portfolio section library / modular blocks

**Prior classification:** MISSING · **After M8:** MISSING (unchanged)

_The email CTA survives; the resume-download control and the site chrome do not. Two named subfeature losses, one preserved lead._

**1. `handleEmailClick` → `PRESERVED`**

- Legacy anchor: src/components/PortfolioBuilder/PortfolioComponents/Hero4.jsx:121-133 (`mailto:` composed and opened)
- Modern search actually run: grep -n "mailto" frontend/src/components/portfolio/portfolio-view.tsx → :69-73 safeMailto() used by every template CTA
- Chain:
    - *call*: portfolio-view.tsx:69-73 mailto CTA
    - *route*: none (mailto: URI, no request)
    - *persistence*: n/a — address comes from the portfolio document (frontend/src/lib/portfolio-document.ts:67 contact.email)
    - *authorization*: n/a — public share page
    - *test*: frontend/src/components/portfolio/__tests__/portfolio-view.test.tsx (renders mailto href)
- Note: Preserved by replacement: `mailto:` is still emitted, with a guard so an unset address cannot produce a broken link.

**2. `handleResumeDownload` → `MISSING`**

- Legacy anchor: src/components/PortfolioBuilder/PortfolioComponents/About3.jsx:126-140 (`/shared/{id}` resume download)
- Modern search actually run: grep -rn "resume" frontend/src/components/portfolio/portfolio-view.tsx → no download control; grep -rn "download" frontend/src/lib/portfolio-document.ts → none
- Chain:
    - *call*: no call site
    - *route*: n/a — the legacy control requested /shared/{id} which the modern API does not serve
    - *persistence*: n/a
    - *authorization*: n/a
    - *test*: no test asserts a download control
- Note: A real subfeature loss, recorded rather than argued away: a public portfolio cannot hand out the owner's resume.

**3. `toggleMobileMenu (portfolio chrome) + 'Twitter' label` → `MISSING`**

- Legacy anchor: src/components/PortfolioBuilder/PortfolioComponents/{Hero4,About3}.jsx mobile menu + Twitter link
- Modern search actually run: portfolio-view.tsx renders the document without site chrome by design; no social links other than email
- Qualifier: **would be INTENTIONAL_RETIREMENT only with decision evidence; none exists**
- Chain:
    - *call*: none
    - *route*: n/a
    - *persistence*: n/a
    - *authorization*: n/a
    - *test*: none
- Note: No documented decision retires portfolio-site chrome, so this is NOT classified as an intentional retirement (the package's rule: a retirement needs decision evidence).

### FP-D07 — Notification centre (bell, unread polling, routing)

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged) — an earlier M8 draft proposed REPLACED BY EQUIVALENT and it did not survive

_The centre itself (bell, popover with 5 items, /dashboard/notifications list, optimistic read, routing) is a genuine equivalent replacement. The polling contract is not: live refresh and the badge are gone._

**1. `runOnce / createUnreadMessagesPoller (shared coalesced poller with backoff ladder)` → `MISSING`**

- Legacy anchor: src/hooks/unreadMessagesPoller.js:1-30 and :44-71 — one request per tick shared by four subscribers, 15/30/60/120/240/300 s ladder, Retry-After honoured, reset on success
- Modern search actually run: ls frontend/src/hooks → only use-api-hooks.ts, use-restore-focus-when-idle.ts; grep -rn "setInterval\|refetchInterval" frontend/src → per-page only: pages/dashboard/messages.tsx:146 and components/dashboard/conversation-thread.tsx:54
- Chain:
    - *call*: notifications page and shell consume useNotifications() (hooks/use-api-hooks.ts:527-539) with staleTime 30 s and **no** interval
    - *route*: GET/DELETE /notifications and /notifications/read-all via @/lib/notifications (register: backend/routes/notifications.js)
    - *persistence*: notifications table, optimistic read with rollback (use-api-hooks.ts:532-539)
    - *authorization*: authenticated user, scoped to own rows
    - *test*: frontend/src/hooks/__tests__ (optimistic read); no test for polling cadence
- Note: Coalescing, the backoff ladder and Retry-After handling have no modern counterpart; one failed poll stops the only per-page poller (a `query.state.status === 'error' ? false` closure), which is the opposite of the legacy design.

**2. `Global unread badge (MessagesNavBadge)` → `MISSING`**

- Legacy anchor: src/components/Dashboard/MessagesNavBadge.jsx — nav-count badge fed by the shared poller
- Modern search actually run: grep -rn "totalUnread" frontend/src --include=*.tsx → pages/dashboard/messages.tsx:153,294 only
- Chain:
    - *call*: none outside the messages page
    - *route*: GET /messages/unread-count exists and is used only there
    - *persistence*: messages table
    - *authorization*: authenticated owner
    - *test*: none
- Note: A candidate sitting on any other dashboard page is never told a message arrived. Raised as DISC-053.

### FP-D12 — Dashboard shared state / cross-component events

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged)

_Losses in this row are Privacy-page presence and the shared-event debounce, not the leads M7 listed._

**1. `handleProfileUpdate + handleNotificationsUpdated (custom window events)` → `EQUIVALENT_REPLACEMENT`**

- Legacy anchor: src/components/Dashboard/ProfileDisplay.jsx:73-84 dispatch 'profileUpdated'; :232-241,243-247 dispatch 'notificationsUpdated' on success
- Modern search actually run: grep -rn "addEventListener\|queryClient.setQueryData" frontend/src/pages/dashboard frontend/src/components/layout → cache writes replace events: components/settings/profile-panel.tsx:156,182 setQueryData for profile; hooks/use-api-hooks.ts:565-580 invalidate the notifications key
- Chain:
    - *call*: profile edit submit → useUpdateProfile mutation (use-api-hooks.ts)
    - *route*: PATCH /profile (backend/index.js)
    - *persistence*: users/profile tables via repository
    - *authorization*: authenticated user, own row
    - *test*: frontend/src/hooks/__tests__ cache-update assertions
- Note: A shared cache is strictly better than stringly-typed window events: no missed listener, no manual teardown. Equivalent outcome, different mechanism.

**2. `handleMobileToggle / toggleNavGroup` → `PRESERVED`**

- Legacy anchor: src/components/Dashboard/{Sidebar,Header}.jsx — sidebar open state + nav group collapse
- Modern search actually run: frontend/src/components/layout/app-shell.tsx:70 (mobileMenuOpen state) + per-group disclosure in the shell
- Chain:
    - *call*: app-shell.tsx:70 → toggle handlers in the same file
    - *route*: none (local UI state)
    - *persistence*: n/a
    - *authorization*: n/a
    - *test*: component test for mobile menu
- Note: Mobile menu and nav-group disclosure both present.

**3. `handleResize` → `EQUIVALENT_REPLACEMENT`**

- Legacy anchor: src/components/Dashboard/Header.jsx — window resize listener
- Modern search actually run: no resize listener in the modern shell; responsive layout is CSS-only
- Chain:
    - *call*: n/a
    - *route*: n/a
    - *persistence*: n/a
    - *authorization*: n/a
    - *test*: none
- Note: A resize listener used to drive JS layout state; the modern shell uses media queries, which do not need one. No behavioural loss.

### FP-D13 — Career assistant guidance (role guidance, grace banner)

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged)

_One lead replaced (with the no-provider limitation stated), two confirmed missing._

**1. `handleGuidanceSubmit (guidance classifier)` → `EQUIVALENT_REPLACEMENT`**

- Legacy anchor: src/components/Candidate/CandidateCareerAssistant.jsx:61-68 + :147-151 — keyword classifier routes free text to a destination
- Modern search actually run: frontend/src/pages/dashboard/ai-assistant.tsx:23-48 quick prompts + :254 submitPrompt → api.post('/career/assistant/chat'); pages/dashboard/resume-builder.tsx:247-267 STEP_MAP (deep-link → step) covers the routing half
- Qualifier: **no offline fallback: guidance fails without a provider**
- Chain:
    - *call*: ai-assistant.tsx:254
    - *route*: POST /api/career/assistant/chat (register; auth boundary backend/index.js:417-477)
    - *persistence*: conversation rows (career assistant history)
    - *authorization*: authenticated candidate
    - *test*: backend/test — assistant route tests
- Note: Keyword classification is replaced by a model call plus explicit deep links. The limitation is that there is no offline fallback: with no AI provider the guidance path fails instead of degrading to a keyword route.

**2. `'Subscription renewal needs attention' (PaymentGraceBanner)` → `MISSING`**

- Legacy anchor: src/components/Candidate/PaymentGraceBanner.jsx:30-38 — dunning/grace banner driven by subscription status
- Modern search actually run: grep -rn "grace\|past_due\|dunning" frontend/src → no candidate billing-status surface; enterprise billing tab is tenant-scoped only
- Chain:
    - *call*: none
    - *route*: no candidate-side billing-status operation consumed by the browser
    - *persistence*: subscription status exists server-side
    - *authorization*: n/a
    - *test*: none
- Note: Payment problems are now silent to the candidate. Named loss, carried forward.

**3. `toggleSaved (saved guidance snippets)` → `MISSING`**

- Legacy anchor: src/components/Candidate/CandidateCareerAssistant.jsx — saved/unsaved toggle
- Modern search actually run: no saved-snippet store in frontend/src; ai-assistant.tsx has no save control
- Chain:
    - *call*: none
    - *route*: none
    - *persistence*: none
    - *authorization*: n/a
    - *test*: none
- Note: Small but real: guidance cannot be kept.

### FP-F07 — Job discovery & filtering map/location surface

**Prior classification:** MISSING · **After M8:** MISSING (unchanged)

_Map/autocomplete absent, and the replacement listing path is broken end to end. Runtime at a2ecb96: /api/jobs 404, /api/jobs-data 200._

**1. `handlePlaceSelect / handleOptionClick (Google Places autocomplete + map)` → `MISSING`**

- Legacy anchor: src/components/JobsListings/GoogleMapsProvider.jsx, LocationAutocomplete.jsx:1-40, SimpleLocationInput.jsx, JobMap.jsx
- Modern search actually run: grep -rn "google.maps\|places\|autocomplete" frontend/src → 0 hits; frontend/src/pages/jobs/portal.tsx:61-81 builds q/location/type text inputs and fetches
- Chain:
    - *call*: portal.tsx:61-75 — get('/jobs?…')
    - *route*: **no registered operation**: GET /jobs does not exist (393-operation register; 0 matches). The listing is GET /jobs-data (backend/routes/jobsData.js:159, mounted index.js:515)
    - *persistence*: jobs table via repository.getJobs (MySQLRepository.js:1153-1176, InMemoryRepository.js:402-425)
    - *authorization*: public-only projection
    - *test*: no client test asserts the jobs request
- Note: This is the row where a broken contract compounds a missing feature: the page cannot list jobs at all, and the two text filters would be dropped by the repository even if the URL were fixed (only publicOnly/status/employerId/limit are read). Raised as DISC-051.

### FP-G11 — Marketing site: contact / lead capture

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged)

_The page exists and looks complete; the one thing it must do — deliver the message — it does not do._

**1. `handleDismissSuccess (success state with dismissal)` → `MISSING`**

- Legacy anchor: src/components/Contact/Contact.jsx:189-191 — success card with a dismiss handler after a resolved POST
- Modern search actually run: frontend/src/pages/cms/index.tsx:288-300 — success card rendered from `submitted` state, no request; no dismiss handler
- Qualifier: **the success card is shown without any request being sent (DISC-050)**
- Chain:
    - *call*: cms/index.tsx:234-243 handleSubmit → setSubmitted(true) with **no** HTTP call
    - *route*: POST /api/contact exists (backend/index.js:2360-2387), rate limiter mounted at :577
    - *persistence*: repo.saveContactMessage with ip/userAgent (reached by no client)
    - *authorization*: public + rate-limited + honeypot
    - *test*: backend/test contact tests exist; no frontend test asserts a request
- Note: The dismiss control is the smaller half of this finding. The larger half is that the enquiry is discarded while the UI says it was received — DISC-050, the only false-success site with no failed request to swallow.

### FP-G21 — AI interview coach (role-based question generation and assessment)

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged)

_Question generation and live scoring are preserved (server-authoritative); the history surface that M7 flagged is confirmed absent._

**1. `downloadTextFile (session export)` → `MISSING`**

- Legacy anchor: src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx:9,1202 — history export via downloadTextFile
- Modern search actually run: grep -rn "downloadTextFile\|Blob(" frontend/src → only job-tracker ICS export (pages/dashboard/job-tracker.tsx:141-153)
- Chain:
    - *call*: none for interview sessions
    - *route*: no export operation
    - *persistence*: sessions are server-side rows (assessment + attempt)
    - *authorization*: owner
    - *test*: none
- Note: The job tracker can export a calendar file, which is a different capability and cannot be counted as the interview export.

**2. `removeHistoryEntry (delete a past session)` → `MISSING`**

- Legacy anchor: src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx — history row delete
- Modern search actually run: frontend/src/lib/interview-coach.ts:5-11 lists POST /generate-interview, /generate-questions, /evaluate-answer, /start-interview, /abandon-interview; no history list, no delete
- Chain:
    - *call*: none
    - *route*: no history listing operation
    - *persistence*: interview_sessions rows persist
    - *authorization*: owner
    - *test*: none
- Note: Sessions persist but are unreachable to the candidate: no history view exists to delete from.

### FP-G23 — Cross-cutting client hooks (pollers, dialogs, media, token/engine status)

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged)

_Two leads replaced, two missing, one replacement that carries a fabrication risk of its own._

**1. `createUnreadMessagesPoller / runOnce / handleError` → `MISSING`**

- Legacy anchor: src/hooks/unreadMessagesPoller.js:1-30 (singleton, ladder, Retry-After), error handler reschedules
- Modern search actually run: ls frontend/src/hooks → 2 hooks; per-page refetchInterval only (messages.tsx:146, conversation-thread.tsx:54); no coalescing, no ladder
- Chain:
    - *call*: none (no shared hook)
    - *route*: GET /messages/unread-count exists
    - *persistence*: messages table
    - *authorization*: owner
    - *test*: none for cadence
- Note: Same evidence as DISC-053, recorded here because the hook layer is this row's subject.

**2. `handleConfirm (useConfirmDialog / usePromptDialog)` → `EQUIVALENT_REPLACEMENT`**

- Legacy anchor: src/hooks/useConfirmDialog.js, usePromptDialog.js — promise-returning confirm/prompt used across the dashboard
- Modern search actually run: grep -rn "ConfirmDialog" frontend/src → components/portfolio/portfolio-dialogs.tsx:41 (with returnFocusRef), admin AI settings ClearKeyConfirmDialog/QuotaResetConfirmDialog (Radix AlertDialog), per-surface dialogs (e.g. withdraw-dialog, tracker-delete-dialog)
- Chain:
    - *call*: per-surface dialog components
    - *route*: n/a
    - *persistence*: n/a
    - *authorization*: n/a
    - *test*: component tests per dialog
- Note: No single hook; the outcome (a confirm step before a destructive action, with focus return) is present. One surface still uses the native window.confirm (components/enterprise/EnterpriseRolesTab.tsx:281), which is an accessibility regression rather than a missing capability.

**3. `toggleAudio / toggleVideo (media controls)` → `MISSING`**

- Legacy anchor: src/components/Interview/VideoCall.jsx (getUserMedia toggles)
- Modern search actually run: grep -rn "getUserMedia\|MediaRecorder" frontend/src → 0 hits
- Chain:
    - *call*: none
    - *route*: none
    - *persistence*: none
    - *authorization*: n/a
    - *test*: none
- Note: Voice/video interview controls are absent, consistent with the audio-API census in the V6 register.

**4. `token / engine / service-availability status hooks` → `MIXED`**

- Legacy anchor: src/hooks/useAiTokenUsage.js, useAiEngineStatus.js, useServiceAvailability.js
- Modern search actually run: frontend/src/hooks/use-api-hooks.ts:451-475 useSystemHealth() (admin) reads /platform/operational-status and — note — falls back to **six hardcoded 'healthy' service rows** when the payload lacks `checks`/`services`
- Qualifier: **admin equivalent; candidate-facing token/maintenance status missing; replacement renders 6 hardcoded 'healthy' rows when the payload shape is unexpected**
- Chain:
    - *call*: useSystemHealth (admin console only)
    - *route*: GET /platform/operational-status
    - *persistence*: read-only
    - *authorization*: admin
    - *test*: none asserts the absence of the fixture fallback
- Note: The candidate-facing token budget and maintenance notice are gone. Separately, the fallback at :466-473 renders invented service rows if the endpoint returns an unexpected shape — recorded here and raised for the false-state inventory, not silently accepted as a replacement.

### FP-G24 — Candidate support surface (tickets)

**Prior classification:** PARTIAL PARITY · **After M8:** PARTIAL PARITY (unchanged)

_Creation, listing, replies and status filters all work; the modal's accessibility contract is the loss._

**1. `createTicketButtonRef / createTicketDialogRef / createTicketSubjectRef` → `MISSING`**

- Legacy anchor: src/components/Dashboard/DashboardSupport/DashboardSupport.jsx:127-133 (refs), :191-202 (scroll lock, initial focus on subject, Escape with in-flight guard), :831-834 (subject ref bound), teardown returns focus to the opener
- Modern search actually run: frontend/src/pages/dashboard/support.tsx:353-372 — <div role="dialog" aria-modal="true"> with overlay click-to-close and a close button; grep -c "Escape\|keydown\|autoFocus" → 0; no body overflow write; no ref
- Qualifier: **workflow preserved, keyboard/AT contract lost (DISC-052)**
- Chain:
    - *call*: support.tsx create-ticket form → POST /support/tickets (use-api-hooks.ts:599)
    - *route*: routes/support.js userRouter (mounted twice; register lines)
    - *persistence*: supportTickets table via services/supportTickets.js
    - *authorization*: authenticated candidate, own tickets
    - *test*: backend support tests; no keyboard test
- Note: The ticket workflow is preserved; its keyboard/AT contract is not, although frontend/src/components/ui/dialog.tsx:1-8 already wraps Radix Dialog with focus lock and Escape. Raised as DISC-052.

## 3. What changed in the package because of this section

1. **A preserved-looking lead was downgraded to MISSING.** `FP-B05`'s `handleSaveLead` has a UI input, a
   registered `PATCH /api/enterprise/teams/:teamId`, and a green test — and still cannot work: the
   production registry (`MySqlTenantRegistry`) implements neither `updateTeam`, `archiveTeam` nor
   `restoreTeam`, and `enterprise_teams` has no lead column. The test that proves otherwise builds
   `InMemoryTenantRegistry`. Raised as **DISC-054**.
2. **Two leads an earlier M8 draft called replacements are MISSING.** Interview-history export and
   candidate-facing token/maintenance status have no counterpart; a calendar export from the job tracker
   is a different capability and cannot stand in for either.
3. **One replacement carries a fabrication risk of its own.** `useSystemHealth()` returns six hardcoded
   'healthy' service rows when `/platform/operational-status` does not return the expected shape
   (`frontend/src/hooks/use-api-hooks.ts:466-473`) — recorded as a loss *and* as a false-state risk,
   not as a clean equivalent.
4. **No row classification moved.** All ten rows keep their M7 class because the leads were subfeatures
   inside rows whose headline verdicts already accounted for this kind of loss. The parity distribution
   therefore changes for the three rows in `M8-PARITY-REVALIDATION.md`, and not here.

## 4. What is still not established

- **No lead was closed at runtime.** Every chain above is static: file, line and, where it exists, a
  suite that exercises the same code against a test double. The three broken team verbs would be
  observable as `503 TENANT_TEAM_*_FAILED` in a MySQL-backed run — that run is blocked here (§7 of the
  acceptance report).
- **`FP-C02`'s Twitter control** is treated as MISSING rather than an intentional retirement because no
  decision record retires it. If a decision exists elsewhere, this classification should be revisited
  with that document — not with a similarity argument.

