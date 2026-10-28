# Browser & UI Runtime Verification Report

**What this replaces:** the previous audit's blanket statement that "no browser,
Lighthouse, axe-core, or screenshot tooling was executed" (`UI-UX-AUDIT.md`,
`appendix/ENVIRONMENT-GAPS.md` EG-002). A real Chromium **was** driven against the
real application in this pass; everything below is observed behaviour, and the
areas that remain untested are listed in §7 rather than glossed over.

| Field | Value |
|---|---|
| Browser | Chromium **149.0.7827.0** (`@sparticuz/chromium@149.0.0`, brotli-decoded from the npm tarball) |
| Driver | Playwright **1.64.1** |
| App under test | `frontend/` served by the repository's own `npx vite` dev server on `:4000` (and a second instance on `:5173` for one spec that hardcodes that port) |
| API under test | `backend/index.js` (Express 5.2.1) on `:8080`; repository in **in-memory** mode and in **MySQL-5.7-substitute** mode (see manifest §5) |
| Audit spec | `developer-review/tools/audit-browser-verification.spec.ts` (audit-only, app untouched) |
| Raw data | `Evidence/artifacts/browser-observations.json`, `Evidence/artifacts/axe-violation-details.json` |
| Screenshots | `Evidence/screenshots/` — **45 full-page PNGs**, 9.3 MB |
| Logs | `Evidence/logs/playwright-*.log`, `Evidence/logs/pw/*.log` |

---

## 1. Viewport matrix executed (mandated widths)

| ID | Dimensions | Device profile |
|---|---|---|
| `375x667-mobile` | 375 × 667 | small phone (mandated) |
| `390x844-mobile` | 390 × 844 | modern phone (mandated) |
| `768x1024-tablet` | 768 × 1024 | tablet portrait (mandated) |
| `1440x900-desktop` | 1440 × 900 | desktop (mandated) |
| `1920x1080-ultrawide` | 1920 × 1080 | ultrawide (mandated) |

Additionally the repository's own engine matrix was exercised at
**360×640, 768×1024, 1280×800, 1920×1080, 3840×2160** (`mobile/tablet/desktop/laptop/4k`)
through `tests/engine-responsive.spec.ts`.

## 2. Workflows exercised per viewport (9 × 5 = 45 executions, **45 passed**)

| Workflow | Route | Auth | HTTP | Horizontal overflow | Result |
|---|---|---|---:|---:|---|
| `landing` | `/` | none | 200 | 0 px | PASS |
| `login` | `/login` | none | 200 | 0 px | PASS |
| `pricing` | `/pricing` | none | 200 | 0 px | PASS |
| `candidate-dashboard` | `/dashboard` | dev shim | 200 → redirect `/login?next=%2Fdashboard` | 0 px | PASS (auth guard) |
| `admin-console` | `/admin` | dev shim | 200 → redirect `/login?next=%2Fadmin` | 0 px | PASS (auth guard) |
| `ai-settings-providers` | `/admin/ai-settings?subtab=providers` | dev shim | 200 → redirect | 0 px | PASS (auth guard) |
| `resume-builder` | `/build-resume` | dev shim | 200 → redirect | 0 px | PASS (auth guard) |
| `portfolios` | `/portfolios` | none | 200 | 0 px | PASS |
| `settings-support` | `/dashboard/settings?tab=support` | dev shim | 200 → redirect | 0 px | PASS (auth guard) |

**Zero horizontal overflow at every viewport** (max measured `scrollWidth - clientWidth`
= **0 px** across all 45 captures) and **zero uncaught page errors**.

Rendered content at the mandated widths (mean body text length): landing 2,353 chars,
pricing 3,798 chars, login/redirect 349 chars, portfolios 232 chars — i.e. the
public pages render real content, while protected routes render the login shell
because the router guard rejected the `localStorage.ime_dev_user` shim (see §6).

## 3. Network and console observations (genuine, not filtered)

| Observation | Count | Interpretation |
|---|---:|---|
| `GET https://fonts.googleapis.com/css2?family=Cinzel…Inter…Merriweather…` → `net::ERR_CONNECTION_CLOSED` | **90** (10 per workflow run × 5 viewports × … ) | Sandbox network blocks Google Fonts. **Environment artifact**, not an app defect. Consequence: text renders with fallback fonts — this is also the cause of the visual-regression deltas in §5. |
| `502 (Bad Gateway)` from the Vite `/api` proxy | 5 (portfolios workflow only) | Expected: that capture ran before the Express API was started. After the API was started, the same routes returned 200/expected statuses. |
| `pageerror` (uncaught JS exceptions) | **0** | No runtime crash on any exercised route/viewport. |
| Horizontal overflow | **0 px** everywhere | Layout containment verified at all mandated widths. |

## 4. Accessibility — 5 real WCAG 2.1 AA violations found (axe-core 4.14.0)

axe tags: `wcag2a, wcag2aa, wcag21a, wcag21aa`. Reproduced identically at 375×667
and 1440×900 (i.e. viewport-independent), captured in
`Evidence/artifacts/axe-violation-details.json` with selectors, HTML and contrast
numbers.

| ID | axe rule | Impact | Nodes | Source anchor | Failure detail |
|---|---|---|---:|---|---|
| A11Y-001 | `aria-prohibited-attr` | serious | 3 | `frontend/src/pages/landing.tsx:239` | `<div class="flex gap-1 text-warning-500" aria-label="5 star rating">` — `aria-label` on a `div` with no valid role; screen readers ignore it (testimonial star ratings become unlabelled) |
| A11Y-002 | `label-content-name-mismatch` | serious | 2 | `frontend/src/pages/landing.tsx:79`, `:296` | Logo link `aria-label="IME365 Home"` while its visible text is not contained in that name → voice-control users cannot activate it by visible label |
| A11Y-003 | `button-name` | **critical** | 1 | `frontend/src/pages/billing/pricing.tsx:264-272` | Billing-period `role="switch"` button has no accessible name (`aria-checked` present, no `aria-label`/`aria-labelledby`) |
| A11Y-004 | `color-contrast` | serious | 4 | `frontend/src/pages/billing/pricing.tsx:285` (3.16:1, `#009966` on `emerald-500/10`) and `:335` (2.45:1, `text-ink-muted/60` on surface) | Below the 4.5:1 AA threshold for normal text |
| A11Y-005 | `scrollable-region-focusable` | serious | 1 | `frontend/src/pages/billing/pricing.tsx:384` | `overflow-x-auto` comparison table cannot be scrolled by keyboard |

### 4.1 What the repository's own accessibility suite also says (59 tests, all passing)

`frontend/tests/accessibility.spec.ts` (unmodified) → **59/59 pass** across
Public Landing, Candidate Dashboard, Employer Portal, Admin Console and Enterprise
Console at 375/768/1440, including landmark/heading/ARIA structure assertions and
its own axe runs. Note the honest tension: **its axe assertions are conditional**
(`if violations serious/critical exist` only on some surfaces), so a green result
there does not contradict A11Y-001…005 — those are on the landing testimonials and
the pricing page, which that suite does not deep-scan at node level. Both results
are true and are reported side by side.

## 5. Visual regression against the committed baselines

`tests/engine-responsive.spec.ts` compares five full-page screenshots
(`ai-settings-{providers,discovery,metrics,unified-gateway,playground}.png`) against
the **committed** Linux baselines in `frontend/tests/engine-responsive.spec.ts-snapshots/`
(25 committed files: 5 views × 5 projects), with `maxDiffPixelRatio: 0.01`.

Result: **20 of 20 comparisons failed**, deltas **3 %–7 %** of pixels.

### 5.1 A methodology error I made and corrected (disclosed deliberately)

A first attempt drove the suite through a single project named `audit-chromium`.
Because the repository's `snapshotPathTemplate` includes `{projectName}`, Playwright
did not *compare* anything — it wrote five **new** `*-audit-chromium-linux.png`
baselines and reported "passed". That is a fabricated pass and it was rejected:
the five generated PNGs were deleted, `developer-review/tools/playwright.audit.config.ts`
was rewritten to reproduce the repository's exact project names
(`mobile`, `tablet`, `desktop`, `laptop`, `4k`), viewports and
`snapshotPathTemplate`, and the suite was re-run. Only the re-run is reported here,
and `git status` confirms no new files were written into the app's snapshot
directory.

### 5.2 Classification of the 20 failures

`ENVIRONMENT-ATTRIBUTABLE (font substitution)` — the baselines were produced in an
environment with Google Fonts access; here `fonts.googleapis.com` is blocked
(§3), so Inter/Merriweather/Cinzel/Fira Code fall back to metric-different local
fonts, which perturbs text rendering across the whole page (a 3–7 % pixel delta is
consistent with text-only reflow, not with structural breakage).
**Not established as a product regression**, and **not dismissed either**: it
cannot be resolved in this sandbox. Follow-up: re-run `engine-responsive.spec.ts`
with font access (or with the fonts served locally) before treating the baselines
as current. Recorded as `GAP-B2`.

Everything **non-visual** in that suite passed: responsive containment limits,
above-the-fold CTA visibility, modal reflow and the per-viewport axe checks.

## 6. Authenticated journeys — what actually authenticated, and what did not

| Mechanism | Result |
|---|---|
| `localStorage.ime_dev_user` (the shim used by the repo's accessibility spec) | **does not** authenticate the router. `frontend/src/lib/preview-session.ts` exposes `PREVIEW_SESSION_KEY='ime_dev_user'`, consumed by `preview-modal.tsx`, `dashboard/resumes.tsx`, `export/cv-renderer.tsx` — not by the auth guard. Consequence: the 5 protected routes correctly redirected to `/login?next=…`. |
| `POST /api/auth/preview-login` (the app's own non-production identity issuer, gated on `TEST_AUTH_HMAC_SECRET` + `NODE_ENV !== production`) | **works**: `200`, `role=SUPER_ADMIN`, 323-char signed token; the token then authorises `GET /api/admin/ai-settings` (200) while a CANDIDATE token receives **403** and a forged token **401** (§4.1 of `TEST-EXECUTION-REPORT.md`). |
| Real Firebase sign-in | **not exercised** — no credentials; Firebase Admin ran in "limited local mode". |

Consequently the AI-settings surfaces **were** exercised in a browser through the
repository's own specs (`engine-security`, `engine-responsive`, `freellmapi-admin-e2e`)
using that bearer path, at 5 viewports, with no API mocking in
`engine-security` / `freellmapi-admin-e2e`.

## 7. Explicitly untested UI areas (do not read as verified)

| Area | Why |
|---|---|
| Real sign-in / sign-up against Firebase (email, OAuth Google/GitHub/LinkedIn) | no identity provider credentials |
| `/dashboard/*` data surfaces after real login (job tracker CRUD, resume upload, cover letters, interviews, messages, notifications) | `tests/candidate/*` requires Express + MariaDB + live AI; 3 of 175 sampled tests failed/timed out and the run was stopped (`TEST-EXECUTION-REPORT.md` §10.2) |
| `/employer`, `/org` (enterprise tenancy) consoles | need enterprise tables from migrations 002+ |
| Billing checkout completion (Stripe/PayPal/Razorpay/Paytm redirects) | requires live/sandbox gateway keys; only the pricing page + local checkout modal render path was exercised |
| Admin console tabs other than AI settings | need MariaDB-backed admin data |
| Upload/parse of real PDF/DOCX resumes | needs storage + parsing service |
| Screen-reader verification with a real AT (NVDA/JAWS/VoiceOver), keyboard-only traversal beyond axe's static rules | no AT available in this environment; axe is a rule engine, not a user |
| Lighthouse performance metrics | not installed; blocked-network environment would invalidate the numbers anyway |

## 8. Net effect on the audit

* `R-034` (accessibility/responsiveness/forms/modals) — was **BLOCKED**, now
  **PARTIAL**: runtime axe + viewport + modal/reflow evidence exists, with the
  five concrete violations above as findings.
* `R-035` (viewport testing at 375/390/768/1440/1920) — was **BLOCKED**, now
  **PASS** for the reachable surfaces (45/45 executions, 0 px overflow), PARTIAL
  overall because authenticated data surfaces could not be reached.
* `EG-002` (no browser/accessibility tooling) — **CLOSED (superseded)**; replaced by
  the sharper, smaller gaps in §7 and `GAP-B1/GAP-B2`.
* New findings: **A11Y-001 … A11Y-005** (5 WCAG 2.1 AA defects, 1 critical).
