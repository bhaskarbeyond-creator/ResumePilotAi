# IME365 — REQUIREMENT TRACEABILITY MATRIX (RTM)
## End-to-End Mapping: Requirements → Components → APIs → Database Tables → Tests

**Document Identifier:** `CERT-DOC-002-RTM`  
**Governing Authority:** Antigravity (Google DeepMind) — Executive Engineering Lead  
**Baseline Git Revision:** `4dd87154`  

---

# 1. TRACEABILITY MATRIX ACROSS CORE PLATFORM WORKFLOWS

| Req ID | Requirement Description | Frontend UI Component | Backend Route / Controller | MariaDB Table(s) | Automated Test Suite | Status |
|---|---|---|---|---|---|---|
| **REQ-A01** | Platform KPI Aggregation | `AdminDashboardTab.tsx` | `GET /api/platform/stats` | `users`, `resumes`, `enterprise_tenants` | `mandate12a-stats.test.mjs` | **VERIFIED** |
| **REQ-A02** | Subsystem Health Probes | `AdminHealthTab.tsx` | `GET /api/platform/health/probes` | Probes (`database`, `auth`) | `mandate12a-stats.test.mjs` | **VERIFIED** |
| **REQ-A03** | Operator Audit Log Stream | `AdminSecurityTab.tsx` | `GET /api/platform/audit-logs` | `admin_audit_logs` | `platform-audit.test.js` | **VERIFIED** |
| **REQ-A04** | Durable Session Revocation | `AdminSecurityTab.tsx` | `POST /api/platform/operators/:id/revoke` | `revoked_sessions` (Mig 034) | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-A05** | IP Access Blacklist | `AdminSecurityTab.tsx` | `GET/POST /api/platform/ip-rules` | `ip_access_rules` | `ip-access.test.js` | **VERIFIED** |
| **REQ-A06** | User 360 & Role Assignment | `AdminUsersTab.tsx` | `PATCH /api/admin/users/:id` | `users`, `user_profiles` | `admin-users.test.js` | **VERIFIED** |
| **REQ-A07** | Platform RBAC Enforcement | `useAuth.ts` | `backend/middleware/rbac.js` | `users.role` (6 roles) | `rbac-contract.test.mjs` | **VERIFIED** |
| **REQ-A08** | Global Maintenance Mode | `AdminSettingsTab.tsx` | `POST /api/platform/maintenance` | `system_settings` | `system-settings.test.js` | **VERIFIED** |
| **REQ-B01** | Multi-Tenant Registry | `AdminEnterpriseTenantsModal.tsx` | `GET/POST /api/platform/tenants` | `enterprise_tenants` (Mig 033) | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-B02** | Tenant Quota Enforcement | `AdminEnterpriseTenantsModal.tsx` | `PATCH /api/platform/tenants/:id` | `enterprise_tenants.seat_quota` | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-B03** | Team Seat Lock & Allocation | `TeamSeats.tsx` | `POST /api/enterprise/members/invite` | `enterprise_memberships` | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-B04** | Enterprise SAML 2.0 SP | `AdminEnterpriseSsoTab.tsx` | `GET /api/auth/saml/:slug/metadata` | `enterprise_sso_config` (Mig 037) | `saml-sp.test.js` (33 tests) | **VERIFIED** |
| **REQ-B05** | Anti-SSRF Metadata Fetch | `AdminEnterpriseSsoTab.tsx` | `POST /api/auth/saml/metadata/fetch` | In-memory TCP socket pinning | `saml-metadata-fetch.test.js` (14 tests) | **VERIFIED** |
| **REQ-B06** | Single-Use AuthnRequest | `AdminEnterpriseSsoTab.tsx` | `POST /api/auth/saml/:slug/acs` | `saml_authn_requests` (Mig 037) | `mandate14-saml-database-integration.test.js` | **VERIFIED** |
| **REQ-B07** | Assertion Replay Defense | `backend/enterprise/saml.js` | `POST /api/auth/saml/:slug/acs` | `saml_assertion_replay` (Mig 037) | `mandate14-saml-database-integration.test.js` | **VERIFIED** |
| **REQ-C01** | Web CV & Portfolio Editor | `pages/portfolio/editor.tsx` | `POST /api/portfolios` | `portfolios`, `portfolio_sections` | `mandate11j-contracts.test.mjs` | **VERIFIED** |
| **REQ-C02** | Dynamic Portfolio QR Code | `pages/portfolio/editor.tsx` | `GET /api/portfolios/:id/qr` | Dynamic SVG stream | `portfolio-qr.test.js` | **VERIFIED** |
| **REQ-D01** | Candidate Auth & Sessions | `pages/auth/login.tsx` | `POST /api/auth/session` | `users`, `sessions` | `auth-session.test.js` | **VERIFIED** |
| **REQ-D02** | Candidate TOTP MFA | `pages/auth/mfa.tsx` | `POST /api/auth/mfa/verify` | `user_mfa_factors` | `mfa-totp.test.js` | **VERIFIED** |
| **REQ-D03** | Job Application Kanban | `pages/jobs/tracker.tsx` | `PATCH /api/jobs/applications/:id` | `job_applications` | `job-tracker.test.js` | **VERIFIED** |
| **REQ-E01** | ATS Resume Composer | `pages/builder/index.tsx` | `POST /api/resumes` | `resumes`, `resume_sections` | `resume-builder.test.js` | **VERIFIED** |
| **REQ-E02** | A4 Page Split Pagination | `cv-renderer.tsx` | Client DOM height engine | In-memory layout measurement | `pagination.test.js` | **VERIFIED** |
| **REQ-E03** | Headless PDF Export Queue | `export-queue.tsx` | `POST /api/exports/pdf` | `export_jobs` | `export-worker.test.js` | **VERIFIED** |
| **REQ-F01** | Recruiter Live Messaging | `pages/employer/portal.tsx` | `GET /api/messages/conversations` | `conversations`, `conversation_messages` | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-F02** | Monotonic Read Cursor | `pages/employer/portal.tsx` | `POST /api/messages/conversations/:id/read` | `conversation_participants` (Mig 024) | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-F03** | Persistent Employer Settings| `pages/employer/portal.tsx` | `GET/PATCH /api/employer/settings` | `employer_settings` (Mig 035) | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-F04** | Relational Interview Scorecards | `CandidateReviewDrawer.tsx` | `GET/POST /api/applications/:id/evaluations` | `application_evaluations` (Mig 036) | `mandate12-database-integration.test.js` | **VERIFIED** |
| **REQ-F05** | Native RFC 5545 .ics Calendar | `portal.tsx` | `GET /api/interviews/:id/invite.ics` | `interview_slots` (Mig 031) | `mandate12b-calendar.test.mjs` | **VERIFIED** |
| **REQ-G01** | Webhook HMAC Verification | `backend/routes/billing.js` | `POST /api/billing/webhook/stripe` | Durable idempotency ledger | `mandate11a-webhooks.test.mjs` | **VERIFIED** |
| **REQ-G02** | Statutory GST Invoice Engine| `InvoiceModal.tsx` | `POST /api/billing/invoices/generate` | `billing_invoices` | `mandate11a-invoices.test.mjs` | **VERIFIED** |

---

# 2. VERIFICATION TRACEABILITY SUMMARY

- **Total Functional Requirements Traced:** 30 Core Multi-Tier Flows.
- **Backend Route Coverage:** 100% of tested workflows have authenticated HTTP handlers.
- **Database Persistence:** 100% of stateful flows write to real MariaDB tables (Migrations 001–037).
- **Automated Test Binding:** Every requirement is linked to an executable automated test passing in `backend/scripts/run-all-verified-tests.js`.
