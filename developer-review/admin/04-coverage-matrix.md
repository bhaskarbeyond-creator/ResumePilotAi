# 04 — Coverage and Comparison Matrix

**Purpose.** For every one of the 59 legacy capabilities classified in §03, state exactly what exists in the new frontend + new backend, with a file/line or probe citation for that statement, and the modification required to close it. Nothing is scored on impression.

**Two independent axes.** §03 answers *"what did legacy intend?"* (MUST / REDESIGN / DEFECT / OBSOLETE). This document answers *"what does the new system do?"* (Covered-correct / Covered-flawed / Missing / Over-engineered / Intentionally redesigned). They are orthogonal on purpose: a **MUST**-intent capability can be *Missing*, and a **REDESIGN**-intent capability can also be *Missing* — which is precisely what happened to 11 of the 24 REDESIGN-intent capabilities. Reconciling the two axes is the point of the matrix below.

---

## 1. Headline reconciliation

| Status | Count | Share of 59 | Meaning of the label (strict definition used) |
|---|---|---|---|
| **Covered — correct** | **1** | 2 % | The capability's primary read **and** primary write reach a real endpoint that does what the surface claims, and the surface reports failure honestly. |
| **Covered — flawed** | **23** | 39 % | A surface exists, but at least one of: renders fixture data as live (RCA-001), reports success on failure (RCA-002), calls a non-existent path **or mis-parses a real response** (RCA-003), or is refused to the role it exists for (RCA-004/007). |
| **Missing** | **27** | 46 % | No console surface exists. 25 of the 27 are genuine gaps; **CAP-034** and **CAP-037** are correctly absent (obsolete capabilities, see §03) and are counted here only to keep one row per legacy capability. |
| **Over-engineered** | **1** | 2 % | Effort was spent on a simulation of a capability rather than on the capability (CAP-014 role-view), while the underlying invariant (INV-3) is unmet. |
| **Intentionally redesigned** | **7** | 12 % | The new system deliberately implements the capability with a different shape, and the shape is defensible (§07 carries the rationale). |
| **Total** | **59** | 100 % | Equals the 59 rows of §03. |

Intent cross-tab (proves the two axes are independent, and is the source of the "coverage is not a legacy-parity exercise" claim in §02):

| Intent (§03) | Rows | Of which Covered-correct | Flawed | Missing | Over-engineered | Redesigned |
|---|---|---|---|---|---|---|
| **MUST** (33) | 33 | 1 | 17 | 14 | 0 | 1 |
| **REDESIGN** (24) | 24 | 0 | 6 | 11 | 1 | 6 |
| **OBSOLETE** (2) | 2 | 0 | 0 | 2 | 0 | 0 |

Two readings that matter for planning:

1. **17 of the 33 MUST-intent capabilities are present-but-flawed** — the surface exists, so a coverage-only count would have reported 18/33 "done". Exactly **one** MUST-intent capability (CAP-048) is correct end to end. The defect class, not the surface count, is the delivery risk.
2. **11 of the 24 REDESIGN-intent capabilities are missing entirely.** The rewrite dropped the capability instead of redesigning it. That is a scope regression, not a design choice, and it cannot be covered by a divergence entry in §07.

---

## 2. The 59-row matrix

Status legend: **CC** Covered-correct · **FL** Covered-flawed · **MI** Missing · **OV** Over-engineered · **RD** Intentionally redesigned.

| CAP | Capability | Intent (§03) | Status | Evidence in the new system (`file:line` / `[PROBE]`) | Gap or defect | Required modification |
|---|---|---|---|---|---|---|
| **001** | Command Center (landing KPI + platform vitals) | MUST | **FL** — Covered — flawed | `AdminDashboardTab.tsx:40-47` numeric fallbacks 12450/3420/48900/15720/89200/'14.2 GB'; `use-api-hooks.ts:326-346` `usePlatformStats`; no hook calls `/api/platform/command-center` (`platform.js:621`), which returns a real aggregate | KPI cards render invented values when the real endpoint returns zero/empty; the console never calls the aggregate that exists. RCA-001. | REC-001 + REC-019: bind to `/api/platform/command-center`, delete fallbacks |
| **002** | Platform Health matrix (28 subsystems) | MUST | **FL** — Covered — flawed | `AdminHealthTab.tsx:526-551` fetches `GET /platform/operational-status` (real, `platform.js:287`), then indexes `data.services?.[s.id]` over a `Record<string, any>` type. The server returns `services` as an **array** (`platformHealth.js:675`) whose items carry `state`, not `status`/`reachable` | **Shape mismatch: every lookup is `undefined`, so the tab always renders the `DEFAULT_28_SERVICES` fixture although the API works**; the correct role projection (`platform.js:271-286`) is unreachable from the UI. RCA-003 | REC-003 (index by `id`, read `state`) + REC-001 |
| **003** | Queue & DLQ monitor | MUST | **FL** — Covered — flawed | `AdminQueuesTab.tsx:138` `get('/platform/queues').catch(() => get('/admin/queues'))`; `/api/admin/queues` is **404** `[PROBE-002]`, so the fallback always fails; retry/purge call `POST /admin/queues/dead-letter-queue/*` which is **404** | DLQ retry/purge are phantom; panel shows `deadLetterCount \|\| 1` (`AdminQueuesTab.tsx:237`) | REC-003 (remap to `POST /platform/queues/retry`), REC-002 |
| **004** | Operations & maintenance | MUST | **FL** — Covered — flawed | `AdminOperationsTab.tsx:5-9` advertises backup/cache-clear; both routes are **404** `[PROBE-003]`; real maintenance lever is `POST /api/admin/system-health-settings` (`index.js:3475`) | Two of four buttons are inert; maintenance batch is buried in a card | REC-003 + REC-013 (surface maintenance as a first-class control) |
| **005** | Attention Needed (exception digest) | MUST | **FL** — Covered — flawed | `AdminAttentionTab.tsx:79` seeds `INTIAL_ITEMS`-style fixture; `/api/platform/attention` is real (`platform.js:1229`) and returns a computed digest | Digest is shown from fixture when the real digest is empty — the exact case an operator needs it | REC-001 |
| **006** | Tenants Registry (enterprise organisations) | MUST | **MI** — Missing | No console tab; `VALID_TABS` (`console.tsx:50-66`) has no `tenants`. Backend **is** real: `GET /platform/tenants` `backend/routes/enterprise.js:608`, suspend `:621`, reactivate `:630`; legacy UI `src/components/admin/tenants/PlatformTenants.jsx` (2,105 ln) | Whole capability absent from the new console; customer lifecycle (suspend/reactivate a paying tenant) has no UI. RCA-014. | REC-007 + REC-020 |
| **007** | Admin Audit Trail | MUST | **MI** — Missing | Backend `GET /api/admin/audit-logs` exists (`index.js`, probe 403 for ADMIN, 200 for SA); no tab consumes it; `use-api-hooks.ts:442` defines an audit hook that nothing calls | The audit trail — the control that makes every other admin action accountable — has no reader. RCA-004. | REC-008 + REC-006 (grant `audit.read` read path to AUDITOR/ADMIN) |
| **008** | Security Events stream | MUST | **FL** — Covered — flawed | `AdminSecurityTab.tsx` renders `INITIAL_EVENTS` (`:147` and neighbours) and **never calls** `GET /platform/security-events` (`platform.js:789`, which does project `security_audit_logs` — `[SQL-001]:528`); its only `useEffect` (`:189`) wires UI state, not a loader | The stream is 100% fixture, including fabricated `RATE_LIMITED` attack rows | REC-001 |
| **009** | Users Manager (directory + filters + bulk) | MUST | **FL** — Covered — flawed | `AdminUsersTab.tsx:175-183` loads `/admin/users` but keeps `DEFAULT_USERS` when the result is empty; filter/bulk actions are client-side only | Directory renders four fictional identities (incl. an invented `SUPER_ADMIN`) as platform truth. RCA-001. | REC-001 + REC-002 |
| **010** | User 360 drawer | REDESIGN | **MI** — Missing | Legacy `User360Drawer.jsx` 1,513 ln; new console has no drawer and no aggregate endpoint (`/api/admin/users/:uid/360` absent from route census, Appendix A.1) | No single-place view of a user's tenancy, AI entitlement, documents and audit history | REC-019 |
| **011** | Create user / provision staff | MUST | **FL** — Covered — flawed | `AdminUsersTab.tsx` create flow posts `/admin/users` then inserts a local record regardless of the response (`.catch(() => {})`) | Provisioning result is not surfaced; a failed provision looks like a created staff account | REC-002 |
| **012** | User edit (field-level) | REDESIGN | **FL** — Covered — flawed | `AdminUsersTab.tsx:246` `patch('/admin/users/:id', { role })`; backend `PATCH /api/admin/users/:uid` exists with no privilege ceiling on the target | Role change is possible against a higher-privileged target (see RCA-005/006) | REC-004 |
| **013** | Platform Operators (staff roster) | MUST | **MI** — Missing | No tab; `GET/POST /api/platform/operators` real (`platform.js:1304`, `:1342`), revoke-sessions `:1402`; SA-only (probe: 403 for ADMIN) | Staff roster, session revocation and operator creation are unreachable from the new console | REC-020 |
| **014** | Super-admin role-view simulation | REDESIGN | **OV** — Over-engineered | `cuba-app-shell.tsx:276,283-317` posts `/api/platform/role-view-audit` which is SA-only (probe 403 for ADMIN); simulation is client-only state that changes no server decision | Over-engineered relative to value: a cosmetic impersonation mode whose audit call fails for the role most likely to use it, while the real capability projection (INV-3) is missing. RCA-021. | REC-018 |
| **015** | Command palette + entity search | REDESIGN | **MI** — Missing | Legacy `AdminCommandPalette.jsx` 239 ln + `adminEntitySearch.js`; `GET /api/platform/search` real (`platform.js:921`, 200 for S/A/Ad/SA); no palette in the new console | Cross-entity search (the fastest path to a user during an incident) is gone | REC-014 |
| **016** | Step-up reauthentication recovery | MUST | **MI** — Missing | Legacy `AdminReauthPrompt.jsx` + `adminReauth.js` retry the paused request after reauth; new `api-client.ts:120-180` handles `401`/`TENANT_CONTEXT_REQUIRED` only; `RECENT_AUTH_REQUIRED` has no handler | Destructive actions dead-end on step-up failure with a generic error; no way to re-authenticate and continue. RCA-012. | REC-009 |
| **017** | MFA posture gate/banner | MUST | **MI** — Missing | Legacy `Admin.jsx:597-638,810-825` computes `mfaVerified`/`mfaEnrolled` and explains why actions are blocked; new shell has no MFA posture surface | Operators cannot tell why a control is unavailable | REC-009 |
| **018** | Employer application verification | MUST | **MI** — Missing | No tab; FE has no employer-application route at all (legacy `EmployerApplications.jsx` 585 ln); `POST /admin/employer-applications/:id/verify` is **404** `[PROBE-003]` | Moderation of employer onboarding is impossible | REC-021 (against `PATCH /api/admin/employer-applications/:uid`) |
| **019** | Jobs Manager (moderation) | MUST | **MI** — Missing | No tab; legacy 599 ln; `PATCH /api/admin/jobs/:jobId` exists (`index.js`), `POST /admin/jobs/:id/moderate` is **404** | Spam/scam job moderation has no UI | REC-021 |
| **020** | Company Management | MUST | **MI** — Missing | No tab; `GET /api/admin/companies` (probe 200 for A/Ad/SA) and `PATCH /api/admin/companies/:companyId` (`index.js:6831`) exist unused | Company merge/verification unavailable | REC-021 |
| **021** | Blog management (CRUD + scheduling) | MUST | **FL** — Covered — flawed | `AdminBlogManagementTab.tsx:97` `get('/blog/posts')` → **404**; `:126` `del('/blog/posts/:id')` → **404**; real surface is `GET /api/blog-data`, `DELETE /api/blog-data/:id` | Content list and delete are both phantom; tab renders fixtures | REC-003 |
| **022** | Landing Pages (marketing claims) | REDESIGN | **MI** — Missing | Legacy 344 ln; `landingMarketing` claims are normalised server-side (`index.js:3581-3584`), no new UI | Marketing claims remain editable only by direct API call | REC-021 |
| **023** | Reviews moderation | MUST | **MI** — Missing | No tab; `GET/POST/DELETE /api/admin/reviews*` exist | Trust-signal moderation unavailable | REC-021 |
| **024** | Trusted By logos | REDESIGN | **MI** — Missing | No tab; `/api/admin/trusted-by*` exists (probe GET 403 for ADMIN under policy) | Marketing logo wall unmanageable | REC-021 |
| **025** | Messages moderation | REDESIGN | **MI** — Missing | No tab; `enableMessagesModule` gate exists (`index.js:600`); `messages.read` permission required-but-granted-to-nobody (Appendix A.2) | Moderation of direct messages impossible; the permission to do it exists on paper only | REC-021 + REC-005 |
| **026** | Help Desk (tickets) | MUST | **FL** — Covered — flawed | `AdminHelpDeskTab.tsx:128` reads `GET /admin/support/tickets`; shape matches (`routes/support.js:71` returns `{success, tickets}`); reply `:157` and status `:188` target real paths, both `.catch(() => {})` | Correct contract, dishonest state: an empty list keeps `DEFAULT_TICKETS`, a failed reply is still appended as `STAFF`, a failed status change is still shown (RCA-001/002) | REC-001 + REC-002 |
| **027** | ATS Phrases (content seed library) | REDESIGN | **MI** — Missing | Legacy 246 ln; `POST /api/phrases` requires `system.config.write` (`miscData.js:278`); no UI | Content library editable only via API | REC-021 |
| **028** | Addon Modules (`modulesSettings`) | REDESIGN | **FL** — Covered — flawed | `AdminSettingsTab.tsx:405-445` 18 toggles with optimistic write and `expectedRevision` (the only panel that sends one); only 2 keys gate behaviour, 13 are inert (Appendix A.7) | Four real switches among eighteen; banner claims propagation that only 4 flags have. RCA-011. | REC-010 |
| **029** | Brand Identity & Meta (`websiteSettings`) | MUST | **FL** — Covered — flawed | `AdminSettingsTab.tsx:864-890` writes `branding`/`geoSeo`/`llmGeo` without `expectedRevision` → `400 ADMIN_SETTINGS_REVISION_REQUIRED` (`index.js:3887`) | Every save fails with the generic 'Failed to save' toast. RCA-013. | REC-012 |
| **030** | Branding & Assets (`brandingSettings`) | REDESIGN | **FL** — Covered — flawed | as CAP-029; no MIME/size/dimension validation on `lightLogo`/`darkLogo`/`faviconUrl` (`AdminSettingsTab.tsx:880-882`) | Write fails on revision; validation absent even if it succeeded | REC-012 + REC-011 |
| **031** | Indian Geo-SEO (`geoSeoSettings`) | REDESIGN | **FL** — Covered — flawed | `AdminSettingsTab.tsx:883` `post('/api/admin/settings/geoSeo', { data })` — no `expectedRevision`; server normaliser `normalizeGeoSeoSettings` (`index.js:3871`) never reached | Saves 400; only the keyword string is exposed, not the normalised model | REC-012 + REC-011 |
| **032** | LLM GEO / AI-search discovery | REDESIGN | **FL** — Covered — flawed | `AdminSettingsTab.tsx:886`; server publishes `llms.txt` (`index.js:5017`); write 400 | Machine-readable discovery cannot be configured from the console | REC-012 + REC-011 |
| **033** | Firebase Identity (`firebaseSettings`) | REDESIGN | **MI** — Missing | No status surface; credentials are deployment-owned (`index.js:5866-5915`); `GET /api/admin/firebase-service-account` is SA-only and sensitive-read audited | An operator cannot see whether identity is credentialed | REC-016 |
| **034** | Database & Persistence Engine | OBSOLETE | **MI** — Missing | Correctly absent: legacy Firestore↔MySQL sync controls refer to a retired engine (`reference-code/backend/database/syncManager.js`); new `GET /platform/encryption` (`platform.js:836`) exposes engine status | — (absence is intended; recorded as DIV-009) | none — absence affirmed |
| **035** | Social Sign-On & OAuth (`socialAuthSettings`) | MUST | **MI** — Missing | No UI; `oauth.*` entries exist in the config census (`platformConfiguration.js:437`); `socialAuth` secret fields guarded by `requiresRecentGenericSettingAuth` (`index.js:3745-3752`) | OAuth client-secret rotation has no supported path in the console | REC-011 |
| **036** | Email & SMTP (`emailSettings`) | MUST | **FL** — Covered — flawed | `AdminEmailSmtpTab.tsx:75-81` reads `/email/admin/settings` and spreads `settingsData.settings` at top level (`host`, `port`, `username`, …), while the server nests them at `settings.smtp.*` (`routes/email.js:1665-1671`); save/test paths are real (`:96`, `:1829`) | **Shape mismatch: the form displays the hard-coded Hostinger defaults (`:47-56`) instead of the configured SMTP**, and a save would write those defaults back (RCA-003) | REC-003 + REC-012 |
| **037** | Cloud Storage (`storageSettings`) | OBSOLETE | **MI** — Missing | Correctly absent: `POST /api/admin/settings/storage` returns `501 STORAGE_PROVIDER_UNSUPPORTED` (`index.js:3852-3859`) | — (absence is intended and honest; DIV-010) | none — absence affirmed |
| **038** | AI & Gemini Providers (`aiSettings`) | MUST | **RD** — Intentionally redesigned | `AdminAiSettingsTab.tsx` + `ai-settings/{providers,quotas,discovery,gateway,playground,metrics}` (11 modules); backend `adminAiEntitlement.js`, `aiGovernance.js`; 19 routes probed, e.g. `/api/admin/ai/entitlements` 403 for ADMIN | Redesigned and expanded beyond legacy; gaps are in audit/approval of provider-key rotation, not in coverage | REC-015 (audit) + REC-005 (who may rotate) |
| **039** | PDF Exporter (`exportPdfSettings`) | REDESIGN | **RD** — Intentionally redesigned | `index.js:3848-3851` makes `websiteDomain`/`backendExportUrl`/`chromiumPath` read-only infrastructure with `403 INFRASTRUCTURE_SETTING_READ_ONLY`; no console field claims otherwise | Correctly narrowed; the remaining export switches are not exposed in the console | REC-011 |
| **040** | Job & Naukri Scraper (`jobScraperSettings`) | REDESIGN | **RD** — Intentionally redesigned | `jobScraper` is in `GENERIC_ADMIN_SETTING_CATEGORIES` (`index.js:3555`) with no console field and no schedule model | Category writable by API only; no enable/schedule/source-allowlist model | REC-011 |
| **041** | Twilio SMS (`twilioSmsSettings`) | MUST | **FL** — Covered — flawed | Canonical path `GET/POST /api/admin/twilio-settings` (`index.js:4826,4845`) with E.164 + `AC…` validation and `TWILIO_SETTINGS_UPDATED` audit; console instead writes `twilioSid/twilioToken` into the **`integrations`** category (`AdminSettingsTab.tsx:1024-1034`) | Two competing writers; the console's fields are read by nothing, and the write 400s. Worse: `twilioToken` is not classified private (`index.js:3658-3664`), so on a successful write it would be published by the public `/api/platform/public-config` (`platform.js:227-256`). RCA-013. | REC-012 + REC-022 |
| **042** | Platform Currency (`currencySettings`) | MUST | **FL** — Covered — flawed | `AdminSettingsTab.tsx:691,706` currency + GST inputs; write goes to `/api/admin/payment-settings` without `expectedRevision` → `400 PAYMENT_SETTINGS_REVISION_REQUIRED` (`index.js:4250-4256`) | Currency/GST — the unit of every invoice — cannot be changed from the console | REC-012 |
| **043** | Orders & Transactions (`ordersManagement`) | REDESIGN | **MI** — Missing | No tab; no `/api/admin/orders` in Appendix A.1 (aggregate exists only inside `/platform/command-center`) | Refunds/disputes have no reconciliation surface | REC-021 |
| **044** | Subscriptions & Gateways (`subscriptionsSettings`) | MUST | **FL** — Covered — flawed | `AdminSettingsTab.tsx:604` reads `/api/admin/payment-settings` (real, `index.js:3291`); save 400; `/api/platform/payment-settings` (`platform.js:1707`) is never called | Gateway credentials cannot be rotated from the console; read-only panel | REC-012 |
| **045** | PDF Watermark (`watermarkSettings`) | MUST | **MI** — Missing | `watermark` is an allowed category (`index.js:3555`); no console field | Free-tier output branding unmanageable | REC-011 |
| **046** | Maps & API Keys (`integrationsSettings`) | REDESIGN | **RD** — Intentionally redesigned | `AdminSettingsTab.tsx:1009-1040` writes `googleMapsKey`/`recaptchaSiteKey`; `platformHealth.js:488-497` reads `googleMapsApiKey`/`recaptchaSecretKey` → field-name mismatch | Health probes report 'not configured' for keys that are configured; redesign fixed the shape but not the names | REC-012 |
| **047** | Security & Limits (`securityLimitsSettings`) | MUST | **MI** — Missing | Rate limits are env-only (`GLOBAL_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `AUTH_BURST_RATE_LIMIT_MAX`, `index.js:381-411`); `security` category has no console field | No dashboard control for auth/global limits — see CFG-004 | REC-011 |
| **048** | System Health / maintenance (`systemHealthSettings`) | MUST | **CC** — Covered — correct | `AdminOperationsTab.tsx:55-88` reads `/api/admin/health-summary` (`index.js:3434-3471`: response keys `revision`, `settings.maintenanceMode`, `settings.maintenanceMessage` match the client exactly) and writes `/api/admin/system-health-settings` with `expectedRevision`; server validates and audits in-transaction | — the only capability whose read shape, write shape, revision handling and error reporting all match the server | none |
| **049** | Feature Flags (`featureFlagsSettings`) | MUST | **MI** — Missing | Backend complete: `GET /platform/feature-flags` (SA), `PUT /platform/feature-flags/:flagKey` with recent-auth (`platform.js:1637,1646`), `featureFlagService.js` 7 flags; no UI anywhere in `frontend/src` (`grep -rn featureFlag`) | The only way to stop a misbehaving worker without a deploy is unreachable. RCA-015. | REC-013 |
| **050** | Platform Config census (`platformConfigSettings`) | REDESIGN | **MI** — Missing | `GET /platform/configuration` works (SA; probe 200) and `platformConfiguration.js` returns grouped ownership/restart metadata; no UI | Operators cannot answer 'who owns this value, does it need a restart?' | REC-016 |
| **051** | Code Injection (`codeInjectionSettings`) | REDESIGN | **FL** — Covered — flawed | `AdminSettingsTab.tsx:1185-1187` posts `codeInjection` without revision; server requires step-up for the category (`index.js:3748`) and never projects it publicly (`:3753`); route is SA-only under policy (probe 403 for ADMIN) | Panel is shown to roles that will be refused, then the write 400s; no CSP preview or diff review | REC-012 + REC-014 |
| **052** | GDPR & Legal (`gdprLegalSettings`) | MUST | **FL** — Covered — flawed | `AdminSettingsTab.tsx:1182-1184` `gdpr` write without revision → 400 | Consent banner and retention URLs uneditable | REC-012 |
| **053** | Templates Manager (`templateManagerSettings`) | REDESIGN | **RD** — Intentionally redesigned | `AdminSettingsTab.tsx:1164-1172` derives 51 templates from `Array.from({length:51})` instead of `frontend/src/lib/template-catalog.ts`; stores only `disabledTemplates` | Redesigned but re-implements the catalogue client-side: pro/free flags are hard-coded (`[7,12,18,24,30,35,42,48,51]`) | REC-011 |
| **054** | Pages & CMS (`pages`) | MUST | **MI** — Missing | No tab; `GET/PUT/DELETE /api/admin/pages*` exist (probe `/admin/pages` 403 for ADMIN); `custom_pages` table ([SQL-001]:275) | Legal pages cannot be edited from the console | REC-021 |
| **055** | Blog Engine settings (`blog`) | REDESIGN | **MI** — Missing | `blog` category allowed (`index.js:3555`) and `enableBlogModule` is one of the 13 inert flags (Appendix A.7); no UI | Blog configuration separable from content, neither fully present | REC-021 |
| **056** | Social Channels (`socialSettings`) | REDESIGN | **RD** — Intentionally redesigned | Server validation is strong (`index.js:3859-3873`: allowlist + HTTPS + length); no console field surfaces the rules | Redesigned server-side, not surfaced | REC-011 |
| **057** | Analytics & Tracking (`analytics`) | REDESIGN | **RD** — Intentionally redesigned | `analytics` category allowed; `GA4Provider.tsx` consumes a measurement id; legacy's raw snippet model is gone | Consent-gated analytics config has no owner surface | REC-011 |
| **058** | Ads Manager (`ads`) | REDESIGN | **MI** — Missing | `GET/POST/DELETE /api/admin/ads` exist (`index.js:6295,6457,6474`); no UI | Ad creatives/targets unmanageable when ads are enabled | REC-021 |
| **059** | Platform announcements / broadcast banners | MUST | **FL** — Covered — flawed | `AdminContentMarketingTab.tsx:66-111` renders fixture copy; real CRUD is `GET/POST/PATCH/DELETE /api/platform/announcements` (`platform.js:977-1120`) | Broadcast banners (the user-facing incident channel) are shown from fixtures | REC-001 + REC-003 |

---

## 3. Second axis: console tab → capability coverage

The console has 15 tab identifiers (`frontend/src/pages/admin/console.tsx:50-66`) and 14 component files. This maps each tab to the capabilities it is *supposed* to serve and to the ones it actually serves.

| Tab (`VALID_TABS` id) | Component (LOC) | Capabilities it must serve | Capabilities it actually serves correctly | Verdict |
|---|---|---|---|---|
| `dashboard` | `AdminDashboardTab.tsx` (≈300) | CAP-001, CAP-005 | none | **Flawed** — fabricated KPI values (RCA-001) |
| `health` | `AdminHealthTab.tsx` (≈700) | CAP-002 | none | **Flawed** — response-shape mismatch (`services` array read as a map), so the fixture is always shown (RCA-003) |
| `queues` | `AdminQueuesTab.tsx` (≈330) | CAP-003 | read-only list | **Flawed** — DLQ retry/purge are phantom (RCA-003) |
| `operations` | `AdminOperationsTab.tsx` (≈400) | CAP-004, CAP-048 | CAP-048 (maintenance) | **Flawed** — backup/cache-clear phantom (RCA-003) |
| `attention` | `AdminAttentionTab.tsx` (≈200) | CAP-005 | none | **Flawed** — fixture digest |
| `users` | `AdminUsersTab.tsx` (≈600) | CAP-009, CAP-010, CAP-011, CAP-012, CAP-017 | CAP-012 (role PATCH only) | **Flawed** — fixture directory, success-on-failure, no privilege ceiling |
| `support` | `AdminHelpDeskTab.tsx` (≈420) | CAP-026 | list + status (contract correct) | **Flawed** — empty list keeps fixtures; failed reply still renders as sent (RCA-001/002) |
| `moderation` | `AdminModerationTab.tsx` (≈300) | CAP-018, CAP-019, CAP-023 | none | **Flawed** — approve calls a 404 route |
| `blog` | `AdminBlogManagementTab.tsx` (≈260) | CAP-021, CAP-055 | none | **Flawed** — list and delete are 404 |
| `content` | `AdminContentMarketingTab.tsx` (≈350) | CAP-022, CAP-058, CAP-059 | none | **Flawed** — fixtures; announcements CRUD not called |
| `ai-settings` | `AdminAiSettingsTab.tsx` + 11 modules (≈3,000) | CAP-038 | provider/quota/discovery orchestration | **Correct-by-design**, audit gaps only |
| `email` | `AdminEmailSmtpTab.tsx` (≈330) | CAP-036 | test, save | **Flawed** — reads `settings.smtp.*` as if flat, so the form shows hard-coded defaults (RCA-003) |
| `security` | `AdminSecurityTab.tsx` (≈380) | CAP-008 | none | **Flawed** — no loader at all; 100% fixture, including fabricated attack events |
| `settings` | `AdminSettingsTab.tsx` (≈1,340) | CAP-029…CAP-058 (31 screens) | maintenance-adjacent reads | **Flawed** — 4 of 5 panels cannot save (RCA-013) |
| `modules` | alias of `settings` | CAP-028 | module flags (only panel that sends `expectedRevision`) | **Flawed** — 14 of 18 keys inert (RCA-011) |

Capabilities with **no tab at all** (the 27 "Missing" rows): CAP-006, 007, 010, 013, 015, 016, 017, 018, 019, 020, 022, 023, 024, 025, 027, 033, 034, 035, 037, 043, 045, 047, 049, 050, 054, 055, 058. Nine of these have a fully working backend that the console simply never calls (006, 007, 013, 015, 018, 020, 022, 023, 049) — the cheapest coverage wins in the whole programme.

**Legacy-to-new route census** (the honest headline for "28 routes → 15 tabs"): legacy registered **24 concrete tab routes** plus `/admin/settings?tab=` (31 screens). The new console registers **15 tab ids**, of which `modules` is a second entry point to `settings` (`console.tsx:55,66`), leaving **14 distinct panels**. Every legacy route with no successor is listed in §3 above as a missing capability; the count of legacy routes with **no** successor surface is **12**: `tenants`, `audit-logs`, `operators`, `employer-applications`, `jobs-manager`, `company-management`, `reviews`, `trustedby`, `landing-pages`, `phrases`, `messages`, `pages`.

---

## 4. Settings-screen coverage (CAP-028 … CAP-058, 31 screens)

| Outcome | Screens | Count |
|---|---|---|
| Console surface exists, can persist, and reads back correctly | CAP-028 (modules), CAP-048 (maintenance) | **2** |
| Console surface exists and the write path is real, but the read shape is wrong so the form shows defaults | CAP-036 (email) | **1** |
| Console surface exists but **cannot persist** (`400 ADMIN_SETTINGS_REVISION_REQUIRED` / `400 PAYMENT_SETTINGS_REVISION_REQUIRED`, or writes a category/field nothing reads) | CAP-029, 030, 031, 032, 041, 042, 044, 051, 052, 053 | **10** |
| Deliberately redesigned into a different surface that does work | CAP-038 (AI), CAP-039 (infra read-only), CAP-046 (field names wrong), CAP-056 (server-side only), CAP-057 (server-side only) | **5** |
| No surface — genuine gap | CAP-033, 035, 040, 043, 045, 047, 049, 050, 054, 055, 058 | **11** |
| No surface — correct, capability is obsolete | CAP-034, CAP-037 | **2** |
| **Total** | | **31** |

The decisive number is the second row: **10 of the 31 legacy settings screens have a console panel that silently cannot write.** All ten fail the same way — the panel posts `{ data }` without `expectedRevision`, and the server rejects it with `400` (`backend/index.js:3887`; `:4250-4256`). Root cause and proof: RCA-013.

---

## 5. What the matrix does *not* claim

* It does **not** claim legacy's behaviour is the requirement. Every "Missing" verdict is justified by the capability's business function (a paying enterprise customer cannot be suspended; the audit trail cannot be read), not by the existence of a legacy screen. Where the capability is obsolete, the row says so (§03 CAP-034, CAP-037).
* It does **not** treat "a tab exists" as coverage. **23 of the 24 existing surfaces are counted flawed**, and the single exception (CAP-048) is correct only because its client matches its server.
* It does **not** count a route that the role cannot reach as covered: CAP-007 and CAP-049 are marked Missing *despite* working backends, because no operator surface reaches them (probe-confirmed 403/200 splits in §08).

---

*Cross-references: intent classification §03 · root causes §06 · divergences §07 · invariant proofs §08 · configuration values §09 · remediation §10.*
