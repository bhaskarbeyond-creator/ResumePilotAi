# Master Gap Register — Unified Finding Index

> **Audit SHA**: `06f443d` | **Date**: 2026-08-31 | **Total Findings**: 32

## P0 — BLOCKER (0 findings)

*No P0 blockers found. SEC-001 downgraded after verifying `.env` files are gitignored.*

---

## P1 — CRITICAL (3 findings)

| ID | Category | Summary | File(s) | Evidence | Status |
|---|---|---|---|---|---|
| ARCH-001 | Architecture | Backend monolith: `index.js` is 3,845 lines / 224KB with 80 inline route handlers | `backend/index.js` | Line count + endpoint extraction | PROVEN |
| ARCH-002 | Architecture | Frontend monolith components: `BuildResume.jsx` (137KB), `subscriptionsSettings.jsx` (167KB), `platform.js` (109KB), `MySQLRepository.js` (150KB) | Multiple | File size measurement | PROVEN |
| SEC-010 | Security | Webhook signature verification — unverified for Paytm/PhonePe callbacks | `backend/routes/payments.js:577,586` | Static analysis, handlers exist but verification depth unknown | UNPROVEN |

---

## P2 — HIGH (7 findings)

| ID | Category | Summary | File(s) | Evidence | Status |
|---|---|---|---|---|---|
| RBAC-003 | RBAC/UX | No AUDITOR-specific UI restrictions — sees mutation buttons that fail 403 | `Admin.jsx`, sidebar | Static analysis of sidebar rendering | PROVEN |
| SEC-004 | Security | Test auth verifier: HMAC bypass when `NODE_ENV !== 'production'` | `backend/security/auth.js:18-61` | Source code analysis | PROVEN |
| SEC-006 | Security | Multi-layer admin auth: GET endpoints rely on middleware ordering between two guards | `backend/index.js:583-589`, `backend/security/policy.js:71-111` | Middleware chain trace | PROVEN |
| SEC-008 | Security | Enterprise tenant isolation: Cross-tenant data access untested | `backend/enterprise/tenantContext.js` | Static analysis only | UNPROVEN |
| SEC-009 | Security | Payment credentials resolved from env then MariaDB fallback — DB tampering risk | `backend/index.js:594-603` | Source code analysis | PARTIALLY PROVEN |
| MAINT-001 | Maintenance | `test-output.txt` (124KB) tracked in git | Root `test-output.txt` | `git ls-files` confirms tracking | PROVEN |
| MAINT-002 | Maintenance | 70+ scratch PNG screenshots tracked in git (forensic captures, debug screenshots) | `scratch/*.png` | `git ls-files` confirms tracking | PROVEN |

---

## P3 — MEDIUM (12 findings)

| ID | Category | Summary | File(s) | Evidence | Status |
|---|---|---|---|---|---|
| RBAC-001 | RBAC | Build Resume route `/build-resume/*` has no auth guard (`MaybeApplicationShell`) | `main.jsx:436-437` | Route guard analysis | PROVEN |
| RBAC-004 | RBAC/UX | SUPPORT role sees all admin nav items despite limited permissions | `Admin.jsx`, sidebar | Static analysis | PROVEN |
| SEC-002 | Security | Firebase client API key in root `.env` (low risk — client keys are public by design) | `.env:1` | File inspection | PROVEN |
| SEC-005 | Security | Recent auth check skipped in non-production | `backend/security/auth.js:226-227` | Source code analysis | PROVEN |
| SEC-007 | Security | Blog editor accessible to non-admin users at `/blog-editor` | `main.jsx:462-463` | Route guard analysis | PROVEN |
| SEC-011 | Security | CORS configuration unverified | `backend/index.js:307` | Static analysis only | UNPROVEN |
| SEC-012 | Security | CSP headers: `crossOriginResourcePolicy: 'cross-origin'` is permissive | `backend/index.js:323-324` | Source code analysis | PARTIALLY PROVEN |
| PAGE-001 | UX | Blog editor accessible without admin role check (frontend only) | `main.jsx:462-463` | Route analysis | PROVEN |
| AI-001 | AI | Model deprecation management — deprecated NVIDIA models documented in AGENTS.md | AGENTS.md rules | Rules inspection | PROVEN |
| AI-002 | AI | Provider failover chain complexity — multi-provider runtime at 63KB | `backend/services/aiRuntime.js` | File size, provider count | PROVEN |
| ENT-001 | Enterprise | KMS encryption provider not implemented | `backend/enterprise/encryptionProvider.js:170` | Source code | PROVEN |
| PAY-001 | Payments | 5 payment providers (Stripe, PayPal, Razorpay, Paytm, PhonePe) with complex callback flows | `backend/routes/payments.js` | Endpoint count | PROVEN |

---

## P4 — LOW (10 findings)

| ID | Category | Summary | File(s) | Evidence | Status |
|---|---|---|---|---|---|
| RBAC-002 | Dead Code | Dashboard2 imported but never rendered (redirects to Dashboard) | `main.jsx:84,470-471` | Import + redirect analysis | PROVEN |
| PAGE-002 | Dead Code | Dashboard2 component tree in bundle unnecessarily | `Dashboard2/` | Code inspection | PROVEN |
| DEAD-001 | Dead Code | `nvidia-proxy.php` — PHP file at root with no consumer | Root directory | File inspection | PROVEN |
| MAINT-003 | Maintenance | Debug/log files in repo (`database-debug.log`, `firestore-debug.log`) | Root directory | `git ls-files` — NOT tracked (local only) | DISPROVEN |
| MAINT-004 | Maintenance | Typo in filename: `anlyticsSettings.jsx` (missing 'a' in analytics) | `src/components/admin/settings/anlyticsSettings.jsx` | Filename inspection | PROVEN |
| MAINT-005 | Maintenance | Typo in component path: `/adm/user/ss` (unclear naming for UserEdit) | `Admin.jsx:225` | Route analysis | PROVEN |
| MAINT-006 | Maintenance | Legacy route aliases exist: `/admin/*` → `/adm/*`, `/platform/*` → `/adm/*` | `main.jsx` | Route analysis | PROVEN |
| MAINT-007 | Maintenance | `CustomePage.jsx` — typo in filename (should be CustomPage) | `src/components/CustomPage/CustomePage.jsx` | Filename inspection | PROVEN |
| NAMING-001 | Naming | Inconsistent naming: `paiment/` directory in assets (should be `payment/`) | `src/assets/paiment/` | Directory listing | PROVEN |
| NAMING-002 | Naming | Inconsistent naming: `DashboardFavourites` vs US English convention | Dashboard components | Component name inspection | PROVEN |

---

## Summary by Status

| Status | Count | Meaning |
|---|---|---|
| PROVEN | 25 | Direct evidence from source code / file system |
| PARTIALLY PROVEN | 3 | Some evidence, needs runtime confirmation |
| UNPROVEN | 3 | Requires runtime testing or deeper analysis |
| DISPROVEN | 1 | Initially suspected, verified as non-issue |
| NOT TESTABLE | 0 | — |

## Summary by Category

| Category | Count | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| Architecture | 2 | 2 | 0 | 0 | 0 |
| Security | 9 | 1 | 3 | 4 | 0 |
| RBAC/UX | 4 | 0 | 1 | 2 | 1 |
| Dead Code | 3 | 0 | 0 | 0 | 3 |
| Maintenance | 5 | 0 | 2 | 0 | 3 |
| AI | 2 | 0 | 0 | 2 | 0 |
| Enterprise | 1 | 0 | 0 | 1 | 0 |
| Payments | 1 | 0 | 0 | 1 | 0 |
| UX/Naming | 4 | 0 | 0 | 1 | 3 |
| **TOTAL** | **32** | **3** | **7** | **12** | **10** |
