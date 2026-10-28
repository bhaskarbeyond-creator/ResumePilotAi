# Feature Parity Matrix

**Audit revision:** `cccd35a5dac6` · **Generated:** 2026-10-28 (generator clock, UTC) · **Generator:** `developer-review/tools/parity-matrix.cjs`
**Machine-checkable twin:** `Evidence/artifacts/feature-parity.json` (consumed by `scripts/verify-audit-package.sh`)
**Inventory basis:** `LEGACY-MODERN-FEATURE-INVENTORY.md` / `Evidence/artifacts/legacy-modern-inventory.json`

## 1. How to read this document

Each row is a **capability**, not a component: a user-visible job the product does. Rows are keyed `FP-<domain><nn>` and
are stable — later revisions must add rows, never renumber them. File and line counts are **derived by the generator**
from the measured inventory, so they cannot drift from the code. Classification uses the closed directive vocabulary:

| Classification | Meaning in this audit |
|---|---|
| `FULL PARITY` | The capability exists in the modern tree with equivalent depth, wired to a real backend, and persists. |
| `PARTIAL PARITY` | Exists but demonstrably narrower, or has a defect (swallowed errors, seeded fallbacks, missing sub-operation). |
| `MISSING` | No modern implementation found. |
| `STATIC STUB` | Renders, has no behaviour and no data path. |
| `MOCK / FABRICATED STATE` | Presents invented records or asserts an action that did not occur. |
| `LOCAL-ONLY PERSISTENCE` | Mutations are kept in component state / localStorage; server never sees them. |
| `INTENTIONAL RETIREMENT` | Removal is **evidenced** by an ADR, changelog, migration note or commit rationale. |
| `REPLACED BY EQUIVALENT` | Different implementation, same user-visible capability. |
| `UNVERIFIED` | Evidence gathered was insufficient to decide. Never silently promoted to a pass. |

`INTENTIONAL RETIREMENT` is applied **zero** times in this revision: no ADR, changelog, or commit rationale documents
any of the removals, so the directive's rule ("do not classify a feature as intentionally retired merely because the new
implementation omits it") is respected literally. Undocumented removal is still recorded as removal.

## 2. Totals

| Classification | Capabilities |
|---|---:|
| FULL PARITY | 19 |
| PARTIAL PARITY | 43 |
| MISSING | 32 |
| STATIC STUB | 0 |
| MOCK / FABRICATED STATE | 9 |
| LOCAL-ONLY PERSISTENCE | 0 |
| INTENTIONAL RETIREMENT | 0 |
| REPLACED BY EQUIVALENT | 6 |
| UNVERIFIED | 3 |
| **Total** | **112** |

Aggregate verdict: of 112 capabilities, **25 are at parity** 
(FULL + REPLACED BY EQUIVALENT), **43 partial**, **41 missing or fabricated**, and **3 UNVERIFIED**.

The four figures sum to 112; the UNVERIFIED row is reported separately rather than folded into either side, because "not established" is not a synonym for "present" or "absent".

## 3. Coverage by domain

| Domain | Capabilities | FULL | REPLACED | PARTIAL | MISSING | FABRICATED | STUB | LOCAL-ONLY | UNVERIFIED |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A — Super Admin / platform operations | 26 | 0 | 0 | 11 | 6 | 9 | 0 | 0 | 0 |
| B — Enterprise talent cloud | 11 | 4 | 0 | 6 | 1 | 0 | 0 | 0 | 0 |
| C — Portfolio / Puck / WebCV | 7 | 2 | 0 | 1 | 4 | 0 | 0 | 0 | 0 |
| D — Candidate experience, voice interview, HUD, palette | 15 | 1 | 1 | 6 | 7 | 0 | 0 | 0 | 0 |
| E — Resume builder, ATS, templates, share | 17 | 6 | 0 | 7 | 3 | 0 | 0 | 0 | 1 |
| F — Employer, pipelines, messaging, onboarding, job discovery | 11 | 3 | 0 | 5 | 2 | 0 | 0 | 0 | 1 |
| G — Remaining legacy components (shared infra & content) | 25 | 3 | 5 | 7 | 9 | 0 | 0 | 0 | 1 |

Per-domain legacy footprint (measured): see §5 of `LEGACY-MODERN-FEATURE-INVENTORY.md`.

## 4. Backend traceability of every non-parity row

The directive requires tracing each gap to the backend: does the endpoint exist, is it authorised, tenant-scoped,
invoked, schema-compatible, persisted, error-handled, tested? Columns below are those eight checks; `—` means the
capability has no backend surface by design (pure client feature).

| ID | Capability | Classification | BE exists | Authz | Tenant | UI invokes | Schema | Persists | Errors | Tests |
|---|---|---|---|---|---|---|---|---|---|---|
| FP-A01 | Platform KPI dashboard (users, resumes, applications, AI generations, storage) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-A02 | KPI fabricated fallback values shown when the stats endpoint returns nothing | MOCK / FABRICATED STATE | yes | yes | partial | yes | compatible | no | no | no |
| FP-A03 | Subsystem health catalogue (28 services, latency, remediation hints) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-A04 | Health fallback claims (invented latency, "99.8%" delivery, "100% Enforced" isolation) displayed when no telemetry arrives | MOCK / FABRICATED STATE | yes | yes | partial | yes | compatible | no | no | no |
| FP-A05 | Security event stream / audit viewer | MOCK / FABRICATED STATE | yes | yes | partial | no | compatible | no | n/a | no |
| FP-A06 | Operator roster + force-revoke sessions | MOCK / FABRICATED STATE | yes | yes | partial | no | compatible | no | no | no |
| FP-A07 | IP blocklist / deny rules | MOCK / FABRICATED STATE | partial | yes | partial | no | compatible | no | no | no |
| FP-A08 | Platform announcements publisher | MOCK / FABRICATED STATE | yes | yes | partial | no | compatible | no | no | no |
| FP-A09 | Marketing content: phrases, reviews, trusted-by logos, landing pages | MOCK / FABRICATED STATE | yes | yes | partial | no | compatible | no | no | no |
| FP-A10 | At-risk attention inbox / platform insights | MOCK / FABRICATED STATE | yes | yes | partial | no | compatible | no | no | no |
| FP-A11 | Employer application + job posting moderation | PARTIAL PARITY | yes | yes | partial | yes | compatible | no | no | partial |
| FP-A12 | Platform tenant registry (list tenants, quotas, suspend) | MISSING | yes | yes | partial | no | compatible | no | n/a | partial |
| FP-A13 | Company management (verification, documents, quotas) | MOCK / FABRICATED STATE | partial | yes | partial | partial | compatible | no | no | no |
| FP-A14 | Coupon / promo-code administration | MISSING | yes | yes | partial | no | compatible | n/a | n/a | partial |
| FP-A15 | Refunds, invoices, payment orders administration | MISSING | yes | yes | partial | no | compatible | n/a | n/a | partial |
| FP-A16 | SMTP/IMAP + transactional email template settings | PARTIAL PARITY | yes | yes | partial | partial | compatible | partial | partial | no |
| FP-A17 | User manager, User360 drawer, session revoke | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-A18 | Bulk user operations (multi-select, bulk role change, bulk removal) | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-A19 | Support / help-desk tickets | PARTIAL PARITY | yes | yes | partial | yes | compatible | partial | partial | partial |
| FP-A20 | Job queues, DLQ, outbox, cache, backups (operations console) | PARTIAL PARITY | yes | yes | partial | yes | compatible | unknown | no | yes |
| FP-A21 | Platform settings, feature flags, maintenance, encryption/backup status | PARTIAL PARITY | yes | yes | partial | partial | compatible | partial | partial | partial |
| FP-A22 | Dedicated audit-log browser with filters and export | MISSING | yes | yes | partial | no | compatible | n/a | n/a | yes |
| FP-A23 | Admin command palette + entity search | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-A24 | Public pricing, plan comparison and checkout | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | yes | partial |
| FP-A25 | AI provider / gateway administration (provider CRUD, key pool, quotas, discovery, playground, unified gateway) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | yes | yes |
| FP-A26 | Admin console shell and tab routing | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-B01 | Enterprise console shell + context switching | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | yes | yes |
| FP-B02 | Member directory, invitations, single-member removal, CSV export | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | yes | yes |
| FP-B03 | Bulk member actions with per-member partial-failure reporting | MISSING | partial | yes | partial | no | compatible | n/a | no | no |
| FP-B04 | Roles & permissions matrix | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-B09 | Enterprise resumes + PDF rendering | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-B10 | AI quota rings + enterprise AI controls | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | yes | partial |
| FP-B11 | Usage, email, security, support, settings tabs | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-C01 | Puck-based drag-and-drop portfolio page editor | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-C02 | 71 modular portfolio page blocks (About1-6, Experience1-2, Education1-2, Contact1-4, Awards1-2, …) | MISSING | no | — | partial | no | — | n/a | n/a | no |
| FP-C03 | WebCV Studio (layout ladder, template presets, template utils) | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-C04 | Editing portfolios created by the legacy editor | MISSING | yes | yes | partial | yes | compatible | yes | partial | no |
| FP-C06 | Portfolio template gallery with palettes | PARTIAL PARITY | n/a | — | — | n/a | compatible | n/a | n/a | no |
| FP-D01 | Live voice interview (TTS question delivery + pacing) | MISSING | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-D02 | Microphone capture + live audio waveform | MISSING | n/a | — | — | no | compatible | n/a | n/a | no |
| FP-D03 | Interview session UI (question flow, transcript, scoring) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-D04 | Candidate command palette (⌘K) with fuzzy entity search | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-D05 | Copilot assistant (mascot, prompt builder, action registry) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-D06 | Candidate HUD overlay | MISSING | n/a | — | — | no | compatible | n/a | n/a | no |
| FP-D07 | Notification centre (bell, unread poller, routing) | REPLACED BY EQUIVALENT | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-D08 | User-selectable UI density | MISSING | n/a | — | — | no | compatible | n/a | n/a | no |
| FP-D09 | Candidate dashboard home, next-steps onboarding, applied-jobs tracker | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-D10 | Guided "next steps" onboarding checklist | MISSING | n/a | — | — | no | compatible | n/a | n/a | no |
| FP-D12 | Dashboard-v2 element library (stats, activity, profile display, resumes/covers lists) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-D13 | Candidate shell, AI career briefing, top job matches, executive rail, progress charts | PARTIAL PARITY | yes | yes | partial | yes | compatible | partial | partial | partial |
| FP-D14 | Payment grace-period / dunning banner | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-D11 | Candidate⇄employer messaging | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-E01 | Guided multi-step resume builder (Form/Boards/Actions steps) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | yes | partial |
| FP-E03 | Structurally distinct template layouts (design diversity) | PARTIAL PARITY | n/a | — | — | n/a | compatible | n/a | n/a | partial |
| FP-E05 | Server-side ATS audit (authoritative score from backend) | UNVERIFIED | no | — | partial | no | — | no | n/a | no |
| FP-E06 | Profile photo crop / zoom | MISSING | yes | yes | partial | no | compatible | n/a | n/a | no |
| FP-E07 | QR code generation for shares / MFA enrolment | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-E16 | Export access guard (plan-gated export routes) | PARTIAL PARITY | yes | yes | partial | yes | compatible | no | yes | partial |
| FP-E11 | DOCX export with ZIP magic-byte validation | PARTIAL PARITY | yes | yes | partial | yes | compatible | no | yes | partial |
| FP-E12 | Server-rendered PDF export | PARTIAL PARITY | yes | yes | partial | no | compatible | yes | partial | yes |
| FP-E14 | Bullet-point quality/health cards and role health checks | MISSING | no | — | partial | no | — | n/a | n/a | no |
| FP-E15 | Free-tier watermark + export entitlement gating | PARTIAL PARITY | yes | yes | partial | partial | compatible | partial | partial | partial |
| FP-E10 | AI writing aids (grammar check, summary, import) | PARTIAL PARITY | yes | yes | partial | yes | compatible | no | yes | partial |
| FP-F01 | Employer portal shell with tabbed workspace | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-F03 | Employer candidate messaging / send-message dialog | PARTIAL PARITY | yes | yes | partial | partial | compatible | partial | partial | partial |
| FP-F04 | Employer onboarding wizard | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-F07 | Job discovery with map view and location autocomplete | MISSING | partial | yes | partial | partial | compatible | n/a | n/a | no |
| FP-F08 | Regional job hubs / landing pages | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | no |
| FP-F11 | Employer dashboard: companies management, job editing, application modals, rejection reasons | PARTIAL PARITY | yes | yes | partial | yes | compatible | partial | partial | partial |
| FP-F10 | Job listing browse/filter UI (beyond maps and autocomplete) | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-F09 | Employer dashboard analytics | UNVERIFIED | partial | yes | partial | partial | compatible | n/a | n/a | no |
| FP-G02 | Cuba design-system primitives (30 components) | REPLACED BY EQUIVALENT | n/a | — | — | n/a | compatible | n/a | n/a | partial |
| FP-G03 | Internationalisation (16 locales, ~1,011 translation keys) | MISSING | n/a | — | — | no | compatible | no | n/a | no |
| FP-G04 | Product analytics (GA4 / gtag) | MISSING | n/a | — | — | no | compatible | no | n/a | no |
| FP-G05 | Per-route SEO metadata (title, description, canonical, structured data) | MISSING | no | — | partial | no | — | no | n/a | no |
| FP-G06 | Service worker / offline shell | MISSING | n/a | — | — | no | compatible | no | n/a | no |
| FP-G07 | Toast / notification feedback primitives | PARTIAL PARITY | n/a | — | — | n/a | compatible | n/a | n/a | no |
| FP-G08 | Auth flows: OAuth sign-in, 2FA, forced password change | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-G09 | Blog authoring + public blog | MISSING | yes | yes | partial | no | compatible | no | no | partial |
| FP-G10 | CMS custom pages / landing page rendering | PARTIAL PARITY | yes | yes | partial | partial | compatible | partial | partial | no |
| FP-G11 | Marketing site: welcome, features, FAQ, about, contact, legal | PARTIAL PARITY | n/a | — | — | n/a | compatible | n/a | n/a | partial |
| FP-G12 | Privacy consent banner + cookie policy surface | MISSING | n/a | — | — | no | compatible | no | n/a | no |
| FP-G13 | Entitlements / plan-gating data model | PARTIAL PARITY | partial | yes | partial | partial | compatible | partial | partial | no |
| FP-G15 | Shared utility library (42 modules: formatting, validation, download, OAuth resolvers, print) | REPLACED BY EQUIVALENT | n/a | — | — | n/a | compatible | n/a | n/a | partial |
| FP-G16 | Typed API service layer (client, resumes, covers, jobs, portfolios, blog, platform, users, databaseAdmin) | REPLACED BY EQUIVALENT | yes | yes | partial | yes | compatible | yes | yes | yes |
| FP-G17 | Geo / location datasets, autocomplete directories, job-location helpers | MISSING | partial | yes | partial | no | compatible | n/a | n/a | no |
| FP-G18 | Structured data / JSON-LD for public pages | MISSING | no | — | partial | no | — | no | n/a | no |
| FP-G19 | TOTP / MFA secret provisioning helpers | PARTIAL PARITY | yes | yes | partial | yes | compatible | yes | partial | partial |
| FP-G22 | Data models, runtime conf and React context scaffolding | REPLACED BY EQUIVALENT | n/a | — | — | n/a | compatible | n/a | n/a | partial |
| FP-G23 | Cross-cutting hooks (unread pollers, AI token usage, AI engine status, service availability, dialogs) | PARTIAL PARITY | yes | yes | partial | partial | compatible | partial | partial | no |
| FP-G24 | In-app support surface and input validation modals | MISSING | no | — | partial | no | — | no | no | no |
| FP-G25 | App bootstrap, route focus management, global spinner | REPLACED BY EQUIVALENT | n/a | — | — | n/a | compatible | n/a | n/a | partial |
| FP-G14 | Misc legacy orphans (Front, initailisation, Analytics, variables.scss) | UNVERIFIED | no | — | partial | no | — | n/a | n/a | no |

`Authz` / `Tenant` are `partial` unless the row states otherwise: route-level `requirePermission` guards were observed
across `backend/routes/adminAudit.js`, `platform.js` and `adminCoupons`-style routers, and tenant scoping is enforced
in `enterprise` routers, but per-endpoint audit is out of scope for this matrix and is carried by `REQUIREMENT-REGISTER.md`.

## 5. Capability register


### A — Super Admin / platform operations

| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |
|---|---|---:|---:|---|---|
| `FP-A01` | Platform KPI dashboard (users, resumes, applications, AI generations, storage) | 1 / 508 | 2 / 491 | **PARTIAL PARITY** | AdminDashboardTab.tsx:37 usePlatformStats(); :41-48 KPI values |
| `FP-A02` | KPI fabricated fallback values shown when the stats endpoint returns nothing | 0 / 0 | 1 / 261 | **MOCK / FABRICATED STATE** | AdminDashboardTab.tsx:41-48 `stats?.totalUsers ?? '48,290'`, `?? '420,910'`, `?? '184.2 GB'` |
| `FP-A03` | Subsystem health catalogue (28 services, latency, remediation hints) | 3 / 882 | 1 / 910 | **PARTIAL PARITY** | AdminHealthTab.tsx:508 DEFAULT_28_SERVICES; :528-543 remote override |
| `FP-A04` | Health fallback claims (invented latency, "99.8%" delivery, "100% Enforced" isolation) displayed when no telemetry arrives | 0 / 0 | 1 / 910 | **MOCK / FABRICATED STATE** | AdminHealthTab.tsx:460-500 metrics {'Carrier Delivery':'99.8%'}, {'Active Tenants':12}, {'Isolation Invariants':'100% Enforced'} |
| `FP-A05` | Security event stream / audit viewer | 2 / 762 | 1 / 929 | **MOCK / FABRICATED STATE** | AdminSecurityTab.tsx 928 lines, 0 api-client references, INITIAL_EVENTS at :66-110 incl. fabricated requestPath :98 |
| `FP-A06` | Operator roster + force-revoke sessions | 1 / 770 | 1 / 929 | **MOCK / FABRICATED STATE** | handleRevokeSessions only setState + toast asserting "Next request will return 401" (~:204-213) |
| `FP-A07` | IP blocklist / deny rules | 1 / 363 | 1 / 929 | **MOCK / FABRICATED STATE** | handleBlockIp -> setState + toast; no endpoint found in backend/routes |
| `FP-A08` | Platform announcements publisher | 68 / 29,850 | 1 / 929 | **MOCK / FABRICATED STATE** | announcements state seeded in AdminSecurityTab; CRUD backend present in backend/routes/platform.js |
| `FP-A09` | Marketing content: phrases, reviews, trusted-by logos, landing pages | 4 / 1,127 | 1 / 457 | **MOCK / FABRICATED STATE** | AdminContentMarketingTab.tsx 456 lines / 0 API refs; INITIAL_PHRASES 5, INITIAL_REVIEWS 3, INITIAL_TRUSTED 5, INITIAL_PAGES 3 (:40-150) |
| `FP-A10` | At-risk attention inbox / platform insights | 1 / 131 | 1 / 170 | **MOCK / FABRICATED STATE** | AdminAttentionTab.tsx 169 lines, 0 api refs, DEFAULT_SIGNALS :31, refresh does not fetch |
| `FP-A11` | Employer application + job posting moderation | 2 / 1,186 | 1 / 675 | **PARTIAL PARITY** | AdminModerationTab.tsx:152,167,184 real POSTs but `.catch(() => {})`; list seeded from DEFAULT_APPLICATIONS/DEFAULT_JOBS :61-111 and never re-fetched |
| `FP-A12` | Platform tenant registry (list tenants, quotas, suspend) | 1 / 2,106 | 1 / 675 | **MISSING** | AdminModerationTab.tsx:389 renders companies/tenants sub-sections from DEFAULT_APPLICATIONS; no tenant list fetch |
| `FP-A13` | Company management (verification, documents, quotas) | 1 / 642 | 1 / 675 | **MOCK / FABRICATED STATE** | companies sub-section (:389) renders seeded application objects; no company entity endpoint used |
| `FP-A14` | Coupon / promo-code administration | 35 / 14,191 | 0 / 0 | **MISSING** | no admin coupon surface in frontend/src; only a feature-flag toggle (AdminSettingsTab.tsx:334) and a checkout promo field |
| `FP-A15` | Refunds, invoices, payment orders administration | 35 / 14,191 | 0 / 0 | **MISSING** | frontend/src contains only `payment_refunded: billing` in lib/notification-display.ts |
| `FP-A16` | SMTP/IMAP + transactional email template settings | 35 / 14,191 | 2 / 1,674 | **PARTIAL PARITY** | AdminEmailSmtpTab.tsx present; 2 api refs; legacy EmailSmtpSettings.jsx + template editor |
| `FP-A17` | User manager, User360 drawer, session revoke | 4 / 3,243 | 1 / 1,132 | **PARTIAL PARITY** | AdminUsersTab.tsx 1131 lines, 7 api refs, :280 revoke-sessions |
| `FP-A18` | Bulk user operations (multi-select, bulk role change, bulk removal) | 3 / 2,773 | 0 / 0 | **MISSING** | no selectedRows/bulk handler in frontend/src admin tabs; legacy EnterpriseUsersTab.jsx:251-297 has handleBulkAction with partial-failure reporting |
| `FP-A19` | Support / help-desk tickets | 68 / 29,850 | 1 / 381 | **PARTIAL PARITY** | AdminHelpDeskTab.tsx 380 lines, 3 api refs, 1 seed array |
| `FP-A20` | Job queues, DLQ, outbox, cache, backups (operations console) | 5 / 1,634 | 2 / 984 | **PARTIAL PARITY** | AdminQueuesTab.tsx:138/173 call /platform/queues and /platform/queues/retry (UI-REACHABLE). The V4-declared /admin/queues and /admin/queues/dlq/replay-all are NOT registered: the same tab reaches them only as .catch() fallbacks (AdminQueuesTab.tsx:138/173/186/204) and those branches 404. AdminOperationsTab.tsx:122/136 POST /admin/operations/backup and /admin/operations/cache-clear, neither registered; /admin/operations/feature-flags is UNREACHABLE. |
| `FP-A21` | Platform settings, feature flags, maintenance, encryption/backup status | 35 / 14,191 | 1 / 1,325 | **PARTIAL PARITY** | AdminSettingsTab.tsx 1324 lines / 8 api refs + feature-flag catalogue |
| `FP-A22` | Dedicated audit-log browser with filters and export | 1 / 399 | 0 / 0 | **MISSING** | hooks/use-api-hooks.ts useAdminAuditLogs has 0 consumers; AdminSecurityTab fabricates instead |
| `FP-A23` | Admin command palette + entity search | 2 / 382 | 0 / 0 | **MISSING** | AdminCommandPalette.jsx 239 lines + adminEntitySearch.js 141 lines; 0 modern matches for palette/⌘K handlers |
| `FP-A24` | Public pricing, plan comparison and checkout | 3 / 3,856 | 2 / 1,586 | **PARTIAL PARITY** | checkout-modal.tsx calls /paypal/create-order and /razorpay/create-order (UI-REACHABLE); the coupon field at checkout-modal.tsx:246 POSTs /billing/validate-coupon, which is NOT registered (the registered op is /coupons/validate). /billing/plans and /billing/checkout are NOT registered; the plan catalogue is client-side data. |
| `FP-A25` | AI provider / gateway administration (provider CRUD, key pool, quotas, discovery, playground, unified gateway) | 2 / 1,658 | 44 / 4,980 | **PARTIAL PARITY** | ai-settings hooks call /admin/ai/test-provider, /admin/ai/quota-stats and /admin/ai/reset-quota (UI-REACHABLE); /admin/ai/fetch-models is registered via app.all and is UI-REACHABLE (useDiscoveryPlayground.ts:60). /ai/providers is NOT registered; /admin/ai/entitlements, /admin/ai/quota-limits, /admin/ai/routing-telemetry and /admin/ai/reset-state are UNREACHABLE. |
| `FP-A26` | Admin console shell and tab routing | 2 / 1,542 | 1 / 230 | **PARTIAL PARITY** | console.tsx VALID_TABS (:50-66) = 15 tabs (dashboard, health, queues, operations, attention, users, support, moderation, blog, content, ai-settings, email, security, settings, modules); legacy src/components/admin/ holds 30 modules. Not one-to-one: several legacy modules fold into one modern tab, and some modern tabs aggregate. |

### B — Enterprise talent cloud

| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |
|---|---|---:|---:|---|---|
| `FP-B01` | Enterprise console shell + context switching | 8 / 1,898 | 2 / 675 | **PARTIAL PARITY** | console.tsx drives 14 tabs; switchers collapsed into a single org selector |
| `FP-B02` | Member directory, invitations, single-member removal, CSV export | 1 / 973 | 1 / 902 | **PARTIAL PARITY** | modern :259 deleteMembership, :287 CSV build; legacy :251-297 bulk handler |
| `FP-B03` | Bulk member actions with per-member partial-failure reporting | 1 / 973 | 0 / 0 | **MISSING** | legacy EnterpriseUsersTab.jsx:251-297 `Successfully applied bulk action to N member(s)` + per-failure error; modern has single-target delete only |
| `FP-B04` | Roles & permissions matrix | 1 / 741 | 1 / 686 | **PARTIAL PARITY** | ROLE_HIERARCHY present in both |
| `FP-B05` | Teams + archive/restore | 1 / 599 | 1 / 358 | **FULL PARITY** | archive/restore are modern-only endpoints |
| `FP-B06` | Workspaces + archive/restore | 1 / 561 | 1 / 520 | **FULL PARITY** | modern adds suspend/reactivate lifecycle |
| `FP-B07` | Tenant lifecycle (suspend / reactivate) from the enterprise platform tab | 1 / 324 | 1 / 230 | **FULL PARITY** | suspend/reactivate are modern-only |
| `FP-B08` | Enterprise audit trail with CSV export | 1 / 550 | 1 / 312 | **FULL PARITY** | EnterpriseAuditTab.tsx:85-90 CSV export |
| `FP-B09` | Enterprise resumes + PDF rendering | 2 / 1,723 | 2 / 878 | **PARTIAL PARITY** | 1:1 file correspondence |
| `FP-B10` | AI quota rings + enterprise AI controls | 3 / 530 | 2 / 738 | **PARTIAL PARITY** | /enterprise/usage/ai/events UI-REACHABLE (enterprise-api.ts:487); quota governance hooks call /admin/ai/quota-stats and /admin/ai/reset-quota (UI-REACHABLE). /enterprise/ai/generate-content and /enterprise/ai/generate-interview are registered but UNREACHABLE — no client call site exists. |
| `FP-B11` | Usage, email, security, support, settings tabs | 7 / 2,895 | 8 / 2,269 | **PARTIAL PARITY** | 5/5 tabs reimplemented; per-tab depth not individually verified (U-B01) |

### C — Portfolio / Puck / WebCV

| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |
|---|---|---:|---:|---|---|
| `FP-C01` | Puck-based drag-and-drop portfolio page editor | 2 / 1,789 | 0 / 0 | **MISSING** | no @puckeditor reference anywhere under frontend/src; package no longer in any built entry |
| `FP-C02` | 71 modular portfolio page blocks (About1-6, Experience1-2, Education1-2, Contact1-4, Awards1-2, …) | 72 / 18,016 | 0 / 0 | **MISSING** | 71 block components; modern renders a fixed canonical section set (lib/portfolio-document.ts) |
| `FP-C03` | WebCV Studio (layout ladder, template presets, template utils) | 6 / 2,325 | 0 / 0 | **MISSING** | WebCvStudio 856 lines + presets 683 + utils 427; modern offers a 6-entry PORTFOLIO_TEMPLATES gallery |
| `FP-C04` | Editing portfolios created by the legacy editor | 1 / 1,743 | 2 / 1,157 | **MISSING** | builder.tsx:347 `const editable = stored ? isWebCvDocument(stored) : false;`, :477 "Built with the earlier page editor", :490-533 save/preview gated; isWebCvDocument() portfolio-document.ts:412 rejects block content |
| `FP-C05` | Public portfolio rendering + slug availability + publish | 1 / 308 | 6 / 1,725 | **FULL PARITY** | public-portfolio.tsx sets document.title; canonical document model |
| `FP-C06` | Portfolio template gallery with palettes | 7 / 1,822 | 3 / 729 | **PARTIAL PARITY** | modern portfolio-view.tsx:33 PALETTES (modernMinimal, …); legacy template family library larger |
| `FP-C07` | Portfolio gallery / showcase | 1 / 239 | 2 / 355 | **FULL PARITY** | legacy routed at src/main.jsx:575 -> /portfolios; modern routed at frontend/src/app/router.tsx:99 -> /portfolios. Search over title/description/tags, template filter, result count, loading skeleton, error+retry, empty state all present; modern adds URL-persisted ?q=/?template= and honest error surfacing |

### D — Candidate experience, voice interview, HUD, palette

| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |
|---|---|---:|---:|---|---|
| `FP-D01` | Live voice interview (TTS question delivery + pacing) | 2 / 1,926 | 1 / 510 | **MISSING** | 0 matches for speechSynthesis|SpeechRecognition|getUserMedia|MediaRecorder|AudioContext anywhere in frontend/src |
| `FP-D02` | Microphone capture + live audio waveform | 2 / 510 | 0 / 0 | **MISSING** | LiveAudioWaveform.jsx 254 lines + useInterviewMedia.js 254 lines; modern 0 media APIs |
| `FP-D03` | Interview session UI (question flow, transcript, scoring) | 6 / 5,823 | 16 / 15,105 | **PARTIAL PARITY** | live-interview-panel.tsx 509 lines (text mode) |
| `FP-D04` | Candidate command palette (⌘K) with fuzzy entity search | 5 / 1,376 | 0 / 0 | **MISSING** | 1,527 legacy lines across palette + entity search + fuzzyRank; 0 modern ⌘K/palette handlers |
| `FP-D05` | Copilot assistant (mascot, prompt builder, action registry) | 3 / 545 | 1 / 571 | **PARTIAL PARITY** | mascot (72 lines) and copilotActions registry (265 lines) have no modern counterpart |
| `FP-D06` | Candidate HUD overlay | 1 / 47 | 0 / 0 | **MISSING** | CubaHud.jsx 46 lines; no modern HUD component |
| `FP-D07` | Notification centre (bell, unread poller, routing) | 4 / 1,143 | 4 / 1,913 | **REPLACED BY EQUIVALENT** | modern bell in cuba-app-shell + dedicated notifications page + category mapping |
| `FP-D08` | User-selectable UI density | 1 / 69 | 0 / 0 | **MISSING** | CubaDensityProvider.jsx 68 lines; modern "density" occurrences are all resume-layout tokens |
| `FP-D09` | Candidate dashboard home, next-steps onboarding, applied-jobs tracker | 16 / 7,098 | 7 / 2,626 | **PARTIAL PARITY** | 3 legacy areas map to 2 modern pages; onboarding checklist dropped (FP-D10) |
| `FP-D10` | Guided "next steps" onboarding checklist | 1 / 125 | 0 / 0 | **MISSING** | modern mentions onboarding once in overview.tsx; no checklist component |
| `FP-D12` | Dashboard-v2 element library (stats, activity, profile display, resumes/covers lists) | 28 / 3,390 | 18 / 16,414 | **PARTIAL PARITY** | 14 Dashboard2 element files + 9 Dashboard sub-panels consolidated into modern dashboard pages; dashboard search and portfolio list have no located twin |
| `FP-D13` | Candidate shell, AI career briefing, top job matches, executive rail, progress charts | 16 / 2,920 | 2 / 1,711 | **PARTIAL PARITY** | 14 legacy Candidate modules (CubaCandidateShell/Hero, AiCareerBriefing, CandidateCareerAssistant, TopJobMatches, ApplicationProgressChart) vs 1 modern ai-assistant page |
| `FP-D14` | Payment grace-period / dunning banner | 2 / 138 | 0 / 0 | **MISSING** | 9 legacy grace-period references; 0 genuine modern matches (remaining hits are autocomplete/admin strings) |
| `FP-D15` | Saved jobs / favourites | 1 / 402 | 4 / 635 | **FULL PARITY** | dedicated favourites page + lib + display mapper + saved-item component |
| `FP-D11` | Candidate⇄employer messaging | 3 / 867 | 6 / 1,068 | **PARTIAL PARITY** | conversation-list/thread/participant-avatar + query-keys; module gating (entitlement) not found |

### E — Resume builder, ATS, templates, share

| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |
|---|---|---:|---:|---|---|
| `FP-E01` | Guided multi-step resume builder (Form/Boards/Actions steps) | 61 / 25,243 | 8 / 10,001 | **PARTIAL PARITY** | modern single-page builder + 7 resume components vs 146 legacy step files |
| `FP-E02` | Template catalogue volume (51 legacy cv dirs) | 73 / 13,985 | 2 / 616 | **FULL PARITY** | V4 counted the TEMPLATES array with a bracket/string-aware scan: 100 entries, ids Cv1..Cv100, each carrying archetype/category/palette/font/skillVariant/timelineStyle/dividerStyle/density/thumbnail; 51 legacy cv* dirs under src/cv-templates; router registers per-template export routes |
| `FP-E03` | Structurally distinct template layouts (design diversity) | 73 / 13,985 | 2 / 2,299 | **PARTIAL PARITY** | verified: 100 catalogue entries carry only 5 distinct archetype values (modern-split, minimal-ats, executive-banner, compact-euro, tech-grid) and 6 distinct headerStyle values; differentiation is palette/font/skillVariant/timelineStyle/dividerStyle/density over a shared layout engine, plus smart-layout-families.tsx |
| `FP-E04` | ATS score with per-section breakdown and job-description targeting | 1 / 349 | 2 / 445 | **FULL PARITY** | lib/atsScore.js 53,831 bytes; ats-score.tsx:311 renders result.sections with score/maxScore; JD targeting :202-225 |
| `FP-E05` | Server-side ATS audit (authoritative score from backend) | 1 / 349 | 1 / 369 | **UNVERIFIED** | no ATS scoring route found in backend/routes; both trees compute in the browser |
| `FP-E06` | Profile photo crop / zoom | 20 / 10,124 | 0 / 0 | **MISSING** | 0 `crop` matches in frontend/src; ImageCropModal.jsx in legacy |
| `FP-E07` | QR code generation for shares / MFA enrolment | 5 / 7,408 | 0 / 0 | **MISSING** | 0 `qrcode` matches in frontend/src |
| `FP-E08` | Public share links / share modal | 36 / 16,941 | 2 / 477 | **FULL PARITY** | share-publication.ts:41 GET /resumes/{id}/publication, :52 POST /resumes/{id}/publish, :73 POST /resumes/{id}/unpublish — all three UI-REACHABLE. The V4-declared /share and /resumes/{X}/share are NOT registered. |
| `FP-E09` | Cover letters | 74 / 15,832 | 2 / 1,454 | **FULL PARITY** | cover-letters.ts:207/220/232/238 call GET/POST/DELETE /covers[/{id}] and :303 POST /generate-ai-cover-letter — all UI-REACHABLE. The V4-declared /cover-letters is NOT registered. |
| `FP-E16` | Export access guard (plan-gated export routes) | 3 / 179 | 2 / 479 | **PARTIAL PARITY** | The token-fragment guard is implemented client-side (require-export-access.tsx:32) and the export page redeems the token. /export-docx and /export-render-data are UI-REACHABLE. POST /export is registered (index.js:2420) but has NO caller — UNREACHABLE. No plan/entitlement middleware is applied: index.js:575 attaches only exportAccountLimiter to the four export paths. |
| `FP-E17` | Document rendering surface (page composer, template renderer, public resume) | 5 / 1,274 | 3 / 1,496 | **FULL PARITY** | cv-renderer.tsx + ResumePageComposer.tsx mirror the legacy composer |
| `FP-E11` | DOCX export with ZIP magic-byte validation | 1 / 123 | 2 / 2,147 | **PARTIAL PARITY** | preview-modal.tsx:168, resumes.tsx:497 and cv-renderer.tsx:218 POST /export-docx (UI-REACHABLE; backend/index.js:5167). /public-export-docx is registered but UNREACHABLE. The ZIP magic-byte check exists only in legacy src/utils/docxDownload.js:14 (DOCX_MAGIC [0x50,0x4b]); the modern path calls res.blob() at preview-modal.tsx:185 and saves it without any signature check. |
| `FP-E12` | Server-rendered PDF export | 3 / 372 | 2 / 2,147 | **PARTIAL PARITY** | modern handleDownloadPdf does `window.open('/export/<templateId>/<id>/en')` — the SPA print route (router.tsx:352); `/api/export` is never called |
| `FP-E13` | Smart resume layout engine (section partitioner, 5 layouts, themed rendering) | 23 / 3,082 | 4 / 3,510 | **FULL PARITY** | legacy engine/hybrid layouts CompactEuroLayout/ExecutiveBannerLayout/MinimalATSLayout/ModernSplitLayout/TechGridLayout map 1:1 onto the modern archetype names modern-split/minimal-ats/executive-banner/tech-grid/compact-euro |
| `FP-E14` | Bullet-point quality/health cards and role health checks | 2 / 1,471 | 0 / 0 | **MISSING** | bulletQuality referenced by 6 legacy files (WorkHistoryStep, EducationStep, RoleHealthCard, RoleAiCopilotModal); 0 modern references |
| `FP-E15` | Free-tier watermark + export entitlement gating | 2 / 210 | 2 / 736 | **PARTIAL PARITY** | resume-view.tsx:28 WatermarkConfig; pricing advertises "PDF Download with watermark"; client-side moduleFlags/entitlements.js has no modern twin (FP-G13) |
| `FP-E10` | AI writing aids (grammar check, summary, import) | 2 / 995 | 3 / 899 | **PARTIAL PARITY** | ai-content.ts calls /check-grammar and /parse-resume (UI-REACHABLE). The declared /ai/generate-summary is NOT registered and no summary endpoint exists (the only "summary" path is /admin/health-summary). |

### F — Employer, pipelines, messaging, onboarding, job discovery

| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |
|---|---|---:|---:|---|---|
| `FP-F01` | Employer portal shell with tabbed workspace | 12 / 2,100 | 1 / 1,169 | **PARTIAL PARITY** | portal.tsx 1,168 lines, 7 tabs |
| `FP-F02` | Applicant pipeline (kanban + list, stage transitions) | 12 / 2,100 | 2 / 2,024 | **FULL PARITY** | portal.tsx:66 KANBAN_STAGES, :114 kanban/list toggle, optimistic concurrency noted in header |
| `FP-F03` | Employer candidate messaging / send-message dialog | 2 / 142 | 1 / 1,169 | **PARTIAL PARITY** | portal.tsx declares a `messages` tab; candidate-side messaging is fully built |
| `FP-F04` | Employer onboarding wizard | 1 / 136 | 0 / 0 | **MISSING** | EmployerOnboarding.jsx in legacy; 0 employer onboarding components in frontend/src |
| `FP-F05` | Job creation / requisition editor | 12 / 2,100 | 1 / 747 | **FULL PARITY** | useJobs/useCreateJob/useUpdateJob/useDeleteJob call GET/POST/PATCH/DELETE /employer/jobs[/{X}] and each hook has live consumers — INDIRECTLY-REACHABLE. The V4-declared /jobs is ambiguous and resolves to four different resources. |
| `FP-F06` | Company profile + team seats | 12 / 2,100 | 2 / 1,007 | **FULL PARITY** | CompanyProfile.tsx calls GET/POST/PATCH/DELETE /employer/companies[/{id}] (UI-REACHABLE); enterprise team seats use /enterprise/teams and /enterprise/memberships (UI-REACHABLE); the registered /enterprise/teams/{id}/members has no caller. The V4-declared /employer/company (singular) is NOT registered. |
| `FP-F07` | Job discovery with map view and location autocomplete | 3 / 302 | 1 / 345 | **MISSING** | 0 map-provider references in frontend/src; jobs portal binds a plain <input> (:124); AutocompleteInput used only by resume-builder |
| `FP-F08` | Regional job hubs / landing pages | 4 / 901 | 1 / 413 | **PARTIAL PARITY** | regional-hub.tsx exists |
| `FP-F11` | Employer dashboard: companies management, job editing, application modals, rejection reasons | 7 / 3,394 | 7 / 4,031 | **PARTIAL PARITY** | CandidateReviewDrawer.tsx:84 rejectionFeedback state, :245-258 combines it into notes, PATCH /job-applications/:id/status validated at backend/index.js:1687 with transition map + expectedRevision CAS. V4 CORRECTION of the earlier note: rejection capture DOES exist employer-side. |
| `FP-F10` | Job listing browse/filter UI (beyond maps and autocomplete) | 21 / 7,818 | 2 / 830 | **PARTIAL PARITY** | 15 further legacy JobsListings files (filters, cards, saved searches) map onto one 1,000+ line modern portal page |
| `FP-F09` | Employer dashboard analytics | 13 / 2,111 | 1 / 1,169 | **UNVERIFIED** | portal.tsx header claims "Real-time pipeline metrics"; no analytics endpoint call verified |

### G — Remaining legacy components (shared infra & content)

| ID | Capability | Legacy (files / lines) | Modern (files / lines) | Classification | Evidence |
|---|---|---:|---:|---|---|
| `FP-G01` | Cuba application shell (nav, header, popovers, a11y) | 2 / 1,141 | 2 / 1,683 | **FULL PARITY** | 792 legacy lines -> 1,342 modern lines |
| `FP-G02` | Cuba design-system primitives (30 components) | 52 / 7,164 | 13 / 2,363 | **REPLACED BY EQUIVALENT** | 13 modern ui primitives (button, card, dialog, dropdown, input, select, textarea, …) replace ~30 Cuba components |
| `FP-G03` | Internationalisation (16 locales, ~1,011 translation keys) | 1 / 44 | 0 / 0 | **MISSING** | src/locales has 16 locale dirs (de, dk, en, es, fr, gk, hi, is, it, nl, no, pl, pt, ro, ru, se); 1,011 distinct t() keys; 0 i18next/useTranslation matches in frontend/src |
| `FP-G04` | Product analytics (GA4 / gtag) | 1 / 55 | 0 / 0 | **MISSING** | 0 gtag/analytics-init matches in frontend/src or frontend/index.html; GA4Provider referenced by 14 legacy files |
| `FP-G05` | Per-route SEO metadata (title, description, canonical, structured data) | 4 / 604 | 0 / 0 | **MISSING** | RouteSeo.jsx 407 lines; frontend/index.html carries one static <title>/description; only public-portfolio.tsx mutates document.title |
| `FP-G06` | Service worker / offline shell | 2 / 49 | 0 / 0 | **MISSING** | 0 serviceWorker registrations in frontend/src or frontend/vite.config.ts |
| `FP-G07` | Toast / notification feedback primitives | 1 / 132 | 1 / 300 | **PARTIAL PARITY** | no toast/sonner library in frontend/src; admin tabs use inline notice state |
| `FP-G08` | Auth flows: OAuth sign-in, 2FA, forced password change | 6 / 1,727 | 1 / 635 | **PARTIAL PARITY** | 11 modern 2FA matches vs 7 legacy; useOAuthSignIn.js + 18 OAuth-referencing legacy files vs 4 modern |
| `FP-G09` | Blog authoring + public blog | 7 / 3,915 | 3 / 1,088 | **MISSING** | Every blog operation in the register is UNREACHABLE (14 of 14). The modern pages call paths that do not exist: pages/blog/index.tsx:46 GET /blog/posts; pages/blog/editor.tsx:91/147/149 GET/PUT/POST /blog/posts[/{id}]; AdminBlogManagementTab.tsx:97 GET /blog/posts and :126 DELETE /blog/posts/{id}. The backend serves /blog-data, /blog-data/{id} and /admin/blog/posts — never /blog/posts. |
| `FP-G10` | CMS custom pages / landing page rendering | 17 / 3,985 | 2 / 720 | **PARTIAL PARITY** | public reader endpoint used by modern cms page; admin authoring is fabricated (FP-A09) |
| `FP-G11` | Marketing site: welcome, features, FAQ, about, contact, legal | 3 / 2,592 | 3 / 786 | **PARTIAL PARITY** | Welcome.jsx 1,504 lines + Features.jsx 666 lines vs consolidated landing/features pages |
| `FP-G12` | Privacy consent banner + cookie policy surface | 1 / 88 | 0 / 0 | **MISSING** | no consent-banner component in frontend/src (cookie policy page exists) |
| `FP-G13` | Entitlements / plan-gating data model | 2 / 142 | 0 / 0 | **PARTIAL PARITY** | 1 modern `entitlement` match vs 11 legacy files with client-side gating |
| `FP-G15` | Shared utility library (42 modules: formatting, validation, download, OAuth resolvers, print) | 43 / 9,669 | 36 / 7,630 | **REPLACED BY EQUIVALENT** | 37 modern lib modules absorb the surviving utilities; the ones with no modern twin are tracked individually (FP-E14 bulletQuality, FP-G04 ga4, FP-G05 seo, FP-G12 privacyConsent, FP-G18 geo) |
| `FP-G16` | Typed API service layer (client, resumes, covers, jobs, portfolios, blog, platform, users, databaseAdmin) | 23 / 5,686 | 4 / 1,482 | **REPLACED BY EQUIVALENT** | modern api-client normalises errors (normalizeError) and centralises baseURL /api; endpoint parity measured in the inventory (161 modern vs 153 legacy) |
| `FP-G17` | Geo / location datasets, autocomplete directories, job-location helpers | 3 / 2,099 | 0 / 0 | **MISSING** | 5 legacy geo/location modules; modern autocomplete-service.ts exists but is consumed only by resume-builder |
| `FP-G18` | Structured data / JSON-LD for public pages | 1 / 179 | 0 / 0 | **MISSING** | 0 matches for application/ld+json | jsonld | schema.org in frontend/src |
| `FP-G19` | TOTP / MFA secret provisioning helpers | 2 / 231 | 16 / 15,230 | **PARTIAL PARITY** | 7 modern totp/2FA matches; QR rendering absent (FP-E07) |
| `FP-G20` | Job application tracker | 2 / 1,355 | 7 / 1,548 | **FULL PARITY** | job-tracker.ts:208/214/224 call GET/POST/PATCH /jobs-data/tracker[/{id}] (UI-REACHABLE); job-application-modal.tsx calls GET/POST /jobs/{id}/applications (UI-REACHABLE). The V4-declared /jobs/applications is NOT registered. |
| `FP-G21` | AI interview coach / role-based question generation | 2 / 859 | 1 / 346 | **FULL PARITY** | interview-coach.ts:176 calls /generate-interview and the /live-interview/sessions family (UI-REACHABLE). The V4-declared /ai/generate-interview is a different (enterprise) operation and is UNREACHABLE. |
| `FP-G22` | Data models, runtime conf and React context scaffolding | 7 / 344 | 37 / 8,001 | **REPLACED BY EQUIVALENT** | legacy JS model factories replaced by TypeScript types in lib/*.types and app/ |
| `FP-G23` | Cross-cutting hooks (unread pollers, AI token usage, AI engine status, service availability, dialogs) | 11 / 1,431 | 2 / 637 | **PARTIAL PARITY** | useAiTokenUsage/useAiEngineStatus/useServiceAvailability have no located modern twin; useUnreadMessages became the notification page (FP-D07) |
| `FP-G24` | In-app support surface and input validation modals | 3 / 1,420 | 5 / 978 | **MISSING** | No ticket operation exists in the register: zero paths contain /support/tickets or /admin/support/tickets. AdminHelpDeskTab.tsx:128/157/188 and use-api-hooks.ts:588/599/612 call six non-existent paths (GET/POST /support/tickets, POST /support/tickets/{X}/messages, GET /admin/support/tickets, POST /admin/support/tickets/{X}/messages, PATCH /admin/support/tickets/{X}). |
| `FP-G25` | App bootstrap, route focus management, global spinner | 4 / 740 | 10 / 1,113 | **REPLACED BY EQUIVALENT** | modern entrypoint + loading primitive; route-level focus management not verified (U-G05) |
| `FP-G14` | Misc legacy orphans (Front, initailisation, Analytics, variables.scss) | 5 / 108 | 0 / 0 | **UNVERIFIED** | Analytics.jsx is 10 lines; Front/initailisation are scaffolding |

### Notes per capability

- **`FP-A01`** — Live data path exists. Defect isolated in FP-A02.
- **`FP-A02`** — A failed/empty response renders an invented, plausible dashboard with no error state. Not disclosed to the operator.
- **`FP-A03`** — Remote values override the seed when present — but see FP-A04.
- **`FP-A04`** — Severity: an unmonitored subsystem renders OPERATIONAL with fabricated numbers, including a security-isolation claim.
- **`FP-A05`** — Backend and an unused `useAdminAuditLogs` hook both exist. UI shows invented principals, IPs and API paths.
- **`FP-A06`** — A false assertion of a completed security action is shown to the operator. Highest-severity fabrication in Domain A.
- **`FP-A07`** — No backend support either: the capability was never implemented end-to-end, in either tree.
- **`FP-A09`** — Trusted-by seeds name real partner brands. Public reader endpoints exist and are unused by this tab.
- **`FP-A11`** — Writes are real; reads are fabricated and failures are silently swallowed. Operator cannot tell a successful moderation from a failed one.
- **`FP-A12`** — Enterprise-side tenant management exists (FP-B06); the platform-level registry UI does not.
- **`FP-A14`** — Backend CRUD exists; nothing in the modern UI can create or list a coupon.
- **`FP-A15`** — Monetisation-critical. Backend endpoints exist and are unreachable from the modern app.
- **`FP-A16`** — Transport settings present; template authoring depth not verified -> see U-items.
- **`FP-A17`** — Single-user operations wired. No bulk selection/actions (see FP-A18).
- **`FP-A19`** — Thread replies exist (modern-only endpoint). Seeded fallback list unverified for fetch-override.
- **`FP-A20`** — V5 correction of an over-claim. Queue listing and retry are wired; DLQ retry/purge, backup, cache-clear and the feature-flag console are not, and the two operations buttons fabricate success after swallowing the failure (DISC-026).
- **`FP-A21`** — Largest remaining modern admin tab; depth by sub-setting not individually verified.
- **`FP-A22`** — Backend is permissioned (audit.read) and tested; the only UI consumer was dropped.
- **`FP-A23`** — One modern heading literally reads "Quick Command Palette" (EnterpriseOverviewTab.tsx:405) with no palette behind it.
- **`FP-A24`** — V5 correction. Checkout initiation is genuinely wired; coupon validation is a 404 and plan entitlements are not server-authoritative.
- **`FP-A25`** — V5 correction: 46 modern files are real, but the declared /ai/providers does not exist and four governance endpoints have no caller. Modern still exceeds legacy in volume.
- **`FP-A26`** — Shell parity high; the loss is inside the tabs (fabricated panels, missing audit viewer), not in the shell. See FP-A05..FP-A14, FP-A22.
- **`FP-B02`** — Bulk/partial-failure path lost — tracked as FP-B03.
- **`FP-B05`** — Modern exceeds legacy.
- **`FP-B06`** — Modern exceeds legacy.
- **`FP-B08`** — Refutes the "enterprise exports were dropped" allegation.
- **`FP-B10`** — V5 correction: reporting/governance are wired; the two enterprise AI generation controls are route definitions with no caller.
- **`FP-C01`** — Removal is undocumented: no ADR, no changelog entry, no migration note in the repo. Classified MISSING, not INTENTIONAL RETIREMENT, because intent is unevidenced.
- **`FP-C02`** — Replaced by a constrained schema, which is a deliberate architectural choice for the *new* flow — but existing block content has no path into it (FP-C04).
- **`FP-C04`** — Read-only dead end for every pre-existing portfolio. This is the concrete user-visible loss from C01-C03.
- **`FP-C06`** — Visual diversity reduced; not a functional loss.
- **`FP-C07`** — V4 RECLASSIFIED from UNVERIFIED. The earlier note said "no route in main.jsx referenced it either" — that was wrong: main.jsx:575 routes it. Capability preserved; only the legacy static theme preview PNGs are replaced by palette rendering (see FP-C06).
- **`FP-D01`** — Browser-only in legacy, so no backend prerequisite. Cheapest high-value restoration in the package.
- **`FP-D02`** — Backend stores transcript turns only; audio was never persisted in either tree.
- **`FP-D05`** — Task-scoped copilots replaced a global assistant.
- **`FP-D06`** — Small surface (46 lines); low remediation cost.
- **`FP-D07`** — Refutes the "notification centre was dropped" reading; implementation differs, capability retained.
- **`FP-D08`** — Low severity: a11y/comfort preference, not workflow.
- **`FP-D14`** — Billing-adjacent: a lapsed user gets no in-app dunning notice in the modern app.
- **`FP-D11`** — Entitlement gating (MessagesModuleGate) has no modern equivalent -> message module access is no longer gated client-side.
- **`FP-E01`** — Step surface radically consolidated; per-step field parity not exhaustively verified (U-E01).
- **`FP-E02`** — REFUTES the "51 templates reduced to 8/24" allegation as stated. Earlier passes said 104 entries; the verified count is 100 — corrected here rather than carried forward. See FP-E03 for the real regression.
- **`FP-E03`** — 100 templates are 5 archetypes x token permutations. Honest count: more entries, fewer visually distinct layouts than 51 hand-built legacy directories. Earlier "9 archetypes / 24 families" figures were not reproducible and are withdrawn.
- **`FP-E04`** — REFUTES the "per-section ATS health dropped" allegation. Scoring is client-side in both trees — so "ATS score" is a local heuristic, not a server audit (scope note for FP-E05).
- **`FP-E05`** — Not a legacy→modern regression. Recorded so the score shown to users is not mistaken for a server-validated audit.
- **`FP-E07`** — Impacts 2FA enrolment UX: the modern card may show a secret without a scannable code.
- **`FP-E08`** — V5 endpoint correction only: the capability is genuinely wired; V4 cited two paths that do not exist while missing the three that do.
- **`FP-E09`** — V5 endpoint correction only. This is the class (i) artefact: the capability row listed a pluralised path with no mount, and the real resource is /covers.
- **`FP-E16`** — V5 correction: the V4 endpoint was the one route nobody calls, and the "plan-gated" part is a rate limiter, not a plan check.
- **`FP-E11`** — V5: export works, but the validation half of the capability was dropped, and V4 counted a dead endpoint as evidence.
- **`FP-E12`** — Legacy consumed the validated blob endpoint (magic-byte checked). Modern depends on the browser print dialog. Usable, but the server PDF path and its error handling are unused.
- **`FP-E13`** — This is the provenance of FP-E03: the 5 hand-built engine layouts became 24 tokenised layout families. Ported and expanded, not dropped.
- **`FP-E14`** — Client-side writing-quality coaching; no backend prerequisite.
- **`FP-E15`** — Watermark rendering survives; the client gating model that decided *whether* to watermark does not.
- **`FP-E10`** — V5 correction: two of three aids are wired; summary generation has no backend operation.
- **`FP-F02`** — Refutes "pipeline was dropped".
- **`FP-F03`** — Employer-side message composition depth not verified (U-F01).
- **`FP-F05`** — V5 endpoint correction: the /jobs row never identified which jobs resource was meant; the employer requisition editor uses /employer/jobs.
- **`FP-F06`** — V5 endpoint correction only: singular vs plural, plus team seats moved to the enterprise surface.
- **`FP-F07`** — `lib/autocomplete-service.ts` + `components/ui/autocomplete-input.tsx` exist but are unreachable from job search — salvageable components, no wiring.
- **`FP-F08`** — Depth of hub content generation not verified.
- **`FP-F11`** — PARTIAL because (a) the reason is free text folded into notes, not a structured rejectionReason; (b) MySQLRepository.saveApplication maps only 13 fixed columns and does not write employerNotes or revision, so feedback is dropped and the CAS counter is inert under MySQL (DISC-020); (c) no applicant-facing rendering in applied-jobs.tsx (DISC-019/DISC-020 chain).
- **`FP-F10`** — Filter dimension parity not diffed item-by-item (U-F02).
- **`FP-F09`** — Could not confirm whether the overview counters are server-derived.
- **`FP-G01`** — Modern exceeds legacy.
- **`FP-G02`** — Consolidation, not loss. Exceptions tracked individually (FP-D06 HUD, FP-D08 density, FP-D05 mascot).
- **`FP-G03`** — Largest unreported capability loss after voice. All modern UI strings are hard-coded English.
- **`FP-G04`** — Not named in the supplied report; found during Domain G sweep.
- **`FP-G05`** — Material for a public marketing + blog surface: every modern route shares one title/description.
- **`FP-G07`** — Feedback exists but is ad-hoc per tab; no global live-region was verified (a11y risk recorded as U-G01).
- **`FP-G08`** — 2FA send-sms is modern-only; OAuth provider breadth not verified (U-G02).
- **`FP-G09`** — V5 correction from FULL PARITY to MISSING. Both a UI and a backend exist, but the contract does not match, so every read and write 404s and the admin delete reports success anyway (DISC-025, DISC-026).
- **`FP-G11`** — Content parity not diffed page-by-page (U-G03).
- **`FP-G12`** — Compliance-adjacent: consent capture UI gone while a cookie policy route remains.
- **`FP-G13`** — Client-side gating removed; server-side enforcement not verified (U-G04).
- **`FP-G15`** — Bulk-equivalence claim is at module-layer level; individual utility parity is asserted only where a row exists.
- **`FP-G17`** — Reinforces FP-F07: the data and components for location search survive in isolation (lib/autocomplete-service.ts, components/ui/autocomplete-input.tsx) but nothing in job discovery uses them.
- **`FP-G18`** — Job-posting schema is what makes listings eligible for Google Jobs; its loss is commercially material for a job board.
- **`FP-G20`** — V5 endpoint correction only: applications are per-job, and the tracker has its own /jobs-data resource.
- **`FP-G21`** — V5 endpoint correction only: the enterprise AI variant was cited instead of the live coach endpoints.
- **`FP-G24`** — V5 correction from FULL PARITY to MISSING. The helpdesk UI is a shell over a backend surface that does not exist; the dashboard-side hooks have live consumers, so this is user-visible.
- **`FP-G14`** — Individually inspected during Domain G sweep; no capability judged lost, but not proven unused either.

## 6. Legacy file attribution (completeness check)

Legacy source files under `src/`: **650**. Attributed to at least one capability row: **650**.
Unattributed: **0**, of which **0** are non-style/markup source files.

Modern source files under `frontend/src/`: **206**. Attributed to at least one capability row: **206**.
Unattributed: **0**, of which **0** are source files.

## 7. What this matrix does *not* claim

- It does not claim 100 % parity anywhere. Rows marked `FULL PARITY` mean *equivalent depth was evidenced*, not that every
  legacy field, edge case or translation was diffed.
- It does not treat modern innovations as offsets. Modern-only capabilities are catalogued in §3 of
  `LEGACY-MODERN-FEATURE-INVENTORY.md` but do not reduce any legacy-loss classification.
- It does not score. There is no percentage figure, because weighting a fabricated security panel against a lost
  mascot would be arbitrary.
