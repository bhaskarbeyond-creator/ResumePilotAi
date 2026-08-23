# Final Codebase Forensic Audit — Closure Pass

**Purpose:** close every remaining codebase-level gap identified after the first
forensic pass, so the Local Developer can proceed to production deployment and
live certification without unknown defects hiding behind "production
configuration required".

**Production access:** NONE. No Hostinger, SSH, PM2, Firebase console,
production environment variables, database, payment providers, SMTP, OAuth
providers or Cloudflare. Nothing in this document asserts that production works.

---

## 1. Baseline and final state

| Item | Value |
| --- | --- |
| Original baseline (`origin/main`) | `4da57d90f35ab76dad79944613ee85c593457e45` |
| Closure-pass baseline | `c1587d55b0e88084789fb5f41b0cff1c867b74ca` |
| Final commit | see `FINAL SHA` in the handover report |
| Branch | `arena/01a02fcb-resumepilotai` |

---

## 2. Correction to the previous audit (stated first, deliberately)

The previous pass reported:

> "tenant decommission exists in the backend but has no UI"

**That finding was false.** The control exists and is fully wired:
`PlatformTenants.jsx` → `services/platformApi.js#decommissionTenant` →
`POST /api/platform/tenants/:tenantId/decommission`, guarded by
`requireRecentAdminAuthentication` (Super Admin + recent auth + MFA), with a
reason field, an explicit confirmation dialog, busy state, error state and a
server re-fetch afterwards.

**Root cause of the false finding:** the reconciliation grepped page components
for `fetch('/api/...')` and could not see through the service layer. It also
mis-parsed template literals containing query strings, and treated third-party
URLs (`openrouter.ai/api/v1`) as application routes.

This matters more than the individual claim: a reconciliation tool that
manufactures false gaps will also **miss real ones**. The fix was to build a
proper resolver rather than re-run a better grep — see §3.

---

## 3. Capability reconciliation, rebuilt

`scripts/capability-reconciler.cjs` now resolves API reachability through the
whole frontend module graph:

1. Extract every `/api/...` reference per file, handling template literals,
   embedded expressions, query-string suffixes and skipping absolute
   third-party URLs.
2. Build the `src/**` import graph.
3. Propagate paths transitively so service-layer indirection is followed.
4. Match against backend routes using segment-wise comparison where `:param` is
   a wildcard on **either** side.
5. Account for routers mounted at multiple prefixes (the email router is mounted
   at both `/api` and `/api/email`; those are one capability, not two).

**Result:** 108 control-plane routes, **0 frontend calls to nonexistent routes**,
**5 routes with no UI**, each individually justified and pinned by test.

Generated output: `docs/ADMIN_SUPER_ADMIN_CAPABILITY_MATRIX.md`
(`npm run inventory:capabilities`).

### The 5 routes without a UI

| Route | Verdict |
| --- | --- |
| `GET /api/admin/settings` | Superseded read; the console reads the public config document. Writes go through the reachable `POST /api/admin/settings/:category`. |
| `POST /api/admin/gdpr-settings` | Superseded writer — **and the source of defect D2 below.** |
| `GET /api/admin/circuit-breaker-status` | Diagnostic read; the breaker is operated via the reachable reset control. |
| `POST /api/admin/save-template-customization` | Legacy writer superseded by the template editor. |
| `GET /api/admin/custom-templates` | Legacy companion read for the above. |

None is a missing operator capability. All are recorded in
`ACCEPTED_ROUTES_WITHOUT_UI` in `tests/admin-capability-reconciliation.test.mjs`;
adding a sixth without a justification fails the suite, and an entry that becomes
reachable also fails (so the list cannot rot).

---

## 4. Defects found and fixed in this pass

### D1 — Enterprise tenant selection persisted a rejected context (P1)

**Root cause.** `EnterpriseContext.selectTenant` / `selectWorkspace` wrote the
requested id to `sessionStorage` **before** calling `load()`. When the server
rejected the selection (revoked membership, suspended/decommissioned tenant, a
transient 5xx), the rejected id remained persisted. Every later mount read it
back as the requested context, so the console reopened directly into the same
failure.

**Why this matters for the reported symptom.** This is a stale-state defect that
a reload could **not** clear — only clearing browser storage could. It is an
independent second mechanism behind "the view isn't right until I reload", and
it would have survived the entire CSS fix.

**Fix.** Persist only after the server accepts, store the id the server actually
returned (not the one requested, so a server-side fallback is what is
remembered), roll back to the previous accepted value on failure, and clear the
persisted request when a load fails so the next mount falls back to the server
default.

**Regression test.** `tests/frontend-state-hygiene.test.mjs` (4 tests) asserts
the write follows the await, the rollback exists, the failure path clears the
request, and the persisted value derives from the response.

### D2 — Hardened GDPR validation was dead code; the live path bypassed it (P2)

**Root cause.** `POST /api/admin/gdpr-settings` validated the consent-banner
fields (site-relative paths only, control characters stripped, lengths bounded).
**No frontend ever called it.** The console writes GDPR settings through the
generic `POST /api/admin/settings/gdpr`, which applied only the generic
normaliser — so the hardening was unreachable and the live write path accepted:

- an absolute third-party `privacyPolicyUrl` / `termsOfServiceUrl`, rendered to
  every visitor in the consent banner (an off-site link that the client-side
  `sanitizeUrl` permits, since it only blocks non-http(s) schemes),
- control characters in `cookieMessage` / `buttonText`,
- values far beyond the intended 500/80 character bounds.

**Fix.** Extracted a single canonical `sanitizeGdprSettings()` used by **both**
routes, so the hardened path cannot be bypassed and the two cannot drift.

**Regression test.** `backend/test/gdpr-settings-hardening.test.js` (6 tests)
drives the **real Express app** through the route the UI actually uses, and
includes a convergence test asserting both routes produce identical output.

### D3 — Non-deterministic typography from a duplicate remote font (P2)

**Root cause.** `src/tailwind.css` opened with an `@import` of Poppins from
Google Fonts while `index.html` already loaded a **self-hosted** Poppins
covering weights 300–900. The import survived the build as a real `@import`
inside `main-*.css`, so:

1. every page load made a render-blocking request to a third-party CDN, and
2. the remote `@font-face` rules were parsed **after** the self-hosted ones and
   therefore **won** — meaning the product actually rendered Google's copy, and
   silently swapped to the self-hosted copy whenever the CDN was slow, blocked
   by an extension, unreachable on a restricted network, or refused by CSP.

That is a non-deterministic typography path and a plausible contributor to the
original "doesn't look right until I reload" report.

A second instance was found in `src/components/Dashboard/Settings/Settings.scss`
(a remote Inter import in an application UI stylesheet).

**Fix.** Both removed. Typography now resolves from exactly one source with no
network round trip. Remote font imports that remain are confined to the CV and
portfolio **template engines** (`src/engine/hybrid/smartEngine.css`,
`src/components/PortfolioTemplates/webcv.css`), where the certified template
themes genuinely require typefaces the product does not ship. That distinction —
a *required* remote font vs a *duplicate* of one we already host — is enforced by
an allowlist in the test.

**Regression test.** `tests/stylesheet-hygiene.test.mjs` (7 tests), including a
built-output assertion that the main entry stylesheet contains no Google Fonts
reference.

### D4 — 73 dead stylesheets (P3)

**Method.** `scripts/stylesheet-reachability.cjs` computes reachability from all
build entry points (including the `template-lab` Rollup entry, which is the only
thing keeping `src/index.css` alive — an earlier version of the analyzer wrongly
reported it as dead). Each candidate additionally had to have **no textual
reference anywhere** in `src`, `scripts`, `tests`, `template-lab`, `public`,
`backend` or the build configuration.

**Proof of inertness.** The full production build was captured before and after
deletion and **every emitted CSS file is byte-identical** (76 chunks, matching
md5 sums). The deleted files provably could not affect rendering.

**Retained deliberately:** `AIGenerationModal.scss` (referenced by
`backend/frontend-example.js`, a reference implementation someone may restore).

**Regression test.** `tests/stylesheet-hygiene.test.mjs` fails if an unreachable
stylesheet is reintroduced.

### D5 — Configuration census was incomplete while reported COMPLETE (P2)

**Root cause.** The first census matched only `process.env.NAME` /
`import.meta.env.NAME`. Modules that receive an injected environment object and
read `env.NAME` were invisible. It reported "126 keys, COMPLETE" while omitting:

- `FIREBASE_TOTP_MFA_ENABLED` — the platform's own MFA capability declaration,
- `ENTERPRISE_ENCRYPTION_KEY`, `_KEYS`, `_ACTIVE_KEY`, `_KEY_VERSION`,
  `_PROVIDER` — **encryption key material**,
- `ENTERPRISE_DATA_PROVIDER`, `APP_PUBLIC_URL`, `PUBLIC_APP_URL`,
  `CANONICAL_PUBLIC_URL`, `VITE_DEV_PORT`.

A census that silently omits secret material is worse than none, because it is
trusted.

**Second defect in the same tool:** it scanned its own source, injecting a
phantom `NAME` key; and it classified every `VITE_*` key containing "KEY" as
`SECRET`. Vite inlines `VITE_*` into the client bundle, so those values are
public by construction — labelling them SECRET implies a protection that cannot
exist. They are now `PUBLISHABLE CLIENT IDENTIFIER` (security comes from
provider-side referrer/domain restrictions, not secrecy).

**Result:** 137 keys, 17 backend-only without a UI surface.

**Regression test.** `tests/configuration-census.test.mjs` (6 tests) regenerates
the census and fails if it is stale, cross-checks it with an **independent**
extractor, anchors the specific keys the first pass missed, and asserts no true
SECRET is reported as UI-exposed.

### D6 — Silent catch in the invoice printer (P3)

`subscriptionsSettings.jsx` had `catch (e) {}` around `printWindow.focus()`.
Replaced with an explicit `console.warn` and a comment stating why the failure is
non-fatal. Locked by a test that forbids a catch containing *neither handling nor
a documented reason*.

### D7 — MFA denials were not structured for the shared platform client (P2)

`platformApi.platformFetch` discarded the `mfaDenial` envelope produced in the
first pass, so a Super Admin blocked on a destructive tenant operation received a
bare HTTP error object. It now attaches `mfaState`, `remediation` and
`recoverableByReauthentication: false`, so every panel built on `platformFetch`
— including tenant decommission — inherits the honest explanation.

---

## 5. MFA / TOTP — final verification of the 7-state model

Re-verified by execution, not inspection (35 executed tests across
`backend/test/mfa-state-machine.test.js`, `backend/test/mfa-enforcement.test.js`,
`tests/mfa-state-machine.test.mjs`):

| Requirement | Status |
| --- | --- |
| All 7 states distinct and reachable | Verified — an executed test enumerates them and asserts the set |
| `MFA_REQUIRED` can never become authenticated-only | Verified — every enforced path asserts `satisfied === false` and returns 403 |
| Super Admin destructive ops protected | Verified — 4 destructive routes tested through the real Express app |
| Frontend cannot override MFA | Verified — the client posture is advisory; the server decides and re-derives from the token |
| Recent auth cannot masquerade as MFA | Verified — `RECENT_AUTH_REQUIRED` carries `satisfiesMfa: false`; a fresh session with no factor still yields `MFA_REQUIRED` |
| Enrollment cannot masquerade as verification | Verified — an enrolled-but-unchallenged token is denied; `Admin.jsx` no longer ORs in `enrolledFactors.length` |
| Forged custom claims rejected | Verified — a token carrying `mfa: true, mfaVerified: true` is denied |
| UNKNOWN provider never becomes ENABLED | Verified — capability defaults to `UNKNOWN`; only an explicit declaration or an observed successful enrollment sets `ENABLED` |
| `auth/operation-not-allowed` handled honestly | Verified — mapped to `MFA_CONFIGURATION_REQUIRED` with a platform-owner action; access still denied |
| No infinite reauth loop | Verified — `mfaDenial()` terminates the retry path with `recoverableByReauthentication: false` |
| No retry storm | Verified — MFA denials return immediately with no retry; `fetchAdminWithReauth` retries at most once and only for `RECENT_AUTH_REQUIRED` |

**No security control was weakened in this pass.**

---

## 6. Remaining accepted items (nothing hidden)

| Item | Why it is not a defect | Who acts |
| --- | --- | --- |
| Firebase TOTP provider enablement | Not observable from the codebase; Firebase Admin exposes no read API | Local Developer |
| Browser-level CSS suite not executed | No Chromium binary and no Playwright CDN access in the audit sandbox | Local Developer (`npm run test:css:browser`) |
| Remote fonts in `smartEngine.css` / `webcv.css` | Required by certified CV/portfolio template themes; removing them would change template output and break the visual gate | — (documented, allowlisted) |
| `smartEngine.css` lands in the `TemplateRenderer` entry chunk, so template fonts are requested on every page | Real inefficiency, but deferring it changes template rendering paths; out of scope for a hardening pass | Recommended follow-up |
| `AIGenerationModal.scss` unreferenced | Retained for `backend/frontend-example.js` | — |
| 625 ESLint warnings | 0 errors; not mass-edited during a security audit | Recommended follow-up |

---

## 7. Test-quality position

- No `.only` anywhere.
- The only `.skip` usages are conditional on `dist/` being absent.
- Tests added in this pass that exercise **real behaviour through the real
  application**: `gdpr-settings-hardening` (supertest against Express),
  `mfa-enforcement` (supertest), `platform-health-mfa-honesty` (real snapshot
  builder), `css-cascade-isolation` (real build output),
  `stylesheet-hygiene` (real reachability graph + real build output),
  `configuration-census` (regenerates and cross-checks with an independent
  extractor), `admin-capability-reconciliation` (real module graph).
- Non-vacuity is explicitly proven where a guard could silently pass: the CSS
  analyzer reports 4 conflicts before the fix and 0 after; the capability
  resolver has a test asserting the tenants page reaches decommission
  *indirectly*, so the test would fail if the indirection disappeared.
- Several tests initially failed against my own explanatory comments (prose
  quoting the removed `@import`/`alert()`). Those were fixed by making the tests
  analyse **code with comments and literals stripped** — a strengthening, not a
  relaxation. No assertion was deleted or weakened to obtain a pass.

---

## 8. Production-only verification required

1. Firebase TOTP multi-factor provider enabled on the production project.
2. `FIREBASE_TOTP_MFA_ENABLED=true` set to match reality.
3. `SUPER_ADMIN_MFA_REQUIRED` set as intended.
4. Live Firebase, SMTP, payment, Twilio, OAuth and AI provider credentials/health.
5. Hostinger deployment, PM2 process health, deployed `COMMIT_SHA`.
6. Cloudflare/Hostinger cache: `index.html` served `no-store`, `/assets/*`
   immutable, cache purged on deploy.
7. Browser-level CSS/asset suite executed against the deployed build.
8. Live CRUD, payment and email behaviour.

---

## 9. Local Developer runbook

```bash
# 1. Full deterministic regression
npm run lint
npm test
npm run test:enterprise:all
npm run build

# 2. Browser-level CSS/asset reliability (builds + serves + runs, one command)
npm run test:css:browser
#    …or against a deployed URL:
node scripts/run-css-reliability.mjs --base https://your-deployment

# 3. Regenerate derived inventories after any route/config change and commit
npm run inventory:api
npm run inventory:config
npm run inventory:capabilities

# 4. Resolve the MFA P0 in production
#    Firebase console → Authentication → Sign-in method → Advanced
#      → Multi-factor → enable Authenticator app (TOTP)
#    Then set FIREBASE_TOTP_MFA_ENABLED=true and restart via PM2.
#    Verify: GET /api/platform/security/mfa-posture
#      → state MFA_VERIFIED, satisfied true, providerCapability ENABLED
#    Until enabled, /adm correctly shows
#      "Multi-factor authentication configuration required" — that is the
#      honest state, not a regression.

# 5. Deployment cache
#    index.html                 → no-store
#    /assets/*-<hash>.(js|css)  → public, max-age=31536000, immutable
#    Purge the Cloudflare cache for index.html on every deploy.
```
