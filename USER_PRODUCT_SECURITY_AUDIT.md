# User Product Security, RBAC & Data Isolation Audit

**Standard:** Zero-Trust Client-Server Boundary + Strict Invariable IDOR Protection  
**Audited Vectors:** Candidate ID boundaries, Cross-user isolation, API Bearer token enforcement, Negative Authorization, GDPR Data Portability, and Secrets Masking.

---

## 1. Authentication & Session Security

- **Cryptographic Trust Boundary**: The frontend never accepts identity, role, or entitlement from local storage or request bodies. Every API request is verified server-side using the Firebase Admin SDK token verifier.
- **Single-Flight Token Refresh**: Multiple parallel background requests coalesce onto a single `getIdToken(true)` promise lock in `src/main.jsx` (`refreshApiTokenSingleFlight`), preventing race conditions and HTTP 401 token churn.
- **Session Clean-Up**: Switching user accounts immediately invokes `clearAccountScopedBrowserState()`, destroying all cached drafts, resume IDs, and user profiles.

---

## 2. Invariable Object-Level Access Control (IDOR Audit)

Every candidate data domain is strictly scoped to the authenticated caller's verified `uid`:

| Data Resource | Query Isolation Predicate | Cross-User Mutation Result | Certified Test Pass |
|---|---|---|---|
| **Resumes** | `WHERE id = ? AND userId = ?` | `HTTP 404 / 403 RESUME_NOT_FOUND` | `account-isolation.test.mjs` |
| **Cover Letters** | `WHERE id = ? AND userId = ?` | `HTTP 404 / 403 COVER_NOT_FOUND` | `account-isolation.test.mjs` |
| **Support Tickets** | `WHERE id = ? AND userId = ?` | `HTTP 404 / 403 TICKET_NOT_FOUND` | `user-dashboard-forensic.test.mjs` |
| **Portfolios** | `WHERE id = ? AND userId = ?` | `HTTP 404 / 403 PORTFOLIO_NOT_FOUND` | `portfolio-isolation.test.mjs` |
| **Job Tracker** | `WHERE id = ? AND userId = ?` | `HTTP 404 / 403 JOB_NOT_FOUND` | `job-tracker.test.mjs` |
| **Master Profile** | `WHERE uid = ?` | `HTTP 403 FORBIDDEN` | `profile-workflow.test.mjs` |

---

## 3. Negative Authorization (Role Separation)

- **Ordinary Candidate Isolation**: Regular users (`role = 'user'`) cannot access `/api/admin/*`, `/adm/*`, or Super Admin endpoints. Any attempt returns `HTTP 403 FORBIDDEN`.
- **Administrative UI Isolation**: Candidate dashboard components never render administrative action buttons, bulk user edit tools, or system configuration panels.
- **Super Admin User-View Simulation**: When a Super Admin inspects the candidate view (`superadmin_role_view = 'USER'`), a prominent top warning banner indicates active simulation without exposing real user credentials.

---

## 4. TOTP 2FA & Sensitive Operation Posture

- **RFC 6238 TOTP Standard**: Time-based one-time password lifecycle verified (`beginUserTotp2FA`, `saveUserTotp2FA`, `disableUserTotp2FA`).
- **Zero Secrets Leakage**: Secret keys (Google AI, NVIDIA NIM, Stripe, Razorpay) are stored exclusively on the server and are never included in candidate browser payloads.
