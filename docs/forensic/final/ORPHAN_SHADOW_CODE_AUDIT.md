# Orphan / Shadow Code Audit

## Unused Files Identified

### Vite Scaffolding Residue (non-production)
- `src/App.jsx` – Default Vite "count is {count}" template. **Not imported anywhere** (main.jsx renders AuthWrapper directly). Orphaned from initial project scaffolding.
- `src/App.css` – Styles for App.jsx. Not imported anywhere.
- `src/assets/react.svg` – Referenced by App.jsx only.

These are harmless template leftovers. They do not increase bundle size (not imported), but they clutter the repo. **Recommended action:** Safe to remove in a future cleanup; not removed during this audit to minimize change scope.

### capture_templates.js
- `src/capture_templates.js` – CLI script for generating template preview screenshots. Contains console.log but is explicitly a developer/CI tool, not production code. Acceptable.

### Backend root-level files
- `backend/hn.pdf` – Sample PDF likely used for testing. Not imported; likely local developer artifact.
- `backend/test-routes.js` – Appears to be a standalone route test, used by tests via supertest. NOT orphaned.
- `backend/reset-pwd.js` – Standalone password reset script. CLI utility.

### Template-lab directory
- `template-lab/*` – Developer tooling for template testing, visual regression, PDF evidence generation, accessibility probes. Not bundled into production build. Acceptable.

### Duplicate Helpers / Shadow Implementations
After code search:
- **NO duplicate implementations** of payment providers, auth, AI runtime, repositories, or routers.
- **NO shadow auth implementations** – all auth flows through `security/auth.js`.
- **Compatibility leftovers** are explicitly marked and return 410 GONE (e.g., `/api/cms-pages`, `/api/invoice`, `/api/subscription/preferences`, retired notification endpoints). These are intentional contract surfaces that inform old clients rather than silent fallbacks.
- **Backwards-compatible route aliases** exist (e.g., `/api/admin/payment-settings` aliasing `/api/platform/payment-settings`) and explicitly document themselves as read-only backward-compatibility aliases.
- **Two graceful-shutdown handlers** are registered (top-level and in `if (require.main === module)` block). The inner one shadows the outer (both call `closePool()`; inner one has a 5-second force-exit timeout). Functionally safe (both close pool and exit), but technically redundant. Not a defect.

### Commented-Out Code
- Minimal, mostly in JSX for historical feature notes (e.g., commented-out postal-code/dob fields in ActionFilling). These are commented JSX used as reference. Harmless.

### Console.log in Production Code
- Frontend ActionFilling.jsx had 26 debug console.log statements — **REMOVED during this audit** (see Remediation Register).
- `src/capture_templates.js` is CLI-only.
- Backend uses `console.log`, `console.warn`, `console.error` for legitimate operational logging (startup messages, warnings, errors). No debug leaks of user data (PII is logged as email subject only in audit context; secrets never logged).

### Dead Exports / Functions
- `src/App.jsx` exports `App` which is never imported – documented above.
- Backend exports are all used (verified via grep of `require('./...')` chains).

### Feature Flags
- `enterpriseFeatureEnabled()` – active gate; checks env/settings. Not dead.
- CMS scheduler, notification outbox, enterprise outbox, tenant GC workers – all env-gated (CMS_SCHEDULER_ENABLED, NOTIFICATION_OUTBOX_WORKER_ENABLED, ENTERPRISE_OUTBOX_WORKER_ENABLED, TENANT_GC_WORKER_ENABLED). These are legitimate config switches, not dead flags.

## Summary
- **PROVEN:** No duplicate payment/auth/AI implementations.
- **PROVEN:** Retired endpoints return 410 GONE with clear messages (no shadow fallback).
- **PROVEN:** No compatibility shims that silently accept invalid data.
- Low-priority orphans: Vite template files (App.jsx, App.css, react.svg), backend/hn.pdf. Not removed to keep change surface minimal.
- **REMEDIATED:** 26 debug console.log calls in ActionFilling.jsx removed.
