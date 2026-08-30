# ResumePilot AI — Final Forensic Codebase Audit

**Audit type**: Independent adversarial review. The prior certification
(`docs/FINAL_EXHAUSTIVE_SYSTEM_CERTIFICATION.md`) was treated as a claim to be
disproved, not as a baseline to be re-run.
**Auditor scope**: source-of-truth review of the repository at the baseline SHA.
**Date**: 2026-08-24

---

## 1. Baseline (recorded before any modification)

| Item | Value | Source |
|---|---|---|
| `git HEAD` | `049b4866dcde369f1169030dfa09ec04eae7a82d` | `git rev-parse HEAD` |
| `origin/main` | `049b4866dcde369f1169030dfa09ec04eae7a82d` | `git rev-parse origin/main` |
| Working tree | clean at audit start | `git status --porcelain` (empty) |
| Commit count | **1** (squashed; no history) | `git log --oneline --all` |
| `backend/COMMIT_SHA` | `29ff2e12ca67f6fdad590adf8ceee56deaf4721f` | file contents |
| SHA asserted by the prior report | `c8ae56565ce7cbfbead7b0b2e8ca8cbe073c6833` | `docs/FINAL_EXHAUSTIVE_SYSTEM_CERTIFICATION.md` |
| SHA asserted by the task brief | `049b486` | brief |

### 1.1 Baseline integrity — DEFECT (D7, P2)

**Three mutually inconsistent SHAs.** `049b486` is the only SHA that exists in
this repository. `git cat-file -t 29ff2e12ca67f6fdad590adf8ceee56deaf4721f`
returns `fatal: could not get object info` — the value in `backend/COMMIT_SHA`
**does not exist in this repository's object store**. The SHA quoted by the prior
certification report (`c8ae5656…`) likewise does not exist here.

Consequence: the prior report's headline claim
`LOCAL (HEAD) == ORIGIN/MAIN == DEPLOYED BACKEND == DEPLOYED FRONTEND (5/5 PASS)`
cannot be reproduced from this repository, and `npm run certify:identity` — which
compares the live backend `COMMIT_SHA` against `EXPECTED_SHA` — would **fail** if
run against a deployment carrying the committed `backend/COMMIT_SHA`.

`backend/COMMIT_SHA` is a deploy-time artifact that has been committed with a
stale value. It is read by `backend/routes/platform.js:getCommitSha()` and served
on `/api/platform/version`, so the deployed API would self-report a SHA that is
not the tested SHA.

**RCA**: `backend/COMMIT_SHA` is written by the deploy pipeline but is also
version-controlled, so a stale committed value silently overrides the
self-identification contract.
**Fix applied**: none in code — changing it here would assert a deployment fact
this environment cannot prove. See §9 (production-only items).
**Mitigation**: the runbook step must export `EXPECTED_SHA=$(git rev-parse HEAD)`
and treat a `COMMIT_SHA` mismatch as a hard stop (the script already does).

### 1.2 `049b486` is the authoritative release

`049b486` is HEAD, is `origin/main`, and is the only commit. It is therefore the
authoritative release for this audit. The repository has **not** moved beyond it;
all changes in this audit are uncommitted-to-this-branch working-tree edits on
`arena/01a032c3-resumepilotai`.

---

## 2. Method

Reverse-discovery from source, not from existing inventories:

1. **Route census** — parsed every `router.<verb>(…)` in `backend/index.js` and
   `backend/routes/*.js`, resolving `app.use(prefix, router)` mount points and
   **array-form** registrations (`app.post(['/a','/b'], …)`).
2. **Frontend consumer census** — extracted every `/api/…` literal from `src/**`.
3. **Import-graph reachability** — walked the static import graph from
   `src/main.jsx` (comment-aware, so commented-out imports do not create edges).
4. **Guard map** — associated each route with its middleware chain
   (`requireAuth`, `requirePermission`, `requireSuperAdmin`,
   `requireRecentAdminAuthentication`, `requireEnterpriseAuth`,
   `resolveTenantContext`, `requireTenantPermission`).
5. **CSS cascade analysis** — nesting- and `@media`-aware scan for selectors that
   can match arbitrary application markup, validated against the built
   `dist/assets/*.css` artifacts.
6. **Behavioural tests** — real Express app over HTTP via `supertest`; real
   frontend module loaded with Node module hooks.

### 2.1 Tooling corrections made during the audit

Three of the auditor's own first-pass findings were **false positives** and are
recorded here so they are not mistaken for defects:

| Initial suspicion | Verdict | Evidence |
|---|---|---|
| `sign_in_second_factor` is not a real Firebase claim, so `hasSecondFactor()` is always false and Super Admin is permanently locked out | **WRONG — disproved** | It is a documented Firebase ID-token claim under `token.firebase`, used in security rules as `request.auth.token.firebase.sign_in_second_factor`. The MFA design is sound. |
| Lazy `CoverLetter.css` leaks `html/body/*/button/input` globally on screen | **WRONG — false positive** | Those selectors are inside `@media print { … }` (`src/components/CoverLetter/CoverLetter.scss:26+`). The scanner had stripped `@media` wrappers. |
| 17 broken imports in live code | **Overstated** | After comment-aware scanning: 8, of which 7 are in unreachable files and 1 is a prose string, not an import. |

---

## 3. Independent census (authoritative)

| Metric | Prior report | **This audit** |
|---|---|---|
| Backend route verbs | 409 | **276** |
| Backend unique paths | 266 endpoints | **236** |
| Frontend `/api/` call paths | 1,303 interactive actions | **165 distinct API paths** |
| Frontend files reachable from `src/main.jsx` | 491 files scanned | **562 reachable** |
| Frontend calls with no backend route | 0 | **0** (the sole hit, `/api/placeholder/200/280`, is inside unreachable dead code) |
| Backend routes with no frontend consumer | 0 | **7**, all legitimate public/infra: `/healthz`, `/readyz`, `/llms.txt`, `/custom-pages.json`, `/public/custom-pages.json`, `/trusted-by.json`, `/public/trusted-by.json` |
| Tests (`npm test` = security+product) | 366 | **653** (280 security + 373 product) |
| Tests incl. `test:enterprise` | — | **849** |

The prior report's counts do not match any reproducible measurement. They are
treated as inaccurate rather than as evidence of missing code: the *route and
consumer sets reconcile cleanly*, which is the property that actually matters.

---

## 4. Defects found

| ID | Sev | Summary | Status |
|---|---|---|---|
| D1 | **P1** | Payment-settings read gated `SUPER_ADMIN` while the Admin console renders it; failure swallowed by `console.warn` → empty gateway fields | **FIXED** |
| D2 | **P2** | `MFA_ENROLLED` conflated with `MFA_VERIFIED` in the Admin console | **FIXED** |
| D3 | **P2** | Unscoped global CSS leaked resume typography into the whole application | **FIXED** |
| D4 | **P3** | Poppins loaded twice (self-hosted + remote render-blocking `@import`) | **FIXED** |
| D5 | **P2** | A string-matching test certified an unreachable component as a capability | **FIXED** |
| D6 | **P1** | `listBlogPosts()` error handler threw `ReferenceError` — the fallback path was dead | **FIXED** |
| D7 | **P2** | Three inconsistent SHAs; committed `backend/COMMIT_SHA` is not a real object | **DOCUMENTED** (production-only) |
| D8 | **P3** | `npm run ci:security` failed at step 1 (`npm run lint` exited 1, 2 `no-undef` errors) | **FIXED** (by D6) |
| D9 | **P3** | Dead components with unresolvable imports counted in the capability census | **DOCUMENTED** |

---

## 5. Root-cause analysis

### D1 (P1) — Payment panel silently empty; "Razorpay values disappeared"

**Chain**: `Admin console → Settings → Subscriptions & Gateways`
(`src/components/admin/settings/Settings.jsx:113`) renders
`subscriptionsSettings.jsx`, which called `getAdminPaymentSettings()` →
`GET /api/platform/payment-settings`, gated `requireSuperAdmin`
(`backend/routes/platform.js:1697`). In production that middleware also demands a
verified second factor. The component wrapped the call in
`catch (e) { console.warn(...) }`.

**Effect**: for any ADMIN — and for a SUPER_ADMIN whose session had not completed
a second factor — the request returned 403, the catch swallowed it, and the panel
rendered every gateway field empty with `paymentRevision: 0`. The next save sent
`expectedRevision: 0` and was rejected with `PAYMENT_SETTINGS_CONFLICT`
("refresh before saving"), which refreshing could never fix. This reproduces the
reported symptom exactly.

**Architecture inconsistency**: the identical, secret-free projection was already
served to any ADMIN holding `system.config.read` by the alias
`GET /api/admin/payment-settings` (`backend/index.js:1876`). The declared
permission map already grants ADMIN `payments.manage`
(`backend/security/auth.js`). So the `SUPER_ADMIN` gate on the canonical route
never restricted anything real — it only made the canonical route unreachable for
the UI that renders it.

**Fix** (architecture-aligned, no new service, no parallel path):
- `backend/routes/platform.js` — canonical read now `requirePermission('system.config.read')`, matching the alias.
- The **write** is untouched: `POST /api/admin/payment-settings` still requires `requireRecentAdminAuthentication` = SUPER_ADMIN + verified second factor + recent `auth_time`.
- `subscriptionsSettings.jsx` — load failures set `paymentSettingsNotice` (rendered, `role="alert"`) and `paymentSettingsLoaded`; `submitHandler()` refuses to save while the projection has not loaded.
- The component's existing intent ("This view is read-only for Admin") now actually holds, because the read succeeds.

**Security note**: the projection is secret-free by construction —
`publicPaymentSettings()` strips every credential-shaped key; only `maskedKeys`
(`••••last4`) and public client-side identifiers (Razorpay `key_id`, Stripe
publishable key, PayPal client id, Paytm MID, PhonePe id) leave the server. Test
2 of `payment-settings-rbac.test.js` asserts no raw secret crosses the wire.

### D2 (P2) — MFA state confusion

`Admin.jsx` computed a single flag:
`hasMfa = Boolean(claims…sign_in_second_factor || user.multiFactor?.enrolledFactors?.length)`.
The second operand is **MFA_ENROLLED**, not **MFA_VERIFIED**. A Super Admin who
had enrolled TOTP but signed in without completing the challenge saw **no**
banner, then received `SUPER_ADMIN_MFA_REQUIRED` on every protected action with
no guidance.

**Fix**: two distinct fields. `mfaVerified` derives **only** from the verified
`sign_in_second_factor` claim (the same source of truth as
`backend/security/auth.js:hasSecondFactor`). `mfaEnrolled` derives from
`enrolledFactors`. The banner is driven by `!mfaVerified` and its copy differs
for the enrolled-but-unverified case. The token-read failure path fails closed
(`mfaVerified = false`).

**Backend authority is unchanged** — this was a UI-state defect, not a bypass.
`requireSuperAdmin` remained server-side authoritative throughout.

### D3 (P2) — Global CSS leakage

`src/cv-templates/css/globalTemplateEnhancements.css` is linked from
`index.html`, so it applies on **every** route. It contained:

```css
p, .summaryContent, [class*="-description"], [class*="-summary"], … {
  text-align: justify !important;
}
.cv-content, [class*="-content"], .sectionTitle, .rightSection, … {
  width: 100% !important; max-width: 100% !important;
}
h1,h2,h3,h4,h5,h6, [class*="-title"], [class*="-head"] { break-after: avoid !important; }
section, [class*="item"], [class*="grid"], [class*="-card"] { break-inside: avoid !important; }
```

Verified in the built artifact
(`dist/assets/globalTemplateEnhancements-*.css`):

```css
p,.summaryContent,.employment__body,[class*=-description],[class*=-summary],[class*=-bodySection] p{text-align:justify!important;text-justify:inter-word!important}
```

Because these are `!important`, they **silently defeated Tailwind's
`text-left` / `text-center` / `text-right` utilities** on every paragraph in the
Admin console, Enterprise console, Dashboard, Auth, Blog chrome, modals and
toasts. `[class*="-content"]` additionally matched `blog-content`,
`modal-content`, `dashboard-content`, `provider-content`, … and forced full
width.

**Fix**: every one of these rules is now scoped to the resume document
containers that all templates actually render into — `[class*="-board"]`
(all `cvN-board` / `coverN-board` roots), `[data-cv-board]` (set by
`ResumePageComposer`), `.cv-board`. No template declares
`text-align: left|center !important`, so **template output is unchanged** while
application UI typography returns to Tailwind's control.

**Order-independence verdict — important correction**: the prior report's
"CSS order independence verified" claim is *narrowly* true but for the wrong
reason. `globalTemplateEnhancements.css` is emitted as a **separate chunk** yet
is `<link>`-ed statically in `index.html`, ahead of `main-*.css`; its leak was
therefore **deterministic and always-on, not visit-order-dependent**. The genuine
order-dependent residue is **print-only**: `@media print` rules in lazy chunks
(`CoverLetter`, `Cv*`, `EnterpriseConsole`) persist in `<head>` for the whole SPA
session, so printing a different page after visiting them hides
`nav/header/footer/button/input/textarea`. Screen styling does **not** depend on
visit order, hard reload, or chunk order.

### D4 (P3) — Duplicate font loading

`index.html` self-hosts Poppins (`/fonts/poppins.css`, 36 `@font-face` rules,
weights 300–900, normal + italic, with `rel=preload`). `src/tailwind.css`
additionally began with
`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@100;…;900&display=swap')`.

Consequences: a **render-blocking** third-party import, a hard runtime dependency
on Google's origin (plus CSP allow-list entries for `fonts.googleapis.com` /
`fonts.gstatic.com`), nine weights downloaded on top of seven already
self-hosted, and **two competing `@font-face` sets for the same family whose
winner depends on stylesheet load order**.

**Fix**: remote import removed; the self-hosted file is the single source of
truth.
**Accepted, documented consequence**: weights 100 and 200 were only on the Google
URL. The single `font-extralight` (200) usage
(`src/components/PortfolioBuilder/PortfolioComponents/Hero3.jsx:119`) now resolves
to the nearest self-hosted weight (300) — one decorative hero line, no family
fallback. The test suite asserts no *new* uncovered weight appears.

### D5 (P2) — False-positive certification test

`tests/docx-client-journey.test.mjs` asserted that the string
`executeDocxDownload` appears in
`src/components/BuildResume/steps/FinalizeStep.jsx`. That file:
- is **not imported by any module** (unreachable from `src/main.jsx`);
- imports `../../../services/firebase`, which **does not exist**;
- uses `alert()` and points four template previews at `/api/placeholder/200/280`,
  an endpoint that does not exist.

So a test "verified" a capability no user can reach. `npm run build` succeeds only
because the file is never in the module graph.

**Fix**: removed from the asserted surface set, and a **reachability guard** was
added (`D5: every asserted DOCX journey surface is reachable from the application
entry`) that walks the real import graph and fails if any asserted capability
surface is unreachable. This prevents the class of error, not just this instance.

### D6 (P1) — Dead error handler (`ReferenceError`)

In `src/firestore/dbOperations.js`, `listBlogPosts()` destructured `page` and
`limit` from `options` **inside** the `try` block. They were block-scoped to the
`try` and not visible in the `catch`, so the "graceful empty list" fallback threw
`ReferenceError: page is not defined` instead of returning. Callers received an
unrelated runtime error rather than the documented empty envelope.

ESLint flagged both as `no-undef`, but `npm run lint` is **not** part of
`npm test` — only part of `ci:security`. That is also **D8**: `npm run ci:security`
began with `npm run lint &&` and therefore **exited 1 at step 1**. The prior
certification's implication that the CI security gate passes is false.

**Fix**: read `Number(options?.page)` / `Number(options?.limit)` in the catch
(`options` is always in scope). `npm run lint` now exits **0 with 0 errors**
(644 pre-existing warnings remain).

### D9 (P3) — Dead code counted as capability

Unreachable files with unresolvable imports: `FinalizeStep.jsx`,
`Dashboard/AddPage/AddPage.jsx`, `admin/settings/pagesSettings.jsx`*,
`Form/img-upload-input/ImgUploadInput.jsx`*, `Boards/canvas-react/CanvasR.jsx`,
`cv-templates/index.jsx`, `welcome/App.test.js`, `App.jsx`,
`Dashboard/ResumeCard/ResumeCard.jsx`. (*`pagesSettings.jsx` and
`ImgUploadInput.jsx` are reachable; their missing-package imports are commented
out, so they are live and fine — corrected during the audit.)

Also dead: `DashboardMain.jsx:191 handleCoverLetter()` and the
`isCommingSoonShowed` state — defined, never bound to any control. **No
user-visible dead button results**; this is code hygiene.

**Not deleted** in this audit: removing files is a larger blast radius than the
defect warrants, and the reachability guard now prevents dead code from being
*certified*. Recommended as a follow-up cleanup.

---

## 6. Files changed

| File | Change |
|---|---|
| `backend/routes/platform.js` | D1 — `GET /payment-settings` gate aligned to `system.config.read`; RCA comment |
| `src/components/admin/settings/subscriptionsSettings.jsx` | D1 — honest failure surfacing (`paymentSettingsNotice`, `paymentSettingsLoaded`), save guard, split catch blocks |
| `src/components/admin/Admin.jsx` | D2 — `mfaVerified` vs `mfaEnrolled` separated; banner + context updated; fail-closed |
| `src/cv-templates/css/globalTemplateEnhancements.css` | D3 — four global rule groups scoped to board containers |
| `src/tailwind.css` | D4 — remote font `@import` removed; RCA comment |
| `src/firestore/dbOperations.js` | D6 — `listBlogPosts` catch no longer references out-of-scope bindings |
| `tests/docx-client-journey.test.mjs` | D5 — unreachable surface removed from assertions |
| `backend/test/payment-settings-rbac.test.js` | **NEW** — 7 behavioural tests over real HTTP |
| `tests/forensic-audit-regressions.test.mjs` | **NEW** — 13 regression tests (D1–D5) |
| `tests/blog-list-fallback.test.mjs` | **NEW** — 2 behavioural tests (D6) |
| `tests/helpers/empty-stub.mjs` | **NEW** — inert stub for module-hook tests |
| `package.json` | new frontend test files wired into `test:product` |
| `docs/FINAL_FORENSIC_CODEBASE_AUDIT.md` | **NEW** — this document |

---

## 7. Tests

### 7.1 Counts

| Suite | Before | After |
|---|---|---|
| `test:security` | 273 | **280** |
| `test:product` | 358 | **373** |
| `test:enterprise` | 196 | **196** |
| **Total** | **827** | **849** |

All green: `0 failed, 0 skipped, 0 todo`. `npm run build` exits 0.
`npm run lint` exits 0 (was 1).

### 7.2 Non-vacuity evidence

Every fix was re-broken deliberately and the suite re-run:

| Reintroduced defect | Tests that failed |
|---|---|
| `GET /payment-settings` → `requireSuperAdmin` | `payment-settings-rbac` **#1, #2, #5** (4 pass / 3 fail) |
| bare `p,` restored in the justification rule | `forensic-audit-regressions` **#2** |
| remote font `@import` restored | `forensic-audit-regressions` **#5** |
| `mfaVerified` re-conflated with `enrolledFactors` | `forensic-audit-regressions` **#8** |
| banner reverted to `!authState.hasMfa` | `forensic-audit-regressions` **#9** |
| `FinalizeStep.jsx` re-added to asserted surfaces | `forensic-audit-regressions` **#12, #13** |
| `page`/`limit` restored in the catch | `blog-list-fallback` **#1, #2** — both reported `name: 'ReferenceError'` |

In every case the tests were then restored and re-run green.

### 7.3 Test-quality notes

- `payment-settings-rbac.test.js` drives the **real Express app over HTTP** via
  `supertest`, with a real Firestore-shaped mock. It asserts status codes, the
  returned projection, secret absence, and that the write path still rejects
  ADMIN and SUPER_ADMIN-without-MFA.
- `blog-list-fallback.test.mjs` loads the **real** `dbOperations.js` module
  through Node `module.registerHooks` with only Firebase stubbed, and calls the
  real function. It is not a re-implementation of the logic under test.
- `forensic-audit-regressions.test.mjs` contains structural assertions where no
  DOM harness exists for the component. Two of them are deliberately
  self-guarding against passing by deletion (`assert.ok(checked > 0, '… must not
  pass by deletion')`).
- No test was deleted or weakened to obtain green. One assertion target was
  *removed* (D5) and replaced with a stronger reachability invariant.

---

## 8. Verification results by domain

### Security / RBAC
- `requireAuth`, `requirePermission`, `requireSuperAdmin`,
  `requireRecentAdminAuthentication` are all **server-side**; no client flag
  grants access.
- `requireRecentAdminAuthentication` uses the verified `auth_time` claim and
  **fails closed** when absent; no client-supplied timestamp is accepted.
- Verified by HTTP: ADMIN cannot write payment settings (403); SUPER_ADMIN
  without a verified second factor gets `SUPER_ADMIN_MFA_REQUIRED` (403);
  unauthenticated gets 401; USER gets 403 on the read.
- No security control was weakened. The one gate change (D1) is on a **read** of
  a provably secret-free projection and matches an alias that already granted the
  same payload to the same role.

### MFA
- `sign_in_second_factor` confirmed as a genuine Firebase ID-token claim; the
  enforcement design is correct.
- The four states are now distinct in the UI as well as the backend:
  `AUTHENTICATED` ≠ `RECENT_AUTHENTICATED` ≠ `MFA_ENROLLED` ≠ `MFA_VERIFIED`.
- **MFA PRODUCTION CONFIGURATION = NOT VERIFIED.** Whether the Firebase project
  has the TOTP second-factor provider *enabled* is a console/tenant setting that
  cannot be read from this repository. If it is disabled, enrollment fails with
  `auth/operation-not-allowed` at runtime. This remains an open production item.

### CSS
- 0 truly-unscoped on-screen global selectors remain in
  `globalTemplateEnhancements.css` (was 4 rule groups).
- Built artifact verified after rebuild.
- Remaining unscoped selectors app-wide: `html, body` in `src/index.scss`
  (intentional reset) and `h1`–`h6` in `src/tailwind.css` (intentional, preserves
  heading defaults after Tailwind preflight). Both are deliberate and global by
  design.
- Screen rendering does not depend on visit order, reload, or chunk order.
  Print output does (see D3 note) — recorded as a known, low-severity residue.

### API
- 276 verbs / 236 paths; 0 frontend calls without a backend route; 7
  backend routes without a frontend consumer, all public/infra by design.
- No unexplained 5xx was found in the route set; non-2xx responses inspected
  carry explicit `error.code` values (`FORBIDDEN`, `SUPER_ADMIN_MFA_REQUIRED`,
  `RECENT_AUTH_REQUIRED`, `PAYMENT_SETTINGS_CONFLICT`,
  `INFRASTRUCTURE_SECRET_CANNOT_CLEAR`, `EMAIL_VERIFICATION_REQUIRED`, …).

### Platform Health
- `backend/services/platformHealth.js` distinguishes `OPERATIONAL`, `DEGRADED`,
  `UNAVAILABLE`, `DISABLED`, `NOT_CONFIGURED`, `NOT_SUPPORTED`, `UNKNOWN`, with a
  severity ordering and an explicit "an unreadable source is reported as UNKNOWN
  rather than zero" contract. No path converts `UNKNOWN → HEALTHY` or
  `DISABLED → OPERATIONAL`. **PASS (code-level)**.

### Secret management
- `paymentAdmin.resolveWriteOnlySecret` implements PRESERVE / REPLACE / CLEAR
  with masked values treated as PRESERVE, and refuses to clear
  deployment-managed secrets (`INFRASTRUCTURE_SECRET_CANNOT_CLEAR`, 409).
- Optimistic-concurrency `expectedRevision` → 409 on conflict.
- Verified over HTTP that no raw secret appears in the read projection.

### AI
- `aiRuntime.requestProvider` retries at most **one** additional model candidate
  per provider, bounded by a `for` loop — no recursion. Provider failover walks a
  fixed order and aborts on `signal.aborted`.
- `aiService.generateUserAiContent` retries **at most once**, only on
  401/403/`AUTH_REQUIRED`/`EMAIL_VERIFICATION_REQUIRED`, and only after a forced
  `getIdToken(true)`. No retry storm, no duplicate generation (the retry only
  fires when the first request did **not** succeed).

### Email verification
- `backend/security/auth.js:requireAuth` re-checks live Firebase
  (`lookupUser`) when the token's `email_verified` is false, so a freshly verified
  user is not blocked by token-cache lag. The lookup failure is non-fatal and
  preserves token-derived state.

### Silent failures
- 119 empty/console-only catch blocks across reachable frontend files; 17 in
  admin/enterprise surfaces. The consequential one (D1) is fixed. Others reviewed:
  print-window handling, optional quota stats, localStorage preference writes,
  health-indicator polling (which correctly reports `unavailable`, never green).

---

## 9. Production-only items — remain UNVERIFIED

These **cannot** be proven from this environment and are **not** claimed as PASS:

1. **Firebase TOTP second-factor provider enabled** on the production project.
2. **Live deployment SHA** equals the tested SHA (see D7).
3. **Real payment-provider credentials** and end-to-end charge/settlement for
   Stripe, Razorpay, PayPal, Paytm, PhonePe.
4. **SMTP/IMAP deliverability**, **Twilio** send, and **AI provider** quota/keys
   (NVIDIA, Gemini, OpenAI, Groq, DeepSeek, OpenRouter).
5. **Cloudflare** cache/CSP behaviour and **Supademo** framing in production.
6. **Firestore/RTDB security rules** enforcement — `npm run test:firestore`
   requires the Firebase emulator, which was not run here.
7. **Browser-level** verification (Playwright live probes). No browser was driven
   in this audit; the prior report's "56/56 live probes" is **not reproduced**.

---

## 10. Configuration census (summary)

- **97** app-level backend environment variables (`backend/**`, excluding
  `node_modules`).
- **18** `VITE_*` build-time public variables.
- `ENTERPRISE_TENANCY_ENABLED` / `VITE_ENTERPRISE_TENANCY_ENABLED` — **exist**,
  default `false` in `.env.example`, asserted `false` by
  `backend/enterprise-test/consistency-audit.test.js`. Infrastructure-only;
  resource writes fail closed when enabled without encryption configuration.
- **`FIREBASE_TOTP_MFA_ENABLED` — DOES NOT EXIST in this codebase.** A full-tree
  search returns no match. MFA enforcement is governed by
  **`SUPER_ADMIN_MFA_REQUIRED`** (`true`/`false`; defaults to enabled when
  `NODE_ENV=production`), with `SENSITIVE_AUTH_MAX_AGE_MS` (default 600000) and
  `REQUIRE_RECENT_AUTH_IN_TEST` for test parity. Any runbook or dashboard
  referencing `FIREBASE_TOTP_MFA_ENABLED` is describing a setting that is not
  implemented.

Classification of the notable settings:

| Setting | Class |
|---|---|
| `SUPER_ADMIN_MFA_REQUIRED`, `SENSITIVE_AUTH_MAX_AGE_MS` | INFRASTRUCTURE ONLY |
| `ENTERPRISE_TENANCY_ENABLED`, `ENTERPRISE_STORAGE_PROVIDER`, `ENTERPRISE_OUTBOX_WORKER_ENABLED`, `TENANT_JOB_SIGNING_SECRET` | INFRASTRUCTURE ONLY |
| `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `GOOGLE_APPLICATION_CREDENTIALS` | SECRET / WRITE-ONLY |
| `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_SECRET`, `PAYPAL_CLIENT_SECRET`, `PAYTM_MERCHANT_KEY`, `PHONEPE_SALT_KEY`, `TWILIO_AUTH_TOKEN`, `SMTP_PASS`, `IMAP_PASS`, `CLOUDFLARE_API_TOKEN` | SECRET / WRITE-ONLY (Admin UI cannot clear env-managed values) |
| AI provider keys, SMTP/IMAP hosts, rate limits, CMS scheduler | SUPER ADMIN CONFIGURABLE (via `POST /api/admin/settings/:category`, SUPER_ADMIN + MFA + recent auth) |
| Payment public identifiers & pricing | SUPER ADMIN CONFIGURABLE (write), ADMIN readable |
| `VITE_FIREBASE_*`, `VITE_RAZORPAY_KEY_ID`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_PAYPAL_CLIENT_ID` | BUILD-TIME PUBLIC |
| `FORENSIC_ADMIN_*`, `RESET_ADMIN_*` | TEST/BOOTSTRAP ONLY — must not be set in production |

---

## 11. Remaining risks

1. **D7 unresolved in code.** `backend/COMMIT_SHA` still carries a SHA that is not
   an object in this repository. Until the deploy pipeline owns that file (or it
   is git-ignored), deployment self-identification can silently disagree with the
   tested SHA.
2. **Print-media leakage across SPA navigation** (D3 note). Visiting a cover
   letter or CV route leaves `@media print` display-none rules for
   `nav/header/footer/button/input/textarea` in the document, affecting printing
   of later routes until reload. Low severity, screen-neutral.
3. **Dead code remains in the tree** (D9). It cannot execute, but it inflates
   naive censuses and will break if ever imported.
4. **644 lint warnings** remain (unused variables, useless escapes). None are
   errors, but the volume hides future `no-undef` findings — the class that
   produced D6. Recommend `npm run lint` stay in CI and that `no-undef` be
   promoted to a blocking rule.
5. **No browser-level verification** was performed in this audit.

---

## 12. Certification matrix

`PASS` = proven from this environment. `UNVERIFIED` = requires production
credentials/tools. Nothing below is inferred.

| Domain | Status | Basis |
|---|---|---|
| CODEBASE | **PASS** | 849 tests green, build exits 0, lint 0 errors |
| ARCHITECTURE | **PASS** | no parallel auth/tenant/service introduced; fixes reuse existing policy middleware and endpoints |
| SECURITY | **PASS** (code-level) | server-side gates verified over HTTP; no control weakened |
| MFA | **PARTIAL** | state machine correct and tested; **Firebase provider enablement NOT VERIFIED** |
| ADMIN | **PASS** | payment panel now loads and fails honestly; RBAC verified |
| SUPER_ADMIN | **PASS** (code-level) | write still requires SUPER_ADMIN + MFA + recent auth |
| TENANT | **PASS** (code-level) | 196 enterprise tests green; **live isolation NOT VERIFIED** |
| USER CRUD | **PARTIAL** | blog-list fallback fixed and tested; other CRUD paths not re-proven against a live datastore here |
| CONFIGURATION | **PASS** | census complete; `FIREBASE_TOTP_MFA_ENABLED` proven absent |
| SECRET MANAGEMENT | **PASS** (code-level) | PRESERVE/REPLACE/CLEAR + 409 guards verified over HTTP; **no live provider exercised** |
| AI | **PASS** (code-level) | retry bounded to one, non-recursive; **no live provider call** |
| EMAIL VERIFICATION | **PASS** (code-level) | live-state fallback present; **no live send** |
| CSS | **PASS** | 0 unscoped on-screen globals in the leaking sheet; built artifact verified |
| CACHE / STATE | **PARTIAL** | service worker disabled and unregistered; no browser session tested |
| API | **PASS** | 276 verbs / 236 paths, 0 orphans, guards mapped |
| PLATFORM HEALTH | **PASS** (code-level) | no UNKNOWN→HEALTHY path; **live collectors NOT VERIFIED** |
| EXTERNAL INTEGRATIONS | **UNVERIFIED** | no credentials in this environment |
| TEST QUALITY | **PASS** | non-vacuity demonstrated for all 7 fix areas |
| DOCUMENTATION | **PASS** | this report; prior report's counts corrected |
| LIVE PRODUCTION | **UNVERIFIED** | no production access; browser probes not run |

### Final statement

**CODEBASE VERIFIED.** **LIVE PRODUCTION NOT VERIFIED.**

This audit does **not** assert "10/10 production certified". Seven real defects
were found that a fully green 827-test suite and a 10/10 report had missed —
including a dead error handler that threw `ReferenceError`, an Admin page that
silently rendered empty payment credentials, a CSS rule that overrode the entire
application's paragraph alignment, and a CI gate that was failing at step 1. Six
were fixed with non-vacuous regression tests; one (D7) is a deployment concern
this environment cannot resolve.
