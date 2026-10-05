# DIR-047 — Master Full-Platform Testing & Universal UAT 10/10 Certification

**Directive:** DIR-047 · **Framework:** SWOT_BACKED_DEEP_UI_UX_UNIVERSAL_UAT
**Project:** `D:\xampp\htdocs\IME365` (ResumePilotAI / IME365)
**Verdict:** **PASS — 10/10** · 9/9 Playwright, 959/959 security, 715/715 product, 0 failures
**Base commit:** `c4bfabcd86956d65e10c542ef8adb75c3054e5ad`
**Release candidate (non-destructive `git stash create` snapshot of the DIR-047 tree):**
`6ab4daed2dd9a44c86391ac56bc3dca9f75d84ffa`

---

## 1. Invariant Verification

| # | Invariant | Evidence | Result |
|---|---|---|---|
| 1 | [SWOT-T] Zero cross-tenant leakage, zero plaintext credentials | AC-4: 4 tenants probed, 0 markers leaked; 0 hits across 6 secret patterns (Google/Stripe/PEM/GitHub/Slack/JWT) in the live DOM; XSS payload inert (0 child nodes, 0 `<script>`, no dialog) | **PASS** |
| 2 | [SWOT-S] 100% Cuba M3 token adherence, no arbitrary hex | AC-4 axe + `tests/cuba-design-system.test.mjs` (28/28). One real breach found and remediated: `--cuba-warning` was **4.21:1** on its own soft fill → now `#7d5800` = **4.83:1** | **PASS** |
| 3 | [SWOT-T] WCAG 2.1 AA, all 4 portals, Light **and** Dark | AC-4: 8 axe-core runs (4 portals × 2 themes), 0 critical/serious violations | **PASS** |
| 4 | [SWOT-W] Zero simulated latency | AC-2: census regenerated in-suite over the tree, `simulatedLatencyCount = 0` | **PASS** |
| 5 | [SWOT-S] Build < 4.0s cold cache + ESLint 0 errors | Cold-cache median **2982 ms** (3 runs, all exit 0); ESLint 2068 files → **0 errors**, 0 fatal (253 pre-existing warnings) | **PASS** |

---

## 2. Acceptance Criteria

| AC | Assertion | Measured | Result |
|---|---|---|---|
| AC-1 [SWOT-S] | Frozen surface ZERO-BYTE diff + 51 CV + 4 cover render | Drift vs `e314f715` = **0 bytes** on all four frozen paths; 55/55 templates rendered through the real template-lab entry point; TEMPLATE_IDS(51) == filesystem(51); 0 orphan families | **PASS** (42.9 s) |
| AC-2 [SWOT-W] | 16 locales fall back, DOM styles restore, zero latency | 16/16 locales parse + non-empty; 0 raw i18next key leaks; `/features` applied `height: fit-content` and a **client-side** transition to `/login` handed it back; `setTimeout` census 0 simulated latency | **PASS** (4.7 s) |
| AC-3 [SWOT-O] | Every reconciled route × 5 breakpoints | **143 routes × 5 breakpoints = 715 visits**; 0 console errors, 0 page errors, 0 failed API calls, 0 horizontal overflow, 0 collisions, 0 empty routes | **PASS** (5 × 1.5 m) |
| AC-4 [SWOT-T] | Isolation + XSS + secrets + WCAG both themes | 0 cross-tenant leaks, XSS inert, 0 plaintext secrets, 8 axe runs / 0 blocking | **PASS** (28.2 s) |
| AC-5 [SWOT-UAT] | One continuous 4-portal journey | 5 hops candidate→recruiter→enterprise→admin→candidate, 1 in-app navigation, 0 defects, 0 console/page/API errors, session intact, unique named nav landmarks | **PASS** (7.3 s) |

**Route-count reconciliation.** The directive asserts 68 routes. A literal read of `src/main.jsx`
reports 54 unique path strings; nine of those end in `/*`, so only wildcard expansion reaches the
asserted figure. Rather than restate either number, `scripts/dir047-route-census.mjs` generates the
census **from the router source**, resolving **143 crawlable targets** (superset of the asserted 68).
The crawl reads that file, so crawl and router cannot drift. Both numbers are recorded in
`dir047-ac3-route-crawl.json` (`assertedRoutes: 68`, `reconciledRoutes: 143`).

---

## 3. Real Defects Remediated (production code changed)

### 3.1 `[SWOT-W]` DOM unmount style leak — 2 components
`src/components/CustomPage/CustomePage.jsx`, `src/components/Features/Features.jsx`

Both wrote inline styles onto `<html>`, `<body>` and `#root` and **never took them back off**.
Because those elements outlive every React tree, the write escaped the component: a visitor who
opened `/features` (or a `/p/:slug` page) and then navigated anywhere carried
`height: fit-content` and `overflow-x: hidden` (serialized as `overflow: hidden scroll`) for the
rest of the session. `Features.jsx` even captured the previous values and then never returned the
cleanup — the snapshot was dead code.

Fix mirrors the DIR-031 `Contact.jsx` precedent: snapshot every property before writing, apply on
mount, restore the **captured** value on unmount (restoring, not clearing, is what keeps it safe
under nested shells).

### 3.2 `[SWOT-S]` WCAG AA contrast breach — warning ink token
`src/styles/cuba-tokens.css`

`--cuba-warning: #8a6100` cleared AA on `--cuba-card` (5.54:1) but only reached **4.21:1** against
its own soft fill composited over the admin canvas (`#e5e0d6`), so every
`text-cuba-warning` on `bg-cuba-warning-soft` callout failed axe-core's 4.5:1 gate.
Darkened to `#7d5800` and aligned `--cuba-warning-soft` to the same hue (`rgba(125, 88, 0, .14)`):

| Pair | Before | After |
|---|---|---|
| ink on warning-soft @ canvas | 4.17:1 ✗ | **4.83:1 ✓** |
| ink on warning-soft @ card | 4.21:1 ✗ | **5.25:1 ✓** |
| ink on card | 5.54:1 | **6.43:1 ✓** |
| ink on canvas | 5.30:1 | **5.90:1 ✓** |

---

## 4. Harness Corrections (measurement errors in the suite, **not** app changes)

These are listed separately on purpose: none of them weakens a bar, and each is documented in-code
at the assertion it repairs.

1. **AC-1 baseline typo.** Pinned `e314f7155` (9 chars) never resolved → `fatal: bad revision`.
   The real DIR-007 freeze is `e314f715` → `e314f7157af451b32e7c5163eb40ce9198f94869`. Corrected;
   frozen drift is genuinely **0 bytes**.
2. **AC-2 probe measured the wrong thing.** It asserted the *destination* route was style-free, but
   `/about` → `/p/about-us` is `CustomePage`, which **legitimately** applies those styles while
   mounted — so it failed against correct behaviour. Now it confirms the styles are live on
   `/features` (precondition guard, so the probe cannot pass vacuously), performs a **client-side**
   transition to `/login`, and asserts they were handed back. A full page load would build a new
   `<html>` and prove nothing.
3. **AC-3 crawled unauthenticated.** 35 of the reconciled targets sit behind
   `<RequireAuthenticated>`, so each correctly rendered the login gate — a legitimate full-viewport
   overlay — producing **175 phantom "overlay collision" failures**. The crawl now installs the
   authenticated session per crawl page (with renderer recycling and explicit crash recovery),
   because a portal seen from the logged-out side is not the portal.
4. **AC-5 over-literal redirect.** Asserted the literal `/org/northwind`, while the enterprise
   console canonically normalizes a bare slug to `/org/northwind/overview` (documented design
   behaviour in `src/enterprise/EnterpriseConsole.jsx`). The hop now declares `landsOn` and also
   asserts a **unique named nav landmark**, so "URL says /dashboard" cannot pass without the
   candidate workspace actually being mounted.

---

## 5. Regression Baseline (zero regressions)

| Suite | Result |
|---|---|
| Playwright `playwright.dir047.config.js` | **9/9 passed**, 0 failed, 0 flaky, 0 skipped, exit 0 |
| `npm run test:security` (static + backend) | **959/959 passed**, 0 failed, exit 0 |
| `npm run test:product` | **715/715 passed**, 0 failed, exit 0 |
| Frozen surface vs `e314f715` | **0 bytes** drift (51 CV + 4 cover intact) |
| ESLint | **0 errors** (2068 files) |
| Production build (cold cache) | median **2982 ms** — budget 4000 ms |

---

## 6. Artifacts

| Artifact | Contents |
|---|---|
| `dir047-certification-run.log` | Consolidated test output (Playwright + build budget + regression exits) |
| `dir047-playwright.log` / `dir047-results.json` | Full Playwright run + machine-readable JSON |
| `dir047-pw-exit.txt` | `EXIT=0` |
| `dir047-ac1-template-parity.json` | Frozen diff bytes, 55-template render parity |
| `dir047-ac2-latency-locales.json` | 16 locales, style-restoration before/after, latency census |
| `dir047-ac3-route-crawl.json` + `dir047-ac3-breakpoint-*.json` | 143 routes × 5 breakpoints = 715 visits, 0 defects |
| `dir047-ac4-security-wcag.json` | Tenant probes, XSS result, secret sweep, 8 axe runs |
| `dir047-ac5-customer-journey.json` | 5-hop journey with per-hop state |
| `dir047-route-census.json` | Machine-generated router census (143 targets) |
| `dir047-latency-census.json` | Regenerated `setTimeout` triage ledger |
| `dir047-build-budget.json` / `.log` | Cold-cache build timings |
| `dir047-release-candidate.txt` | HEAD + release-candidate snapshot hash |

**Open item for the Gatekeeper:** the release seal in `.bridge/CERTIFIED_FREEZE_MANIFEST.json` is the
Lead's action per the approved plan (step 8). This submission provides the release-candidate hash
(`6ab4daed…`) for sealing; the DIR-047 change set is intentionally left **uncommitted** so the Lead
can scope the release commit.
