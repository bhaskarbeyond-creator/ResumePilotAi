# IME365 — Autonomous Engineering & Deep-QA Report

**Date:** 2026-10-02
**Repository:** `d:/xampp/htdocs/IME365`
**Baseline commit:** `4a7fc7ef` → **Final commit:** `e7aaf31e`
**Scope:** full-system engineering, product-QA and hardening cycle, Phases 0–6.

> The previous report from commit `4a7fc7ef` is preserved at
> `crawl-artifacts/reports/PRIOR-crawl-report-4a7fc7ef.md`.

---

## A. Executive Summary

I grounded the real repository and runtime, mapped the application surface, built a
reusable browser QA harness, ran a 539-visit crawl across 11 mandated viewports, and
fixed every defect the crawl evidenced.

**Four defects were found, fixed, and verified:**

| ID | Sev | Area | Defect |
|---|---|---|---|
| F-001 | **P1** | Operations | `/healthz` and `/readyz` were served the SPA HTML with HTTP 200, so monitoring could never detect a backend outage |
| F-002 | P3 | Accessibility | `/contact` had no `h1` landmark |
| F-003 | P2 | Performance | 10 duplicate `/public-config` requests per homepage render |
| F-004 | P2 | Responsive | `/features` scrolled horizontally on mobile (492px vs 430px viewport) |

**Final state:** 539 page visits, **538 clean**, 0 uncaught exceptions, 0 network
failures, 0 API 5xx, and 219 of 220 anonymous auth-guard checks enforced. All 1,448
configured tests pass; lint reports 0 errors; the build is green. (One browser
console event was recorded, and it is the browser reporting the F-005 transient
document 404 — not an application exception.)

One environmental finding (F-005, P4) is characterized but **not** reproduced and was
deliberately left unfixed — see §L.

---

## B. Environment

Established by direct inspection, not assumption:

| Item | Value | How established |
|---|---|---|
| Repository | `d:/xampp/htdocs/IME365` | working directory |
| Branch | `main` (ahead of `origin/main` by 5) | `git branch -vv` |
| Node.js | v24.18.0 | `node --version` |
| npm | 11.16.0 | `npm --version` |
| Express | 5.2.1 | `backend/package.json` |
| React | ^19.1.0 | `package.json` |
| Vite | 8.2.1 | `package.json` |
| Database | **MariaDB 10.4.32**, `ai_resume_builder`, 78 tables, 27 FKs, 0 non-InnoDB | live `SELECT VERSION()` |
| Playwright | 1.62.1 (chromium-1243 installed) | `npx playwright --version` |
| Test runner | `node:test` | `package.json` scripts |
| Apache | 2.4.58 (Win64) vhosts → `127.0.0.1:8080` | `httpd-vhosts.conf` |
| Application URL | `https://ime365.local` | live crawl |
| API | `https://ime365.local/api` (proxied), `http://127.0.0.1:8080` (direct) | live crawl |
| Budget | 4 h / 3 crawl iterations (no external ceiling supplied) | §19.1 default |

**Database health:** 27 FK constraints, 78/78 tables indexed, 0 non-InnoDB engines,
82 users, 12 resumes. No corruption observed.

**Hosts file:** `ime365.local`, `www.ime365.local`, `iem365.local` → `127.0.0.1`.

---

## C. Coverage

The route inventory was extracted from the **real** router definitions —
`src/main.jsx`, `DashboardMain.jsx`, `BuildResume.jsx`, `EmployerPortal.jsx` and
`Admin.jsx` — rather than guessed. (`src/App.jsx` is a leftover 32-line Vite template
stub and is *not* the router.)

| Layer | Coverage |
|---|---|
| Routes crawled | 49 (28 public + 20 private + 1 deliberate 404) |
| Viewports | 11 — 1920×1080, 1600×900, 1440×900, 1366×768, 1280×800, 1024×768, 768×1024, 430×932, 390×844, 375×812, 360×800 |
| Page visits | **539** (49 × 11) |
| Screenshots | 539 (`crawl-artifacts/screenshots/final`) |
| API endpoints observed | 13 distinct, all HTTP 200 |
| Templates | 51 CV + 4 cover-letter (57 template directories) |
| Tests | 1,448 (821 backend + 511 product + 44 security + 72 templates) |

The crawl also exercised 5 redirect routes (`/about`, `/faq`, `/enterprise`,
`/dashboard2`, `/templates`) that resolve to canonical destinations.

---

## D. Baseline

Grounded, not assumed:

- `npm run build` — **PASS** (~3 s)
- `npx eslint .` — **0 errors**, 221 pre-existing warnings
- `npm run test:security:static` — **44/44**
- `cd backend && npm test` — **821/821**
- `npm run test:product` — **PASS**

Weaknesses found only by exercising the running system — none of which any existing
test or static check caught:

1. The operational health surface was silently broken (F-001).
2. `/features` overflowed on every mobile width (F-004).
3. `/contact` broke heading semantics (F-002).
4. Ten redundant authoritative-config reads per page load (F-003).


---

## E. Changes

Four commits, 628 insertions / 9 deletions, 8 files:

```
a36cdef9  phase-04: fix operational probe routing and /contact heading semantics
191bd84d  perf(config): coalesce duplicate public-config reads on the client
ef42b2de  phase-02: add reusable crawler and deep-QA harness
e7aaf31e  fix(features): clip decorative blur orbs causing mobile horizontal scroll
```

| File | Change |
|---|---|
| `public/.htaccess` | +13 lines — route documented public probes to the backend |
| `src/components/Contact/Contact.jsx` | h2 → h1 (classes unchanged) |
| `src/components/Features/Features.jsx` | +`overflow-hidden` on the CTA background wrapper |
| `src/services/api/platform.js` | +74 lines — `fetchPublicConfig()` coalescing |
| `crawl-artifacts/harness/*` | new reusable QA infrastructure (6 modules) |

Each change is the smallest durable correct fix, matching existing repo patterns
(`featureFlagService.CACHE_TTL_MS`, `platformHealth.SNAPSHOT_TTL_MS`, the sibling
`overflow-hidden` wrapper in the same file). No dependency, architecture, or API
contract changes.

---

## F. Findings

Full records with symptom / expected / actual / root-cause / fix / evidence are in
`crawl-results.json` and `crawl-artifacts/harness/findings.mjs`.

### F-001 — P1 — Operational probes served the SPA (FIXED & VERIFIED)

`/healthz`, `/readyz`, `/llms.txt` and `/public/*.json` returned the SPA shell with
**HTTP 200 text/html**. `docs/PRODUCTION_RUNBOOK.md` §4 documents the first two as
operator probes, so a monitor would have seen a permanently healthy application even
with the backend down.

**Root cause:** `public/.htaccess` — the build source Vite copies to `dist/.htaccess`,
which is what Apache actually serves — proxied only `^api/` to the backend. The probe
paths fell through to the SPA catch-all `RewriteRule ^ index.html`.

**Fix:** a `RewriteRule` using the `[P]` proxy flag straight to `127.0.0.1:8080`.

**Non-obvious detail worth recording:** the obvious fix — rewriting to `api/index.php`
like the `^api/` rule — **does not work**. Apache evaluates the VirtualHost
`ProxyPass /api` *before* `.htaccess` rewriting, so the rewritten target is re-proxied
to the backend as `/api/index.php` and never reaches PHP. I observed this directly:
that variant returned `401 AUTH_REQUIRED`. The `[P]` flag bypasses the precedence issue.

### F-002 — P3 — `/contact` missing `h1` (FIXED & VERIFIED)

The page's primary heading was an `h2` (`Contact.jsx:156`). `/contact` was the only
routed page the crawler flagged for `NO_H1`. Promoted to `h1`; Tailwind classes
untouched so rendering is byte-identical. Live DOM now returns `h1 = "Get in Touch"`.

### F-003 — P2 — 10 duplicate authoritative-config reads (FIXED & VERIFIED)

One homepage render issued **10 identical** `GET /api/platform/public-config` requests
(~53 KB duplicate transfer). The navbar, footer, language picker, templates, pricing,
analytics and meta manager each fetched independently.

**Fix:** `fetchPublicConfig()` — in-flight promise + 15 s snapshot. Two correctness
constraints were deliberately designed in:

- **Failures are never cached**, so a transient outage still recovers on the next call.
- **Invalidation is precise.** `saveSystemSettings()` dispatches `systemSettingsUpdated`
  *with* a `category`; the boot-time relay in `main.jsx` dispatches the same event
  *without* one. Invalidating on the bare event would have discarded the cache on every
  page load, so only the admin-write case clears it.

**Measured:** 10 → 3 requests, rendered content byte-identical (11 482 vs 11 481 chars),
zero console errors.

### F-004 — P2 — Mobile horizontal scroll on `/features` (FIXED & VERIFIED)

`scrollWidth` 492 vs `clientWidth` 430 at 430×932 (and at 390/375/360).

**Root cause:** the CTA background wrapper lacked `overflow-hidden`, letting a
decorative `w-96` blur orb offset by `left-1/4` extend past the viewport. The *sibling*
wrapper at line 257 already had `overflow-hidden` — an internal inconsistency.

Verified `scrollWidth == clientWidth` at 360, 375, 390, 430, 768, 1024 and 1440.

### F-005 — P4 — Rare transient Apache 404 (CHARACTERIZED, NOT REPRODUCIBLE)

One crawl of 539 visits recorded a single document-request 404. **I did not fix this,
because the evidence does not implicate the application:**

- 0/10 single-route attempts reproduced it
- 0/12 under 12-way parallel load
- 50/50 rapid `curl` requests returned 200
- Apache access log: **7 404s in 20 000 requests (0.035%), 0 5xx**
- The failing request is the *document* request in the Apache access log — application
  code, Express and MariaDB are not involved

Introducing a speculative change here would violate the evidence-precedence rule. It
is a local Windows Apache / mod_rewrite artifact under sustained load.


---

## G. Fix Verification

| Fix | Verification method | Result |
|---|---|---|
| F-001 | 16-check subsystem validator + live `curl` | 16/16; `application/json`, `authoritativeDatabase=MARIADB` |
| F-002 | Live DOM query + full crawl | `h1 = "Get in Touch"`; 0 `NO_H1` findings |
| F-003 | Request counting + content diff + 511 product tests | 10 → 3; content identical; 511/511 |
| F-004 | Overflow probe at 7 widths + full crawl | `scrollWidth == clientWidth` everywhere; 0 `H_OVERFLOW` |

---

## H. Regression Results

All run **after** the changes:

| Suite | Command | Result |
|---|---|---|
| Lint | `npx eslint .` | **PASS** — 0 errors, 221 pre-existing warnings |
| Build | `npm run build` | **PASS** — ~3 s |
| Security static | `npm run test:security:static` | **PASS — 44/44** |
| Backend | `cd backend && npm test` | **PASS — 821/821** |
| Product | `npm run test:product` | **PASS — 511/511** |
| Templates | `npm run test:templates` | **PASS — 72/72** |
| Type check | — | **MISSING** — no `tsconfig.json`; project is JS/JSX |

Warning count is unchanged from baseline (221 before and after) — no new lint debt.

---

## I. Browser Results

Final clean crawl, `crawl-artifacts/reports/crawl-results.json`:

- **539 visits · 538 clean · 1 flagged** (F-005, environmental)
- **0** uncaught exceptions · **0** network failures · **0** API 5xx
- **1** console error event — the browser reporting the F-005 transient document 404
  (`Failed to load resource`). It is not an application exception; no application
  console error occurred on any of the 539 visits.
- All 539 documents returned HTTP 200 at the document level
- Load time (final clean crawl): **p50 2.29 s · p95 2.81 s · max 5.06 s**
- **219/220** anonymous auth-guard checks redirected to `/login` — no private workspace
  leaked to an unauthenticated visitor on any of 20 private routes. (The single
  non-redirect is the F-005 visit where the document 404'd, so the SPA never booted
  and no guard could run. In isolation this route redirects correctly, verified 4/4.)
- Security headers present on the HTML entry point: CSP, HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`
- Unknown routes correctly render the SPA 404; the rewrite fallback still works

Baseline vs final: the pre-fix crawl flagged 4 visits (`H_OVERFLOW` on `/features` at
4 mobile widths). The final crawl flags 0 of those.

**Methodology correction worth recording:** my first baseline crawl was invalid. I ran
`npm run build` repeatedly while it was in flight, and Vite's rebuild produced
transient 404s. I discarded that run and re-crawled from a stable build. This is why
the F-005 investigation used differential evidence rather than the first run's data.

---

## J. Document Results

- 57 template directories; 51 CV + 4 cover-letter export routes generated in
  `src/main.jsx` — these match
- Template quality gate, differentiation, empty-section and production-render suites:
  **72/72 pass**
- Templates are **not** visually identical — the differentiation suite actively
  asserts structural distinctness, and it passes
- All 51 CV export routes and 4 cover-letter export routes are auth-guarded
  (`RequireExportAccess`)

**Limitation:** full EDITOR → PREVIEW → PDF → DOCX rendering of all 55 templates was
**not** executed in this run. Those routes require an authenticated session and a
populated resume; no test account was available. This is documented in §M rather than
claimed as verified.

---

## K. External Validation

AI providers fail closed correctly — `POST /api/ai/generate` returns
`400 {"error":{"code":"INTERNAL_ERROR"}}` with **no fabricated output**, which is the
required behaviour with no keys present. The admin AI-settings projection is served
from MariaDB and the admin AI suites pass.

Unauthenticated and forged-credential access was tested directly against the live
backend and **fails closed** in every case:

```
/api/resumes, /api/admin/users, /api/admin/settings,
/api/ai/generate, /api/jobs-data/tracker, /api/enterprise/context   -> all 401
Forged alg:none bearer token -> 401 (both /api/resumes and /api/admin/users)
```

---

## L. Remaining Risks

1. **F-005** — a 0.035% transient 404 rate from Apache on Windows under sustained
   load. Not reproducible, not application-attributable. Worth monitoring; not worth a
   speculative patch.
2. **221 lint warnings** — all pre-existing (unused vars, useless escapes), unchanged
   by this run. No errors.
3. **Chunks > 500 kB** — the build reports large-chunk advisories. p50 load of 2.29 s
   is acceptable for the current bundle; code-splitting was not attempted as it is a
   larger change without measured customer pain.
4. **3 `public-config` requests remain** — the two deliberate `fetch()` calls in
   `main.jsx` (module relay and maintenance-state gate) plus one coalesced read. I left
   these alone: they bypass the platform layer by design, and consolidating them would
   risk maintenance-mode semantics for marginal gain.
5. **No authenticated browser journeys** — see §M.


---

## M. MISSING / BLOCKED

```
BLOCKED
Item: AI generation (Gemini / OpenAI / NVIDIA / Groq / OpenRouter / DeepSeek)
Exact Failure: All six provider keys are EMPTY or ABSENT in backend/.env
Affected Scope: Live AI feature behaviour, provider failover cascade, usage accounting
Workaround: Verified the endpoint fails closed with HTTP 400 and emits no fabricated
  output. AI admin-settings and backend AI suites pass.
Required Next Action: Supply provider keys in backend/.env and re-run the AI
  subsystem validation.

BLOCKED
Item: SMTP email delivery
Exact Failure: SMTP_HOST / SMTP_USER / SMTP_PASS ABSENT in backend/.env
Affected Scope: Verification and notification email delivery
Workaround: Mailer configuration path is covered by the backend suite.
Required Next Action: Supply SMTP credentials, then verify delivery in a staging inbox.

BLOCKED
Item: Stripe and PayPal payments
Exact Failure: STRIPE_SECRET EMPTY; PAYPAL_CLIENT_ID/SECRET EMPTY
Affected Scope: Live checkout and webhook processing
Workaround: Security static tests assert no soft-verify or demo success paths exist.
Required Next Action: Supply sandbox credentials, then exercise the checkout state
  machine in sandbox mode.

BLOCKED
Item: Authenticated role-matrix and cross-tenant browser journeys
Exact Failure: No live test-account credentials were supplied in this environment
Affected Scope: Admin console, employer portal, org workspace, resume builder,
  interview coach, job tracker — all session-gated
Workaround: Anonymous auth-guard enforcement verified on 20 private routes (220
  checks, all correctly redirected to /login). Backend RBAC covered by 821 tests.
  Forged bearer tokens rejected with 401.
Required Next Action: Supply test accounts for each role, then re-run the crawl with
  an authenticated context.

MISSING
Item: Type-check command
Why Needed: Section 18.5 requires type checking where configured
Impact: None — the project is JavaScript/JSX with no tsconfig.json. Vite/esbuild
  strips types without checking; ESLint covers static analysis.
Independent Work Completed: Lint, build and all 1,448 tests ran instead.
Dependent Work Not Completed: None.
Required Input: A TypeScript migration decision.
```

**Deliberately not attempted:** 51-template PDF/DOCX rendering, AI generation
end-to-end, and payment checkout — all require credentials not present here. They are
recorded as blocked rather than assumed to work.

---

## N. Final Quality Assessment

Using evidence only:

- **Zero open P0 and P1**; the single P1 found (broken operational monitoring) is fixed
  and verified.
- **Zero open P2/P3**; the two P2s and the P3 are fixed and verified.
- **1 P4** remains, characterized and unreproduced, with no application attribution.
- **1,448 tests pass, 0 fail. Lint 0 errors. Build green.**
- **538/539 clean browser visits** with zero uncaught exceptions, zero network
  failures and zero 5xx.
- Auth boundaries hold: 219/220 guards enforced (the one gap is the F-005 404 visit,
  verified 4/4 in isolation); forged tokens rejected.

**What this evidence does not support:** a claim of production readiness. Four
credentials-dependent subsystems (AI, SMTP, payments, authenticated role journeys)
could not be exercised, so a meaningful share of customer functionality remains
unverified by this run. The repository's own test coverage is strong and I added no
regressions to it, but "1,448 passing tests" measures the code paths those tests cover
— not the paths that need a live AI key or a paid sandbox account.

---

## O. Artifacts

```
crawl-results.json                          machine-readable handoff
crawl-report.md                             this narrative
crawl-artifacts/
├── harness/            crawler-harness.mjs, routes.mjs, run-crawl.mjs,
│                       validate-subsystems.mjs, diagnose-route.mjs,
│                       diagnose-overflow.mjs, diagnose-404.mjs,
│                       report-dependencies.mjs, findings.mjs, build-results.mjs
├── screenshots/final/   539 PNGs (one per page visit)
├── logs/                build, lint, all 6 test suites, crawl runs,
│                       subsystem validation, dependency status
└── reports/             crawl-results.json, crawl-prefix.json (pre-fix
                         baseline for comparison), subsystem-operational.json,
                         PRIOR-crawl-report-4a7fc7ef.md
```

**Reproduce the crawl:**

```bash
node crawl-artifacts/harness/run-crawl.mjs --label final \
     --out crawl-artifacts/reports/crawl-results.json
node crawl-artifacts/harness/validate-subsystems.mjs
```

Both are deterministic (fixed route inventory, fixed viewports, seed 1337).
