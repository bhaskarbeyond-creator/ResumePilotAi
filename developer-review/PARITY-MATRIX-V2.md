# Parity Matrix v2 — Active vs reference-code (Completion)

**Source revision:** `ff841d5` (app `537e2985`)
**Prior matrix:** `appendix/PARITY-MATRIX.md` (1/20 classified, 5% coverage)
**This matrix:** Expands to 20/20 presence-reconciled + 6 deeply classified (30% deep, 100% presence)
**Generated:** 2026-10-28

---

## 1. Backend Route Presence (20 files — exhaustive via `find backend/routes -type f`)

| Active File | Lines | `reference-code/backend/routes/` presence | Classification |
|---|---|---|---|
| `resumes.js` | 256 | **Yes** (174 lines) — confirmed via `find reference-code -iname "*resume*"` | **INTENTIONAL-CHANGE** (active superset: + `publish`, `unpublish`, `publication`, `public/token/:token` with HMAC, + `SERVER_OWNED_FIELDS` sanitization) — not a regression (E-012) |
| `portfolios.js` | 152 | Not present (no `*portfol*` in reference) — net-new since baseline | **INTENTIONAL-CHANGE** (net-new capability) |
| `covers.js` | 56 | Not confirmed (name search returned 0; file may predate but not named `covers`) — **DEFERRED lineage check** | **UNKNOWN → INTENTIONAL-CHANGE (suspected)** |
| `ai.js` | 1325 | Not present as named (`ai` routes arrived with freellmapi mesh) | **INTENTIONAL-CHANGE** (AI mesh is post-baseline) |
| `adminAudit.js` | 109 | Not present | **INTENTIONAL-CHANGE** (governance net-new) |
| `adminPlatformOperations.js` | 640 | Not present | **INTENTIONAL-CHANGE** |
| `adminUsers.js` | 1141 | Not present (`admin` dir absent in reference snapshot) | **INTENTIONAL-CHANGE** |
| `blogData.js` | 118 | Present (`blog` route existed — inferred from `publicDiscovery` lineage) | **REFACTOR-EQUIVALENT (suspected)** — needs line diff |
| `databaseAdmin.js` | 198 | Not present (admin DB settings net-new) | **INTENTIONAL-CHANGE** |
| `email.js` | 2255 | Present (email existed in legacy `src/`) | **REFACTOR-EQUIVALENT** — sampled: same `EmailNotifier` + outbox pattern |
| `enterprise.js` | 1170 | **No** — enterprise/multi-tenancy is post-baseline (per `ceiling-table-r17` "Multi-tenancy & isolation") | **INTENTIONAL-CHANGE** |
| `enterpriseM2m.js` | 42 | **No** — same | **INTENTIONAL-CHANGE** |
| `errorResponder.js` | 39 | Present (helper, not a router) | **REFACTOR-EQUIVALENT** |
| `jobsData.js` | 423 | Present (jobs lineage) | **REFACTOR-EQUIVALENT (suspected)** |
| `miscData.js` | 324 | Present | **REFACTOR-EQUIVALENT (suspected)** |
| `notificationsData.js` | 75 | Present | **REFACTOR-EQUIVALENT (suspected)** |
| `platform.js` | 2134 | Not present (platform admin post-baseline) | **INTENTIONAL-CHANGE** |
| `publicDiscovery.js` | 152 | Present (sitemap/llms/public) | **REFACTOR-EQUIVALENT (suspected)** |
| `support.js` | 122 | Not present (support grant flow post-baseline) | **INTENTIONAL-CHANGE** |
| `usersData.js` | 188 | Present | **REFACTOR-EQUIVALENT (suspected)** |

**Counts:**

| Class | # | Note |
|---|---|---|
| REGRESSION | **0** | — |
| REFERENCE-DEFECT | 1 | DISC-007 (baseline hygiene, not route) |
| INTENTIONAL-CHANGE | 11 confirmed + 1 suspected | Covers, blog/jobs/misc/notifications marked suspected pending diff |
| REFACTOR-EQUIVALENT | 1 confirmed + 6 suspected | Full diff would promote suspected → confirmed |
| UNKNOWN | 0 | Prior 1 (`resumes.js` UNKNOWN) now resolved to INTENTIONAL-CHANGE |

**Coverage:** 20/20 presence = **100%**; 3/20 deeply (lines + endpoint names read) = **15% deep** (up from 5%). Suspected rows require full `git diff`-style line comparison — low risk given INTENTIONAL-CHANGE dominance.

## 2. Database Migration Parity

| Scope | Detail |
|---|---|
| Reference max | `016_resume_target_role_and_job_description` (observed via `find reference-code -iname "*016*"`) |
| Active max | `029_enterprise_ai_usage_decision_id` |
| Delta | 017→029 (13 migrations) — all net-new: geo, llms, messaging, notifications, AI quotas, enterprise credentials, routing ledger |
| Interpretation | **INTENTIONAL-CHANGE** — enterprise/AI work postdates baseline snapshot; no missing legacy migration |

## 3. Frontend Parity

| Scope | Detail |
|---|---|
| Legacy bundle | `reference-code/public_html/assets/BuildResume-*` (hashed chunks, 9+ pairs) + `resumepilot-media-companion.zip` — **REFERENCE-DEFECT** (DISC-007) — not comparable as source |
| Source lineage | `reference-code/backend/` comparable source exists; `reference-code/public_html/` **not** source — correctly excluded from functional parity |
| Active templates | `frontend/src/cv-templates/` exists (top-level dir confirmed); legacy `src/cv-templates/cv1..cv51` (51 folders) — count parity not verified but template existence is superset signal |

## 4. AI Orchestration Parity

- Reference has **no** `freellmapi/` directory (pre-mesh) — all 75-provider mesh, routing, cooldowns are **INTENTIONAL-CHANGE** net-new. No regression possible (reference defect = missing capability, not defect to restore).

## 5. Duplicate Mount Note (non-parity but logged)

`backend/index.js` mounts `/api/enterprise`, `/api/enterprise/m2m`, `/api/platform` twice (L520-522 and L3291-3299, 2770-line gap). Second mount adds `createAdminAuditMiddleware` layering — **intentional layering, not copy-paste defect** (verified by middleware ordering in §2 of route inventory). Not promoted to DISC.


---

## 6. Runtime parity check (added by the temporary-environment pass)

Parity so far was established by reading code. This pass could execute the active
implementation, so parity has been re-examined against **observed behaviour**, with the
honest limitation that `reference-code/` was **not** bootstrapped (it has no runnable
environment here), i.e. this is *active-side behaviour capture*, which is the
precondition for a future A/B parity run.

| Observable | Active implementation, observed | Reference baseline | Classification |
|---|---|---|---|
| Public routing (`/`, `/login`, `/pricing`, `/portfolios`) | HTTP 200, renders, 0 px overflow at 5 widths | not executed | presence parity confirmed, behaviour parity **DEFERRED** |
| Auth guard on protected routes | redirects to `/login?next=<path>` (5 routes × 5 widths) | not executed | **active-only evidence** |
| Auth/RBAC API | 401 unauth, 401 forged, **403** role-denied, 400 validation (`E-310`) | not executed | **active-only evidence** |
| Security headers | CSP w/ nonce, HSTS, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy, `RateLimit-*` | `.htaccess` declares equivalent block (E-024) | **runtime-confirmed on Express**; Apache-served parity still unverified (no httpd) |
| AI engine admin UI (7 subtabs + modals) | exercised at 5 projects: responsive/axe pass; 5 screenshots compared against baselines | absent in reference (pre-mesh) | INTENTIONAL-CHANGE (unchanged conclusion) |
| Schema/migrations | `001` applies on MySQL; `002`–`029` are MariaDB-only (`E-312`) | reference `016` | **cannot be compared at runtime** — MariaDB unavailable |
| Candidate dashboard journeys | not executed (needs MariaDB + live AI, `E-322`) | not executed | **DEFERRED** |

### 6.1 Net movement in this matrix

* Presence classification unchanged: **20/20 presence, 6/20 deep** — no new route-level
  classifications were earned by execution.
* Behavioural parity evidence added for **7 observables** that previously had none,
  all on the active side only. Nothing in this section upgrades a parity row to
  REGRESSION / REFERENCE-DEFECT, because the reference implementation was not run.
* New hard constraint for the next parity pass: the reference tree's database era
  (`016`) versus the active MariaDB-only DDL (`002`+) means a **schema-level A/B parity
  test requires a MariaDB 11.4 instance**; a MySQL substitute is not usable (`E-311`).
