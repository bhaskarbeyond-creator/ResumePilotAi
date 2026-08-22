# Admin & Super Admin Final Capability Matrix

This matrix categorizes the operational capabilities of the `/adm` platform by their certification level. 

> **Important**: `LIVE PRODUCTION` status is explicitly marked as `UNVERIFIED` because it must be executed against `https://airesume.projectdemo.guru` by an operator with Hostinger/PM2 deployment access. It must **not** be marked `PASS` until the `LIVE_CERTIFICATION_RUNBOOK.md` is executed.

| Capability / Function | Local (Static/Unit) | Integration (API) | Browser E2E | Live Production |
| :--- | :---: | :---: | :---: | :---: |
| **Authentication & Core Access** |
| Access `/adm` Dashboard | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Require `isSuperAdmin` for Destructive APIs | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Surgical Re-Auth / MFA requirement | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| **User Lifecycle Management** |
| Search & Paginate Users | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Edit User Profile / Assign Role | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Suspend / Reactivate User | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Delete User (Auth + Data) | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| **Tenant Lifecycle (Enterprise)** |
| View Platform Tenants | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Suspend / Reactivate Tenant | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Decommission Tenant | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| **Platform Queues & Operations** |
| Monitor Queue Health | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| View Dead Letter Queue (DLQ) | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Replay DLQ Item | ✅ PASS | ✅ PASS | ❌ *Mocked* | ⚠️ UNVERIFIED |
| **Audit & Security** |
| Emit Audit Events on API write | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| View Audit Logs | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| Prevent Tenant Boundary Leaks | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| **UI / UX Experience** |
| Match Enterprise Design Language | ✅ PASS | N/A | ✅ PASS | ⚠️ UNVERIFIED |
| Responsive Layout (1440px -> 375px) | ✅ PASS | N/A | ✅ PASS | ⚠️ UNVERIFIED |
| Command Palette Navigation | ✅ PASS | N/A | ✅ PASS | ⚠️ UNVERIFIED |
| **Infrastructure / DevOps** |
| Automated UI Regression (Zero regressions) | ✅ PASS | ✅ PASS | ✅ PASS | ⚠️ UNVERIFIED |
| PM2 / Backend Process Health | N/A | N/A | N/A | ⚠️ UNVERIFIED |
| Rollback & Backup Restorability | N/A | N/A | N/A | ⚠️ UNVERIFIED |

## Status Definitions
- **LOCAL**: Passed static analysis, linting, and local unit tests (`npm test`).
- **INTEGRATION**: Passed backend integration suites (`routes.integration.test.js`, `security.test.js`) asserting API boundary isolation.
- **BROWSER**: Passed Playwright fixture/E2E suites simulating user interactions (`tests/superadmin-adm.spec.js`).
- **LIVE PRODUCTION**: Pending execution of `LIVE_CERTIFICATION_RUNBOOK.md` against the physical Hostinger server and the `projectdemo.guru` edge domain.
