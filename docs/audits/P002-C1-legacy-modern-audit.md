# P002 · C1 — Candidate Dashboard forensic audit (legacy `src/` vs modern `frontend/src/`)

Scope: Candidate / User Dashboard only (directive §6 scope boundary, commit `98f3449`).
Branch: `arena/994d7b67-resumepilotai`; audit base `ef0bdc7af67d26c7fbe0da913b14889038962086`.
Legacy `src/` was read only, as a behavioural specification. Nothing from it is copied.

## 1. Method and evidence

| Source | What it established |
|---|---|
| `frontend/src/app/router.tsx`, `frontend/src/components/layout/cuba-app-shell.tsx` | Modern routes, navigation groups, breadcrumbs |
| `src/main.jsx`, `src/components/Dashboard/DashboardMain/DashboardMain.jsx`, `src/components/cuba/candidateNavigation.js` | Legacy routes, aliases and navigation |
| `scripts/audit/candidate-endpoint-contract.mjs` → `docs/test-reports/P002-endpoint-contract.json` | Every HTTP call in candidate-scope frontend files, matched against the real Express routing table: 694 routes, including mounted routers resolved from source |
| Live probes against the running backend (MariaDB through the sandbox bridge, `rptest` identity) | `/api/api/*` → 404 `API route not found`; real endpoints → 200 with MariaDB data; portfolio → 403 `PORTFOLIO_MODULE_DISABLED` |
| Pattern scan of candidate pages | Native `alert`/`confirm`, hand-rolled overlays without `role="dialog"`, handler-less buttons, fabricated content |
| Backend route and repository source (`routes/covers.js`, `MySQLRepository.saveCover`, `services/coverLetterAi.js`, `/api/messages/*`) | Persistence model, ownership guards, AI contracts, module gates |

Responsive behaviour across the five required profiles is **measured per surface during its
lifecycle** with the 5-profile Playwright harness (C2). Rows not yet worked show "not measured"
rather than a guessed value.

## 2. Endpoint contract (frontend ↔ backend)

67 candidate-scope calls (44 unique method + path) checked against 694 backend routes. The static
check finds **11 calls with no backend route**. Manual review adds row 4: the builder's save call
builds its path from a variable, which the static scanner cannot resolve. Every row fails at
runtime (`/api/api/*` verified live → 404):

| # | Call as sent | File | Effect | Cause |
|---|---|---|---|---|
| 1 | `POST /api/api/generate-content` | `pages/dashboard/ai-assistant.tsx:137` | Request always 404s, **then fabricated "AI" text is shown** (§4 row 8) | Path already includes `/api`; client `baseURL` is `/api` |
| 2 | `GET /api/api/covers/:id` | `pages/dashboard/cover-letter-builder.tsx:94` | Existing letters never load | Double prefix |
| 3 | `POST /api/api/generate-ai-cover-letter` | `cover-letter-builder.tsx:108` | AI generation always fails | Double prefix, plus wrong field names (`positionTitle` vs `jobTitle`) |
| 4 | `POST /api/api/covers`, `PUT /api/api/covers/:id` | `cover-letter-builder.tsx:131` (template literal) | Nothing can be saved | Double prefix. Backend has no `PUT`; it upserts via `POST /api/covers/:id`. |
| 5 | `POST /api/api/generate-suggestions` | `pages/dashboard/resume-builder.tsx:1581` | Resume AI suggestions always fail | Double prefix |
| 6–9 | `GET/POST/PUT /api/api/portfolios…`, `…/publish` | `pages/portfolio/builder.tsx` | Portfolio builder cannot load or save | Double prefix |
| 10 | `GET /api/api/portfolios/public` | `pages/portfolio/gallery.tsx:53` | Gallery always errors | Double prefix |
| 11 | `GET /api/api/portfolios/public/:slug` | `pages/portfolio/public-portfolio.tsx:92` | Public portfolio deep links always error | Double prefix |
| 12 | `POST /api/users/profile` | `pages/auth/login.tsx:77` | Registration profile creation silently fails (warning only) | Route does not exist. The real route is `POST /api/users-data/profile`. |

Matching an existing route does not make a call semantically correct. Confirmed example:
`POST /api/covers/create` (`cover-letters.tsx`) matches `POST /api/covers/:id` with
`id = "create"`. Every "new" letter upserts the **same** primary key. The repository's ownership
guard then makes the key belong to whichever user created it first, so other users receive 404.

## 3. Route and deep-link inventory (candidate scope)

Status legend: ✅ works · ↪ redirects correctly · ⚠ renders but not equivalent · ❌ 404 / broken.

| Legacy route (src) | Modern route (frontend) | Status | Notes |
|---|---|---|---|
| `/dashboard` (index) | `/dashboard` → `DashboardOverview` | ✅ | |
| `/dashboard/resumes`, `/dashboard/my-resumes` | `/dashboard/resumes` | ✅ / ❌ | `my-resumes` alias missing in modern |
| `/build-resume/*`, `/resume-builder/*`, `/create-resume` | `/build-resume/*` (+ redirects) | ✅ ↪ | |
| `/dashboard/cover-letters`, `/dashboard/cv` | `/dashboard/cover-letters/*` | ✅ / ❌ | `cv` alias missing |
| `/dashboard/cover-letters?role=&company=` (Job Tracker "View linked cover letter", DIR-020 AC-11) | same path | ❌ | Query is ignored; no prefill |
| `/coverletter`, `/cover-letter` (+ `/*`) | `/coverletter/*`, `/cover-letter/*` → builder | ⚠ | Builder reads `useParams().id`, which is always `undefined` under a splat route, so `/cover-letter/<id>` never loads |
| `/dashboard/portfolios` | `/dashboard/portfolio/*` | ❌ | Legacy plural path → Not Found |
| `/portfolio/builder`, `/portfolio/:slug`, `/portfolios` | same | ⚠ | All API calls 404 (§2); module disabled by default (403) |
| `/dashboard/favorites` | `/dashboard/favourites` (+ `favorites` redirect) | ✅ ↪ | |
| `/dashboard/notifications` | same | ✅ | |
| `/dashboard/messages` | same | ⚠ | Shows **notifications**, not conversations (§4 row 5) |
| `/dashboard/jobs`, `/jobs/portal/:jobId`, `/jobs/browse`, `/jobs/category/:cat` | `/dashboard/jobs/*` → `JobsPortalPage` | ✅ | Deferred backlog (Browse Job Portal) |
| `/dashboard/job-tracker` | same | ✅ | |
| `/dashboard/applied-jobs` (`AppliedJobs`) | same path → `JobTrackerPage` | ⚠ | Submitted-applications view not reproduced |
| `/dashboard/interview` | `/dashboard/interview(s)` | ↪ ✅ | |
| `/dashboard/plans`, `/dashboard/billing` | `/dashboard/plans` → `/pricing`; `billing` ❌ | ↪ / ❌ | Deferred backlog (Subscription & Plans) |
| `/dashboard/support`, `/dashboard/tickets`, `/dashboard/help` | `/dashboard/support`; aliases ❌ | ✅ / ❌ | |
| `/dashboard/settings`, `/dashboard/profile`, `/dashboard/security`, `/dashboard/account` | `/dashboard/settings/*` (`?tab=`); aliases ❌ | ✅ / ❌ | Legacy nav used `?tab=Profile` / `?tab=Security` (capitalised) |
| — | `/dashboard/ats-score`, `/dashboard/ats` | ✅ (new) | No legacy dashboard route; ATS lived inside builders |
| — | `/dashboard/ai/*` | ❌ functionally (new) | §4 row 8 |

## 4. Surface matrix

Severity per directive §5: **P0** data loss / security / auth bypass / broken core workflow /
fabricated success; **P1** major feature missing, wrong persistence, broken deep link,
inaccessible primary workflow; **P2** partial parity, weak errors, layout or moderate a11y;
**P3** cosmetic.

| # | Surface | Legacy route / file | Modern route / file | Existing modern behaviour | Discrepancies (evidence) | Backend endpoints | Persistence | Deep links | Responsive | Sev. | Planned changes | Verification | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Cover Letters & Builder | `/dashboard/cover-letters`, `/coverletter*`; `src/components/CoverLetter/CoverLetter.jsx` (1846 lines: list, builder, AI, ATS match, tracker sync, share, print) | `/dashboard/cover-letters/*` → `cover-letters.tsx` (234); `/cover-letter/*`, `/coverletter/*` → `cover-letter-builder.tsx` (420) | List works for reads. Create modal posts to `/covers/create`. Builder opens with a hard-coded persona letter. | **P0 fabricated content**: builder defaults to a fictional candidate, employer, recipient and a complete letter with invented metrics. **P0**: builder cannot load (splat param, double prefix, wrong response shape) or save (double prefix, nonexistent `PUT`). **P0**: create collides on id `create`. AI call double-prefixed with wrong field names. List reads `name`/`updatedAt` but the backend returns `title`/`updated_at`. Edit/Download buttons have no handlers. Modal lacks `role="dialog"`, focus trap, Escape and focus return. Native `confirm`/`alert`. Labels not bound to inputs. Phone/location/address shown but not editable. "Export PDF" is `window.print()`. No search, sort, duplicate, profile prefill, or `?role=&company=` deep link. | `GET /api/covers`, `GET/POST/DELETE /api/covers/:id`, `POST /api/generate-ai-cover-letter` (503 `aiUnavailable` when no provider; never a template), `GET /api/users-data/profile`, `POST /api/jobs-data/tracker` | MariaDB `covers` (id PK, `user_id` FK, `data` JSON). Ownership-guarded upsert. Legacy record shape `cl_<ts>` + `candidate*`/`job*`/`company*`/`letterBody`/`templateId`. | `/cover-letter/:id` broken; `?role=&company=` ignored | not measured | **P0** | Native rebuild of list and builder on the real contract: client ids `cl_<ts>`, legacy-compatible shape, profile prefill, accessible dialogs, search/sort, duplicate, delete confirm, AI with explicit unavailable state, copy/print, deep links | Playwright 5 profiles (behavioural), real API persistence after reload, isolation across two accounts, axe | **Selected — Surface 1** |
| 2 | ATS Score | — (inside builders) | `/dashboard/ats-score`, `/dashboard/ats` → `ats-score.tsx` (474) | Reads resumes; deterministic scoring (`lib/atsScore.js`) | Two handler-less buttons flagged by scan; detailed review pending | `GET /api/resumes`, `GET /api/resumes/:id` | read-only | ✅ | not measured | P2 (provisional) | Review after P0/P1 surfaces | — | Queued |
| 3 | Job Tracker | `/dashboard/job-tracker`, `/dashboard/applied-jobs`; `src/components/AppliedJobs/*` (1622) | `/dashboard/job-tracker`, `/dashboard/applied-jobs` → `job-tracker.tsx` (545) | CRUD on tracker entries | 3× `alert`, 1× `confirm`, 2 overlays without dialog semantics. No "linked cover letter" action (legacy AC-11). `applied-jobs` not equivalent. | `GET/POST /api/jobs-data/tracker`, `PATCH/DELETE /api/jobs-data/tracker/:id` (revisioned, migration 007/018) | MariaDB `job_tracker` | ✅ / ⚠ | not measured | P2 | Accessible dialogs, cover-letter linkage via existing deep link | — | Queued |
| 4 | Interview Coach | `/dashboard/interview`; `DashboardInterviews` (5821) | `/dashboard/interviews/*` → `interview-coach.tsx` (1385) | Practice/mock/CBT modes; static practice bank; `POST /api/generate-content` | Live interview sessions (`/api/live-interview`, migration 017) not wired; parity review pending | `POST /api/generate-content` | sessions not persisted in modern | ✅ | not measured | P1 (provisional) | Review after P0 surfaces | — | Queued |
| 5 | Messages | `/dashboard/messages` + `MessagesModuleGate`; `DashboardMessages` (674) | `/dashboard/messages/*` → `messages.tsx` (468) | Renders **notifications** via `useNotifications` | Wrong data source: backend exposes `/api/messages/conversations`, `…/messages`, `…/read`, `/api/messages/send` (module OFF by default, enforced server-side). No module gate. 1× `alert`. | `/api/messages/*` (unused) | MariaDB messaging tables (migrations 024/025) | ✅ route / ⚠ content | not measured | **P1** | Rewire to conversations API with module-disabled state | — | Queued |
| 6 | Notifications | `/dashboard/notifications`; `DashboardNotifications` (334) | same → `notifications.tsx` (458) | List, mark read, mark all read | Has dialog semantics; review pending | `GET /api/notifications-data`, `PATCH …/:id`, `POST …/mark-all-read` | MariaDB | ✅ | not measured | P2 (provisional) | Review | — | Queued |
| 7 | Favourites | `/dashboard/favorites`; `DashboardFavourites` (401) | `/dashboard/favourites` → `favourites.tsx` (478) | List and remove | Review pending | `GET /api/favourites`, `DELETE /api/favourites/:id` | MariaDB `favourites` | ✅ ↪ | not measured | P3 (provisional) | Review | — | Queued |
| 8 | AI Assistant | — (new surface) | `/dashboard/ai/*` → `ai-assistant.tsx` (531) | Five generation tools with history | **P0 fabricated success**: the only call is double-prefixed (always 404). The catch path shows `generateHighFidelityFallback()`, canned "achievements" with invented metrics ("cut latency by 38%… saving $45,000", "protected over $120k"), presented as AI output. | should use `POST /api/generate-content` (consolidated operations) | none | ✅ route | not measured | **P0** | Remove fabrication; call the real endpoint with its operation contract; explicit unavailable state | Playwright + live 503 path | **Selected — Surface 2** |
| 9 | Settings (incl. Master Profile, Security & 2FA) | `/dashboard/settings`; `DashboardSettings` (7173) | `/dashboard/settings/*` → `settings.tsx` (925) | Profile, MFA disable, export, delete, tickets | 6× `alert`, 1× `confirm`, overlay without dialog semantics; destructive flows need careful verification | `GET/POST /api/users-data/profile`, `POST /api/users-data/mfa/disable`, `POST /api/account/export`, `POST /api/account/delete`, support tickets | MariaDB `users` | ✅ (aliases ❌) | not measured | P2 | Accessible dialogs; alias redirects | — | Queued |
| 10 | Support | `/dashboard/support`; `DashboardSupport` (916) | same → `support.tsx` (468) | Tickets list, create, reply | Dialog semantics present; review pending | `/api/support/tickets*` | MariaDB `support_tickets` (migration 015) | ✅ (aliases ❌) | not measured | P3 (provisional) | Review | — | Queued |
| 11 | Overview | `/dashboard`; `DashboardHomepage` (2351) | `/dashboard` → `overview.tsx` (1258) | Metrics from real endpoints | Review pending | `/api/user-stats`, `/api/resumes`, `/api/covers`, `/api/favourites`, `/api/jobs-data` | read-mostly | ✅ | not measured | P3 (provisional) | Review | — | Queued |
| 12 | Resumes & Master CV | `/dashboard/resumes`; `DashboardResumes` (812) | `resumes.tsx` (1753), `resume-builder.tsx` (3935) | Overhauled in DIR-008; proper dialogs | AI suggestions call double-prefixed (§2 #5) | `/api/resumes*`, `/api/users-data/profile`, `/api/export-docx`, `/api/generate-summary` | MariaDB `resumes` | ✅ | not measured | P1 (AI suggestions) | Fix path only (narrow change) | — | Queued |
| 13 | Public Portfolio | `/dashboard/portfolios`, `/portfolio/*`; `DashboardPortfolios` (547) | `/dashboard/portfolio/*`, `/portfolio/*` → `pages/portfolio/*` | All API calls fail | Six double-prefixed calls; module disabled by default (403 `PORTFOLIO_MODULE_DISABLED`); legacy plural route ❌ | `/api/portfolios*` | MariaDB `portfolios` | ❌ | not measured | P1 | Fix paths, module-disabled state, plural alias | — | Queued |

### Deferred backlog (recorded, not started)

| Item | Status and reason |
|---|---|
| Job Intelligence (nav group) | Container for rows 3–5 and Browse Job Portal; no separate surface. |
| Browse Job Portal (`/dashboard/jobs/*`) | Shared with the public `/jobs` portal (`JobsPortalPage`); endpoints match. Deferred: shared component, larger regression surface. |
| Subscription & Plans (`/dashboard/plans` → `/pricing`) | Payment-sensitive (gateways, entitlements). Deferred until payment-provider test credentials exist; no fabricated checkout. |
| Security & 2FA Hub (`settings?tab=security`) | Part of row 9. MFA enrollment needs Firebase TOTP, which is not reachable here; disable/verify flows reviewed with row 9. |
| Master Profile (`settings?tab=profile`) | Part of row 9; real `GET/POST /api/users-data/profile` contract. |

## 5. Cross-cutting findings

| ID | Sev. | Finding | Plan |
|---|---|---|---|
| X-1 | P1 | `auth-provider.tsx` trusts `localStorage.ime_dev_user` in **all** builds. A forged `{ "role": "ADMIN" }` renders authenticated chrome (backend still rejects it). `login.tsx` fabricates a token-less session when preview login fails, and carries hardcoded demo passwords. | C2: accept a stored session only if it carries a well-formed, unexpired `rptest` token; derive identity and role from the token, not from a separate field; validate it with the backend; remove the token-less fallback and the password literals. Production Firebase flow unchanged. |
| X-2 | P1 | With no Firebase configuration, the normal email/password form throws a non-Firebase error, so its preview fallback (keyed on `auth/unauthorized-domain`) never runs. | C2: in that environment, route the form to `/api/auth/preview-login` (which 404s unless the non-production verifier is on) with the typed credentials. |
| X-3 | P2 | Hand-rolled overlays without dialog semantics and native `alert`/`confirm` in cover letters, job tracker, settings, messages | Use the existing Radix dialog primitive (`components/ui/dialog.tsx`) per surface |
| X-4 | P2 | `frontend/playwright.config.ts` defines 375/768/1440 viewports, not the required five profiles | C2: 5-profile config (1920×1080, 1366×768, 1024×768, 390×844, 320×568) against the real backend |
| X-5 | P2 | `frontend/tsconfig.app.json` has `"strict": false` | Recorded. Enabling strict is repo-wide and out of this scope; new and changed code is written strict-clean. |

## 6. Prioritised plan and selection rationale

1. **C2 shared infrastructure.** Sandbox DB bridge (done), auth hardening (X-1/X-2), 5-profile
   Playwright harness with real-backend login and two isolated accounts. These are shared blockers
   for every surface's verification.
2. **Surface 1: Cover Letters & Builder.** Three P0 defects (fabricated content, unsaveable builder,
   id collision). Queue item #1. The data path is fully available in this sandbox.
3. **Surface 2: AI Assistant.** P0 fabricated output shown as AI. The fix is to remove the
   fabrication, use the real contract, and show an honest unavailable state. AI *success* cannot be
   produced here (no provider network or keys) and will be reported as blocked, not simulated.
4. Then by severity and value: Messages (P1 wrong data source) → Resume Builder AI path (P1,
   narrow) → Portfolio paths (P1) → Job Tracker (P2) → Settings (P2) → remaining P2/P3 reviews.
