# Codebase Forensic Capability Audit

**Scope:** independent, codebase-level forensic audit of ResumePilotAi covering
Admin, Super Admin, Enterprise, Consumer, authentication/MFA, AI, API contracts,
configuration, Platform Health, and frontend CSS/asset reliability.

**Explicit limitation:** this audit had NO production access — no Hostinger, SSH,
PM2, Firebase console, production environment variables, production database,
payment providers, SMTP, OAuth providers, or Cloudflare. Nothing in this document
asserts that production works. Every production-dependent item is listed in
§9 and §10 as requiring verification by the Local Developer.

---

## 1. Baseline

| Item | Value |
| --- | --- |
| Baseline commit (`origin/main` at audit start) | `4da57d90f35ab76dad79944613ee85c593457e45` |
| Working branch | `arena/01a02fcb-resumepilotai` |
| `backend/COMMIT_SHA` | `4da57d90f35ab76dad79944613ee85c593457e45` |
| Working tree at start | clean |
| Baseline test result | `npm test` **green** (45 files, 0 failures) |
| Baseline lint result | **1 error**, 625 warnings (pre-existing) |
| Baseline build | success |

**The baseline being green is the central finding of this audit.** The suite was
green while production could not enrol a single second factor and while route
stylesheets collided non-deterministically. Several existing "security" tests
asserted only that identifiers appeared in source text.

---

## 2. Architecture as implemented

| Layer | Implementation |
| --- | --- |
| Frontend | React 19 + React Router 7 SPA, Vite 8 (rolldown), Tailwind v4 + ~112 module SCSS/CSS files |
| Route surfaces | Consumer (`/`, `/dashboard`, `/build-resume`, …), Enterprise (`/enterprise/*`), Admin & Super Admin (`/adm/*`, with `/admin/*` and `/platform/*` redirecting to it) |
| Backend | Express 5, `backend/index.js` plus routers for `platform`, `enterprise`, `enterpriseM2m`, `ai`, `email`, `adminAudit` |
| Identity | Firebase Authentication; ID token verified server-side on every request (`backend/security/auth.js`) |
| Authorization | Role + permission model (`USER` / `ADMIN` / `SUPER_ADMIN` / `SUPPORT`) from verified custom claims; `*` wildcard for Super Admin |
| Step-up | `requireRecentAdminAuthentication` (verified `auth_time`) and `requireSuperAdmin` (verified `sign_in_second_factor`) |
| Enterprise | Frozen multi-tenant architecture (`docs/ENTERPRISE_PRODUCTION_FROZEN.md`); tenant registry/service with per-tenant security policy including `requireMfaForAdmins` |

Enterprise invariants were treated as frozen. No Enterprise route, contract, or
tenant-isolation rule was changed by this audit.

---

## 3. Capability census

Generated from source, not hand-maintained: **`docs/CONFIGURATION_CENSUS.md`**
(`node scripts/generate-config-census.mjs`).

- 126 distinct configuration keys
- 30 classified SECRET
- 13 backend-only keys with no Admin/Super Admin surface (infrastructure controls;
  listed explicitly so the gap is stated rather than assumed)

API inventory is likewise generated: `npm run inventory:api` →
`docs/FINAL_API_INVENTORY.md` (271 endpoints).

---

## 4. Defects found, root causes, fixes and regression tests

### D1 — TOTP MFA: unsatisfiable requirement presented as an operator error (P0)

**Symptom.** Production returns `auth/operation-not-allowed` from TOTP
enrollment. Certification claimed "Security/RBAC/MFA = PASS".

**Root cause.** The implementation assumed the Firebase TOTP multi-factor
provider was enabled. `beginTotpEnrollment()` called
`TotpMultiFactorGenerator.generateSecret(session)` with no capability detection
and no error classification. When the provider is disabled at the Firebase
project level, that call throws `auth/operation-not-allowed`, and the UI
rendered the generic fallback *"Unable to start MFA enrollment. Reauthenticate
and try again."* — an instruction that cannot possibly succeed.

Simultaneously, `requireSuperAdmin` enforces a verified `sign_in_second_factor`
claim in production. The combination is a **deadlock**: destructive Super Admin
operations require a factor that no operator can obtain, and nothing in the
product says so.

Firebase Admin exposes no API to read whether the TOTP provider is enabled, so
the backend genuinely cannot probe it. The previous code resolved that ambiguity
by assuming success.

**Contributing defects found during the trace:**

- **D1a** — `src/components/admin/Admin.jsx` computed
  `hasMfa = …sign_in_second_factor || user.multiFactor?.enrolledFactors?.length`.
  A *registered* factor was treated as a *verified* one, so the warning banner
  disappeared for sessions the backend still rejected. Classic "UI says MFA
  verified, backend has no MFA proof".
- **D1b** — `SUPER_ADMIN_MFA_REQUIRED` was not handled anywhere in the frontend.
  A blocked Super Admin received a raw error, and the reauth retry path would
  re-prompt for a password that can never satisfy a second-factor requirement.
- **D1c** — `RECENT_AUTH_REQUIRED` and `SUPER_ADMIN_MFA_REQUIRED` were not
  distinguishable by the client, allowing reauthentication to be presented as an
  MFA remedy.
- **D1d** — the pre-existing `tests/mfa-static.test.mjs` asserted only that
  strings such as `assertionForEnrollment` appeared in the source file. It
  proved nothing about the security boundary and passed throughout the outage.

**Fix.** An explicit, server-authoritative state machine. **No boundary was
weakened — every previously denied request is still denied.** Only the reported
reason changed.

- `backend/security/mfaState.js` (new) — states `AUTHENTICATED`,
  `RECENT_AUTHENTICATION`, `MFA_ENROLLED`, `MFA_VERIFIED`, `MFA_REQUIRED`,
  `MFA_UNAVAILABLE`, `MFA_CONFIGURATION_REQUIRED`; provider capability is
  **declared** (`FIREBASE_TOTP_MFA_ENABLED`) and defaults to `UNKNOWN`, never to
  `ENABLED`.
- `backend/security/auth.js` — `requireSuperAdmin` now returns
  `MFA_CONFIGURATION_REQUIRED` (instead of the misleading
  `SUPER_ADMIN_MFA_REQUIRED`) when the provider is declared disabled, and carries
  machine-readable `mfaState` + structured `remediation`. `RECENT_AUTH_REQUIRED`
  now declares `satisfiesMfa: false`.
- `GET /api/platform/security/mfa-posture` (new) — mounted behind
  `system.config.read`, deliberately **not** behind `requireSuperAdmin`, so a
  blocked operator can discover *why*. Carries no secret material.
- `src/services/mfaStates.js` (new) — dependency-free classification and
  derivation, so the real logic is directly testable.
- `src/services/mfaService.js` — classifies `auth/operation-not-allowed` and
  latches provider capability to `DISABLED`; the module remains network-free
  (the existing test forbidding `fetch(` in the TOTP module was respected, and
  the posture read lives in `src/services/mfaPostureClient.js`).
- `src/components/admin/Admin.jsx` — `hasMfa` derives from the verified claim
  only; `AdminMfaNotice` renders a distinct, honest notice per state including a
  platform-owner call to action for `MFA_CONFIGURATION_REQUIRED`.
- `src/services/adminReauth.js` — `mfaDenial()` terminates the retry path for
  MFA codes with `recoverableByReauthentication: false`.
- `DashboardSettings.jsx` — the Enable-2FA control is disabled once the provider
  is known unavailable, and a what/why/impact/action panel replaces the
  misleading message.

**Regression tests.**
- `backend/test/mfa-state-machine.test.js` — 9 tests on the real decision function.
- `backend/test/mfa-enforcement.test.js` — 10 tests through the **real Express
  app** via supertest: four destructive routes deny unverified sessions; a forged
  custom claim is rejected; an enrolled-but-unchallenged session is rejected; a
  verified session passes; posture stays readable while blocked; posture leaks no
  secret.
- `tests/mfa-state-machine.test.mjs` — 18 tests executing the client
  classification and derivation.
- `backend/test/platform-health-mfa-honesty.test.js` — 6 tests (see D3).

### D2 — CSS cascade order depends on SPA navigation history (P1, reliability)

**Symptom.** Pages render incorrectly during normal navigation and become
correct only after a hard reload; styles appear to "collide between modules".

**Root cause.** Route stylesheets are emitted into lazily loaded chunks. Vite
appends each chunk's `<link rel="stylesheet">` to `<head>` the first time that
route loads, and never reorders it. **The cascade order of two route stylesheets
is therefore decided by the order the routes were first visited in the session.**
Where two chunks declared the same selector with different values, the winner —
and the rendered result — changed with navigation history. A hard reload
"fixed" it only because a fresh document loads a different, smaller set of
stylesheets.

Measured on the baseline build: **37 conflicting selectors across independently
loadable chunk pairs**, plus unscoped global rules leaking across surfaces.

Specific collisions fixed:

| # | Collision | Effect |
| --- | --- | --- |
| D2a | `RichTextEditor.css` (BuildResume chunk) and `LexicalStyles.css` (Form chunk) declared ~50 identical selectors — `.editor-input`, `.toolbar`, `div[contenteditable='true'] ul/ol/li/p` — with **different** margins and padding | Editor spacing flipped depending on which editor route was visited first |
| D2b | `src/cv-templates/cv4/Cv4.scss` declared a bare, top-level `p { white-space: pre-wrap }` | Previewing the Cv4 template restyled paragraphs on **every route in the app** until a hard reload |
| D2c | `src/enterprise/enterprise.css` declared an unscoped `.sr-only` | Loading the Enterprise chunk overrode Tailwind's `.sr-only` globally, for every surface, for the rest of the session |

**Fix — style ownership, not overrides.** No `!important` was added and no
override chain was created.

- The two editor stylesheets were mechanically scoped to `.rpa-editor-builder`
  and `.rpa-editor-form`, and each component now renders its owning scope class.
  The two chunks are inert on each other's markup regardless of load order.
- The Cv4 paragraph rule is scoped to `.cv4-board`.
- The Enterprise `.sr-only` is scoped; Tailwind's identical utility ships in the
  always-loaded entry stylesheet, so behaviour is unchanged.

**Why this eliminates the hard-reload dependency:** if no two independently
loadable stylesheets set the same property on the same selector to different
values, load order *cannot* affect the rendered result. Determinism is a
provable property of the build output, not an observation about one screenshot.

**Regression tests.**
- `scripts/css-cascade-analyzer.cjs` (new) — parses stylesheets, ignores
  order-safe constructs (`@keyframes`, disjoint `:root` additions), and reports
  same-selector/same-property/different-value conflicts between chunk pairs.
- `tests/css-cascade-isolation.test.mjs` — 10 tests, wired into `npm run
  test:product`. Includes an explicit **non-vacuity test**, and the analyzer was
  verified against the pre-fix files: it reports **4 conflicts before the fix, 0
  after**. Against the current build it reports **0 order-dependent conflicts
  across 72 lazily loaded stylesheets**.
- `tests/css-reliability.spec.cjs` (new, Playwright) — direct load vs SPA
  navigation vs navigate-away-and-return vs back/forward vs normal reload, a
  full-session traversal drift check, the 7-viewport responsive matrix, the
  1024px breakpoint boundary, asset integrity and service-worker absence. All
  assertions use DOM and `getComputedStyle`, never screenshots.
  **NOT EXECUTED in this audit** — no Chromium binary and no Playwright CDN
  access in the sandbox. See §10.

### D3 — Platform Health reported an unsatisfiable control plane as healthy (P1)

**Root cause.** `super-admin-platform` was `OPERATIONAL` whenever Firestore and
Firebase Auth answered their probes, ignoring whether the enforced second-factor
requirement could be satisfied at all. With MFA enforced and the TOTP provider
disabled, every destructive Super Admin operation is denied and no in-product
action can unblock it — that is not a healthy control plane. This is the same
"code says supported / capability unavailable" pattern as D1.

**Fix.** `backend/services/platformHealth.js` now evaluates dependency health
and MFA satisfiability as two independent conditions and reports **both**:

- enforced + provider declared `DISABLED` → `UNAVAILABLE` / `NOT_CONFIGURED`
- enforced + provider `UNKNOWN` → `UNKNOWN` (never rounded up to healthy)
- reasons state what, why, impact and the recommended action

`FIREBASE_TOTP_MFA_ENABLED` was added to `backend/services/platformConfiguration.js`
so the declaration is visible to Super Admins.

**Regression test.** `backend/test/platform-health-mfa-honesty.test.js` — 6
tests, including a sweep asserting no service claims `OPERATIONAL` while its
configuration is `NOT_CONFIGURED` or `UNKNOWN`.

### D4 — Pre-existing lint error (P3)

`backend/test/email-deliverability-resilience.test.js` used an emoji character
class containing `\u{20D0}-\u{20FF}` (combining diacritical marks — not emoji),
failing `no-misleading-character-class`. The range was removed, which makes the
assertion *stricter*. Lint is now 0 errors.

---

## 5. Areas audited and found sound (no change made)

Reporting these explicitly, because "audited and correct" is a different claim
from "not looked at".

| Area | Finding |
| --- | --- |
| Payment secrets (Razorpay, Stripe, PayPal, Paytm, PhonePe) | `backend/services/paymentAdmin.js` implements a correct write-only pattern: masked/blank input preserves the stored value, only masked forms are projected outward, environment-managed credentials are distinguished from stored ones. No secret in responses. |
| Tenant management routes | `PlatformTenants.jsx` calls `/api/enterprise/platform/tenants`, `…/suspend`, `…/reactivate`, `/api/enterprise/tenants` — all exist, all re-fetch after mutation, no optimistic-only state. |
| API contract | Every same-origin `/api/**` path called by `src/**` resolves to a registered backend route. 35 initial mismatches were all false negatives of a prefix-unaware scanner and were individually verified. |
| Health state vocabulary | `platformHealth.js` already models `OPERATIONAL / DEGRADED / UNAVAILABLE / DISABLED / NOT_CONFIGURED / UNKNOWN` with a severity ordering; only the Super Admin service conflated them (D3). |
| Token verification | `admin.auth().verifyIdToken(token, true)` — revocation checking is on. |
| Service worker | Registration is a no-op and legacy registrations are actively unregistered; no `CacheStorage` strategy exists, so stale-asset replay is not possible. Locked by test. |
| Asset hashing | All emitted CSS/JS are content-hashed; `index.html` declares `no-store`. Locked by test. |

---

## 6. Known gaps NOT fixed (documented, not hidden)

| Gap | Reason |
| --- | --- |
| `POST /api/platform/tenants/:id/decommission` exists in the backend and is MFA-guarded, but no Admin UI exposes it. `PlatformTenants.jsx` offers only suspend/reactivate. | Adding a new destructive control is outside the remit of a hardening audit and would ship an untested destructive path. Recorded as a capability gap. |
| ~75 stylesheet files under `src/**/css/` and several `.scss` files are not imported by any module (dead legacy duplicates of live stylesheets). | Not deleted, to keep this change set focused and avoid touching unrelated history. They are inert at runtime — the cascade analyzer only inspects imported/emitted CSS. |
| `tailwind.css` opens with `@import url('https://fonts.googleapis.com/…Poppins…')` while `index.html` also self-hosts Poppins. | A render-blocking third-party request that duplicates a self-hosted font. Low risk, but it is a real external dependency in the critical CSS path. |
| 625 ESLint warnings. | Pre-existing; 0 errors. Not mass-edited during a security audit. |

---

## 7. Test-quality audit

- No `.only` in any test file.
- The three `.skip` usages introduced by this audit are conditional
  (`skip: !fs.existsSync(distDir)`) and skip only when `dist/` is absent.
- The new suites avoid mock-only success: `mfa-enforcement.test.js` drives the
  real Express app; `css-cascade-isolation.test.mjs` asserts against real built
  output and contains an explicit non-vacuity test.
- `tests/mfa-static.test.mjs` was **kept and satisfied**, not weakened. Its rule
  that the TOTP module performs no network I/O was honoured by relocating the
  posture read into a separate secret-free module.

---

## 8. Local validation performed

| Command | Result |
| --- | --- |
| `npm test` | PASS |
| `npm run test:enterprise` | PASS |
| `npm run test:interview` | PASS |
| `npm run build` | PASS |
| `npm run lint` | PASS (0 errors, 625 pre-existing warnings) |
| `node --test tests/css-cascade-isolation.test.mjs` | PASS (10/10) |
| `node --test tests/mfa-state-machine.test.mjs` | PASS (18/18) |
| `node --test backend/test/mfa-*.test.js` | PASS (19/19) |
| `node --test backend/test/platform-health-mfa-honesty.test.js` | PASS (6/6) |
| `npx playwright test tests/css-reliability.spec.cjs` | **NOT RUN** — no Chromium binary available in the audit sandbox |

---

## 9. Production-only dependencies (NOT verifiable from the codebase)

1. Whether the Firebase TOTP multi-factor provider is actually enabled on the
   production Firebase project.
2. Whether `FIREBASE_TOTP_MFA_ENABLED` matches the real Firebase console state.
3. Whether `SUPER_ADMIN_MFA_REQUIRED` is set as intended in production.
4. Live Firebase, SMTP, Razorpay/Stripe/PayPal/Paytm/PhonePe, Twilio, OAuth and
   AI provider credentials and their live health.
5. Hostinger deployment, PM2 process health, and the deployed `COMMIT_SHA`.
6. Cloudflare and Hostinger cache behaviour for `index.html` and `/assets/*`.
7. Any live CRUD, live payment, or live email behaviour.

---

## 10. Required Local Developer actions

**A. Resolve the TOTP P0 (production).**
1. Firebase console → Authentication → Sign-in method → Advanced →
   Multi-factor → enable **Authenticator app (TOTP)**.
2. Set backend env `FIREBASE_TOTP_MFA_ENABLED=true` and restart (PM2).
3. Confirm `SUPER_ADMIN_MFA_REQUIRED` is `true` (or unset in production, which
   defaults to enforced).
4. As a Super Admin: Dashboard → Settings → enable 2FA, sign out, sign in
   completing the authenticator challenge.
5. `GET /api/platform/security/mfa-posture` must return
   `state: "MFA_VERIFIED"`, `satisfied: true`, `providerCapability: "ENABLED"`.
6. Confirm `/adm` shows **no** MFA banner and a destructive operation succeeds.
   *Until step 1 is done, the console will now correctly display
   "Multi-factor authentication configuration required" instead of failing
   silently — that is the expected, honest state.*

**B. Verify the CSS/asset fix in production.**
1. `npm run build`, deploy `dist/`.
2. Serve `dist/` and run:
   `CSS_AUDIT_BASE_URL=<url> npx playwright test tests/css-reliability.spec.cjs`
3. Confirm `index.html` is served `no-store` and `/assets/*` are served with a
   long-lived immutable cache (they are content-hashed).
4. Purge the Cloudflare cache for `index.html` after each deploy.
5. Manually confirm: navigate `/` → `/enterprise` → `/adm` → `/` without any
   hard reload and confirm each surface is correct.

**C. Standing verification.**
- `npm run inventory:api` and `node scripts/generate-config-census.mjs` after any
  route or configuration change; both outputs are generated and must be committed.
- `npm run certify:*` scripts remain the live-certification path and require
  production credentials.

---

## 11. Codebase-verified vs production-verified

| Capability | Codebase | Production |
| --- | --- | --- |
| Firebase native TOTP enrollment/challenge implementation | VERIFIED | — |
| MFA state machine and fail-closed enforcement | VERIFIED (29 executed tests) | — |
| Firebase TOTP provider actually enabled | — | **VERIFICATION REQUIRED** |
| Honest reporting when the provider is unavailable | VERIFIED | — |
| CSS cascade determinism in built output | VERIFIED (0 conflicts, 72 chunks) | — |
| Rendered-result determinism in a real browser | SPEC WRITTEN, NOT RUN | **VERIFICATION REQUIRED** |
| Asset hashing and `no-store` document policy | VERIFIED | — |
| Cloudflare / Hostinger cache behaviour | — | **VERIFICATION REQUIRED** |
| Payment secret write-only pattern | VERIFIED | — |
| Live payment / SMTP / OAuth / AI provider health | — | **VERIFICATION REQUIRED** |
| Hostinger deployment, PM2 health | — | **VERIFICATION REQUIRED** |
