# Client ↔ Backend Contract Register (Mandate 7)

**Revision:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` · **Generated:** 2026-10-29T07:30:48.848Z (generator clock, UTC) · **Generator:** `developer-review/tools/client-contract-audit.cjs`
**Machine-checkable twin:** `Evidence/artifacts/client-contract-audit.json`

## 1. Method (independent of the V5/V6 inventory)

The tool re-derives both sides from source:

1. **Backend** — every `app.<verb>(path)` and every `router.<verb>(path)` is parsed from `backend/**/*.js`,
   and router-file routes are joined to their mount prefix by resolving the `require()` that binds the
   router identifier in `backend/index.js`. This yields **405** registrations and is compared
   with the canonical register (393 operations) so any divergence is printed rather than hidden.
2. **Client** — every `get/post/patch/put/del/delete/fetch/axios.*/enterpriseRequest/request` call with a
   literal or template-literal URL is captured, with `${…}` segments normalised to `{X}` and query strings
   separated. Absolute URLs are classified `INTENTIONALLY_EXTERNAL`.
3. **Matching** — a call resolves only if the *number* of path segments matches and every segment is equal
   or dynamic on one side. Tail-only overlap is reported as a contract mismatch, never as a match.
4. **Failure semantics** — for each site the surrounding 17 lines are inspected for a swallowed catch and a
   success assertion.

## 2. Tally

| disposition | call sites |
|---|---:|
| `REGISTERED_AND_MATCHED` | 190 |
| `NO_REGISTERED_OPERATION` | 14 |
| `REGISTERED_WITH_CONTRACT_MISMATCH` | 8 |
| **total** | **212** |

- Distinct paths with **no** serving operation or a verb/shape mismatch: **15**
- Call sites in that set: **22**
- Call sites that swallow a failure and then assert success: **12**

## 3. Contract gaps (full list)

| # | caller | verb | effective path | disposition | nearest backend | failure handling | success after swallow |
|---:|---|---|---|---|---|---|---|
| 1 | `frontend/src/components/admin/AdminBlogManagementTab.tsx:97` | GET | `/blog/posts` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/blog/posts (`backend/index.js:6424`) | swallowed (no user-visible error) | no |
| 2 | `frontend/src/components/admin/AdminBlogManagementTab.tsx:126` | DELETE | `/blog/posts/{X}` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/admin/blog/posts/:postId (`backend/index.js:3388`) | swallowed (no user-visible error) | **yes** |
| 3 | `frontend/src/components/admin/AdminModerationTab.tsx:152` | POST | `/admin/employer-applications/{X}/verify` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | **yes** |
| 4 | `frontend/src/components/admin/AdminModerationTab.tsx:167` | POST | `/admin/employer-applications/{X}/verify` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | no |
| 5 | `frontend/src/components/admin/AdminModerationTab.tsx:184` | POST | `/admin/jobs/{X}/moderate` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | **yes** |
| 6 | `frontend/src/components/admin/AdminOperationsTab.tsx:122` | POST | `/admin/operations/backup` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | **yes** |
| 7 | `frontend/src/components/admin/AdminOperationsTab.tsx:136` | POST | `/admin/operations/cache-clear` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | **yes** |
| 8 | `frontend/src/components/admin/AdminQueuesTab.tsx:138` | GET | `/admin/queues` | `NO_REGISTERED_OPERATION` | — | caught and surfaced | no |
| 9 | `frontend/src/components/admin/AdminQueuesTab.tsx:173` | POST | `/admin/queues/{X}/retry` | `NO_REGISTERED_OPERATION` | — | caught and surfaced | no |
| 10 | `frontend/src/components/admin/AdminQueuesTab.tsx:186` | POST | `/admin/queues/dead-letter-queue/retry` | `NO_REGISTERED_OPERATION` | — | caught and surfaced | no |
| 11 | `frontend/src/components/admin/AdminQueuesTab.tsx:204` | POST | `/admin/queues/dead-letter-queue/purge` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | **yes** |
| 12 | `frontend/src/components/admin/AdminQueuesTab.tsx:262` | POST | `/admin/queues/dead-letter-queue/retry` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | no |
| 13 | `frontend/src/components/admin/AdminQueuesTab.tsx:285` | POST | `/admin/queues/dead-letter-queue/purge` | `NO_REGISTERED_OPERATION` | — | swallowed (no user-visible error) | **yes** |
| 14 | `frontend/src/components/admin/AdminUsersTab.tsx:206` | POST | `/admin/users/{X}/status` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/job-applications/:applicationId/status (`backend/index.js:1687`) | swallowed (no user-visible error) | **yes** |
| 15 | `frontend/src/components/employer/CandidateReviewDrawer.tsx:159` | POST | `/notify/email` | `NO_REGISTERED_OPERATION` | — | caught and surfaced | no |
| 16 | `frontend/src/lib/enterprise-api.ts:528` | GET | `/api/platform/status` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/platform/status (`backend/routes/adminPlatformOperations.js:533`) | not handled at the call site | no |
| 17 | `frontend/src/pages/billing/checkout-modal.tsx:246` | POST | `/api/billing/validate-coupon` | `NO_REGISTERED_OPERATION` | — | caught and surfaced | no |
| 18 | `frontend/src/pages/blog/editor.tsx:91` | GET | `/blog/posts/{X}` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/admin/blog/posts/:postId (`backend/index.js:3388`) | caught and surfaced | no |
| 19 | `frontend/src/pages/blog/editor.tsx:147` | PUT | `/blog/posts/{X}` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/admin/blog/posts/:postId (`backend/index.js:3388`) | caught and surfaced | no |
| 20 | `frontend/src/pages/blog/editor.tsx:149` | POST | `/blog/posts` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/blog/posts (`backend/index.js:6424`) | caught and surfaced | no |
| 21 | `frontend/src/pages/blog/index.tsx:46` | GET | `/blog/posts` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/blog/posts (`backend/index.js:6424`) | caught and surfaced | no |
| 22 | `frontend/src/pages/jobs/portal.tsx:74` | GET | `/jobs` | `NO_REGISTERED_OPERATION` | — | caught and surfaced | no |

## 4. Gap adjudications (hand-read at this revision)

Machine-readable twin: `Evidence/adjudications-m7.json` → `contractGaps`. Each entry separates a **wrong URL**
(the capability exists under another contract, so the client is broken and the backend is not) from a
**missing backend capability** (nothing in `backend/` implements it). That distinction decides whether the fix
is a client retarget or a feature build, and it is the distinction DISC-025 did not make.

Adjudicated: **15 of 15** distinct gap paths, plus **3** paths previously reported as gaps and closed as register-repair artefacts (they are served; see DISC-041).

| path | kind | verb | equivalent operation | user-visible behaviour | false success | severity |
|---|---|---|---|---|---|---|
| `/admin/employer-applications/{X}/verify` | `WRONG_URL_AND_VERB` | POST | PATCH /api/admin/employer-applications/:uid with {status:'approved'\|'rejected', expectedStatus, reason} | `.catch(() => {})` then local status flip and toast 'approved & verified badge assigned' / 'rejected. Reason logged to security audit ledger.' Neither happens; no request ever succeeds. | **yes** | P1 |
| `/admin/jobs/{X}/moderate` | `WRONG_URL_AND_VERB` | POST | PATCH /api/admin/jobs/:jobId with exactly one of {status}\|{isFeatured} | `.catch(() => {})` then local status flip to 'flagged' and toast 'status updated to SPAM / FLAGGED'. | **yes** | P1 |
| `/admin/operations/backup` | `MISSING_BACKEND_CAPABILITY` | POST | — **none** | `.catch(() => {})` then lastBackup='Just now (Verified OK)' and 'MariaDB hot backup snapshot completed successfully.' | **yes** | P1 |
| `/admin/operations/cache-clear` | `MISSING_BACKEND_CAPABILITY` | POST | — **none** | `.catch(() => {})` then 'Application route and model caches purged across nodes.' | **yes** | P1 |
| `/admin/queues` | `WRONG_URL_FALLBACK_ONLY` | GET | GET /api/platform/queues | none visible while the primary call succeeds | no | P3 |
| `/admin/queues/dead-letter-queue/purge` | `MISSING_BACKEND_CAPABILITY` | POST | POST /api/platform/queues/purge is registered but answers 410 CLIENT_PURGE_RETIRED-style refusal (routes/platform.js:543); individual replay is the sanctioned path. | `.catch(() => {})` then removes the job from state and reports 'purged from outbox records' | **yes** | P2 |
| `/admin/queues/dead-letter-queue/retry` | `WRONG_URL_FALLBACK_ONLY` | POST | POST /api/platform/queues/retry | primary call first; fallback only on failure. If both fail the function still shows 'successfully re-dispatched' and rewrites the row to QUEUED. | **yes** | P2 |
| `/admin/queues/{X}/retry` | `WRONG_URL_FALLBACK_ONLY` | POST | POST /api/platform/queues/retry {jobId\|queue} | primary call first; fallback only on failure | no | P3 |
| `/admin/support/tickets` | `RESOLVED_BY_REGISTER_REPAIR` | GET|PATCH|POST | GET/PATCH/POST /api/admin/support/tickets* (routes/support.js:71/:81/:95/:110 at /api/admin/support) | works, with one residue: the loader keeps its fixtures when the real list is empty (DISC-048) | no | P3 |
| `/admin/users/{X}/status` | `WRONG_URL_AND_VERB` | POST | PATCH /api/admin/users/:uid with {suspended: boolean} (permission users.suspend, identity domain) | `.catch(() => {})` then setUsers(status=SUSPENDED/ACTIVE) and toast. Account is not suspended; an administrator is told it is. | **yes** | P1 |
| `/api/billing/validate-coupon` | `WRONG_URL` | POST | POST /api/coupons/validate | axios().catch(() => null) then a hardcoded list (SAVE20 20 %, WELCOME50 50 %, PROMO10 10 %, LAUNCH100 100 %) is applied locally. The server re-validates couponCode at order creation (paymentActivation.applyServerCoupon:71-101), so an invented code is rejected with 400 INVALID_COUPON and checkout fails — the displayed discount is never honoured, but no discount is granted either. | no | P2 |
| `/api/platform/status` | `WRONG_URL` | GET | GET /api/admin/platform/status | enterpriseRequest rejects; caller must surface it (not swallowed at the call site) | no | P2 |
| `/blog/posts` | `WRONG_URL` | GET | GET /api/admin/blog/posts (admin) and GET /api/blog-data (public) | admin table keeps its fixture rows; public blog index renders empty | no | P1 |
| `/blog/posts/{X}` | `WRONG_URL` | GET|PUT | GET /api/blog-data/:id or /api/blog-data/slug/:slug; update via PATCH /api/admin/blog/posts/:postId or POST /api/blog-data/:id | editor cannot load an existing post; save path reports failure or silently no-ops | **yes** | P1 |
| `/jobs` | `WRONG_URL` | GET | GET /api/jobs-data | the public job board's only data call fails; the page renders its error state instead of listings | no | P1 |
| `/notify/email` | `MISSING_BACKEND_CAPABILITY` | POST | — **none** | swallowed twice: `.catch(() => { /* Fallback: log notification to application record */ })` (the comment describes a fallback that does not exist) and then the outer `catch` sets messageSuccess(true) as well. The recruiter sees 'Message Dispatched!' for a request that 404s. | **yes** | P1 |
| `/support/tickets` | `RESOLVED_BY_REGISTER_REPAIR` | GET|POST | POST /api/support/tickets (routes/support.js:15), GET /api/support/tickets (:30) | works | no | n/a |
| `/support/tickets/{X}` | `RESOLVED_BY_REGISTER_REPAIR` | GET|POST | GET /api/support/tickets/:id (:40), POST /api/support/tickets/:id/messages (:54) | works | no | n/a |

### `/admin/employer-applications/{X}/verify` — WRONG_URL_AND_VERB

- **Backend evidence:** backend/index.js:6440-6475 — optimistic concurrency (409 ADMIN_TARGET_CHANGED), self-review block, Firebase claims + token revocation, audit action EMPLOYER_APPLICATION_REVIEWED.
- **Payload mismatch:** client sends {decision:'APPROVED'}; the real API accepts {status:'approved'}
- **Call sites:** `AdminModerationTab.tsx:152`, `AdminModerationTab.tsx:167`

### `/admin/jobs/{X}/moderate` — WRONG_URL_AND_VERB

- **Backend evidence:** backend/index.js:6886-6908 — status allowlist active|pending|inactive|archived, featured toggle, moderateJob with expectedStatus/expectedFeatured.
- **Payload mismatch:** client sends {isSpam, status:'flagged'}; 'flagged' is not an allowed status
- **Call sites:** `AdminModerationTab.tsx:184`

### `/admin/operations/backup` — MISSING_BACKEND_CAPABILITY

- **Backend evidence:** No route anywhere in backend/ creates a backup. The only backup surface is GET /api/platform/backup-status (routes/platform.js:876), which reads status, not creates snapshots.
- **Call sites:** `AdminOperationsTab.tsx:122`

### `/admin/operations/cache-clear` — MISSING_BACKEND_CAPABILITY

- **Backend evidence:** No cache-invalidation route exists in backend/ (grep for cache/purge routes returns nothing).
- **Call sites:** `AdminOperationsTab.tsx:136`

### `/admin/queues` — WRONG_URL_FALLBACK_ONLY

- **Backend evidence:** routes/platform.js:465. The client calls the correct path first and only falls back to /admin/queues when it rejects, so this site is dead code on the failure path, not the primary read.
- **Call sites:** `AdminQueuesTab.tsx:138`

### `/admin/queues/dead-letter-queue/purge` — MISSING_BACKEND_CAPABILITY

- **Backend evidence:** routes/platform.js:543 returns 410; no purge operation exists.
- **Call sites:** `AdminQueuesTab.tsx:204`, `AdminQueuesTab.tsx:285`

### `/admin/queues/dead-letter-queue/retry` — WRONG_URL_FALLBACK_ONLY

- **Backend evidence:** routes/platform.js:504; bulk dead-letter replay is deliberately forbidden (routes/databaseAdmin.js:157 returns 400 BULK_REPLAY_FORBIDDEN).
- **Call sites:** `AdminQueuesTab.tsx:186`, `AdminQueuesTab.tsx:262`

### `/admin/queues/{X}/retry` — WRONG_URL_FALLBACK_ONLY

- **Backend evidence:** routes/platform.js:504, requireRecentAdminAuthentication.
- **Call sites:** `AdminQueuesTab.tsx:173`

### `/admin/support/tickets` — RESOLVED_BY_REGISTER_REPAIR

- **Backend evidence:** Same cause as above.
- **Call sites:** `AdminHelpDeskTab.tsx:128`, `AdminHelpDeskTab.tsx:157`, `AdminHelpDeskTab.tsx:188`

### `/admin/users/{X}/status` — WRONG_URL_AND_VERB

- **Backend evidence:** backend/routes/adminUsers.js:673-760 — suspended branch with permission gate, expectedSuspended concurrency, identity/profile domain separation.
- **Call sites:** `AdminUsersTab.tsx:206`

### `/api/billing/validate-coupon` — WRONG_URL

- **Backend evidence:** backend/index.js:4597 — full validation (format, existence, active, expiry, max uses, per-user redemption).
- **Not inflated:** client-side promo constants are not exploitable for a discount because the server recomputes the amount; they are a pricing-integrity/UX defect only. Stated explicitly so the finding is not inflated.
- **Call sites:** `checkout-modal.tsx:246`

### `/api/platform/status` — WRONG_URL

- **Backend evidence:** routes/adminPlatformOperations.js:533, mounted at /api/admin (index.js:6927). No /api/platform/status exists.
- **Call sites:** `enterprise-api.ts:528`

### `/blog/posts` — WRONG_URL

- **Backend evidence:** backend/index.js:6424; routes/blogData.js:35 mounted at /api/blog-data (index.js:517).
- **Also:** POST /blog/posts from pages/blog/editor.tsx:149 — no POST /api/admin/blog/posts exists at all; creation is an upsert through POST /api/blog-data/:id (routes/blogData.js:96) where the client must supply the id. New-article save therefore cannot succeed under either contract.
- **Call sites:** `AdminBlogManagementTab.tsx:97`, `pages/blog/index.tsx:46`

### `/blog/posts/{X}` — WRONG_URL

- **Backend evidence:** routes/blogData.js:85/:96; backend/index.js:3388.
- **Also:** DELETE /blog/posts/{X} from AdminBlogManagementTab.tsx:126 — the equivalent operation exists (DELETE /api/admin/blog/posts/:postId at backend/index.js:3408; DELETE /api/blog-data/:id at routes/blogData.js:106), but the client path is dead and the failure is swallowed: `.catch(() => {})`, row removed from local state, 'Article … deleted successfully.' The article stays published. falseSuccess=true for that site; severity P1.
- **Call sites:** `pages/blog/editor.tsx:91`, `pages/blog/editor.tsx:147`

### `/jobs` — WRONG_URL

- **Backend evidence:** routes/jobsData.js:159 — public listing with query filters, publicOnly scoping, isPubliclyVisibleJob filter; mounted at /api/jobs-data (index.js:515).
- **Call sites:** `pages/jobs/portal.tsx:74`

### `/notify/email` — MISSING_BACKEND_CAPABILITY

- **Backend evidence:** No route matches. The 11 client notification dispatches are retired to 410 (index.js:419-424, :7203) and /api/notify/email is not among them, so it falls through to the zero-trust policy and never reaches a handler. The email service itself (services/emailNotifier.js, imported at index.js:14) has zero call sites in the whole backend — orphaned, not merely unscanned.
- **Call sites:** `CandidateReviewDrawer.tsx:159`

### `/support/tickets` — RESOLVED_BY_REGISTER_REPAIR

- **Backend evidence:** Registered all along; absent from the V5 register because of the receiver defect (DISC-041).
- **Call sites:** `use-api-hooks.ts:588`, `use-api-hooks.ts:599`

### `/support/tickets/{X}` — RESOLVED_BY_REGISTER_REPAIR

- **Backend evidence:** Same cause as above.
- **Call sites:** `use-api-hooks.ts:612`

## 5. Every call site

| caller | verb | path | disposition | backend | notes |
|---|---|---|---|---|---|
| `frontend/src/components/admin/AdminBlogManagementTab.tsx:97` | GET | `/blog/posts` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/blog/posts | same tail "blog/posts" exists at GET /api/admin/blog/posts |
| `frontend/src/components/admin/AdminBlogManagementTab.tsx:126` | DELETE | `/blog/posts/{X}` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/admin/blog/posts/:postId | same tail "posts/{X}" exists at PATCH /api/admin/blog/posts/:postId |
| `frontend/src/components/admin/AdminEmailSmtpTab.tsx:75` | GET | `/email/admin/settings` | `REGISTERED_AND_MATCHED` | GET /api/email/admin/settings |  |
| `frontend/src/components/admin/AdminEmailSmtpTab.tsx:76` | GET | `/email/admin/deliverability` | `REGISTERED_AND_MATCHED` | GET /api/email/admin/deliverability |  |
| `frontend/src/components/admin/AdminEmailSmtpTab.tsx:96` | POST | `/email/admin/test-connection` | `REGISTERED_AND_MATCHED` | POST /api/email/admin/test-connection |  |
| `frontend/src/components/admin/AdminEmailSmtpTab.tsx:124` | POST | `/email/admin/save-smtp` | `REGISTERED_AND_MATCHED` | POST /api/email/admin/save-smtp |  |
| `frontend/src/components/admin/AdminHealthTab.tsx:559` | POST | `/platform/operational-status/refresh` | `REGISTERED_AND_MATCHED` | POST /api/platform/operational-status/refresh |  |
| `frontend/src/components/admin/AdminHealthTab.tsx:568` | POST | `/platform/operational-status/{X}/test` | `REGISTERED_AND_MATCHED` | POST /api/platform/operational-status/:serviceId/test |  |
| `frontend/src/components/admin/AdminHelpDeskTab.tsx:128` | GET | `/admin/support/tickets` | `REGISTERED_AND_MATCHED` | GET /api/admin/support/tickets |  |
| `frontend/src/components/admin/AdminHelpDeskTab.tsx:157` | POST | `/admin/support/tickets/{X}/messages` | `REGISTERED_AND_MATCHED` | POST /api/admin/support/tickets/:ticketId/messages |  |
| `frontend/src/components/admin/AdminHelpDeskTab.tsx:188` | PATCH | `/admin/support/tickets/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/admin/support/tickets/:ticketId |  |
| `frontend/src/components/admin/AdminModerationTab.tsx:152` | POST | `/admin/employer-applications/{X}/verify` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminModerationTab.tsx:167` | POST | `/admin/employer-applications/{X}/verify` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminModerationTab.tsx:184` | POST | `/admin/jobs/{X}/moderate` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminOperationsTab.tsx:57` | GET | `/admin/health-summary` | `REGISTERED_AND_MATCHED` | GET /api/admin/health-summary |  |
| `frontend/src/components/admin/AdminOperationsTab.tsx:88` | POST | `/admin/system-health-settings` | `REGISTERED_AND_MATCHED` | POST /api/admin/system-health-settings |  |
| `frontend/src/components/admin/AdminOperationsTab.tsx:122` | POST | `/admin/operations/backup` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminOperationsTab.tsx:136` | POST | `/admin/operations/cache-clear` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminQueuesTab.tsx:138` | GET | `/platform/queues` | `REGISTERED_AND_MATCHED` | GET /api/platform/queues |  |
| `frontend/src/components/admin/AdminQueuesTab.tsx:138` | GET | `/admin/queues` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminQueuesTab.tsx:173` | POST | `/platform/queues/retry` | `REGISTERED_AND_MATCHED` | POST /api/platform/queues/retry |  |
| `frontend/src/components/admin/AdminQueuesTab.tsx:173` | POST | `/admin/queues/{X}/retry` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminQueuesTab.tsx:185` | POST | `/platform/queues/retry` | `REGISTERED_AND_MATCHED` | POST /api/platform/queues/retry |  |
| `frontend/src/components/admin/AdminQueuesTab.tsx:186` | POST | `/admin/queues/dead-letter-queue/retry` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminQueuesTab.tsx:204` | POST | `/admin/queues/dead-letter-queue/purge` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminQueuesTab.tsx:262` | POST | `/admin/queues/dead-letter-queue/retry` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminQueuesTab.tsx:285` | POST | `/admin/queues/dead-letter-queue/purge` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/admin/AdminSettingsTab.tsx:604` | GET | `/api/admin/payment-settings` | `REGISTERED_AND_MATCHED` | GET /api/admin/payment-settings |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:626` | POST | `/api/admin/payment/test-provider` | `REGISTERED_AND_MATCHED` | POST /api/admin/payment/test-provider |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:661` | POST | `/api/admin/payment-settings` | `REGISTERED_AND_MATCHED` | POST /api/admin/payment-settings |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:864` | GET | `/api/admin/settings/branding` | `REGISTERED_AND_MATCHED` | GET /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:880` | POST | `/api/admin/settings/branding` | `REGISTERED_AND_MATCHED` | POST /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:883` | POST | `/api/admin/settings/geoSeo` | `REGISTERED_AND_MATCHED` | POST /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:886` | POST | `/api/admin/settings/llmGeo` | `REGISTERED_AND_MATCHED` | POST /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:1009` | GET | `/api/admin/settings/integrations` | `REGISTERED_AND_MATCHED` | GET /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:1024` | POST | `/api/admin/settings/integrations` | `REGISTERED_AND_MATCHED` | POST /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:1179` | POST | `/api/admin/settings/templateManager` | `REGISTERED_AND_MATCHED` | POST /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:1182` | POST | `/api/admin/settings/gdpr` | `REGISTERED_AND_MATCHED` | POST /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminSettingsTab.tsx:1185` | POST | `/api/admin/settings/codeInjection` | `REGISTERED_AND_MATCHED` | POST /api/admin/settings/:category |  |
| `frontend/src/components/admin/AdminUsersTab.tsx:175` | GET | `/admin/users` | `REGISTERED_AND_MATCHED` | GET /api/admin/users |  |
| `frontend/src/components/admin/AdminUsersTab.tsx:206` | POST | `/admin/users/{X}/status` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/job-applications/:applicationId/status | same tail "{X}/status" exists at PATCH /api/job-applications/:applicationId/status |
| `frontend/src/components/admin/AdminUsersTab.tsx:230` | POST | `/platform/role-view-audit` | `REGISTERED_AND_MATCHED` | POST /api/platform/role-view-audit |  |
| `frontend/src/components/admin/AdminUsersTab.tsx:246` | PATCH | `/admin/users/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/admin/users/:uid |  |
| `frontend/src/components/admin/AdminUsersTab.tsx:262` | POST | `/admin/users/{X}/send-password-reset` | `REGISTERED_AND_MATCHED` | POST /api/admin/users/:uid/send-password-reset |  |
| `frontend/src/components/admin/AdminUsersTab.tsx:280` | POST | `/admin/users/{X}/revoke-sessions` | `REGISTERED_AND_MATCHED` | POST /api/admin/users/:uid/revoke-sessions |  |
| `frontend/src/components/admin/AdminUsersTab.tsx:354` | POST | `/admin/users` | `REGISTERED_AND_MATCHED` | POST /api/admin/users |  |
| `frontend/src/components/admin/ai-settings/context/AiSettingsContext.tsx:232` | POST | `/admin/ai-settings` | `REGISTERED_AND_MATCHED` | POST /api/admin/ai-settings |  |
| `frontend/src/components/admin/ai-settings/context/AiSettingsContext.tsx:305` | GET | `/admin/ai-settings` | `REGISTERED_AND_MATCHED` | GET /api/admin/ai-settings |  |
| `frontend/src/components/admin/ai-settings/hooks/useProviderMutations.ts:119` | POST | `/admin/ai/test-provider` | `REGISTERED_AND_MATCHED` | POST /api/admin/ai/test-provider |  |
| `frontend/src/components/admin/ai-settings/hooks/useProviderMutations.ts:306` | POST | `/admin/ai/test-provider` | `REGISTERED_AND_MATCHED` | POST /api/admin/ai/test-provider |  |
| `frontend/src/components/admin/ai-settings/hooks/useQuotaGovernance.ts:41` | GET | `/admin/ai/quota-stats` | `REGISTERED_AND_MATCHED` | GET /api/admin/ai/quota-stats |  |
| `frontend/src/components/admin/ai-settings/hooks/useQuotaGovernance.ts:47` | GET | `/freellmapi/status` | `REGISTERED_AND_MATCHED` | GET /api/freellmapi/status |  |
| `frontend/src/components/admin/ai-settings/hooks/useQuotaGovernance.ts:48` | GET | `/freellmapi/metrics` | `REGISTERED_AND_MATCHED` | GET /api/freellmapi/metrics |  |
| `frontend/src/components/admin/ai-settings/hooks/useQuotaGovernance.ts:76` | POST | `/admin/ai/quota-limits` | `REGISTERED_AND_MATCHED` | POST /api/admin/ai/quota-limits |  |
| `frontend/src/components/admin/ai-settings/hooks/useQuotaGovernance.ts:112` | POST | `/admin/ai/reset-quota` | `REGISTERED_AND_MATCHED` | POST /api/admin/ai/reset-quota |  |
| `frontend/src/components/employer/CandidateReviewDrawer.tsx:159` | POST | `/notify/email` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/components/employer/CompanyProfile.tsx:176` | PATCH | `/employer/companies/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/employer/companies/:companyId |  |
| `frontend/src/components/employer/CompanyProfile.tsx:182` | POST | `/employer/companies` | `REGISTERED_AND_MATCHED` | POST /api/employer/companies |  |
| `frontend/src/components/jobs/job-application-modal.tsx:92` | GET | `/resumes` | `REGISTERED_AND_MATCHED` | GET /api/resumes |  |
| `frontend/src/components/jobs/job-application-modal.tsx:164` | POST | `/generate-ai-cover-letter` | `REGISTERED_AND_MATCHED` | POST /api/generate-ai-cover-letter |  |
| `frontend/src/components/jobs/job-application-modal.tsx:225` | POST | `/jobs/{X}/applications` | `REGISTERED_AND_MATCHED` | POST /api/jobs/:jobId/applications |  |
| `frontend/src/components/layout/cuba-app-shell.tsx:298` | POST | `/api/platform/role-view-audit` | `REGISTERED_AND_MATCHED` | POST /api/platform/role-view-audit |  |
| `frontend/src/components/ui/preview-modal.tsx:168` | POST | `/api/export-docx` | `REGISTERED_AND_MATCHED` | POST /api/export-docx |  |
| `frontend/src/hooks/use-api-hooks.ts:198` | GET | `/employer/jobs` | `REGISTERED_AND_MATCHED` | GET /api/employer/jobs |  |
| `frontend/src/hooks/use-api-hooks.ts:210` | GET | `/employer/companies` | `REGISTERED_AND_MATCHED` | GET /api/employer/companies |  |
| `frontend/src/hooks/use-api-hooks.ts:223` | GET | `/jobs/{X}/applications` | `REGISTERED_AND_MATCHED` | GET /api/jobs/:jobId/applications |  |
| `frontend/src/hooks/use-api-hooks.ts:237` | GET | `/employer/jobs/{X}/applications/{X}/resume` | `REGISTERED_AND_MATCHED` | GET /api/employer/jobs/:jobId/applications/:applicationId/resume |  |
| `frontend/src/hooks/use-api-hooks.ts:270` | POST | `/employer/jobs` | `REGISTERED_AND_MATCHED` | POST /api/employer/jobs |  |
| `frontend/src/hooks/use-api-hooks.ts:284` | PATCH | `/employer/jobs/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/employer/jobs/:jobId |  |
| `frontend/src/hooks/use-api-hooks.ts:304` | PATCH | `/job-applications/{X}/status` | `REGISTERED_AND_MATCHED` | PATCH /api/job-applications/:applicationId/status |  |
| `frontend/src/hooks/use-api-hooks.ts:332` | GET | `/platform/public-config` | `REGISTERED_AND_MATCHED` | GET /api/platform/public-config |  |
| `frontend/src/hooks/use-api-hooks.ts:360` | GET | `/admin/users` | `REGISTERED_AND_MATCHED` | GET /api/admin/users |  |
| `frontend/src/hooks/use-api-hooks.ts:433` | GET | `/admin/support/tickets` | `REGISTERED_AND_MATCHED` | GET /api/admin/support/tickets |  |
| `frontend/src/hooks/use-api-hooks.ts:444` | GET | `/admin/audit-logs` | `REGISTERED_AND_MATCHED` | GET /api/admin/audit-logs |  |
| `frontend/src/hooks/use-api-hooks.ts:483` | POST | `/admin/support/tickets/{X}/messages` | `REGISTERED_AND_MATCHED` | POST /api/admin/support/tickets/:ticketId/messages |  |
| `frontend/src/hooks/use-api-hooks.ts:505` | PATCH | `/admin/support/tickets/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/admin/support/tickets/:ticketId |  |
| `frontend/src/hooks/use-api-hooks.ts:588` | GET | `/support/tickets` | `REGISTERED_AND_MATCHED` | GET /api/support/tickets |  |
| `frontend/src/hooks/use-api-hooks.ts:599` | POST | `/support/tickets` | `REGISTERED_AND_MATCHED` | POST /api/support/tickets |  |
| `frontend/src/hooks/use-api-hooks.ts:612` | POST | `/support/tickets/{X}/messages` | `REGISTERED_AND_MATCHED` | POST /api/support/tickets/:ticketId/messages |  |
| `frontend/src/lib/account-settings.ts:166` | GET | `/users-data/profile` | `REGISTERED_AND_MATCHED` | GET /api/users-data/profile |  |
| `frontend/src/lib/account-settings.ts:179` | POST | `/users-data/profile` | `REGISTERED_AND_MATCHED` | POST /api/users-data/profile |  |
| `frontend/src/lib/account-settings.ts:219` | POST | `/account/delete` | `REGISTERED_AND_MATCHED` | POST /api/account/delete |  |
| `frontend/src/lib/account-settings.ts:227` | POST | `/users-data/mfa/disable` | `REGISTERED_AND_MATCHED` | POST /api/users-data/mfa/disable |  |
| `frontend/src/lib/ai-content.ts:395` | POST | `/generate-content` | `REGISTERED_AND_MATCHED` | POST /api/generate-content |  |
| `frontend/src/lib/ai-content.ts:554` | POST | `/check-grammar` | `REGISTERED_AND_MATCHED` | POST /api/check-grammar |  |
| `frontend/src/lib/ai-content.ts:563` | POST | `/parse-resume` | `REGISTERED_AND_MATCHED` | POST /api/parse-resume |  |
| `frontend/src/lib/ai-content.ts:570` | GET | `/ai-usage` | `REGISTERED_AND_MATCHED` | GET /api/ai-usage |  |
| `frontend/src/lib/applications.ts:82` | GET | `/jobs-data/applications/list` | `REGISTERED_AND_MATCHED` | GET /api/jobs-data/applications/list |  |
| `frontend/src/lib/applications.ts:95` | DELETE | `/jobs-data/applications/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/jobs-data/applications/:id |  |
| `frontend/src/lib/cover-letters.ts:238` | DELETE | `/covers/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/covers/:id |  |
| `frontend/src/lib/cover-letters.ts:303` | POST | `/generate-ai-cover-letter` | `REGISTERED_AND_MATCHED` | POST /api/generate-ai-cover-letter |  |
| `frontend/src/lib/enterprise-api.ts:362` | GET | `/api/enterprise/status` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/status |  |
| `frontend/src/lib/enterprise-api.ts:365` | GET | `/api/enterprise/tenants` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/tenants |  |
| `frontend/src/lib/enterprise-api.ts:368` | POST | `/api/enterprise/context` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/context |  |
| `frontend/src/lib/enterprise-api.ts:376` | GET | `/api/enterprise/workspaces` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/workspaces |  |
| `frontend/src/lib/enterprise-api.ts:382` | POST | `/api/enterprise/workspaces` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/workspaces |  |
| `frontend/src/lib/enterprise-api.ts:389` | PATCH | `/api/enterprise/workspaces/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/enterprise/workspaces/:workspaceId |  |
| `frontend/src/lib/enterprise-api.ts:396` | POST | `/api/enterprise/workspaces/{X}/archive` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/workspaces/:workspaceId/archive |  |
| `frontend/src/lib/enterprise-api.ts:402` | POST | `/api/enterprise/workspaces/{X}/restore` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/workspaces/:workspaceId/restore |  |
| `frontend/src/lib/enterprise-api.ts:408` | GET | `/api/enterprise/memberships` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/memberships |  |
| `frontend/src/lib/enterprise-api.ts:413` | POST | `/api/enterprise/memberships` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/memberships |  |
| `frontend/src/lib/enterprise-api.ts:420` | PATCH | `/api/enterprise/memberships/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/enterprise/memberships/:principalId |  |
| `frontend/src/lib/enterprise-api.ts:427` | POST | `/api/enterprise/memberships/{X}/invitation-resend` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/memberships/:principalId/invitation-resend |  |
| `frontend/src/lib/enterprise-api.ts:433` | DELETE | `/api/enterprise/memberships/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/enterprise/memberships/:principalId |  |
| `frontend/src/lib/enterprise-api.ts:439` | GET | `/api/enterprise/roles-matrix` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/roles-matrix |  |
| `frontend/src/lib/enterprise-api.ts:444` | GET | `/api/enterprise/teams` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/teams |  |
| `frontend/src/lib/enterprise-api.ts:449` | POST | `/api/enterprise/teams` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/teams |  |
| `frontend/src/lib/enterprise-api.ts:456` | PATCH | `/api/enterprise/teams/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/enterprise/teams/:teamId |  |
| `frontend/src/lib/enterprise-api.ts:463` | POST | `/api/enterprise/teams/{X}/archive` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/teams/:teamId/archive |  |
| `frontend/src/lib/enterprise-api.ts:469` | POST | `/api/enterprise/teams/{X}/restore` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/teams/:teamId/restore |  |
| `frontend/src/lib/enterprise-api.ts:475` | GET | `/api/enterprise/configuration` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/configuration |  |
| `frontend/src/lib/enterprise-api.ts:480` | PATCH | `/api/enterprise/configuration` | `REGISTERED_AND_MATCHED` | PATCH /api/enterprise/configuration |  |
| `frontend/src/lib/enterprise-api.ts:487` | GET | `/api/enterprise/usage/ai` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/usage/ai |  |
| `frontend/src/lib/enterprise-api.ts:492` | GET | `/api/enterprise/usage/ai/events` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/usage/ai/events |  |
| `frontend/src/lib/enterprise-api.ts:497` | GET | `/api/enterprise/audit` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/audit |  |
| `frontend/src/lib/enterprise-api.ts:503` | GET | `/api/enterprise/resources` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/resources |  |
| `frontend/src/lib/enterprise-api.ts:508` | POST | `/api/enterprise/resources` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/resources |  |
| `frontend/src/lib/enterprise-api.ts:515` | PATCH | `/api/enterprise/resources/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/enterprise/resources/:resourceId |  |
| `frontend/src/lib/enterprise-api.ts:522` | DELETE | `/api/enterprise/resources/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/enterprise/resources/:resourceId |  |
| `frontend/src/lib/enterprise-api.ts:528` | GET | `/api/platform/status` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/platform/status | same tail "platform/status" exists at GET /api/admin/platform/status |
| `frontend/src/lib/enterprise-api.ts:534` | GET | `/api/enterprise/service-accounts` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/service-accounts |  |
| `frontend/src/lib/enterprise-api.ts:539` | POST | `/api/enterprise/service-accounts` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/service-accounts |  |
| `frontend/src/lib/enterprise-api.ts:546` | POST | `/api/enterprise/service-accounts/{X}/revoke` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/service-accounts/:serviceAccountId/revoke |  |
| `frontend/src/lib/enterprise-api.ts:552` | POST | `/api/enterprise/service-accounts/{X}/rotate` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/service-accounts/:serviceAccountId/rotate |  |
| `frontend/src/lib/enterprise-api.ts:558` | GET | `/api/enterprise/queue/status` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/queue/status |  |
| `frontend/src/lib/enterprise-api.ts:568` | POST | `/api/enterprise/queue/replay` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/queue/replay |  |
| `frontend/src/lib/enterprise-api.ts:575` | GET | `/api/enterprise/observability/metrics` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/observability/metrics |  |
| `frontend/src/lib/enterprise-api.ts:580` | GET | `/api/enterprise/data-plane/status` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/data-plane/status |  |
| `frontend/src/lib/enterprise-api.ts:585` | GET | `/api/enterprise/support-grants` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/support-grants |  |
| `frontend/src/lib/enterprise-api.ts:590` | POST | `/api/enterprise/support-grants` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/support-grants |  |
| `frontend/src/lib/enterprise-api.ts:597` | POST | `/api/enterprise/support-grants/{X}/revoke` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/support-grants/:grantId/revoke |  |
| `frontend/src/lib/enterprise-api.ts:603` | GET | `/api/enterprise/platform/tenants` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/platform/tenants |  |
| `frontend/src/lib/enterprise-api.ts:606` | POST | `/api/enterprise/platform/tenants/{X}/suspend` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/platform/tenants/:tenantId/suspend |  |
| `frontend/src/lib/enterprise-api.ts:611` | POST | `/api/enterprise/platform/tenants/{X}/reactivate` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/platform/tenants/:tenantId/reactivate |  |
| `frontend/src/lib/enterprise-api.ts:621` | POST | `/api/enterprise/test-email` | `REGISTERED_AND_MATCHED` | POST /api/enterprise/test-email |  |
| `frontend/src/lib/enterprise-api.ts:628` | PATCH | `/api/enterprise/tenant` | `REGISTERED_AND_MATCHED` | PATCH /api/enterprise/tenant |  |
| `frontend/src/lib/favourites.ts:62` | GET | `/favourites` | `REGISTERED_AND_MATCHED` | GET /api/favourites |  |
| `frontend/src/lib/favourites.ts:71` | DELETE | `/favourites/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/favourites/:itemId |  |
| `frontend/src/lib/favourites.ts:77` | POST | `/favourites` | `REGISTERED_AND_MATCHED` | POST /api/favourites |  |
| `frontend/src/lib/interview-coach.ts:146` | POST | `/generate-interview` | `REGISTERED_AND_MATCHED` | POST /api/generate-interview |  |
| `frontend/src/lib/interview-coach.ts:256` | POST | `/live-interview/sessions` | `REGISTERED_AND_MATCHED` | POST /api/live-interview/sessions |  |
| `frontend/src/lib/interview-coach.ts:271` | GET | `/live-interview/sessions/{X}` | `REGISTERED_AND_MATCHED` | GET /api/live-interview/sessions/:sessionId |  |
| `frontend/src/lib/interview-coach.ts:289` | POST | `/live-interview/sessions/{X}/turns` | `REGISTERED_AND_MATCHED` | POST /api/live-interview/sessions/:sessionId/turns |  |
| `frontend/src/lib/interview-coach.ts:307` | POST | `/live-interview/sessions/{X}/complete` | `REGISTERED_AND_MATCHED` | POST /api/live-interview/sessions/:sessionId/complete |  |
| `frontend/src/lib/interview-coach.ts:319` | DELETE | `/live-interview/sessions/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/live-interview/sessions/:sessionId |  |
| `frontend/src/lib/job-tracker.ts:208` | GET | `/jobs-data/tracker` | `REGISTERED_AND_MATCHED` | GET /api/jobs-data/tracker |  |
| `frontend/src/lib/job-tracker.ts:214` | POST | `/jobs-data/tracker` | `REGISTERED_AND_MATCHED` | POST /api/jobs-data/tracker |  |
| `frontend/src/lib/job-tracker.ts:224` | PATCH | `/jobs-data/tracker/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/jobs-data/tracker/:id |  |
| `frontend/src/lib/job-tracker.ts:234` | DELETE | `/jobs-data/tracker/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/jobs-data/tracker/:id |  |
| `frontend/src/lib/messages.ts:138` | GET | `/messages/conversations` | `REGISTERED_AND_MATCHED` | GET /api/messages/conversations |  |
| `frontend/src/lib/messages.ts:146` | GET | `/messages/conversations/{X}/messages` | `REGISTERED_AND_MATCHED` | GET /api/messages/conversations/:conversationId/messages |  |
| `frontend/src/lib/messages.ts:156` | GET | `/messages/conversations/{X}/participant-profile` | `REGISTERED_AND_MATCHED` | GET /api/messages/conversations/:conversationId/participant-profile |  |
| `frontend/src/lib/messages.ts:165` | POST | `/messages/conversations/{X}/read` | `REGISTERED_AND_MATCHED` | POST /api/messages/conversations/:conversationId/read |  |
| `frontend/src/lib/messages.ts:172` | POST | `/messages/send` | `REGISTERED_AND_MATCHED` | POST /api/messages/send |  |
| `frontend/src/lib/notifications.ts:105` | GET | `/notifications-data` | `REGISTERED_AND_MATCHED` | GET /api/notifications-data |  |
| `frontend/src/lib/notifications.ts:113` | PATCH | `/notifications-data/{X}` | `REGISTERED_AND_MATCHED` | PATCH /api/notifications-data/:id |  |
| `frontend/src/lib/notifications.ts:118` | POST | `/notifications-data/mark-all-read` | `REGISTERED_AND_MATCHED` | POST /api/notifications-data/mark-all-read |  |
| `frontend/src/lib/portfolio.ts:118` | GET | `/portfolios` | `REGISTERED_AND_MATCHED` | GET /api/portfolios |  |
| `frontend/src/lib/portfolio.ts:123` | GET | `/portfolios/{X}` | `REGISTERED_AND_MATCHED` | GET /api/portfolios/public |  |
| `frontend/src/lib/portfolio.ts:129` | POST | `/portfolios/{X}` | `REGISTERED_AND_MATCHED` | POST /api/portfolios/:id |  |
| `frontend/src/lib/portfolio.ts:134` | DELETE | `/portfolios/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/portfolios/:id |  |
| `frontend/src/lib/portfolio.ts:145` | GET | `/portfolios/slug-availability` | `REGISTERED_AND_MATCHED` | GET /api/portfolios/slug-availability |  |
| `frontend/src/lib/portfolio.ts:150` | GET | `/portfolios/public` | `REGISTERED_AND_MATCHED` | GET /api/portfolios/public |  |
| `frontend/src/lib/portfolio.ts:155` | GET | `/portfolios/public/{X}` | `REGISTERED_AND_MATCHED` | GET /api/portfolios/public/:slug |  |
| `frontend/src/lib/portfolio.ts:170` | GET | `/resumes` | `REGISTERED_AND_MATCHED` | GET /api/resumes |  |
| `frontend/src/lib/preview-session.ts:134` | POST | `/api/auth/preview-login` | `REGISTERED_AND_MATCHED` | POST /api/auth/preview-login |  |
| `frontend/src/lib/preview-session.ts:169` | GET | `/api/users-data/profile` | `REGISTERED_AND_MATCHED` | GET /api/users-data/profile |  |
| `frontend/src/lib/share-publication.ts:41` | GET | `/resumes/{X}/publication` | `REGISTERED_AND_MATCHED` | GET /api/resumes/public/:id |  |
| `frontend/src/lib/share-publication.ts:52` | POST | `/resumes/{X}/publish` | `REGISTERED_AND_MATCHED` | POST /api/resumes/:id/publish |  |
| `frontend/src/lib/share-publication.ts:73` | POST | `/resumes/{X}/unpublish` | `REGISTERED_AND_MATCHED` | POST /api/resumes/:id/unpublish |  |
| `frontend/src/lib/tenant-context.ts:143` | GET | `/api/enterprise/tenants` | `REGISTERED_AND_MATCHED` | GET /api/enterprise/tenants |  |
| `frontend/src/pages/auth/login.tsx:59` | GET | `/users-data/profile` | `REGISTERED_AND_MATCHED` | GET /api/users-data/profile |  |
| `frontend/src/pages/auth/login.tsx:60` | POST | `/users-data/profile` | `REGISTERED_AND_MATCHED` | POST /api/users-data/profile |  |
| `frontend/src/pages/billing/checkout-modal.tsx:246` | POST | `/api/billing/validate-coupon` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/pages/billing/checkout-modal.tsx:344` | POST | `/api/pay` | `REGISTERED_AND_MATCHED` | POST /api/pay |  |
| `frontend/src/pages/billing/checkout-modal.tsx:346` | POST | `/api/razorpay/create-order` | `REGISTERED_AND_MATCHED` | POST /api/razorpay/create-order |  |
| `frontend/src/pages/billing/checkout-modal.tsx:348` | POST | `/api/paypal/create-order` | `REGISTERED_AND_MATCHED` | POST /api/paypal/create-order |  |
| `frontend/src/pages/blog/editor.tsx:91` | GET | `/blog/posts/{X}` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/admin/blog/posts/:postId | same tail "posts/{X}" exists at PATCH /api/admin/blog/posts/:postId |
| `frontend/src/pages/blog/editor.tsx:147` | PUT | `/blog/posts/{X}` | `REGISTERED_WITH_CONTRACT_MISMATCH` | PATCH /api/admin/blog/posts/:postId | same tail "posts/{X}" exists at PATCH /api/admin/blog/posts/:postId |
| `frontend/src/pages/blog/editor.tsx:149` | POST | `/blog/posts` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/blog/posts | same tail "blog/posts" exists at GET /api/admin/blog/posts |
| `frontend/src/pages/blog/index.tsx:46` | GET | `/blog/posts` | `REGISTERED_WITH_CONTRACT_MISMATCH` | GET /api/admin/blog/posts | same tail "blog/posts" exists at GET /api/admin/blog/posts |
| `frontend/src/pages/dashboard/overview.tsx:112` | GET | `/user-stats` | `REGISTERED_AND_MATCHED` | GET /api/user-stats |  |
| `frontend/src/pages/dashboard/overview.tsx:125` | GET | `/resumes` | `REGISTERED_AND_MATCHED` | GET /api/resumes |  |
| `frontend/src/pages/dashboard/overview.tsx:149` | GET | `/jobs-data` | `REGISTERED_AND_MATCHED` | GET /api/jobs-data |  |
| `frontend/src/pages/dashboard/overview.tsx:161` | GET | `/favourites` | `REGISTERED_AND_MATCHED` | GET /api/favourites |  |
| `frontend/src/pages/dashboard/overview.tsx:177` | GET | `/covers` | `REGISTERED_AND_MATCHED` | GET /api/covers |  |
| `frontend/src/pages/dashboard/overview.tsx:192` | GET | `/users-data/profile` | `REGISTERED_AND_MATCHED` | GET /api/users-data/profile |  |
| `frontend/src/pages/dashboard/overview.tsx:218` | DELETE | `/favourites/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/favourites/:itemId |  |
| `frontend/src/pages/dashboard/overview.tsx:227` | POST | `/favourites` | `REGISTERED_AND_MATCHED` | POST /api/favourites |  |
| `frontend/src/pages/dashboard/overview.tsx:239` | GET | `/favourites` | `REGISTERED_AND_MATCHED` | GET /api/favourites |  |
| `frontend/src/pages/dashboard/resume-builder.tsx:646` | POST | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | POST /api/resumes/:id |  |
| `frontend/src/pages/dashboard/resume-builder.tsx:771` | GET | `/resumes` | `REGISTERED_AND_MATCHED` | GET /api/resumes |  |
| `frontend/src/pages/dashboard/resume-builder.tsx:778` | GET | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | GET /api/resumes/:id |  |
| `frontend/src/pages/dashboard/resume-builder.tsx:854` | GET | `/users-data/profile` | `REGISTERED_AND_MATCHED` | GET /api/users-data/profile |  |
| `frontend/src/pages/dashboard/resume-builder.tsx:897` | POST | `/export-docx` | `REGISTERED_AND_MATCHED` | POST /api/export-docx |  |
| `frontend/src/pages/dashboard/resume-builder.tsx:3806` | GET | `/users-data/profile` | `REGISTERED_AND_MATCHED` | GET /api/users-data/profile |  |
| `frontend/src/pages/dashboard/resume-builder.tsx:3882` | POST | `/users-data/profile` | `REGISTERED_AND_MATCHED` | POST /api/users-data/profile |  |
| `frontend/src/pages/dashboard/resumes.tsx:153` | GET | `/resumes` | `REGISTERED_AND_MATCHED` | GET /api/resumes |  |
| `frontend/src/pages/dashboard/resumes.tsx:191` | GET | `/users-data/profile` | `REGISTERED_AND_MATCHED` | GET /api/users-data/profile |  |
| `frontend/src/pages/dashboard/resumes.tsx:321` | GET | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | GET /api/resumes/:id |  |
| `frontend/src/pages/dashboard/resumes.tsx:497` | POST | `/api/export-docx` | `REGISTERED_AND_MATCHED` | POST /api/export-docx |  |
| `frontend/src/pages/dashboard/resumes.tsx:535` | GET | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | GET /api/resumes/:id |  |
| `frontend/src/pages/dashboard/resumes.tsx:548` | POST | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | POST /api/resumes/:id |  |
| `frontend/src/pages/dashboard/resumes.tsx:568` | GET | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | GET /api/resumes/:id |  |
| `frontend/src/pages/dashboard/resumes.tsx:578` | POST | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | POST /api/resumes/:id |  |
| `frontend/src/pages/dashboard/resumes.tsx:598` | DELETE | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | DELETE /api/resumes/:id |  |
| `frontend/src/pages/export/cv-renderer.tsx:127` | GET | `/export-render-data` | `REGISTERED_AND_MATCHED` | GET /api/export-render-data |  |
| `frontend/src/pages/export/cv-renderer.tsx:145` | GET | `/resumes/public/token/{X}` | `REGISTERED_AND_MATCHED` | GET /api/resumes/public/token/:token |  |
| `frontend/src/pages/export/cv-renderer.tsx:155` | GET | `/resumes/{X}` | `REGISTERED_AND_MATCHED` | GET /api/resumes/:id |  |
| `frontend/src/pages/export/cv-renderer.tsx:218` | POST | `/api/export-docx` | `REGISTERED_AND_MATCHED` | POST /api/export-docx |  |
| `frontend/src/pages/jobs/portal.tsx:74` | GET | `/jobs` | `NO_REGISTERED_OPERATION` | — | no registration shares this path shape or tail |
| `frontend/src/pages/jobs/regional-hub.tsx:77` | GET | `/api/public/geo/regions/{X}/{X}` | `REGISTERED_AND_MATCHED` | GET /api/public/geo/regions/:kind/:slug |  |

