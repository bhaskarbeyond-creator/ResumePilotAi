# Wave 5 Remediation Report — Final Production-Guard + Accessibility Gate

**Branch:** `arena/01a055a9-resumepilotai`
**Restore tag:** `rollback-pre-wave5-final-gates-20260831-0505` (pre-Wave-5 SHA `24169e5d12a32140a30b92d1e881e560990ec904`)
**Post-Wave-5 commit target:** HEAD on branch
**Date:** 2026-08-31 (Asia/Calcutta)
**Wave scope:**
- Gate K (DEV/E2E shim isolation → production fail-closed)
- Gate F (axe-core automated accessibility audit + real fixes)
- Regression: 513 backend tests + 44 static-security + 5 production-isolation + 108 Playwright + production build + eslint

---

## 1. Fixes applied this wave

### 1.1 Production fail-closed guard for `InMemoryRepository` (Gate K)
**File:** `backend/repositories/index.js`
**Defect found:** The prior guard `if (NODE_ENV === 'production' && IN_MEMORY_REPOSITORY !== '1') return false` allowed an operator/misconfiguration who set `IN_MEMORY_REPOSITORY=1` in production to silently activate the ephemeral in-memory shim — catastrophic durability/security regression.
**Fix:** Replaced with unconditional hard-guard:
```js
if (process.env.NODE_ENV === 'production') return false;
```
In production the in-memory shim is now NEVER selectable, regardless of env-flag accidents. On DB outage the ResilientRepository layer continues to fail closed with 503s instead of swapping to a volatile store.

### 1.2 Production-isolation test harness (Gate K)
**File:** `tests/production-isolation.test.cjs` (new)
5 node:test cases:
1. `InMemoryRepository` is never returned in `NODE_ENV=production`, even with `IN_MEMORY_REPOSITORY=1` and `DEGRADED_MODE_REPOSITORY=inmemory` set.
2. `testVerifierEnabled()` returns false in production (preview-login / rptest token route is 404).
3. `abuse.js` counter-store branches the in-memory shim only under `NODE_ENV !== 'production'`.
4. `src/conf/fire.js` local-auth requires explicit `VITE_LOCAL_AUTH==='true'` and has a `createNullAuth()` fallback.
5. `vite.config.js` registers `firebaseAuthOnlyBundlePlugin` rejecting Firestore/Database/Storage/Functions imports.

### 1.3 Accessibility defects discovered & fixed (Gate F)
Ran `@axe-core/playwright` against 13 routes (7 unauthenticated + 6 authenticated), WCAG 2.1 A/AA + best-practice tags, excluding color-contrast (dynamic-theme false positives). **Initial run found 5 serious/critical violations; all fixed.**

| # | Page | Defect | Fix | File |
|---|------|--------|-----|------|
| 1 | `/login` | `<input>` elements (`input-email`, `input-password`) had no associated `<label>` — the visible text was a `<span>`, not a `<label htmlFor>`. Critical (axe `label`). | Replaced `<span>` with real `<label htmlFor={inputId}>`; added `aria-label` fallback, `aria-required`, `role="alert"` on error message. | `src/components/Form/simple-input/SimpleInput.jsx` |
| 2 | `/blog` | Two `<select>` filters (category, sort) had no accessible name. Critical (axe `select-name`). | Added `<label htmlFor>` (sr-only) and `aria-label` to both selects. | `src/components/Blog/BlogList/BlogList.jsx` |
| 3 | `/dashboard` (user) | Sidebar-toggle icon button had no name. Critical (axe `button-name`). | Added `aria-label="Toggle sidebar"`, `title`, `aria-hidden="true"` on the GoSidebarExpand icon. | `src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx` |
| 4 | `/dashboard` (user) | Pagination prev/next buttons were icon-only with no accessible name. Critical (axe `button-name`). | Added `aria-label="Previous page"` / `"Next page"`, `aria-hidden="true"` on FaChevronRight icons. | `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx` |
| 5 | `/portfolio/builder` | Scrollable preview region (`.overflow-auto`) was not keyboard-focusable in Safari. Serious (axe `scrollable-region-focusable`). | Added `tabIndex={0}`, `role="region"`, `aria-label`, `focus-visible` ring. | `src/components/PortfolioBuilder/WebCvStudio.jsx` |

**Post-fix result: 13/13 a11y tests pass, zero serious/critical violations.**

### 1.4 Axe-core a11y suite added (Gate F)
**File:** `tests/playwright-accessibility.spec.js` (new)
- 7 unauthenticated pages: landing, login, pricing, blog, contact, features, 404.
- 6 authenticated user pages: dashboard, billing, profile, build-resume/heading, settings, portfolio/builder.
- WCAG 2.0/2.1 A + AA + best-practice; color-contrast excluded (theme-shift false positives).
- Any serious/critical violation fails the test.
- Run as part of the standard Playwright suite (single-worker to avoid storage-state collisions).

---

## 2. Verification matrix (Wave 5)

| Check | Command | Result |
|-------|---------|--------|
| eslint (modified files) | `npx eslint <modified files>` | 0 errors, 0 warnings |
| Backend unit/integration tests | `cd backend && npm test` | **513 pass / 0 fail / 24 skipped** (skipped = enterprise E2E requiring MariaDB) |
| Production-isolation tests | `node --test tests/production-isolation.test.cjs` | **5 pass / 0 fail** |
| Static security suite | `npm run test:security:static` | **44 pass / 0 fail** |
| Vite production build | `npm run build` | ✓ built in 5.11s (no errors, only pre-existing chunk-size warning) |
| Playwright regression (single-worker) | 4 suites × 108 tests, chromium, in-memory shim | **108 pass / 0 fail** |

### Playwright breakdown (108 passing)
| Suite | Tests | Purpose |
|-------|-------|---------|
| `playwright-zero-trust.spec.js` | 49 | Public surfaces, auth gating, role escalation, JWT/preview-login abuse, payment-settings RBAC |
| `playwright-role-matrix.spec.js` | 40 | 8 roles × 4 landing/route checks (dashboard, /adm/dashboard, /enterprise, /build-resume, /billing/plans, /profile) + cross-role + public-redirect |
| `playwright-user-journeys.spec.js` | 6 | Candidate flows: dashboard → build-resume → sign-out → settings → billing/plans → portfolio/builder |
| `playwright-accessibility.spec.js` | 13 | axe-core WCAG 2.1 A/AA across 7 public + 6 authenticated routes |

---

## 3. Gates still ENVIRONMENT_BLOCKED (no-fake-evidence policy)

These gates require external infrastructure or outbound HTTPS that is **not available in this sandbox** (apt has no MariaDB package, outbound HTTPS to Google/Stripe/Razorpay/Paytm/PhonePe/PayPal/Firebase is blocked, no deployment target):

| Gate | Status | Exact reproduction when infra is available |
|------|--------|--------------------------------------------|
| A. MariaDB schema/migrations/transactions/concurrency | **VALID_ENVIRONMENT_LIMITATION** | `sudo apt-get install mariadb-server && sudo systemctl start mariadb && cd backend && npm test` (24 skipped tests should drop to 0) |
| B. 24 skipped enterprise E2E tests | **VALID_ENVIRONMENT_LIMITATION** | Same MariaDB provision; then `cd backend && npm test -- enterprise-test/` (0 expected skips) |
| C. Payment provider E2E (Stripe/PayPal/Razorpay/Paytm/PhonePe) | **VALID_ENVIRONMENT_LIMITATION** | Requires provider API keys + webhook tunnels; sandbox does not allow outbound HTTPS to those providers. Static contract verified (see FINAL_ZERO_TRUST_CERTIFICATION §Payments). |
| D. Firebase OAuth E2E | **VALID_ENVIRONMENT_LIMITATION** | Needs Firebase project, OAuth client IDs; outbound accounts.google.com blocked. Fail-closed null-auth path verified. |
| G. Production deployment | **VALID_ENVIRONMENT_LIMITATION** | No deployment target exists in this sandbox. Pre-deploy checklist is documented in FINAL_ZERO_TRUST_CERTIFICATION §Deployment. |
| H. Lighthouse CI | **VALID_ENVIRONMENT_LIMITATION** | Lighthouse/Chrome installs via Google CDN which is blocked; Chrome binary can't be fetched. a11y/SEO/best-practices partially covered by axe-core. |
| I. MFA end-to-end (TOTP enrollment + SUPER_ADMIN enforcement) | **PARTIAL (UI + JWT role gate verified; full TOTP verification requires Firebase/Auth service which is blocked)** | TOTP input renders on login (verified by axe + role matrix); server-side MFA enforcement code exists in `backend/security/auth.js` but cannot be enrolled end-to-end without an email/SMS provider. |

---

## 4. Rollback

```bash
git reset --hard rollback-pre-wave5-final-gates-20260831-0505
```

---

## 5. Files changed in this wave

| File | Delta | Purpose |
|------|-------|---------|
| `backend/repositories/index.js` | +6/-4 | Hard fail-closed InMemoryRepository guard |
| `src/components/Form/simple-input/SimpleInput.jsx` | +9/-4 | Real `<label htmlFor>`, aria-label, role=alert on error |
| `src/components/Blog/BlogList/BlogList.jsx` | +6/-2 | Accessible names on category/sort `<select>` |
| `src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx` | +2/-2 | aria-label on sidebar toggle button |
| `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx` | +4/-4 | aria-label on pagination prev/next buttons |
| `src/components/PortfolioBuilder/WebCvStudio.jsx` | +2/-2 | Keyboard-focusable scrollable preview region |
| `tests/production-isolation.test.cjs` | +108/-0 | NEW: 5 production-isolation unit tests |
| `tests/playwright-accessibility.spec.js` | +89/-0 | NEW: 13 axe-core WCAG 2.1 a11y tests |
| `docs/forensic/final/WAVE5_REMEDIATION_REPORT.md` | +116/-0 | This report |

**Verified:** no shims leak to production; accessibility critical/serious defects fixed; full regression passes.
