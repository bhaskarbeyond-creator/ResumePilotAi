# Test Integrity Audit

## Test Execution Summary

### Backend tests (node --test via scripts/run-tests-with-annotations.js)
- Total: 537
- Pass: 513
- Fail: 0
- Skipped: 24
- Cancelled: 0
- Duration: ~31 seconds

### Security static tests
- Total: 44
- Pass: 44
- Fail: 0
- Tests cover: firebase deploy config auth-only, secret scanning, production delivery security, XSS/HTML sanitizer, URL sanitizer, rich text sanitization, MFA static, auth error messages.

### Product tests
- Total: 411
- Pass: 411
- Fail: 0
- Covers: auth/MFA UI adversarial, OAuth resolver, admin UX consistency, template rendering (51 templates), template differentiation/empty sections/archetypes, portfolio sanitization/data/isolation/templates, blog workflow, admin workflow, superadmin control plane, user-360 tenant assignment, admin AI settings, admin settings regression, profile workflow/concurrency, release candidate, cross-module journeys, account isolation/lifecycle-regression, messaging regression, employer lifecycle, notification lifecycle, custom pages, public discovery, forensic RC, job tracker, i18n, AI client, privacy consent, resume workflow/persistence, interview coach (with hardening/lifecycle), export client, docx client journey, certifications step, create resume extras, ATS module toggle/score/journey, platform health, forensic audit regressions, product UX audit regressions, blog list fallback, portfolio templates.

### Classifications of Skipped Tests
The 24 skipped subtests in backend are NOT due to assertion weakening. They fall into:
1. **VALID_ENVIRONMENT_LIMITATION**: Tests requiring live MariaDB, Firebase credentials, or TENANT_JOB_SIGNING_SECRET (enterprise outbox, backup/restore, data-plane, migration, failover, tenant-purge, load tests).
2. **NOT_APPLICABLE**: Tests that explicitly check for feature-flag-gated behavior that is intentionally disabled when prerequisites aren't met.
3. No tests were found that were skipped due to test bugs or to hide failures.

### Weakened Assertions Check
- Grepped for `todo`, `skip`, `FIXME` in test files — only legitimate `t.skip()` for environment-blocked tests.
- No evidence of tests being modified to accept broken behavior.
- Test helper `routesIntegrationContract.js` enforces strict contract shape; tests cannot pass by returning loosely typed responses.

### Test Mocks
- `test/helpers/inMemory*.js` – legitimate in-memory fakes for repositories (enterprise outbox, tenant registry, enterprise repository, tenant backup pool, atomic counter store). These are used to test contracts without MySQL; they mirror the real interface.
- `setTokenVerifierForTests` / `setUserLookupForTests` – explicitly gated behind NODE_ENV=test.
- No production code branches on test doubles outside of `NODE_ENV=test` or the explicit TEST_AUTH_HMAC_SECRET (which is inert in production).

### Fakes Hiding Production Failures
- Test doubles implement the same async interface as production modules; contract tests verify the interface matches.
- Static analysis shows no stubs that return fake success without exercising real logic (e.g., no `jest.mock('../services/aiRuntime', () => ({ generateWithProviders: () => ({ raw: 'ok' }) }))` patterns).

### Environment-Dependent False Passes
- Tests that depend on live services (Stripe, MySQL, Firebase) explicitly skip when environment variables are missing; they do NOT fake a pass.
- The build reports the skip count and the reason.

### Regression Tests Added By This Remediation
- None required (no defects found that needed fixing beyond lint/debug-log cleanup). Existing regression tests cover the fixes made.
