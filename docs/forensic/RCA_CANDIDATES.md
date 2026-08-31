# RCA Candidates Register — Root Cause Analysis for Remote Developer

> **Audit SHA**: `06f443d` | **Date**: 2026-08-31

## RCA-001: Monolith Backend Architecture
- **Symptom**: `backend/index.js` is 3,845 lines with 80 inline route handlers
- **Root Cause**: Organic growth. Routes were added incrementally to the main file instead of being extracted to dedicated route modules. The project started small and grew without periodic refactoring.
- **Evidence**: The codebase already HAS an extraction pattern — `backend/routes/` contains 26 route modules (276 endpoints total). The inline routes are the ones that were never migrated.
- **Impact**: Merge conflicts, difficulty navigating, cognitive load, testing isolation impossible
- **Recommended Fix**: Extract remaining 80 inline handlers to dedicated route modules (blog, cms, coupon, auth, admin-settings, etc.)
- **Risk Level**: LOW risk to extract (functional behavior preserved)
- **Effort**: MEDIUM (3-5 hours systematic extraction)

## RCA-002: Frontend Component Monoliths
- **Symptom**: Multiple components exceed 100KB:
  - `subscriptionsSettings.jsx` — 167KB
  - `BuildResume.jsx` — 137KB
  - `platform.js` (API client) — 109KB
  - `EmailSmtpSettings.jsx` — 112KB
- **Root Cause**: Feature accretion without decomposition. Each settings panel and wizard accumulated functionality (AI generation modals, preview modals, validation, state management) into single files.
- **Evidence**: The resume builder contains 13 steps PLUS template selection, import modal, ATS scorer, preview — all orchestrated from a single 137KB file.
- **Impact**: IDE performance, code review difficulty, testing granularity
- **Recommended Fix**: Extract subcomponents (wizard orchestrator, step renderer, modal manager). Split API client by domain.
- **Risk Level**: MEDIUM (React component decomposition can introduce state bugs)
- **Effort**: HIGH (10-20 hours per component)

## RCA-003: Admin Panel Lacks Role-Based UI
- **Symptom**: AUDITOR and SUPPORT roles see all admin navigation items and mutation buttons, leading to 403 failures when they try to use them
- **Root Cause**: The admin sidebar (`sidebar.jsx`) renders a static navigation list without consulting the user's permissions. The `Admin.jsx` component only checks if the user HAS admin access (line 167), not WHICH admin access.
- **Evidence**: 
  - `Admin.jsx:167` checks `['ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'SUPPORT'].includes(claimsRole)` — boolean allow/deny
  - Sidebar renders all items unconditionally
  - No `permissionsFor(user)` call in frontend admin components
- **Impact**: Poor UX for limited-permission admin roles. Users attempt actions that fail.
- **Recommended Fix**:
  1. Pass user permissions to sidebar component
  2. Filter navigation items by required permission
  3. Conditionally render/disable mutation buttons in admin panels
- **Risk Level**: LOW (additive change, doesn't break existing behavior)
- **Effort**: MEDIUM (2-4 hours — touch sidebar + each admin panel)

## RCA-004: Multi-Layer Admin Authorization
- **Symptom**: Admin endpoint authorization relies on TWO separate middleware running in correct sequence
- **Root Cause**: 
  - Original design: Admin guard at line 583-589 was the primary protection
  - Later addition: `enforceApiPolicy` at line 413 was added as a comprehensive policy layer
  - The admin guard was never removed/unified because it provides the `requireRecentAdminAuthentication` enforcement for mutations
- **Evidence**: 
  - Guard 1 (line 583-589): Only checks mutations, passes GETs through
  - Guard 2 (`enforceApiPolicy`): Checks all paths via `isAdminPath()` + `resolveAdminReadPermission()`
  - Both are needed — neither alone is sufficient
- **Impact**: Fragile. A middleware ordering change could expose admin data.
- **Recommended Fix**: Unify into a single comprehensive admin middleware that handles both reads and mutations with appropriate permissions.
- **Risk Level**: MEDIUM (authorization changes are sensitive)
- **Effort**: MEDIUM (3-5 hours — careful refactoring + full test suite run)

## RCA-005: Dead Code Accumulation
- **Symptom**: Dashboard2 component, nvidia-proxy.php, test-output.txt, scratch PNGs tracked in git
- **Root Cause**: Development artifacts committed during rapid development cycles. No cleanup pass.
- **Evidence**:
  - `Dashboard2/` — 14 files, imported but routes redirect away
  - `nvidia-proxy.php` — PHP proxy from before the backend was consolidated
  - `test-output.txt` — 124KB committed test output
  - `scratch/*.png` — 70+ forensic/debug screenshots in git history
- **Impact**: Repository size bloat, confusion for new developers
- **Recommended Fix**: 
  1. Remove Dashboard2 import and component directory
  2. Delete nvidia-proxy.php
  3. Add `test-output.txt` and `scratch/*.png` to .gitignore
  4. Use `git filter-branch` or BFG to purge large binaries from history (optional)
- **Risk Level**: LOW
- **Effort**: LOW (1 hour)

## RCA-006: KMS Encryption Not Implemented
- **Symptom**: `encryptionProvider.js:170` throws "not implemented" for KMS provider
- **Root Cause**: Enterprise encryption was built with a provider abstraction (`server-key` vs `kms`). The server-key provider (AES-256-GCM) was implemented first and certified. KMS was deferred.
- **Evidence**: The throw is intentional with a clear error message directing users to use `server-key` provider.
- **Impact**: LOW — the server-key provider is certified and working. KMS is a future enhancement.
- **Recommended Fix**: Document as intentional limitation. Implement KMS when cloud-managed key rotation is needed.
- **Risk Level**: N/A (feature gap, not a bug)
- **Effort**: HIGH (KMS integration requires cloud provider SDK)

## RCA-007: Naming Inconsistencies
- **Symptom**: Typos in filenames (`anlyticsSettings.jsx`, `CustomePage.jsx`, `paiment/`)
- **Root Cause**: Original developer naming conventions, never corrected
- **Evidence**: Direct filename observation
- **Impact**: Confusing for new developers, no functional impact
- **Recommended Fix**: Rename files (requires updating imports)
- **Risk Level**: LOW (but requires careful import graph update)
- **Effort**: LOW (30 minutes)

## RCA-008: Test Auth Bypass Design
- **Symptom**: HMAC-based test tokens bypass Firebase Auth when `NODE_ENV !== 'production'`
- **Root Cause**: Legitimate testing need. The test suite needs to create authenticated requests without a real Firebase project. The HMAC verifier is a controlled alternative.
- **Evidence**: 
  - Hard fail-closed in production
  - Requires explicit `rptest.` token prefix
  - HMAC-SHA256 with timing-safe comparison
  - Minimum 16-char secret requirement
  - Used extensively by 79+ backend test files
- **Impact**: Acceptable risk with current mitigations. Would be dangerous if `NODE_ENV` is misconfigured.
- **Recommended Fix**: Add startup assertion that logs a warning if test verifier is active in any deployment. Consider environment variable cross-check.
- **Risk Level**: LOW (mitigations are solid)
- **Effort**: LOW (1 hour)

---

## Priority Order for Remote Developer

| Priority | RCA | Effort | Risk | Impact |
|---|---|---|---|---|
| 1 | RCA-005 Dead Code | LOW | LOW | Clean repo |
| 2 | RCA-003 Admin RBAC UI | MEDIUM | LOW | Better UX |
| 3 | RCA-007 Naming | LOW | LOW | Code quality |
| 4 | RCA-001 Backend Monolith | MEDIUM | LOW | Maintainability |
| 5 | RCA-004 Auth Unification | MEDIUM | MEDIUM | Security posture |
| 6 | RCA-002 Frontend Monoliths | HIGH | MEDIUM | Maintainability |
| 7 | RCA-008 Test Auth | LOW | LOW | Defense in depth |
| 8 | RCA-006 KMS | HIGH | N/A | Feature gap |
