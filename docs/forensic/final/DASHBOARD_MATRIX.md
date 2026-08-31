# Dashboard Matrix

For each role, dashboard access verified at three layers: frontend routes, backend API authorization, and DB tenant/ownership constraints.

## 1. User (candidate)
- **Login:** Firebase email/password, Google redirect, LinkedIn/GitHub OAuth, password reset, email verification.
- **Dashboard:** `/dashboard` → DashboardMain (build resume, cover letter, portfolio, jobs, settings, billing).
- **Navigation:** AuthenticatedAppShell shows Resume, Cover Letter, Portfolio, Jobs, Billing, Settings based on feature flags.
- **Resume create/edit:** `/build-resume/*` → BuildResume (ActionFilling, template selection, editor).
- **Resume preview/export:** `/export/CvN/:id/:lang` → Exporter (render token, PDF/DOCX).
- **AI features:** Smart summary, work description bullets, education bullets, bullet enhancement, skills autocomplete, grammar check, cover letter generation, interview questions, ATS score.
- **Settings:** Profile, language, account deletion, data export.
- **Subscription/Billing:** `/billing/plans` → Checkout with Stripe/PayPal/Razorpay/Paytm/PhonePe.
- **Logout:** `signOutUser()` clears Firebase auth + browser storage.

## 2. Employer (claims.employer=true)
- **Access:** Requires admin approval of employer application (`/api/employer-applications`).
- **Dashboard:** User dashboard + Employer section (companies, jobs, applications).
- **Companies:** Create/edit/delete owned companies (approved status required to post jobs).
- **Jobs:** CRUD owned jobs (only with approved company), pause/activate.
- **Applications:** View applications for own jobs, update status (pending→interview/rejected, interview→accepted/rejected), messaging with applicants.
- **Candidates:** View applicant profiles (with selected resume), contact via in-app messaging.
- **Account/settings:** Same as user.

## 3. Admin
- **Login:** Same Firebase auth, requires role claim `ADMIN`.
- **MFA:** TOTP enforced for destructive operations in production.
- **Dashboard:** `/adm/dashboard` → Admin console with sidebar navigation.
- **Navigation tabs (in Admin.jsx):**
  - Dashboard (overview, stats)
  - Users (UsersManager, UserEdit, PlatformOperators)
  - Companies (CompanyManagement)
  - Jobs (JobsManager)
  - Employer Applications
  - Blog (BlogManagement)
  - Reviews (Reviews)
  - Trusted By (TrustedBy)
  - Landing Pages (LandingPages, Phrases)
  - Messages (Messages)
  - Help Desk / Support tickets (HelpDesk)
  - Audit Logs (AdminAuditLogs)
  - Tenants (PlatformTenants)
  - Security (PlatformSecurity)
  - Operations (PlatformOperations)
  - Queues (PlatformQueues)
  - Health (PlatformHealth)
  - Attention / To-Dos (PlatformAttention)
  - Settings (Settings – website meta, payments, AI, email, social auth, analytics)
- **Access-denied UX:** Non-admins are signed out or shown access-denied message.
- **Recent re-authentication prompt:** AdminReauthPrompt component for destructive mutations.

## 4. Super Admin
- Inherits all Admin capabilities.
- Additional capabilities:
  - Firebase service account rotation (non-production).
  - Tenant commercials (plan, seat limit, billing status).
  - Tenant AI policy (allowed providers/models, daily quota).
  - Service account CRUD (enterprise M2M keys).
  - Platform operator management (roles assignment/removal; protected against self-modification).
  - Payment refund issuance.

## 5. Auditor
- Read-only access to users, tenants, config, payments, AI usage, audit logs, security.
- No write actions exposed in UI or backend.

## 6. Support
- Read users/tenants/email-logs + ticket management.
- Support grants (break-glass) are time-bound and scoped; grant management requires ADMIN/SUPER_ADMIN.

## 7. Enterprise Admin
- **Login:** Firebase auth + active ENTERPRISE_ADMIN membership in tenant.
- **Dashboard:** `/enterprise` → EnterpriseConsole with per-tab permission checks.
- **Tabs:** Overview, Users, Teams (workspaces), Roles, AI, Security, Audit Logs, Settings, Email, Usage, Workspaces, Resumes, Platform, Support.
- **Can:** manage members, assign roles, configure AI policy (if allowed), view billing, view audit logs, manage workspaces.

## 8. Enterprise Member
- Access to tenant-scoped resumes, AI features within tenant quota, interviews; workspace-scoped reads.

## 9. M2M Service Account (non-interactive)
- No UI; authenticated via `x-api-key`.
- Allowed endpoints strictly allow-listed (data-plane + read-only governance).
- Response format: same JSON contracts.

## Session Expiration
- Firebase ID tokens expire after 1 hour; SDK auto-refreshes.
- Refresh tokens revoked on password change, permission change, or account deletion.
- Admin recent-auth window: 10 minutes (configurable via SENSITIVE_AUTH_MAX_AGE_MS).
- Export render tokens: single-use, discarded on consumption or error.
- OAuth state: 5 minutes.
- OAuth exchange code: 1 minute.
- Password reset tokens: 15 minutes.
- Email verification tokens: 24 hours.
- Support grants: TTL enforced at validation.
