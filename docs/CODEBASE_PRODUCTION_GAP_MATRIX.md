# Codebase Production Gap Matrix

Derived from the forensic audit in `docs/CODEBASE_FORENSIC_CAPABILITY_AUDIT.md`
at baseline `4da57d90f35ab76dad79944613ee85c593457e45`.

**No production access was available.** "Production Verification Required" means
exactly that — it is not a pass and not a fail.

Legend for *Final Classification*:
- **CODEBASE VERIFIED** — behaviour proven by executed tests against real code.
- **CODEBASE VERIFIED / PROD PENDING** — code is correct and tested; a live
  dependency or deployment step must still be confirmed.
- **GAP — DOCUMENTED** — a real gap that was deliberately not closed here.

---

## Capability matrix

| Capability | Code Status | Frontend Status | Backend Status | Configuration Dependency | External Dependency | Security Status | Test Status | Production Verification Required | Final Classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TOTP MFA enrollment (Firebase native) | Implemented, capability-aware | Honest per-state UI; control disabled when provider unavailable | N/A (client-side Firebase API) | `FIREBASE_TOTP_MFA_ENABLED` | Firebase Auth TOTP provider | Fail-closed; no bypass | 18 executed client tests | **Yes** — provider must be enabled in the Firebase console | CODEBASE VERIFIED / PROD PENDING |
| TOTP MFA sign-in challenge | Implemented (`getMultiFactorResolver`, `assertionForSignIn`) | Login renders the 6-digit challenge | Verifies `sign_in_second_factor` claim | — | Firebase Auth | Fail-closed | Covered by client + backend tests | **Yes** | CODEBASE VERIFIED / PROD PENDING |
| Super Admin destructive-op MFA gate | `requireSuperAdmin` | Distinct notice per state | Enforced server-side, machine-readable denial | `SUPER_ADMIN_MFA_REQUIRED` | Firebase Auth | Enforced; forged claims rejected | 10 executed HTTP tests | **Yes** — confirm env in production | CODEBASE VERIFIED / PROD PENDING |
| MFA state machine (7 states) | `backend/security/mfaState.js`, `src/services/mfaStates.js` | Consumed by Admin + Settings | Authoritative | — | — | Never downgrades a requirement | 9 + 18 executed tests | No | CODEBASE VERIFIED |
| MFA posture endpoint | `GET /api/platform/security/mfa-posture` | Read by Admin shell | Behind `system.config.read`, readable while MFA-blocked | — | — | Secret-free payload (asserted) | Executed test | No | CODEBASE VERIFIED |
| Recent-authentication step-up | `requireRecentAdminAuthentication` | Reauth prompt with retry | Verified `auth_time`, fails closed in production | `SENSITIVE_AUTH_MAX_AGE_MS` | Firebase Auth | Explicitly declared NOT to satisfy MFA | Executed test | No | CODEBASE VERIFIED |
| RBAC (USER/ADMIN/SUPER_ADMIN/SUPPORT) | Verified custom claims | Role-aware navigation | `permissionsFor` + `requirePermission` | — | Firebase custom claims | Server-side only | Pre-existing suites pass | Claims must be set on production accounts | CODEBASE VERIFIED / PROD PENDING |
| Token verification & revocation | `verifyIdToken(token, true)` | — | Enforced on every request | — | Firebase Auth | Revocation checked | Pre-existing suites | No | CODEBASE VERIFIED |
| CSS cascade determinism | Style ownership scoping | Editors, Cv4, Enterprise scoped | N/A | — | — | N/A | 10 executed tests; 0/72 chunk conflicts | Cache behaviour only | CODEBASE VERIFIED |
| Rendered-result determinism in a browser | Playwright spec authored | 5 routes × 5 navigation modes | N/A | — | Chromium | N/A | **Spec written, NOT executed** (no browser in sandbox) | **Yes** | CODEBASE VERIFIED / PROD PENDING |
| Responsive matrix (7 viewports) | Spec authored | Overflow + zero-size-control assertions | N/A | — | Chromium | N/A | **NOT executed** | **Yes** | PROD PENDING |
| Asset hashing / release-skew safety | Content-hashed, `no-store` document | — | — | — | Cloudflare, Hostinger | N/A | Executed build-output tests | **Yes** — CDN/edge cache rules | CODEBASE VERIFIED / PROD PENDING |
| Service-worker stale-asset risk | Registration is a no-op; legacy unregistered | Entry unregisters | — | — | — | No CacheStorage | Executed test | No | CODEBASE VERIFIED |
| Platform Health honesty | State vocabulary + severity ordering | Health console | `platformHealth.js` | `FIREBASE_TOTP_MFA_ENABLED` | All probed services | UNKNOWN/NOT_CONFIGURED never reported healthy | 6 executed tests | **Yes** — live probe results | CODEBASE VERIFIED / PROD PENDING |
| Payment credentials (5 providers) | Write-only pattern | Masked, never echoes secrets | `paymentAdmin.js` projection | Per-provider env or stored | Razorpay/Stripe/PayPal/Paytm/PhonePe | No secret in responses/logs/DOM | Pre-existing suites | **Yes** — live keys and transactions | CODEBASE VERIFIED / PROD PENDING |
| AI provider configuration | Registry + health + fallback | Admin AI settings | `routes/ai.js` | Provider keys | AI providers | Keys masked | Pre-existing suites | **Yes** | CODEBASE VERIFIED / PROD PENDING |
| Email verification → AI flow | Live Auth fallback on stale JWT | — | `requireAuth` re-checks the Auth record | — | Firebase Auth | No downgrade | Pre-existing suite | **Yes** | CODEBASE VERIFIED / PROD PENDING |
| Tenant CRUD: create/read/suspend/reactivate | Implemented | Correct routes, re-fetch after mutation | `routes/enterprise.js` | `ENTERPRISE_TENANCY_ENABLED` | Firestore | Server-authorized | Enterprise suite passes | **Yes** | CODEBASE VERIFIED / PROD PENDING |
| Tenant decommission | Implemented | **UI EXISTS** — `tenants/PlatformTenants.jsx` detail drawer via `services/platformApi.js` | `POST /api/platform/tenants/:id/decommission`, recent-auth + Super Admin + MFA | — | Firestore | Enforced | 10 executed reconciliation tests | **Yes** | CODEBASE VERIFIED / PROD PENDING — *the earlier "no UI" claim was a false finding from a service-layer-blind scan; see FINAL_CODEBASE_FORENSIC_AUDIT.md §2* |
| API contract (271 endpoints) | Generated inventory | All frontend `/api/**` calls resolve | Routers mounted | — | — | — | Cross-checked in audit | Live status codes | CODEBASE VERIFIED / PROD PENDING |
| Configuration census (137 keys) | Generated from source; second pass found 12 keys the first missed (incl. 5 encryption keys and `FIREBASE_TOTP_MFA_ENABLED`) | 17 backend-only keys have no UI | — | — | — | SECRET vs PUBLISHABLE CLIENT IDENTIFIER now distinguished | 6 executed tests incl. staleness + independent cross-check | No | CODEBASE VERIFIED |
| Enterprise multi-tenant architecture | Frozen; untouched by this audit | Unchanged | Unchanged | `ENTERPRISE_TENANCY_ENABLED` | Firestore | Unchanged | `test:enterprise` passes | **Yes** | CODEBASE VERIFIED / PROD PENDING |
| Consumer surfaces | Unchanged except scoped editor CSS | Verified by build + suites | — | — | — | — | `test:product` passes | **Yes** | CODEBASE VERIFIED / PROD PENDING |
| Dead stylesheets | 73 removed; build output byte-identical before/after | — | — | — | — | — | `tests/stylesheet-hygiene.test.mjs` blocks reintroduction | No | CODEBASE VERIFIED |
| Duplicate remote font imports | Removed from `tailwind.css` and `Dashboard/Settings/Settings.scss` | Typography now resolves from the self-hosted face only | — | — | none for the app shell | — | 7 executed tests incl. built-output assertion | Confirm no `fonts.googleapis.com` request in production | CODEBASE VERIFIED |
| Remote fonts in CV/portfolio template engines | Retained deliberately | Required by certified template themes | — | — | Google Fonts / rsms.me | — | Allowlisted and asserted | **Yes** | ACCEPTED — DOCUMENTED |
| Enterprise tenant selection persistence | Persists only after server acceptance; rolls back on failure | `EnterpriseContext.jsx` | Server verifies membership | — | Firestore | No client-trusted context | 4 executed tests | **Yes** | CODEBASE VERIFIED |
| GDPR consent-banner settings | Single shared validator on both write paths | `settings/GdprLegalSettings.jsx` | `POST /api/admin/settings/gdpr` + dedicated endpoint converge | — | — | Site-relative paths only; bounded; control chars stripped | 6 executed tests (4 fail without the fix) | **Yes** | CODEBASE VERIFIED |
| Admin/Super Admin capability reconciliation | Resolver traces the module graph | 0 broken frontend calls | 108 control-plane routes | — | — | Guards recorded per route | 10 executed tests | No | CODEBASE VERIFIED |

---

## CSS / asset RCA summary

**SYMPTOM.** Frontend UI does not render correctly during normal SPA navigation.
Layout changes after moving between pages; components appear partially styled;
Admin/Enterprise/Consumer styles appear to affect one another; a page becomes
correct only after a hard reload.

**ROOT CAUSE.** Route-level stylesheets are emitted into lazily loaded chunks.
Vite appends each chunk's `<link rel="stylesheet">` to `<head>` the first time
that route loads and never reorders it. The cascade order of two route
stylesheets is therefore determined by **the order in which the routes were first
visited in the session**. Several chunks declared the same selector with
different declarations, so the winning rule — and the rendered result — varied
with navigation history. Measured on the baseline build: 37 conflicting
selectors across independently loadable chunk pairs.

**AFFECTED ROUTES.** Any route pair whose chunks collided. Concretely:
`/build-resume` and `/create-resume` against the legacy resume/cover flows
(editor spacing); every route after `/enterprise` was visited (`.sr-only`); every
route after a Cv4 template preview (global `p`).

**AFFECTED FILES.**
- `src/components/BuildResume/steps/components/RichTextEditor.css`
- `src/components/Form/simple-textarea/LexicalStyles.css`
- `src/components/BuildResume/steps/components/RichTextEditor.jsx`
- `src/components/Form/simple-textarea/SimpleTextarea.jsx`
- `src/cv-templates/cv4/Cv4.scss`
- `src/enterprise/enterprise.css`

**WHY HARD RELOAD HIDES IT.** A hard reload discards the accumulated `<head>`
and loads only the entry stylesheets plus the current route's chunks. The
colliding stylesheet from a previously visited route is simply absent, so the
"correct" rule wins by default. The bug is therefore invisible to any test that
loads one page at a time — which is exactly why the green baseline suite missed it.

**FIX.** Style ownership, not overrides. The two rich-text editor stylesheets
were scoped to `.rpa-editor-builder` / `.rpa-editor-form` (with the components
rendering those scopes); the Cv4 paragraph rule was scoped to `.cv4-board`; the
Enterprise `.sr-only` was scoped and now defers to Tailwind's always-loaded
utility. No `!important` was added and no override chain was created.

**REGRESSION TEST.** `tests/css-cascade-isolation.test.mjs` (executed, in
`npm run test:product`) asserts that no two lazily loaded stylesheets set the
same property on the same selector to different values — if that holds, load
order provably cannot change rendering. The analyzer was validated against the
pre-fix files and reports 4 conflicts before / 0 after, so the guard is not
vacuous. `tests/css-reliability.spec.cjs` (authored, **not executed** here)
covers the browser-level behaviour.

**DEPLOYMENT / CACHE CONSIDERATIONS.** All CSS/JS are content-hashed;
`index.html` declares `no-store`. A cached `index.html` is the only remaining way
to pair release-A HTML with release-B assets, so the Cloudflare cache for
`index.html` must be purged on every deploy while `/assets/*` may be cached
immutably.

**LOCAL PRODUCTION VERIFICATION.** `npm run build`, deploy, then
`CSS_AUDIT_BASE_URL=<url> npx playwright test tests/css-reliability.spec.cjs`,
plus a manual `/` → `/enterprise` → `/adm` → `/` traversal with no hard reload.
