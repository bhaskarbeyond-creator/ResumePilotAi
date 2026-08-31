# Regression Matrix

Every remediation was verified against existing tests and manual code review.

## Post-Fix Verification Results

| Test Suite | Before Fix | After Fix |
|------------|-----------|-----------|
| Backend unit tests (backend/test/*.js) | 513 pass, 0 fail, 24 skipped | 513 pass, 0 fail, 24 skipped |
| Security static tests (44 assertions) | 44 pass, 0 fail | 44 pass, 0 fail |
| Product tests (411 assertions) | 411 pass, 0 fail | 411 pass, 0 fail |
| ESLint | 2 warnings | 0 errors, 0 warnings |
| Vite production build | Success with eval warning (lottie-web 3rd party) | Same (eval warning is in 3rd party code, not remediated) |

## Areas Verified Not Regressed

1. **AI skill parsing / sanitization** (REM-002/003 regex change):
   - `backend/test/ai-runtime.test.js` – covers `cleanSkillName`, `parseAiResponse`, provider flow.
   - `tests/ai-client.test.mjs` – covers AI client-side service.
   - Both pass.

2. **Resume builder / ActionFilling field management** (REM-001/004 console.log removal):
   - `tests/resume-workflow.test.mjs`, `tests/build-resume-shell.test.mjs`, `tests/create-resume-extras.test.mjs` cover resume creation and field updates.
   - `tests/cross-module-journeys.test.mjs` covers multi-step resume flow.
   - All pass.

3. **Authentication and Authorization** (unchanged):
   - `backend/test/security.test.js` (10 tests) all pass.
   - `backend/test/superadmin-control-plane.test.js`, `admin-rbac-contract.test.js` pass.
   - `tests/auth-mfa-ui-adversarial.test.mjs`, `tests/auth-error-messages.test.mjs`, `tests/mfa-static.test.mjs` all pass.

4. **Payments** (unchanged):
   - `backend/test/payments.test.js` (6 tests) all pass.
   - `backend/test/payment-activation*.test.js`, `provider-refunds.test.js`, `refund-*.test.js`, `indian-gateway-activation.test.js` all pass.
   - `tests/membership-lifecycle.test.mjs` integration passes.

5. **Build resume / Template rendering** (unchanged):
   - All 8 template-render tests pass.
   - 51 templates verified in catalog tests.
   - `tests/template-production-render.test.mjs`, `tests/template-empty-sections.test.mjs`, `tests/template-differentiation.test.mjs`, `tests/template-quality-gate.test.mjs` all pass.

6. **Export** (unchanged):
   - `backend/test/export-pipeline.test.js`, `export-tokens-authority.test.js` pass.
   - `tests/export-client.test.mjs`, `tests/docx-client-journey.test.mjs` pass.

7. **Enterprise** (unchanged):
   - Enterprise test files require live MariaDB (environment-blocked) but code paths unchanged.

## Cross-Cutting Verification
- No route signatures changed.
- No API response schemas changed.
- No permission checks modified.
- No payment provider contracts modified.
- No database migrations added.
- No auth token formats changed.
