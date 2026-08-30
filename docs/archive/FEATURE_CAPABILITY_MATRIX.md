# ResumePilot AI — Feature & Capability Matrix

> **⚠ FORENSIC AUDIT CORRECTION (2026-08-24).** The "54/54 capabilities, 0 broken
> controls" claim counted at least one surface that cannot render:
> `src/components/BuildResume/steps/FinalizeStep.jsx` is **not imported by any
> module** and imports `../../../services/firebase`, which does not exist. A
> string-matching test (`tests/docx-client-journey.test.mjs`) asserted the
> presence of `executeDocxDownload` in that file and passed.
>
> A **reachability guard** now walks the real import graph from `src/main.jsx`
> and fails if any asserted capability surface is unreachable.
>
> Also corrected: "1,303 interactive actions" is a raw string count, not a
> verified control inventory. Measured instead: **562 files reachable** from the
> entry point and **165 distinct backend API paths** consumed by the frontend,
> reconciling with **0 orphan calls**.
> See `FINAL_FORENSIC_CODEBASE_AUDIT.md`.


> **Authoritative Feature & Capability Matrix**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Candidate & User Workspace Capabilities

| Feature Domain | Route / Entry Point | Implementation Component | Backend Integration | Verified Status |
|----------------|---------------------|--------------------------|---------------------|-----------------|
| **Public Landing & SEO** | `/`, `/features`, `/pricing` | `Welcome.jsx`, `Features.jsx`, `Plans.jsx` | `/api/public/custom-pages`, `/api/public/trusted-by` | ✅ VERIFIED |
| **Authentication & Registration** | `/login`, `/register` | `Login.jsx`, `Register.jsx` | Firebase Auth SDK + `/api/auth/oauth/exchange` | ✅ VERIFIED |
| **Email Verification** | URL link `/` with token | `AuthWrapper (main.jsx)` | `/api/auth/verify-email-token` | ✅ VERIFIED |
| **Password Recovery** | Modal / `/login` | `ResetPasswordModal.jsx` | `/api/auth/custom-password-reset` | ✅ VERIFIED |
| **Resume Builder (51 Templates)** | `/create-resume/*`, `/build-resume/*` | `BuildResume.jsx` | Firestore `resumes` + `/api/generate-resume` | ✅ VERIFIED |
| **Cover Letter Builder (4 Templates)** | `/coverletter/*`, `/cover-letter/*` | `CoverLetter.jsx` | Firestore `covers` + `/api/generate-ai-cover-letter` | ✅ VERIFIED |
| **Web CV & Portfolio Builder (4 Templates)** | `/portfolio/builder` | `PortfolioBuilder.jsx`, `WebCvStudio.jsx` | Firestore `portfolios` + `/api/notify/portfolio-published` | ✅ VERIFIED |
| **Public Portfolio Discovery** | `/portfolios`, `/portfolio/:slug` | `PortfolioGallery.jsx`, `PublicPortfolio.jsx` | Firestore `portfolios` (fallback resilient) | ✅ VERIFIED |
| **High-Fidelity PDF Export** | `/export/Cv:id/:resumeId/:lang` | `Exporter.jsx` | Playwright Chromium headless + token isolation | ✅ VERIFIED |
| **Native DOCX Export (51 Templates)** | Resume action toolbar | `docxDownload.js` | `/api/export-docx` (`backend/services/docxExport.js`) | ✅ VERIFIED |
| **ATS Score Meter & Optimizer** | Resume action toolbar | `AtsScoreMeter.jsx` | In-browser NLP heuristic + keyword density analyzer | ✅ VERIFIED |
| **AI Interview Coach & CBT Simulator** | `/dashboard/interviews` | `DashboardInterviews.jsx` | `/api/ai/interview-coach` + prompt isolation | ✅ VERIFIED |
| **Job Board & Application Tracker** | `/jobs`, `/jobs/portal`, `/jobs/browse` | `MainJobListings.jsx`, `JobsLanding.jsx` | Firestore `jobs` (composite index fallback enabled) | ✅ VERIFIED |
| **Direct Messaging & Conversations** | `/dashboard/messages` | `DashboardMessages.jsx` | Realtime Database + `/api/messages/send` | ✅ VERIFIED |
| **Account Settings & Security** | `/dashboard/settings` | `DashboardSettings.jsx` | Firebase Auth MFA + `/api/auth/send-verification-email` | ✅ VERIFIED |

---

## 2. Administrator & Super Administrator Control Plane (`/adm/*`)

| Admin Module | Route | Panel Component | Backend API Endpoint | Access Level | Status |
|--------------|-------|-----------------|----------------------|--------------|--------|
| **Executive Dashboard** | `/adm/dashboard` | `dashboard.jsx` | `/api/platform/overview` | ADMIN | ✅ VERIFIED |
| **AI Providers Configuration** | `/adm/settings?tab=AiSettings` | `AiSettings.jsx` | `/api/admin/ai-settings`, `/api/admin/ai/test-provider` | SUPER_ADMIN | ✅ VERIFIED |
| **Payment Gateways & Catalogs** | `/adm/settings?tab=subscriptionsSettings` | `subscriptionsSettings.jsx` | `/api/admin/payment-settings`, `/api/admin/payment/test-provider` | SUPER_ADMIN | ✅ VERIFIED |
| **Email SMTP & Templates** | `/adm/settings?tab=EmailSmtpSettings` | `EmailSmtpSettings.jsx` | `/api/admin/email-settings`, `/api/admin/email/test` | SUPER_ADMIN | ✅ VERIFIED |
| **Feature Flags Manager** | `/adm/settings?tab=FeatureFlagsSettings` | `FeatureFlagsSettings.jsx` | `/api/platform/feature-flags` | ADMIN | ✅ VERIFIED |
| **System Health & Probes** | `/adm/health` | `PlatformHealth.jsx` | `/api/platform/health`, `/api/platform/health-indicator` | ADMIN | ✅ VERIFIED |
| **Durable Outbox Queues** | `/adm/queues` | `PlatformQueues.jsx` | `/api/platform/queues`, `/api/platform/queues/retry` | SUPER_ADMIN | ✅ VERIFIED |
| **Tenant Lifecycle Manager** | `/adm/tenants` | `PlatformTenants.jsx` | `/api/enterprise/platform/tenants` | SUPER_ADMIN (MFA) | ✅ VERIFIED |
| **User Directory & RBAC** | `/adm/users` | `UsersManager.jsx` | `/api/admin/users`, `/api/platform/operators` | ADMIN / SUPER | ✅ VERIFIED |
| **Security Audit Logs** | `/adm/audit-logs` | `AdminAuditLogs.jsx` | `/api/admin/audit-logs`, `/api/admin/audit-logs/stats` | ADMIN | ✅ VERIFIED |
| **Platform Operators** | `/adm/operators` | `PlatformOperators.jsx` | `/api/platform/operators` | SUPER_ADMIN (MFA) | ✅ VERIFIED |
| **Custom CMS Pages** | `/adm/settings?tab=pagesSettings` | `pagesSettings.jsx` | `/api/admin/pages`, `/api/public/custom-pages` | ADMIN | ✅ VERIFIED |
| **Trusted Brand Logos** | `/adm/trustedby` | `TrustedBy.jsx` | `/api/admin/trusted-by`, `/api/public/trusted-by` | ADMIN | ✅ VERIFIED |
| **Job Moderation** | `/adm/jobs-manager` | `JobsManager.jsx` | Firestore `jobs` | ADMIN | ✅ VERIFIED |
| **Company Moderation** | `/adm/company-management` | `CompanyManagement.jsx` | Firestore `companies` | ADMIN | ✅ VERIFIED |
| **Blog CMS** | `/adm/blog-management` | `BlogManagement.jsx` | Firestore `blogPosts` | ADMIN | ✅ VERIFIED |

---

## 3. Enterprise Multi-Tenant Console (`/enterprise/*`)

| Enterprise Tab | Implementation Component | Isolation Scope | API Route | Status |
|----------------|--------------------------|-----------------|-----------|--------|
| **1. Overview** | `EnterpriseOverviewTab.jsx` | Tenant / Workspace | `/api/enterprise/status` | ✅ VERIFIED |
| **2. Users & Members** | `EnterpriseUsersTab.jsx` | Tenant-Scoped RBAC | `/api/enterprise/users` | ✅ VERIFIED |
| **3. Teams** | `EnterpriseTeamsTab.jsx` | Workspace Hierarchy | `/api/enterprise/teams` | ✅ VERIFIED |
| **4. Roles & IAM** | `EnterpriseRolesTab.jsx` | Custom Policy Matrix | `/api/enterprise/roles` | ✅ VERIFIED |
| **5. Workspaces** | `EnterpriseWorkspacesTab.jsx` | Boundary Partition | `/api/enterprise/workspaces` | ✅ VERIFIED |
| **6. Talent Resumes** | `EnterpriseResumesTab.jsx` | Tenant Repository | `/api/enterprise/resumes` | ✅ VERIFIED |
| **7. AI Governance & Quotas** | `EnterpriseAiTab.jsx` | Token Budget Allocation | `/api/enterprise/ai/config` | ✅ VERIFIED |
| **8. Email Templates** | `EnterpriseEmailTab.jsx` | Custom Branded SMTP | `/api/enterprise/email/templates` | ✅ VERIFIED |
| **9. Security Posture** | `EnterpriseSecurityTab.jsx` | Encryption & Keys | `/api/enterprise/security/status` | ✅ VERIFIED |
| **10. Audit Stream** | `EnterpriseAuditTab.jsx` | Compliance Trail | `/api/enterprise/audit-logs` | ✅ VERIFIED |
| **11. Usage Analytics** | `EnterpriseUsageTab.jsx` | Storage & AI Telemetry | `/api/enterprise/usage` | ✅ VERIFIED |
| **12. Platform Hub** | `EnterprisePlatformTab.jsx` | Global Org Policies | `/api/enterprise/platform` | ✅ VERIFIED |
| **13. Tenant Settings** | `EnterpriseSettingsTab.jsx` | Tenant Metadata | `/api/enterprise/settings` | ✅ VERIFIED |
| **14. Support Elevation** | `EnterpriseSupportTab.jsx` | Time-Bound Grant IAM | `/api/enterprise/support/access` | ✅ VERIFIED |
