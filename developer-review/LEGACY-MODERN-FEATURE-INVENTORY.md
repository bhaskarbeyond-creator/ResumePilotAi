# Legacy ↔ Modern Feature Inventory

**Audit revision:** `415335b4b85f39456529850b38962a7c5c79dd73` (branch `arena/393531fe-resumepilotai`,
parent `a7d08a2f`)
**Comparison basis:** working tree at that revision; both frontends read only
**Machine-generated evidence:** `Evidence/artifacts/legacy-modern-inventory.json`,
`Evidence/artifacts/legacy-file-inventory.tsv`, log `Evidence/logs/legacy-modern-inventory.log`
**Tool:** `developer-review/tools/legacy-modern-inventory.cjs` (re-runnable; every count below is
reproducible from it)
**Reopened directive:** legacy-vs-modern parity, omission detection, audit correction

---

## 0. Headline counts (measured, not carried over)

> **V6 note (base `a5835ff6`).** The inventory counts below are unchanged and were re-verified: 650 legacy
> source files / 519 `.jsx` / 193,310 lines, 206 modern files / 151 `.tsx` / 68,812 lines. What changed in V6
> is the **capability mix**, not the file counts: `FULL PARITY` is **12**, not the 19 this document's V5
> annotation quotes, because seven rows were tested at subfeature depth (see
> `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §2.2). The domain map below still holds; the "modern tree genuinely
> added" table now has a counterpart in §2.2 of that register listing what the modern tree *removed*.


| Metric | Legacy `src/` | Modern `frontend/src/` |
|---|---:|---:|
| Source files (`.js`/`.jsx` vs `.ts`/`.tsx`) | **650** | **206** |
| of which JSX/TSX | **519 .jsx** | **151 .tsx** |
| Total lines | **193,310** | **68,812** |
| Distinct API endpoints referenced | **153** | **161** |
| Route declarations in the app entry | 58 (`src/main.jsx`) | **100** (`app/router.tsx`) |

**Endpoint overlap:** **69 shared**, **84 legacy-only**, **92 modern-only**.

**Correction of an earlier claim in this package.** `PARITY-MATRIX-V2.md` §1–§5 assessed backend
route parity only (20/20 presence, 6/20 deep). It never measured *frontend* parity, and
`DISCREPANCY-LOG.md` DISC-001 described the root tree only as an ambiguous second build target.
Neither document asserted that the legacy tree's **capabilities** had been ported. The reopened
directive's premise — that a large capability surface was not ported — is **substantially
confirmed** (§4), but several specific allegations are **refuted** (§6). Both are recorded.

> The legacy file count is **650**, not the "hundreds of JSX components" figure in the supplied
> report (which is also right in spirit: 519 `.jsx` components). The modern tree is **not** a thin
> shell: it has 206 files, 68,812 lines, 100 routes and more distinct API endpoints (161) than the
> legacy tree (153). Modern is a genuine re-architecture, not a stub — with specific, serious
> capability gaps and fabricated admin surfaces enumerated below.

## 1. Which frontend is active (evidence, not assumption)

| Evidence | Result |
|---|---|
| `package.json` scripts | `dev`/`build`/`preview` all delegate `--prefix frontend` — the root Vite app is **not** in any npm script |
| `frontend/package.json` | own `tsc -b && vite build` chain, own Playwright suites |
| `scripts/candidate-workspace-inventory.mjs:5` | imports `../src/components/cuba/candidateNavigation.js` — the **only** non-test build-tool import of legacy code |
| `backend/test/*.test.js` | **7 test files** assert against legacy `src/` source strings (contract tests) |
| Root `index.html` | references `/src/main.jsx`; served only by the root `vite.config.js` |
| Deployed artifact | `scripts/sync-dist.mjs` syncs **`frontend/dist`** → `dist/` (per its own header) |

**Conclusion:** the active runtime application is `frontend/`. The legacy tree is **not dead**,
however:

1. It is the **only** implementation of several capabilities the modern tree lacks (§4).
2. Backend **contract tests assert on its source text**, so it is still part of the repository's
   declared contract surface.
3. One tooling script consumes it.

Therefore "delete it" is **not** a supportable recommendation; "retire capability-by-capability,
with a recorded decision per capability" is (§7).

## 2. Domain map of the legacy tree (all 650 files accounted)

| Domain | Files | .jsx | Lines | Endpoints | Legacy location(s) |
|---|---:|---:|---:|---:|---|
| **A — Super Admin / platform ops** | 87 | 83 | 37,391 | 22 | `src/components/admin/**` (24 sub-areas), `Billing`, `Marketing` |
| **B — Enterprise talent cloud** | 27 | 23 | 10,991 | 26 | `src/enterprise/**` |
| **C — Portfolio builder / WebCV** | 88 | 83 | 24,260 | 1 | `src/components/PortfolioBuilder/**`, `PortfolioTemplates`, `PublicPortfolio` |
| **D — Candidate experience** | 121 | 100 | 32,886 | 12 | `src/components/Dashboard/**`, `Candidate`, `Dashboard2`, `cuba`, `AppShell`, `CoverLetter` |
| **D — Voice interview** | 6 | 5 | 5,823 | 0 | `Dashboard/DashboardInterviews/**`, `hooks/useInterviewMedia.js` |
| **E — Resume builder** | 65 | 61 | 25,557 | 2 | `BuildResume`, `Boards`, `Actions`, `Exporter`, `Form`, `PublicResume` |
| **E — CV templates** | 73 | 72 | 13,985 | 0 | `src/cv-templates/**` (51 `cv*` + 6 `cover*` dirs + css) |
| **F — Employer / job board** | 35 | 33 | 11,542 | 2 | `EmployerPortal`, `JobsListings`, `JobsLanding`, `AppliedJobs` |
| **G — Content & shared infra** | 139 | 59 | 30,885 | 108 | `engine`, `services`, `utils`, `hooks`, `models`, `conf`, `Blog`, `CustomPage`, `MetaManager`, `auth`, `common`, … |

Every one of the 650 files appears individually in
`Evidence/artifacts/legacy-file-inventory.tsv` with its domain, line count and capability signals
(seed arrays, API calls, speech APIs, QR, image-crop, Puck, map-provider). **No legacy source file is
unaccounted for.** The 29 files whose path did not match a directory rule were individually
inspected and assigned to shared/candidate/portfolio infrastructure (`src/main.jsx`,
`src/hooks/*`, `src/components/ResumePageComposer.jsx`, `Features`, `RouteSeo`, `PortfolioGallery`,
`TemplateRenderer`, `GA4Provider`, `PrivacyConsentBanner`, `src/data/entitlements.js`, `src/i18n.js`, …).

### 2.1 Legacy admin sub-areas (24) vs modern admin tabs (15)

| Legacy sub-area | Files | Modern counterpart | Status |
|---|---:|---|---|
| `settings/` | 35 | `AdminSettingsTab.tsx` (1,324 lines, 8 API calls) | mostly REAL |
| `usersManager/`, `userEdit/` | 4 | `AdminUsersTab.tsx` (1,131 lines, 7 API calls) | PARTIAL |
| `health/` | 3 | `AdminHealthTab.tsx` (909 lines, real fetch + fabricated fallback) | PARTIAL |
| `queues/` | 1 | `AdminQueuesTab.tsx` (683 lines, 6 API calls) | FULL |
| `blogManagement/` | 2 | `AdminBlogManagementTab.tsx` | REAL |
| `audit/` | 1 | — (see `AdminSecurityTab`) | FABRICATED |
| `security/` | 1 | `AdminSecurityTab.tsx` (928 lines, **0 API calls**, 4 seed arrays) | FABRICATED |
| `operators/` | 1 | — (inside `AdminSecurityTab`) | FABRICATED |
| `tenants/` | 1 | — (a "Tenants Registry" sub-tab inside `AdminModerationTab`) | FABRICATED (read path) |
| `companyManagement/` | 1 | `AdminModerationTab.tsx` | MOCK read path |
| `employerApplications/`, `jobsManager/` | 2 | `AdminModerationTab.tsx` | MOCK read path |
| `phrases/`, `reviews/`, `TrustedBy/`, `landingPages/` | 4 | `AdminContentMarketingTab.tsx` (456 lines, **0 API calls**, 4 seed arrays) | FABRICATED |
| `attention/` | 1 | `AdminAttentionTab.tsx` (169 lines, **0 API calls**, seeded signals) | FABRICATED |
| `dashboard/` | 1 | `AdminDashboardTab.tsx` (real fetch, fabricated fallbacks) | PARTIAL |
| `messages/`, `operations/`, `command/`, `sidebar/` | 5 | absorbed into `AdminHelpDeskTab` / `AdminOperationsTab` / `console.tsx` | PARTIAL |

## 3. What the modern tree genuinely added (parity is not one-directional)

| Modern-only capability | Evidence | Legacy equivalent |
|---|---|---|
| Enterprise tenant **suspend / reactivate** endpoints wired in UI | `/enterprise/platform/tenants/{X}/suspend, /reactivate` | lifecycle only at platform level |
| Workspace/team **archive + restore** | `/enterprise/workspaces/{X}/archive, /restore`, `/enterprise/teams/{X}/archive, /restore` | absent |
| DLQ **replay-all**, outbox retry, cache-clear, backup actions | `/admin/queues/dlq/replay-all`, `/admin/operations/*` | partial |
| Support ticket conversation threads | `/admin/support/tickets/{X}/messages`, `/support/tickets/{X}/messages` | absent |
| Signed upload URL flow | `/storage/signed-upload-url` | direct upload |
| Live-interview turn API + completion | `/live-interview/sessions/{X}/turns, /complete` | single-shot guide |
| AI providers (5 endpoints) + FreeLLMAPI status/metrics | `/ai/*`, `/freellmapi/*` | single `/api/ai` |
| Billing checkout per gateway | `/billing/checkout`, `/paypal/create-order`, `/razorpay/create-order`, `/webhooks/*` | `/api/pay`, `/payment-orders` |
| Account export/delete (GDPR) | `/account/export`, `/account/delete` | shared |
| 2FA send-sms, check-grammar, generate-summary, generate-interview | modern-only endpoints | absent |

## 4. Confirmed capability losses (the reopened directive's core finding)

### 4.1 Domain A — Super Admin: two fully fabricated tabs behind real-looking UI

**`AdminSecurityTab.tsx` (928 lines) — 0 API call sites, 4 seeded arrays, 10 fabricated records.**
It presents a security event stream, an operator roster, an announcement publisher, IP blocking and
session revocation, all mutating React state only:

* `INITIAL_EVENTS: SecurityEvent[]` — fabricated events with principals such as
  `support-agent-3@internal.corp`, IPs `192.168.1.105` (file lines 66-110).
* `handleRevokeSessions(...)` sets a confirmation modal whose action is
  `setOpNotice('Active tokens & refresh tokens revoked … Next request will return 401.')` and a
  `setTimeout` to clear it (lines ~204-213) — **no API call, but a message asserting a security
  action occurred.**
* Selected event detail shows `requestPath: '/api/enterprise/tenants/tenant_alpha_enterprise/secrets'`
  (line 98) — a fabricated forensic record.
* Backend equivalents **exist**: `GET /api/platform/security-events`,
  `GET/POST /api/platform/operators`, `POST /api/platform/operators/:uid/revoke-sessions`,
  `GET/POST/PATCH/DELETE /api/platform/announcements` (`backend/routes/platform.js`).

**`AdminContentMarketingTab.tsx` (456 lines) — 0 API call sites, 4 seeded arrays, 16 fabricated records.**
`INITIAL_PHRASES` (5), `INITIAL_REVIEWS` (3 named reviewers with quotes), `INITIAL_TRUSTED`
(5 partner logos: "Google Cloud Partner", "NVIDIA Inception", "Microsoft for Startups", "AWS
Activate", "Stripe Climate"), `INITIAL_PAGES` (3 landing pages with view counts `24,190` and
conversion rates `14.2%`). Handlers only `setPhrases`/`setReviews`/`setTrustedList`. Backend
equivalents **exist**: `/api/phrases`, `/api/admin/reviews`, `/api/admin/trusted-by`,
`/api/admin/pages`, plus public readers `/api/public/trusted-by`, `/api/public/custom-pages`.

> **Severity note:** the `INITIAL_TRUSTED` list names real partner organisations. If this tab is
> reached in production, an operator could believe those logos are live site content, and any
> "add brand" action would silently vanish on reload. This is a
> *trust/compliance-adjacent* fabrication, not a cosmetic one.

**`AdminAttentionTab.tsx` (169 lines) — 0 API call sites**, `DEFAULT_SIGNALS` seeded, refresh does
not fetch. Legacy had `admin/attention`.

**`AdminModerationTab.tsx` (674 lines) — MOCK read path, partially-wired write path.**
`DEFAULT_APPLICATIONS` (3 fabricated employer applications with LinkedIn URLs and company
descriptions) and `DEFAULT_JOBS` (3 fabricated postings incl. "Earn $5000/day Data Entry Typist")
seed the UI. The approve/reject handlers **do** call the real endpoints
(`POST /admin/employer-applications/:id/verify`, `POST /admin/jobs/:id/moderate`) — but with
`.catch(() => {})`, i.e. failures are swallowed, and the list is never re-fetched from the server.
The `companies` / `tenants` sub-sections render from the same seeded objects and expose no tenant
list at all.

**`AdminDashboardTab.tsx` / `AdminHealthTab.tsx` — real fetch, fabricated fallback.**
`usePlatformStats()` is real, but each KPI falls back to invented values when data is absent:
`stats?.totalUsers ?? '48,290'`, `stats?.aiGenerations ?? '420,910'`,
`stats?.storageUsed ?? '184.2 GB'` (`AdminDashboardTab.tsx:41-48`).
`AdminHealthTab` keeps a 28-entry `DEFAULT_28_SERVICES` catalogue with `status: 'OPERATIONAL'`,
latencies and claims such as `'Carrier Delivery': '99.8%'`, `'Active Tenants': 12`,
`'Isolation Invariants': '100% Enforced'` (line ~487); remote data **overrides** it when present
(`/platform/operational-status`, line 528-543), so the defect is specifically: *when the endpoint
returns nothing, an unmonitored system is displayed as fully operational with invented metrics.*

**Lost admin capabilities with an existing backend but no modern UI at all:**

| Capability | Legacy | Backend endpoint(s) present | Modern UI |
|---|---|---|---|
| Coupons | `admin/settings/subscriptionsSettings.jsx` | `/api/admin/coupons*` (2 refs) | none (`coupon` appears in 2 modern files, neither an admin CRUD surface) |
| Refunds / invoices / credit notes | `subscriptionsSettings.jsx` | `/api/admin/payments/refund`, `/api/invoices`, `/api/payment-orders` | none (1 incidental "refund" mention) |
| Webhook inspection/replay | — (backend-only) | `/api/platform/payment-webhooks` | none |
| Subscription reconciliation | `subscriptionsSettings.jsx` | — | none |
| Trusted-by / phrases / reviews / landing pages | 4 legacy components | all present | fabricated tab (§4.1) |
| Audit event stream | `admin/audit/AdminAuditLogs.jsx`, `admin/security/PlatformSecurity.jsx` | `/api/admin/audit-logs`, `/api/platform/security-events` | fabricated tab + an **unused hook** (§4.2) |

### 4.2 Phantom data layer (verified)

`frontend/src/hooks/use-api-hooks.ts` defines 22 React Query hooks. Four of them have **zero
consumers** anywhere in the modern app:

```
useAdminAuditLogs        consumers=0   → GET /admin/audit-logs  (real endpoint, never called by UI)
useSystemHealth          consumers=0
useAdminUsers            consumers=0
useAdminSupportTickets   consumers=0
```

The file's own header claims *"PHANTOM HOOKS REMOVED"* — accurate for the endpoints it lists, but the
remaining set is itself partially unused, which is why `AdminSecurityTab` fabricates its audit
stream instead of calling `useAdminAuditLogs()`.

### 4.3 Domain C — Portfolio builder: capability collapse + read-only legacy documents

| Legacy capability | Evidence | Modern |
|---|---|---|
| Puck drag-and-drop page editor | `src/components/PortfolioBuilder/LegacyPuckEditor.jsx:3-4` (`@puckeditor/core`), `PortfolioBuilder.jsx` (dynamic import), `PublicPortfolio.jsx:3` (`Render`) | **absent** — `@puckeditor` appears nowhere under `frontend/src`, and is no longer used by any built entry |
| 71 modular page blocks (`PortfolioComponents/About1‑6, Awards1‑2, Contact1‑4, Education1‑2, Experience1‑2, …`) | 71 `.jsx` files | **absent** — replaced by a canonical structured document (`lib/portfolio-document.ts`) with fixed sections |
| WebCV Studio (856 lines) + template presets (683 lines) + template utils (427) | `WebCvStudio.jsx`, `TemplatePresets.js`, `templateUtils.js` | portfolio "template gallery" over `PORTFOLIO_TEMPLATES` (no studio) |
| Editing previously saved portfolios | legacy editor round-trips its own `content` blocks | **read-only**: `builder.tsx:347` `const editable = stored ? isWebCvDocument(stored) : false;`, and `:477` renders `"Built with the earlier page editor"`; save/preview buttons are gated on `editable` (`:490-533`). `isWebCvDocument()` (`lib/portfolio-document.ts:412-420`) returns false when `content` blocks exist — i.e. **every Puck/WebCV portfolio is now non-editable**. |
| Slug availability, publish, public view | `services/api/platform` | **present**: `/portfolios/slug-availability`, `/portfolios/public/{X}`, `/portfolios/{X}` |

Scale: legacy portfolio area = **88 files / 24,260 lines**; modern portfolio area = **6 files /
1,613 lines** (82 % of files, 93 % of lines gone). The supplied report's "82 files → 3" is
**directionally correct** (the modern portfolio *components+pages* folder is 6 files, 3 of which are
`components/portfolio/*.tsx`), and the "older portfolios cannot be edited" claim is **confirmed at
source level**.

### 4.4 Domain D — voice interview deleted outright

| Legacy | Lines | Modern |
|---|---:|---|
| `DashboardInterviews/LiveInterviewSession.jsx` | 1,691 | `components/interview/live-interview-panel.tsx` (509 lines, text only) |
| `DashboardInterviews/LiveVoiceEngine.js` (`speechSynthesis`, voice selection, SSML-ish pacing) | 233 | — |
| `DashboardInterviews/LiveAudioWaveform.jsx` (mic capture + canvas visualisation) | 254 | — |
| `hooks/useInterviewMedia.js` (`getUserMedia`, `MediaRecorder`) | 254 | — |
| **Total** | **2,432** | **0 speech/mic API references** (`grep -E "SpeechRecognition|speechSynthesis|getUserMedia|MediaRecorder|AudioContext"` over `frontend/src` → **no matches**) |

The backend does not need to change for voice to return: legacy voice ran **entirely in the browser**
(`window.speechSynthesis`, `SpeechRecognition`), while the backend stores `transcript`/`turns`
(`backend/services/liveInterviewSession.js:1099`). So this is a **pure frontend capability loss with
no backend prerequisite** — the cheapest high-impact restoration in the whole package, and the modern
session API (`/live-interview/sessions/{X}/turns`) already exists to receive recognised text.

### 4.5 Domain E — templates: count claim refuted, differentiation claim partly confirmed

* Legacy: **51** `cv*` directories (plus 6 `cover*`), each a hand-built component.
* Modern: `lib/template-catalog.ts` exports **104 `TEMPLATES` entries** (≥ the legacy 51; the category
  label even says "All Templates (100+)"), and `app/router.tsx` registers per-template export routes
  `Cv1…CvN` / `Cover1…Cover4`. **The allegation "51 → 8 templates" is REFUTED as a count claim.**
* However, those 104 entries collapse into **9 archetypes** (`modern-split` 26, `minimal-ats` 21,
  `executive-banner` 20, `tech-grid` 20, `compact-euro` 13, `cover-*` 4) rendered by **24 layout
  families** (`lib/template-layouts.ts:26`) with per-template tokens (colour, font, header style,
  skill variant, timeline style, density). So: **more templates, fewer structurally distinct
  layouts** — a *design-diversity* regression, not a template-count regression.

### 4.6 Domain E/D — small capabilities genuinely missing

| Capability | Legacy evidence | Modern |
|---|---|---|
| Profile image crop & zoom | `Dashboard/DashboardSettings/ImageCropModal.jsx`, `BuildResume/steps/components/PhotoUpload.jsx` | **0 matches for `crop`** under `frontend/src` |
| QR code generation | `DashboardSettings.jsx`, `services/mfaService.js`, `utils/totpHelper.js` | **0 matches for `qrcode`** (sharing exists via `lib/share-publication.ts`, QR does not) |
| Location autocomplete in job search | `JobsListings/LocationAutocomplete.jsx`, `CustomLocationAutocomplete.jsx`, `GoogleMapsProvider.jsx` | `components/ui/autocomplete-input.tsx` exists but its service `lib/autocomplete-service.ts` is used by **no** jobs page; `pages/jobs/portal.tsx:124` binds a plain `<input>` |
| Map-based discovery | `JobsListings/GoogleMapsProvider.jsx` | **0 map-provider references** (`google.maps|react-google-maps|leaflet|mapbox`) |

---

## 5. Allegation adjudication

Each allegation below was tested against the repository, not accepted from the report. Verdicts are
deliberately blunt: several of the supplied report's claims are **wrong**, and one of this audit's own
working hypotheses was wrong too (RA-30) and is recorded as such rather than quietly dropped.

| ID | Allegation as received | Verdict | Evidence |
|---|---|---|---|
| RA-01 | The running application is `frontend/`, not the root `src/` tree | **CONFIRMED** | All root npm scripts use `--prefix frontend`; `scripts/sync-dist.mjs` publishes `frontend/dist` |
| RA-02 | Root `src/` is dead code and can be deleted | **REFUTED** | 7 `backend/test/*.test.js` assert legacy source strings; `scripts/candidate-workspace-inventory.mjs:5` imports legacy `candidateNavigation.js`; it is the only implementation of the 30 `MISSING` capabilities |
| RA-03 | The modern frontend is a thin shell / mostly mock | **REFUTED** | 206 files, 68,812 lines, 100 routes, 161 distinct endpoints — more endpoint surface than legacy (153) |
| RA-04 | Portfolio builder collapsed from 82 files to 3 | **CONFIRMED (magnitude), CORRECTED (count)** | `src/components/PortfolioBuilder` = 82 files; modern portfolio surface = **6** (3 components + `builder/gallery/public-portfolio` pages). The “3” counts components only. 93 % file reduction either way |
| RA-05 | Puck drag-and-drop page editing was dropped | **CONFIRMED** | No `@puckeditor` import anywhere under `frontend/src`; legacy `LegacyPuckEditor.jsx` + dynamic import in `PortfolioBuilder.jsx` |
| RA-06 | Previously saved portfolios can no longer be edited | **CONFIRMED** | `pages/portfolio/builder.tsx:347` `editable = stored ? isWebCvDocument(stored) : false`; `:477` renders “Built with the earlier page editor”; save/preview gated `:490-533`; `isWebCvDocument()` rejects block content (`portfolio-document.ts:412`) |
| RA-07 | 71 modular portfolio blocks were removed | **CONFIRMED** | `PortfolioComponents/` 71 files; modern renders a fixed canonical section set |
| RA-08 | Voice interview was removed | **CONFIRMED** | 2,432 legacy lines (`LiveInterviewSession` 1,691, `LiveVoiceEngine` 233, `LiveAudioWaveform` 254, `useInterviewMedia` 254); **zero** speech/media API references in `frontend/src` |
| RA-09 | Command palette was removed | **CONFIRMED** | 1,527 legacy lines (`CubaCommandPalette` 787, `copilotActions` 265, `AdminCommandPalette` 239, `adminEntitySearch` 141, `candidateEntitySearch` 95); zero ⌘K/palette handlers in modern |
| RA-10 | The candidate HUD was removed | **CONFIRMED** | `CubaHud.jsx` (46 lines) has no modern counterpart |
| RA-11 | 51 CV templates were reduced to ~8 | **REFUTED** | `lib/template-catalog.ts` exports **104** entries and `router.tsx` registers per-template routes; modern has more templates than legacy |
| RA-12 | Template design diversity was reduced | **PARTIALLY CONFIRMED** | 104 entries collapse into **9 archetypes / 24 layout families** with token variation, vs 51 hand-built directories |
| RA-13 | Per-section ATS health was lost | **REFUTED** | `pages/dashboard/ats-score.tsx:311` maps `result.sections` (score/maxScore) and `:202-225` adds JD targeting; `lib/atsScore.js` is 53,831 bytes |
| RA-14 | Profile-photo cropping was removed | **CONFIRMED** | Zero `crop` matches in `frontend/src`; legacy `ImageCropModal.jsx` |
| RA-15 | QR-code generation was removed | **CONFIRMED** | Zero `qrcode` matches in modern; legacy MFA/TOTP helpers generated codes |
| RA-16 | Google Maps and location autocomplete were removed from job discovery | **CONFIRMED with nuance** | Zero map-provider references in modern; `jobs/portal.tsx:124` binds a plain `<input>` — yet `lib/autocomplete-service.ts` and `components/ui/autocomplete-input.tsx` still exist (used only by the resume builder), so the fix is wiring, not re-authoring |
| RA-17 | The admin audit-log viewer is missing or faked | **CONFIRMED** | `useAdminAuditLogs` has 0 consumers; `AdminSecurityTab` shows invented events/IPs/paths; `/admin/audit-logs` is real and permission-guarded |
| RA-18 | Admin security / operator / announcement panels are fabricated | **CONFIRMED** | 928-line tab, 0 api-client references, 4 seed arrays; `handleRevokeSessions` asserts “Next request will return 401” with no network call |
| RA-19 | Marketing-content administration was removed | **CONFIRMED — and worse than reported** | It is not absent, it is **fabricated**: 16 invented records including five real partner brand names, 0 API references, while `/phrases`, `/admin/reviews`, `/admin/trusted-by`, `/admin/pages` all exist |
| RA-20 | Tenants, coupons, refunds, invoices and webhooks have no admin UI | **CONFIRMED** | Zero admin call sites; `/admin/coupons`, `/admin/payments/refund`, `/invoices`, `/payment-orders`, `/platform/payment-webhooks` all implemented |
| RA-21 | SMTP/IMAP administration was removed | **PARTIALLY CONFIRMED** | `AdminEmailSmtpTab.tsx` exists and is wired; but `/email/admin/test-imap`, `/email/admin/circuit-breaker-status`, `/email/logs`, `/email/resend`, `/email/templates` are referenced by **no** frontend in either tree |
| RA-22 | Enterprise talent-cloud features are missing | **REFUTED** | 19 modern enterprise files vs 27 legacy (mostly infra); tab-for-tab parity, with archive/restore, suspend/reactivate and AI-provider admin as modern *additions* |
| RA-23 | Enterprise CSV/audit export was dropped | **REFUTED** | `EnterpriseUsersTab.tsx:287` and `EnterpriseAuditTab.tsx:85-90` both build and download CSV |
| RA-24 | Enterprise bulk member operations were dropped | **CONFIRMED** | Legacy `handleBulkAction` (partial-failure reporting, `:251-297`) has no modern equivalent; single-target delete only |
| RA-25 | Candidate/employer messaging was dropped | **REFUTED** | `pages/dashboard/messages.tsx` + 4 `components/messages/*` + `lib/messages.ts`; employer portal mounts a `messages` tab |
| RA-26 | Employer onboarding wizard was dropped | **CONFIRMED** | `EmployerOnboarding.jsx` legacy-only; no modern onboarding component |
| RA-27 | The notification centre was dropped | **REFUTED** | Replaced: bell in `cuba-app-shell.tsx` + `pages/dashboard/notifications.tsx` + `lib/notification-display.ts` |
| RA-28 | (found independently) Internationalisation was dropped | **CONFIRMED** | 16 locales (`de dk en es fr gk hi is it nl no pl pt ro ru se`), 1,011 distinct `t()` keys, 131 legacy consumers → **0** `i18next`/`useTranslation` references in modern |
| RA-29 | (found independently) Analytics, per-route SEO and offline shell were dropped | **CONFIRMED** | 0 gtag/GA4 init; `RouteSeo.jsx` (407 lines) → one static `<title>` in `index.html`; 0 service-worker registrations; 0 JSON-LD |
| RA-30 | (this audit's own hypothesis) DOCX export was dropped | **REFUTED — by our own follow-up** | Initial keyword pass suggested no modern DOCX path. Direct read shows `preview-modal.tsx:151` and `resumes.tsx` call `POST /api/export-docx`, implemented at `backend/index.js:5167` with an entitlement test at `adversarial-certification.test.js:338`. Recorded to document that the first negative reading was wrong |
| RA-31 | Employer dashboard analytics are server-derived | **UNRESOLVED** | `portal.tsx` header claims “real-time pipeline metrics”; no analytics endpoint call could be traced |
| RA-32 | Employer-side rejection reasons are still captured | **UNRESOLVED** | Rejection-reason capture is confirmed **admin-side** (`AdminModerationTab:588`); employer-side equivalent not located, not disproved |
| RA-33 | The portfolio gallery is still reachable | **UNRESOLVED** | `PortfolioGallery.jsx` (239 lines) exists; modern has `pages/portfolio/gallery.tsx`; whether the legacy gallery shipped a distinct capability was not established |
| RA-34 | OAuth provider breadth is unchanged | **UNRESOLVED** | Legacy 18 OAuth-referencing files vs 4 modern; provider-by-provider comparison not completed |

**Verdict tally (34 adjudications):** 18 CONFIRMED · 1 CONFIRMED-with-correction · 2 PARTIALLY CONFIRMED ·
9 REFUTED · 4 UNRESOLVED.

The single most consequential correction to the prior package: the supplied report's *scale* claims were
broadly right about **portfolio, voice, palette and admin operations**, and broadly **wrong** about
**templates, ATS, enterprise, messaging, notifications and the overall thinness of the modern app**.
An audit that accepted the report wholesale would have overstated the damage; one that defended the
prior `PARITY-MATRIX-V2` would have missed 30 genuinely missing capabilities.

---

## 6. Backend without UI (measured)

Produced by `developer-review/tools/backend-ui-coverage.cjs`; artifacts in
`Evidence/artifacts/backend-ui-coverage.json` and `Evidence/logs/backend-ui-coverage.log`.
Mount prefixes are resolved from `backend/index.js` (V5: all 385 unique `METHOD + path` pairs resolved; 0
guessed). A route counts as consumed only if the modern tree references the same normalised path.

| Measure | Count |
|---|---:|
| Route declarations in `backend/routes/*.js` + `backend/index.js` | 498 |
| Unique `METHOD + path` after de-duplication | **384** |
| Referenced by the modern frontend | 192 |
| **Implemented but unreachable from the modern UI** | **192 (50 %)** |
| Referenced by **neither** frontend (fully orphaned) | **58** |

That 50 % figure is the strongest single number in this re-audit: half the backend's operation surface
cannot be driven by the shipping application. It also explains why the fabricated admin tabs were
never noticed — nobody reached the real endpoints to compare against.

Largest unreachable clusters: `/admin/*` (65), `/platform/*` (33), `/auth/*` (12), `/email/*` (11),
`/enterprise/*` (9), `/public/*` (6), `/blog-data/*` (6).

### 6.1 Fully orphaned operations (no UI in either tree) — 58

Selected, by risk:

| Endpoint(s) | Why it matters |
|---|---|
| `POST /invoice`, `POST /invoice/generate`, `POST /email/send-invoice-email` | invoicing exists end-to-end on the server and cannot be triggered from either UI |
| `GET /platform/payment-webhooks`, `POST /platform/payment-webhooks/:id/replay` | payment reconciliation is invisible and unreplayable |
| `GET/PATCH /platform/tenants/:id`, `POST /platform/tenants/:id/decommission`, `POST /platform/tenants/garbage-collect` | platform-level tenant lifecycle has no operator surface (enterprise-side suspend does) |
| `GET /platform/security-events` | the security feed the fabricated tab pretends to show |
| `GET /email/logs`, `POST /email/resend`, `GET/POST /email/templates`, `POST /email/admin/test-imap`, `GET /email/admin/circuit-breaker-status` | deliverability, template authoring and IMAP diagnostics are all dark |
| `POST /paytm/*`, `POST /phonepe/*`, `POST /paypal/verify`, `POST /razorpay/verify-payment`, `POST /stripe-webhook` | five payment integrations with no modern client path |
| `GET /public/jobs/:id/og.png`, `GET /public/blog/:id/og.png`, `GET /public/featured-companies`, `GET /custom-pages.json`, `GET /trusted-by.json`, `GET /reviews` | public SEO/embedding surface that already exists server-side |
| `GET /v1/status`, `GET /readyz`, `GET /platform/version`, `GET /rtl-font-config` | operability endpoints |

Full list: `Evidence/artifacts/backend-ui-coverage.json` → `backendWithoutAnyUi`.

---

## 7. Verdict on the legacy→modern transition

**The modern frontend is a real, larger re-architecture with a serious, quantified capability debt.**
It is not a stub, and it did not ship the legacy product. In 109 capability verdicts:

| Classification | Count |
|---|---:|
| `FULL PARITY` | 25 |
| `REPLACED BY EQUIVALENT` | 6 |
| `PARTIAL PARITY` | 35 |
| `MISSING` | 30 |
| `MOCK / FABRICATED STATE` | 9 |
| `UNVERIFIED` | 4 |
| `STATIC STUB` / `LOCAL-ONLY PERSISTENCE` / `INTENTIONAL RETIREMENT` | 0 |

Legacy file attribution is **complete: 650/650 source files** map to at least one capability row
(`FEATURE-PARITY-MATRIX.md` §6). No legacy source file is unaccounted for.

### 7.1 Remediation order implied by the evidence

1. **Fabricated security & marketing admin (9 rows).** Highest severity: the product currently asserts
   security actions that did not happen and displays invented partner brands. Either wire the existing
   endpoints or remove the panels. Fixing this is cheap *because* the backend exists.
2. **Voice interview (2,432 legacy lines, 0 modern).** No backend prerequisite; the modern session and
   turn APIs already accept recognised text.
3. **i18n (16 locales, 1,011 keys).** Complete loss, and the only Domain-G finding with user-visible
   reach across every screen.
4. **Monetisation admin** — coupons, refunds, invoices, payment webhooks: four backend surfaces with no
   UI. The 58 fully orphaned endpoints cluster here.
5. **Legacy portfolio edit dead-end.** Users with existing portfolios cannot edit them; this is a
   data-access regression, not a missing feature.
6. **Job discovery wiring** — maps, location autocomplete, geo data, JSON-LD, OG images: mostly
   existing components and endpoints that were left disconnected.
7. **Lower severity:** image crop, QR, employer onboarding, bulk member actions, HUD, density,
   bullet-quality coaching, grace-period banner.

### 7.2 What would change this verdict

Evidence that a panel is *deliberately* test-mode, an ADR documenting a retirement, a feature flag that
gates the fabricated tabs off in production, or a migration path for legacy portfolio documents. None
was found in the repository. Absent that, `MISSING` and `MOCK / FABRICATED STATE` stand.

---

## 8. Method, reproducibility and limitations

**Reproduce:**
```bash
node developer-review/tools/legacy-modern-inventory.cjs   # 650/206 files, 153/161 endpoints
node developer-review/tools/parity-matrix.cjs             # 109 capabilities, regenerates FEATURE-PARITY-MATRIX.md
node developer-review/tools/backend-ui-coverage.cjs       # 384 backend ops, 192 unreachable
```

**What was executed for this re-audit:** three audit-only Node generators (inventory, parity matrix,
backend coverage) plus `scripts/verify-audit-package.sh` (61 PASS / 0 FAIL, log
`Evidence/logs/audit-package-verification.log`). **No application test suite was re-run in this pass** —
the re-audit is static evidence work; the executed test results (252 Playwright executions, 197 pass /
25 fail / 30 not-run) belong to the 2026-10-28 runtime pass and are cited from `TEST-EXECUTION-REPORT.md`,
not re-claimed here. No application source file was read-write touched: `git status --porcelain` outside
`developer-review/` is empty.

**Limitations, stated rather than hidden:**

- Classification is per capability as *implemented*, not a field-by-field diff. `FULL PARITY` means
  "no loss evidenced", never "identical".
- Endpoint extraction is static. Paths built by runtime string concatenation beyond `{X}` normalisation
  can be missed in either direction; the inventory's own first pass under-counted modern endpoints by
  7× before the `apiClient`/`baseURL` pattern was corrected, and that correction is why `161` is trusted
  rather than the initial `83`.
- "Backend without UI" counts a route as consumed on a prefix match, which biases *toward* consumed —
  i.e. the 192 figure is, if anything, a floor.
- No production system was contacted. No application source was modified. All counts are reproducible
  from a clean checkout of `415335b`.
