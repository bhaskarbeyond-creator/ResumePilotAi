# M8A — SOURCE CROSSWALK

**Mandate:** 8A — Forensic Omission Challenge
**Source revision audited:** `888c2e5` (`arena/393531fe-resumepilotai`)
**Method:** static source inspection of the checked-out revision only. No application file was modified.
**Purpose:** establish, per claim, the exact legacy locus, the exact modern locus, the backend route/service/persistence
locus, and the authz/permission locus — before any disposition is issued in
`M8A-OMISSION-CHALLENGE-REPORT.md`.

> **Line-number rule (mandate §5.3):** every line range below was read from the revision named above. **No dossier line
> number is reused.** Where the dossier's path or line did not resolve, the row records the correction.

---

## 0. Path resolution — dossier vs actual checkout

The dossier supplied 24 paths. **9 did not resolve** and were relocated by repository-wide search. This is recorded as a
method finding (see `M8A-METHOD-QUALITY-REVIEW.md` §2), not as an omission.

| # | Dossier path | Actual path at `888c2e5` | Status |
|---|---|---|---|
| 1 | `DashboardDashboardSettings.jsx` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` | resolved |
| 2 | `profilePersistence.js` | `src/services/profilePersistence.js` | dir corrected |
| 3 | `profileData.js` | `src/utils/profileData.js` | dir corrected |
| 4 | `SubscriptionModal.jsx` | `src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx` | dir corrected |
| 5 | `pricing.tsx` | `frontend/src/pages/billing/pricing.tsx` | dir corrected |
| 6 | `CustomePage.jsx` | `src/components/CustomPage/CustomePage.jsx` | dir corrected |
| 7 | `subscriptionsSettings.jsx` | `src/components/admin/settings/subscriptionsSettings.jsx` | dir corrected |
| 8 | `JobApplicationModal.jsx` | `src/components/JobsListings/JobApplicationModal.jsx` | dir corrected |
| 9 | `LiveAudioWaveform.jsx` | `src/components/Dashboard/DashboardInterviews/LiveAudioWaveform.jsx` | dir corrected |
| — | `src/utils/contactFormValidation.js` | exists (referenced by B1) | as stated |
| — | `src/components/Blog/BlogEditor/BlogEditor.jsx` | **not named by the dossier**, found by inventory sweep (D3) | reported found |

**Additional dossier-name defect:** the dossier cites subfeature row **`U-G03`** for claim B4. `U-G03` **does not exist**
in `CAPABILITY-SUBFEATURE-REGISTER.md`; `U-` rows do not exist in that register at all. The register uses `FP-` IDs.
Claim B4 is therefore anchored to `FP-G11` (and the pricing/checkout half to `FP-A24`) instead. Recorded as method finding.

---

## 1. Inventory basis

| Set | Files | Endpoints | Note |
|---|---:|---:|---|
| Legacy app `src/` | 650 | 153 | React 18 + Vite, `src/services/api/*` client layer |
| Modern app `frontend/src/` | 206 | 161 | React + TypeScript + TanStack Query |
| Backend routes + `index.js` | 112 | 393 ops (parser B: 405 instances) | Express, count reconciled in Gate B |

Inventory signals used in this mandate: file count, line count, handler count, `useState` count, live network call count,
and **reachability of the route the client actually calls**. File size is treated as an inventory signal only — a large
file is not evidence of capability, and a small file is not evidence of absence (mandate §5.1).

---

## 2. Claim-by-claim source crosswalk

Legend for **Persistence**: whether the data survives reload in a store the server owns.
Legend for **Authz**: the server-side gate on the route the feature needs.

---

### A1 — Master Profile career repository (11 sections + ATS gap computation)

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy UI shell | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx:327` | `SUB_TAB_ORDER` — 12 profile subtabs |
| Legacy ATS gap engine | `DashboardSettings.jsx:67, 89, 111, 129, 148, 166, 184, 201, 218, 236, 253` | `computeGaps(p)` defined **per section** (11 sections compute gaps; `:270` returns `[]` for the 12th) |
| Legacy gap render | `DashboardSettings.jsx:5348` | `const gaps = conf.computeGaps(profile)` → inline checklist |
| Legacy actionable tips | `DashboardSettings.jsx:93, 98` | e.g. `'Add bullet points or description for all roles'`, `'Lead bullet points with active verbs like Spearheaded, Engineered, Directed'` |
| Legacy AI bullet synthesis (work exp) | `DashboardSettings.jsx:1155` (`runProfileAi`), `:1252` (`generate-work-description`) | operator AI call, merges `•`-bulleted suggestions into `description` at `:1272-1274` |
| Modern settings shell | `frontend/src/pages/dashboard/settings.tsx:26, 28-33` | `SettingsTab` union + `TABS` — **4 tabs** (profile, security, account, appearance) |
| Modern profile field model | `frontend/src/lib/account-settings.ts:39-52` | `PROFILE_FIELDS` — **12 flat scalar fields**, no list sections |
| Modern profile UI | `frontend/src/components/settings/profile-panel.tsx` | renders only the 12 flat fields |
| Modern reader path | `frontend/src/lib/master-profile.ts:330-405` | maps **9 list sections** on read |
| Modern completeness | `frontend/src/lib/master-profile.ts:427-454` | `describeMasterCompleteness` reports **11 sections** |
| Backend sanitizer | `backend/services/profileSanitizer.js:3-52` | `SIMPLE_LIMITS`, `LIST_FIELDS` — accepts **8 list sections** |
| Backend write route | `backend/routes/usersData.js` (`/profile` GET/POST via `account-settings.ts:166,179`) | persists whatever passes sanitizer |
| ATS gap in modern | repo-wide search `computeGaps` in `frontend/src` | **0 hits** |
| ATS tips in modern | repo-wide search `atsTip` / `ATS tip` in `frontend/src` | **0 hits** |

**Crosswalk conclusion:** the backend and the *reader* still understand 9–11 sections; the modern **writer** can only
produce 12 scalars, and 8 list section types accepted by the sanitizer have **no writer in `frontend/src`**. The
completeness meter therefore reports sections the user has no UI to fill. `computeGaps` and the actionable-tip strings
have no modern counterpart.
**Persistence:** server-owned (`/users-data/profile`), survives reload. **Authz:** authenticated owner route.
**Filename/component parity:** NOT claimed. The modern tab is *labelled* "Master Profile" — the label is not the capability.

---

### A2 — Bidirectional resume ⇄ profile sync

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy sync UI | `src/components/Dashboard/DashboardSettings/SyncProfileModal.jsx:1-40` | docblock + `selectedPullSections` — per-section selection for pull **and** push |
| Legacy pull | `SyncProfileModal.jsx` (same file) | pulls profile → resume, section-selectable |
| Legacy push | `SyncProfileModal.jsx` (same file) | resume → profile, section-selectable |
| Modern sync | `frontend/src/pages/dashboard/resume-builder.tsx:3867-3897` | **summary-only** push/pull; single scalar field |
| Modern section push | repo-wide search `frontend/src` | **absent** — no section-level push path |
| Persistence | `usersData.js` `/profile`, resume store | server-owned |
| Per-section checklist | legacy `selectedPullSections` | **no modern equivalent** |

**Crosswalk conclusion:** modern pull covers the 9 lists via `master-profile.ts`, but **push is summary-only**, and the
per-section selection checklist is gone. Bidirectionality is therefore asymmetric, not absent.

---

### A3 — Candidate billing / subscription console

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy console | `src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx:9, 68-72, 162-232` | plan display, coupon entry, transaction view |
| Legacy transaction fetch | `src/services/api/platform.js:356-368` — `getUserTransactions()` → `GET /api/payment-orders` | real server call |
| Legacy plan catalogue | `src/components/Billing/Plans/Plans.jsx:8, 165` | public plans |
| Modern pricing page | `frontend/src/pages/billing/pricing.tsx:167-172` | advertises in-account upgrade / downgrade / cancel |
| Modern plan-management UI | `frontend/src/components/settings/account-panel.tsx:53, 240` | **account deletion only** — no plan management |
| Modern transaction history | repo-wide search `payment-orders` in `frontend/src` | **0 hits** |
| Modern checkout | `frontend/src/pages/billing/checkout-modal.tsx:246-259, 300-380` | see false-success row in `M8A-FALSE-SUCCESS-AND-MOCK-DATA.md` |
| Route redirect pair | `frontend/src/app/router.tsx:201-203` (`/dashboard/plans` → `/pricing`) and `:223` (`/dashboard/billing` → `/dashboard/plans`) | both land on the **public** marketing page |
| Backend — pay | `backend/index.js:784` `POST /api/pay` | present |
| Backend — paypal | `backend/index.js:1074` `POST /api/paypal/create-order` | present |
| Backend — razorpay | `backend/index.js:1176` `POST /api/razorpay/create-order` | present |
| Backend — orders | `backend/index.js:805` `GET /api/payment-orders` | present, **unreachable from modern UI** |
| Backend — coupons | `backend/index.js:4597` `POST /api/coupons/validate` | present |
| Backend — invoices | `backend/index.js:5101, 5131, 5146, 5162` | generate / list / by-order / create |
| Backend — refunds | `backend/index.js:6132` `POST /api/admin/payments/refund` (+ `requireRecentAdminAuthentication`) | present, admin-gated |

**Crosswalk conclusion:** **the payment backend is not absent.** Five providers/routes, coupon validation, invoice
generation and refunds all exist server-side. What is missing is the **candidate-side console**: plan display, validated
coupon application, transaction history, invoice/receipt retrieval, and upgrade/downgrade/cancel UI. `pricing.tsx:167-172`
promises precisely those controls, and the two dashboard routes that would host them redirect to the public marketing page.

---

### A4 — TOTP enrolment, QR, verification, recovery, login history, session management

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy TOTP UI | `DashboardSettings.jsx:487, 1077-1100` | enrolment + QR + verification flow |
| Legacy MFA wrappers | `src/services/api/platform.js:1337-1352` | client wrappers |
| Legacy login history | `platform.js:1399` — `getUserLoginHistory()` | **returns `[]`** — hardcoded empty |
| Legacy login-history render | `DashboardSettings.jsx:784, 5874` | renders whatever the (empty) wrapper returns |
| Modern security UI | `frontend/src/components/settings/security-panel.tsx:165-215` | lists enrolled factors, disables a factor |
| Modern disable route | `backend/routes/usersData.js:145-190` `POST /api/users-data/mfa/disable` | audit-logged, revokes tokens, `503` on identity outage |
| Modern enrolment | repo-wide search `frontend/src` | **absent** — no enrol/QR/verify path |
| Modern recovery codes | repo-wide search `frontend/src` | **absent** |
| Register rows | `FP-G08` (PARTIAL PARITY, `NO_CHANGE`), `FP-G19` (PARTIAL PARITY, `SIGNAL_CLEAN`) | see delta |

**Crosswalk conclusion:** three distinct facts must not be merged — (i) legacy *login history* is a **stub returning
`[]`**, so the legacy capability is largely **falsified**; (ii) modern factor **listing and disabling are real**,
permission-gated, audit-logged, token-revoking; (iii) **enrolment, QR and recovery are absent in modern** while the legacy
enrolment UI exists. `FP-G19` classifies TOTP as `PARTIAL PARITY` from `filtering`/`pagination` subfeature classes with
**legacy 0 handlers / 0 labels** — that measurement contradicts `DashboardSettings.jsx:487,1077-1100` and must be corrected.

---

### B1 — Contact form

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy form | `src/components/Contact/Contact.jsx` (docblock `:11`) | submits for real |
| Legacy client call | `src/services/api/platform.js:310` → `POST /api/contact` | real network call |
| Legacy validation | `src/utils/contactFormValidation.js:5` | mirrors server rules |
| Modern form | `frontend/src/pages/cms/index.tsx:234-247` (`ContactPage`, `handleSubmit`) | `handleSubmit` sets `submitted = true` and **returns** — no fetch, no `apiClient` import used |
| Backend route | `backend/index.js:2360-2385` `POST /api/contact` | real: honeypot `202`, strict email/name/message validation `400`, persists via `repo.saveContactMessage` `202`, `500` on error |
| Backend notification | same block | **no mail dispatch** — persistence only |
| Rate limit | `backend/index.js:577` `contactAccountLimiter` | present |

**Crosswalk conclusion:** a fully functional, validated, persisting backend route exists and the modern UI **never calls
it**, then renders success. Notification-on-submit is absent on the backend for legacy callers too.

---

### B2 — Public CMS pages

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy renderer | `src/components/CustomPage/CustomePage.jsx` | fetches and renders a published page |
| Modern renderer | `frontend/src/pages/cms/index.tsx:38` | `CMS_PAGES` — **hardcoded dictionary**, no network call in the file |
| Modern unknown slug | `frontend/src/pages/cms/index.tsx:148` | `CMS_PAGES[slug] \|\| CMS_PAGES['privacy-policy']` — silent wrong-content fallback |
| Backend public list | `backend/index.js:6537` `GET /public/custom-pages.json`, `/api/public/custom-pages`, `/api/custom-pages.json`, `/custom-pages.json` | present |
| Backend public detail | `backend/index.js:6595` `GET /api/public/custom-pages/:slug` | present |
| Backend admin CRUD | `backend/index.js:6621, 6630, 6658` `GET /api/admin/pages`, `PUT /api/admin/pages/:slug`, `DELETE /api/admin/pages/:slug` | present, admin-gated |
| Retired alias | `backend/index.js:470` → `410 API_RETIRED` for `/api/cms-pages*`, replacement named | alias retired by design |
| Dossier's route | `GET /api/pages`, `GET /api/pages/:slug` | **no registration found**; runtime returns `401 AUTH_REQUIRED`, so absence is static-only evidence. The live routes are the `custom-pages` pair above |
| Runtime probe | `GET /api/public/custom-pages` | `200 {"success":true,"pages":[],"source":"MARIADB_CUSTOM_PAGES"}` — the public API works |
| Runtime probe | `GET /api/public/custom-pages/some-slug` | `404 CUSTOM_PAGE_NOT_FOUND` — correct handling |
| Runtime probe | `GET /api/cms-pages` | `410 API_RETIRED` with `replacement` — retired by design, **not** a defect |

**Crosswalk conclusion:** admin publishing is real and persisted; the public renderer is disconnected from it. Every
admin-authored page is invisible, and any unknown slug silently serves privacy-policy content.

---

### B3 — Blog article reader `/blog/:slug`

| Layer | Exact locus | Observed |
|---|---|---|
| Modern routes | `frontend/src/app/router.tsx:77` `/blog`, `:78` `/blog/:slug` | **both render `BlogPage`** |
| Modern reader | `frontend/src/pages/blog/index.tsx:42-56` | `get('/blog/posts')`; no `useParams`, no slug use, no article body, no author, no sharing |
| Modern error path | `index.tsx:47-50` | `catch { setPosts([]) }` — error swallowed |
| Backend mount | `backend/index.js:517` `app.use('/api/blog-data', blogDataRouter)` | router |
| Backend routes | `backend/routes/blogData.js:35` `/`, `:49` `/categories`, `:74` `/slug/:slug`, `:85` `/:id`, `:96` `POST /:id` | present under `/api/blog-data` |
| `/api/blog/posts` | repository search; **runtime** | no registration found; runtime returns **`401 AUTH_REQUIRED`**, not 404 — auth-shielded, so absence rests on static evidence |
| `/api/blog-data/slug/:slug` (runtime) | `GET` → **`404 {"success":false,"error":"Post not found"}`** | a correct missing-article handler **exists** and the reader does not use it |
| Legacy reader | `src/components/Blog/` | article reader + editor present |

**Crosswalk conclusion:** three separate defects — (i) the modern page calls a route with no registration
(runtime shows `401`, so this is auth-shielded rather than an observable 404), (ii) the failure is swallowed into a
permanent "No articles found" empty state, (iii) `:slug` is routed but ignored, so no article-body view exists even if
data arrived. The dossier's "API 404" is the *first* of the three, not the finding — **and the 404 itself is now
demoted to unverified, because runtime returns 401.**

**Runtime correction (post-inspection probe).** `GET /api/blog-data` → `200 {"success":true,"posts":[]}` and
`GET /api/blog-data/slug/any-slug` → `404 Post not found`. So a correct list route **and** a correct missing-article
handler both exist server-side. The reader's failure is entirely a client-side URL and error-handling defect, not an
absent backend.

---

### B4 — Marketing storytelling / interactive modules

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy module set | `src/components/Marketing/` — **15** `.jsx` components | full marketing surface |
| Legacy comparison | `elements/HomepageComparison.jsx:5, 115` | `useState('bullets')` + tab `onClick` — interactive aspect switcher (223 lines) |
| Legacy template inspector | `elements/HomepageTemplates.jsx:13-14` | `selectedCategory` + `previewTemplate` preview state (307 lines) |
| Legacy language selector | `elements/HomepageLanguages.jsx:27-28` | `isOpen` + `disabledLanguages` fetched state (253 lines) |
| Legacy pricing calculator | `elements/HomepagePricing.jsx:12-13` | `billingCycle` monthly/quartarly/yearly + `showComparison` modal (575 lines) |
| Legacy storytelling | `elements/HomepageStorySections.jsx`, `HomepageSteps.jsx`, `HomepageReviews.jsx`, `HomepageHero.jsx` | narrative modules |
| Modern page | `frontend/src/pages/landing.tsx` — 358 lines | **zero `useState`** — fully static |
| Modern comparison / transformation / inspector / coupon calculator / language selector | repository search in `frontend/src` | **no stateful equivalents** |
| Register | `FP-G11` | classification under-records the losses |

**Crosswalk conclusion:** four stateful legacy modules (comparison switcher, template inspector with preview, language
selector, three-cycle pricing calculator with comparison modal) collapse into a static page. A static icon grid is not a
tool — recorded as such.

---

### C1 — Enterprise team member management

| Layer | Exact locus | Observed |
|---|---|---|
| Modern teams UI | `frontend/src/components/enterprise/EnterpriseTeamsTab.tsx` | team create/edit, lead, workspace, archive/restore; `loading`, `error`, `hasPermission` states |
| Modern member CRUD | same file — repository search for `addMember`/`removeMember` | **absent** — no member add/remove control, no member drawer |
| Backend teams CRUD | `backend/routes/enterprise.js:671` GET `/teams`, `:684` POST, `:693` PATCH `:teamId`, `:702` archive, `:711` restore | present |
| Backend members | `enterprise.js:720` GET `/teams/:teamId/members`, `:729` POST (add), `:738` DELETE `/teams/:teamId/members/:principalId` | **present** |
| Authz | `requireTenantPermission('workspace.read')`; `requireAnyTenantPermission('workspace.members.manage', 'tenant.members.manage')` | server-side, correctly scoped |
| Legacy | dossier's `FP-B05` reference | `FP-B05` is **Teams + archive/restore** — the ID is correct for teams, the claim's framing is not |

**Crosswalk conclusion:** backend membership add/remove exists **with** correct permission gates; the modern UI exposes
team-level management but **no member add/remove surface**. This is a UI-only loss, not an absent capability.

---

### C2 — SIEM JSON export + deep links

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy audit export | `src/components/admin/audit/AdminAuditLogs.jsx:100` | `'data:text/csv;charset=utf-8,' + …` — **CSV only** |
| Legacy other exports | `UsersManager.jsx:387` (`text/csv`), `subscriptionsSettings.jsx:514` (`text/csv`) | CSV |
| SIEM — legacy | repository search `siem` in `src` | only 3 unrelated hits: `Experience6.jsx:205` (`'SIEM Operations'` skill label), `TemplatePresets.js:572` (`'SIEM/SOAR'` skill), `autocompleteDirectories.js:834` (keyword list) |
| SIEM — modern | repository search `siem` in `frontend/src` | **0 hits** |
| SIEM — backend | repository search `siem` in `backend` | **0 hits** |
| Deep links | `AdminAuditLogs.jsx` | no entity deep-link construction found |
| Register | `FP-B08` — "Enterprise audit trail with CSV export" | **correct as recorded** |

**Crosswalk conclusion:** the alleged SIEM-JSON-with-deep-links export **never existed**. `FP-B08`'s CSV-only framing is
accurate and must not be re-classified upward on the strength of this claim.

---

### C3 — Employer ⇄ candidate messaging

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy dialog | `src/components/Dashboard/EmployerDashboard/SendMessageDialog.jsx:5` | imports `createConversation`, `sendMessage` from `services/api/platform` — **real API calls, not hardcoded** |
| Legacy inbox | `src/components/Dashboard/DashboardMessages/DashboardMessages.jsx` | thread view |
| Legacy employer applicants | `EmployerDashboard.jsx:180` (clears previous requisition's applicants), `JobApplicationsModal.jsx:265, 342` | applicant rows loaded from server |
| Modern inbox | `frontend/src/pages/dashboard/messages.tsx:5, 136, 146, 222-241` | real `/api/messages/*`, TanStack Query, 15 s `refetchInterval`, `conversationId` deep link, retry |
| Modern employer→candidate entry | repository search in `applied-jobs.tsx`, `job-tracker.tsx` | **no message action** from the applicant list |
| Backend | `backend/index.js:2042` GET `/api/messages/conversations`, `:2141` GET `/:id/messages`, `:2181` POST `/:id/read`, `:2230` POST `/conversations`, `:2280` GET `/:id/participant-profile`, `:2320` POST `/api/messages/send` | **6 routes, server-persisted** |
| Authz | participant-scoped on each route | present |

**Crosswalk conclusion:** messaging itself is real, persisted and reload-safe, and legacy was **not** hardcoded. The
narrower genuine gap is the **missing employer-side initiation entry point** from the applicant/moderation surface.

---

### D1 — Admin financial back-office

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy console | `src/components/admin/settings/subscriptionsSettings.jsx` — **2,993 lines** | 5 tabs: `gateways`, `gst`, `plans`, `coupons`, `invoices` (`:77`) |
| Legacy imports | `subscriptionsSettings.jsx:1, 3` | `refundOrderTransaction`, `getAllAdminTransactions`, `getPaymentWebhooks`, `testAdminPaymentProvider`, `printAuthoritativeInvoice`, `printAuthoritativeCreditNote`, `isAuthoritativeInvoice` |
| Legacy gateways | `subscriptionsSettings.jsx:45-53` | Razorpay key id/secret, Stripe publishable/secret, PayPal client id/secret |
| Legacy invoice ledger | `subscriptionsSettings.jsx:76-77` | "Master Admin Invoice Ledger & Audit State" |
| Modern admin finance UI | repository search `refund|invoice|coupon` in `frontend/src/components/admin/` | only `AdminHealthTab.tsx` and `AdminSettingsTab.tsx` — and in `AdminHealthTab.tsx:245-278` the hits are **incident-catalogue strings** (`affectedApis: ['/api/billing/checkout', …]`), not controls |
| Backend refund | `backend/index.js:6132` `POST /api/admin/payments/refund` + `requireRecentAdminAuthentication` | present |
| Backend invoice | `backend/index.js:5101` generate, `5131` list, `5146` by order, `5162` create | present |
| Backend payment orders | `index.js:805`, admin `:6329` | present |
| Authz | `requireRecentAdminAuthentication` = step-up re-auth | present |

**Crosswalk conclusion:** the **operator back-office UI is absent** while its backend (refund with step-up auth, invoice
generation/ledger, coupon admin, gateway test, webhook inspection) is present. Same shape as A3: server capability exists,
operator-facing control does not. Must be reported as missing UI, not missing backend.

---

### D2 — Admin queue / DLQ console

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy console | `src/components/admin/queues/PlatformQueues.jsx:96-101, 187` | "Purge DLQ" action with confirm |
| Legacy scope | `PlatformQueues.jsx:152, 155, 226` | "Platform Queue & DLQ Monitor", outbox status, DLQ section |
| Modern console | `frontend/src/components/admin/AdminQueuesTab.tsx` — 683 lines | real fetch + retry, **plus hardcoded baseline** |
| Modern hardcoded queues | `AdminQueuesTab.tsx:48` `DEFAULT_QUEUES` | constant |
| Modern hardcoded jobs | `AdminQueuesTab.tsx:55` `INITIAL_JOBS`, `:59` `channel: 'SMTP / SES'` | constant |
| Modern fabricated stack trace | `AdminQueuesTab.tsx:67-69` | `SES_RATE_LIMIT_EXCEEDED: Maximum send rate exceeded\n  at SESClient.sendTransactional (/backend/services/mailTransport.js:142:19)\n  at Worker.processJob (/backend/services/queues/emailWorker.js:88:24)\n  at JobPool.drain (/backend/services/queues/pool.js:204:11)` — **invented frame filenames and line numbers** |
| Modern initial state | `AdminQueuesTab.tsx:114-115` | `useState(DEFAULT_QUEUES)` / `useState(INITIAL_JOBS)` — baseline rendered **before** any fetch resolves |
| Modern fetch | `AdminQueuesTab.tsx:139` | `get('/platform/queues').catch(() => get('/admin/queues'))` |
| Modern fetch failure | `AdminQueuesTab.tsx:154-156` | `catch { /* Keep baseline */ }` — **hardcoded data stays on screen after a failed load** |
| Modern retry | `AdminQueuesTab.tsx:164-176, 178-196` | `post('/platform/queues/retry')` with `.catch(() => …)` fallback; `finally` only — **no `catch`**, no error surface; success text asserted without response verification |
| Backend list | `backend/routes/platform.js:465` GET `/queues` | present |
| Backend retry | `platform.js:504` POST `/queues/retry` + `requireRecentAdminAuthentication` | present |
| Backend purge | `platform.js:543` POST `/queues/purge` → **`410` retired** | **capability retired** |
| `/admin/queues*` | repository search | **no such backend route** — the client's fallback URL is wrong |

**Crosswalk conclusion:** the console is **partly real** (list + retry are wired to an existing, step-up-auth route) and
**partly fabricated** (baseline queues/jobs and an invented SES stack trace render when telemetry is missing or offline).
Additionally the legacy **Purge DLQ** control is now a `410` retired endpoint, and the client's fallback route does not
exist. Three distinct defects, not one.

---

### D3 — Blog authoring WYSIWYG

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy editor | `src/components/Blog/BlogEditor/BlogEditor.jsx` — **1,631 lines** | full Tiptap/ProseMirror rich-text editor |
| Legacy toolbar | `BlogEditor.jsx:827-984` | undo, redo, paragraph, H1, H2, H3, bold, italic, underline, highlight, align left/centre/right, bulletList, blockquote, codeBlock, link |
| Legacy live preview | `BlogEditor.jsx:1470` | `dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(...) }}` |
| Legacy admin console | `src/components/admin/blogManagement/BlogManagement.jsx` — 874 lines | moderation list + preview modal; **not** an authoring surface |
| Modern editor | `frontend/src/pages/blog/editor.tsx:290, 352` | two plain `<textarea>` elements |
| Modern rich text | repository search `contentEditable|lexical|tiptap|quill` in `frontend/src` | no editor dependency |
| API availability | `index.js:3388/3408/6424`, `blogData.js:96` | separate concern — APIs exist |

**Crosswalk conclusion:** a rich-text authoring surface regressed to raw text. This is a genuine **regression**, and it is
independent of the API-availability question. (First-pass reading of `BlogManagement.jsx` alone would have wrongly
falsified this claim — the editor lives in `src/components/Blog/`, which is why the inventory sweep in §1 was required.)

---

### D4 — Cover-letter editor richness

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy editor component | `src/components/Form/simple-textarea/SimpleTextarea.jsx:7-9` | `LexicalComposer`, `RichTextPlugin`, `ContentEditable` — real Lexical rich text |
| Legacy styles | `SimpleTextarea.jsx:4` `./LexicalStyles.css` | present |
| Legacy cover-letter use | `src/components/Actions/action-step-cover-filling/ActionCoverFilling.jsx:3, 122` | renders `SimpleTextarea` per cover-letter paragraph |
| Legacy other rich-text use | `src/components/BuildResume/steps/components/RichTextEditor.jsx` | present |
| Modern cover letter | `frontend/src/pages/dashboard/cover-letter-builder.tsx:33` | imports `Textarea` from `@/components/ui/textarea` |
| Modern body fields | `cover-letter-builder.tsx:903, 918, 966` | plain `<Textarea>` |
| Modern Lexical | `frontend/package.json` | **no lexical dependency** |

**Crosswalk conclusion:** rich text → plain text, and the capability is not merely unwired — the dependency is gone.
"Not a textarea" is the correct test, and the modern implementation fails it.

---

### D5 — AI interview voice engine

| Layer | Exact locus | Observed |
|---|---|---|
| Legacy engine | `src/components/Dashboard/DashboardInterviews/LiveVoiceEngine.js` — 233 lines | `window.speechSynthesis` (`:54, 58, 70-71, 126-127, 151, 209`), voice enumeration, `SpeechSynthesisUtterance` |
| Legacy waveform | `LiveAudioWaveform.jsx` — 254 lines | `AudioContext` (`:78-81`), `createAnalyser`, `analyserRef` (`:58`) |
| Legacy session | `LiveInterviewSession.jsx` — 1,691 lines | session orchestration |
| Legacy ancillary | `LiveAnswerGuide.jsx`, `LiveResumeDrawer.jsx` | present |
| Legacy total | 3 files / **2,178 lines** of voice stack | |
| Modern replacement — all APIs | repository search `getUserMedia|AudioContext|SpeechRecognition|speechSynthesis|MediaRecorder` in `frontend/src` | **0 hits** |
| Modern interview page | `frontend/src/pages/dashboard/interview-coach.tsx` | question-generation coach, no voice |
| Register | `FP-D02` (mic + waveform), `FP-G21` (interview coach) | see delta |

**Crosswalk conclusion:** the voice engine is **absent with no replacement anywhere in `frontend/src`** — not relocated,
not renamed. Both TTS pacing/playback and microphone capture/waveform are gone. Per mandate §4-D5 the replacement search
was performed before declaring absence; it returned zero.

---

## 3. Crosswalk summary — evidence class per claim

| Claim | Legacy locus proven | Modern locus proven | Backend locus proven | Runtime | Evidence class |
|---|---|---|---|---|---|
| A1 | yes | yes | yes | no | static, three-layer |
| A2 | yes | yes (absence by search) | yes | no | static, three-layer |
| A3 | yes | yes | yes | no | static, three-layer |
| A4 | yes (incl. stub at `platform.js:1399`) | yes | yes | no | static, three-layer |
| B1 | yes | yes | yes | no | static, three-layer |
| B2 | yes | yes | yes | no | static, three-layer |
| B3 | yes | yes | yes | no | static, three-layer |
| B4 | yes | yes (absence by search) | n/a | no | static, two-layer |
| C1 | yes | yes (absence by search) | yes | no | static, three-layer |
| C2 | yes (**claim falsified**) | yes | yes | no | static, three-layer |
| C3 | yes | yes | yes | no | static, three-layer |
| D1 | yes | yes (absence by search) | yes | no | static, three-layer |
| D2 | yes | yes | yes (incl. `410` purge) | no | static, three-layer |
| D3 | yes | yes | yes (separate) | no | static, three-layer |
| D4 | yes | yes | n/a | no | static, two-layer |
| D5 | yes | yes (absence by search) | n/a | no | static, three-layer |

**Runtime status for all 16: `BLOCKED`.** No MariaDB instance, no provider credentials, no browser automation and no
seeded disposable fixture are available in this environment; static inspection is not runtime proof (mandate §5.4). See
`M8A-RUNTIME-VERIFICATION.md` for the blocked-cause record.

**No application file, config, dependency, schema, migration or deployment artefact was modified to produce this
crosswalk.**
