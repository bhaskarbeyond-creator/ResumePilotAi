# Remediation Register

| ID | Description | Files Changed | Pre-State | Post-State | Verified |
|----|-------------|---------------|-----------|------------|----------|
| REM-001 | Remove 26 debug console.log statements from ActionFilling.jsx that leaked resume data to browser console | src/components/Actions/action-step-filling/ActionFilling.jsx | console.log in lifecycle methods, field change handlers, and component render path | All production debug logs removed; code behavior unchanged | Lint ✅ Build ✅ Product tests (411) ✅ |
| REM-002 | Fix unnecessary regex escape in aiRuntime.js skill sanitization regex | backend/services/aiRuntime.js | ESLint `no-useless-escape` warning | Regex fixed, behavior preserved, no warning | Lint ✅ Backend tests (513) ✅ |
| REM-003 | Fix unnecessary regex escape in aiService.js skill sanitization regex | src/services/aiService.js | Same as REM-002 | Regex fixed | Lint ✅ Product tests ✅ |
| REM-004 | Rename unused parameter `option` → `_option` to satisfy no-unused-vars rule | src/components/Actions/action-step-filling/ActionFilling.jsx | ESLint warning: 'option' is defined but never used | Parameter renamed; no functional change | Lint ✅ |

## Dependencies Installed
- Ran `npm install` in root (frontend deps were missing; restored 1275 packages from lockfile).
- Ran `npm install` in backend/ (backend deps were missing; restored 356 packages from lockfile).
This was an environment setup step, not a code change; it restored the lockfile-defined dependencies needed to build and test.

## Items Reviewed But Not Changed
- **Vite template residue (App.jsx, App.css, react.svg):** Left in place because deletion is cosmetic and out of scope for production-critical fixes.
- **Two graceful-shutdown handlers:** Both call closePool() safely; redundant but not harmful. Refactoring would be risky without additional regression testing.
- **Lottie-web direct eval in third-party dependency:** Not our code; cannot be patched without fork.
- **Large bundle chunks (BuildResume 1.2MB, Admin 943KB):** Code-splitting improvement is cosmetic/performance, not a correctness issue.
- **6000-line backend/index.js:** Modularizing is a large refactor that could introduce regressions; not warranted for a certification audit.
- **In-memory export concurrency counter:** Acceptable for single-instance deployment; sticky sessions or external semaphore required only in multi-instance.
