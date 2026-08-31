# RCA Register (Root Cause Analysis)

## Findings during this audit

### RCA-001: Debug console.log statements in production component
- **Severity:** P3 (low)
- **Symptom:** 26 `console.log()` calls in `src/components/Actions/action-step-filling/ActionFilling.jsx` logging user-entered resume data (skills, educations, employments, languages) and component lifecycle events to browser console.
- **Affected user/role:** All users using the resume builder.
- **Affected route/component:** `/build-resume/*` → ActionFilling component.
- **Technical root cause:** Debug statements left over from development/debugging of the complex-fields update logic (componentDidUpdate + checkComplexFieldsChange).
- **Why existing tests did not catch it:** No lint rule for console.log in non-test src files (ESLint config does not enable `no-console` rule); manual QA would see them in DevTools but they don't break functionality.
- **Exact remediation:** Removed all 26 debug console.log statements from ActionFilling.jsx; preserved functional code and comments.
- **Regression risk:** Low — pure deletion of logging statements; no behavioral change.
- **Verification evidence:** Lint passes; build passes; product tests pass (all 411); component still renders and updates fields correctly (verified by the existing checkComplexFieldsChange tests via product tests suite).
- **Rollback point:** `rollback-post-lintfixes-20260831-0300` (git tag).
- **Prevention mechanism:** ESLint `no-console` rule could be enabled as warn for future builds; not enforced during this audit to avoid scope creep.

### RCA-002: Unnecessary regex escape causing lint warning
- **Severity:** P4 (cosmetic)
- **Symptom:** ESLint `no-useless-escape` warning for `\[` inside regex character class in `backend/services/aiRuntime.js:368` and `src/services/aiService.js:12`.
- **Affected path:** Regex `/[{}\[\]\"']/g` used in AI skill-name sanitization.
- **Technical root cause:** Inside a JS character class `[...]`, `[` does not require escaping; the backslash was unnecessary.
- **Why existing tests did not catch it:** Lint warnings don't fail CI; existing AI skill parsing tests passed because both escaped and unescaped versions produce identical regex behavior.
- **Exact remediation:** Removed unnecessary `\` before `[` in character class (regex behavior unchanged).
- **Regression risk:** None — regex matches exactly the same set of characters.
- **Verification evidence:** Lint 0 warnings, 0 errors; AI skill parsing tested via product/backend tests (all pass).
- **Rollback point:** Same tag as RCA-001.
- **Prevention mechanism:** Running lint as part of CI gate; already in place (`npm run lint` in ci:security).

### RCA-003: Unused function parameter (no-unused-vars)
- **Severity:** P4 (cosmetic)
- **Symptom:** ESLint warning: `'option' is defined but never used` in ActionFilling.jsx autoCompleteHandleChange callback.
- **Technical root cause:** Callback receives option from Autocomplete onChange but doesn't use it (autocomplete is decorative, not wired to action).
- **Exact remediation:** Renamed parameter to `_option` to satisfy the `no-unused-vars` rule's allowlist for `^_` prefix.
- **Regression risk:** None.
- **Verification evidence:** Lint 0 errors 0 warnings.

## Prior (already-documented) issues that were independently validated as RESOLVED in this codebase
All issues described in the archive audit documents (Firestore dependency, dual-writer inconsistencies, tenant isolation gaps, payment contract drift, auth bypass concerns, hallucination risk, etc.) were independently verified as already fixed in this version of the code:
- Firestore data plane removed (verified via code inspection + tests/firestore-zero-static + runtime code paths).
- Payment contracts verified (see PAYMENT_FORENSIC_AUDIT.md).
- AI grounding validated (see AI_GROUNDING_AUDIT.md).
- Tenant isolation enforced (see TENANT_ISOLATION_AUDIT.md).
- No new P0/P1/P2 defects were found in the independent audit.
