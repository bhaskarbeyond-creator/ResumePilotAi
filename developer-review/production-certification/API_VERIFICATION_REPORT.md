# IME365 — API VERIFICATION REPORT
## Exhaustive REST API Endpoint Inventory, Security Guards & Contract Verification

**Document ID:** IME365-DVR-006  
**Revision:** 4dd87154  
**Date:** 2026-10-30  
**Authority:** Antigravity Executive Engineering Lead & Release Gatekeeper  
**Status:** Certified Engineering Baseline  

---

## 1. EXECUTIVE API ARCHITECTURE OVERVIEW

The IME365 platform utilizes an enterprise Express.js REST API architecture backed by MariaDB 10.4+ relational storage. All endpoints enforce strict input validation, centralized authentication middleware, role-based access control (RBAC), and standardized JSON response envelopes.

### Standard Response Envelope Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully",
  "meta": {
    "timestamp": "2026-10-30T22:25:00.000Z",
    "requestId": "req_abc123"
  }
}
```

### Standard Error Envelope Format
```json
{
  "success": false,
  "error": {
    "code": "SEAT_LIMIT_REACHED",
    "message": "Tenant has exceeded maximum authorized seats",
    "details": null
  },
  "meta": {
    "timestamp": "2026-10-30T22:25:00.000Z"
  }
}
```

---

## 2. COMPREHENSIVE ENDPOINT INVENTORY BY DOMAIN

### Domain A — Platform Operations & Super Admin

| Endpoint Path | Method | Auth / RBAC Guard | Validation Schema | Primary DB Table | Status Codes | Description |
|---|---|---|---|---|---|---|
| `/api/admin/health` | `GET` | Bearer Token (System Admin) | None | System Telemetry | `200`, `401`, `403` | Real-time system health, memory, CPU, Redis, and DB connectivity |
| `/api/admin/audit-logs` | `GET` | Bearer Token (System Admin) | Query: `limit`, `offset`, `type` | `audit_logs` | `200`, `401`, `403` | Forensic security event stream and operational action audit trail |
| `/api/admin/operators` | `GET` | Bearer Token (Super Admin) | None | `users` | `200`, `401`, `403` | Operator roster listing active administrative sessions |
| `/api/admin/operators/:id/revoke` | `POST` | Bearer Token (Super Admin) | Param: `id` (UUID) | `revoked_tokens` | `200`, `400`, `404` | Immediately terminates administrative session and invalidates JWT |
| `/api/admin/ip-blacklist` | `GET` | Bearer Token (System Admin) | None | `ip_blacklist` | `200`, `401`, `403` | Retrieves current blocked CIDR ranges and malicious IP entries |
| `/api/admin/ip-blacklist` | `POST` | Bearer Token (System Admin) | Body: `ip`, `reason`, `expiresAt` | `ip_blacklist` | `201`, `400`, `409` | Adds IP to firewall blacklist with automated expiration |
| `/api/admin/storage-telemetry`| `GET` | Bearer Token (System Admin) | None | `resumes`, `attachments` | `200`, `401`, `403` | Wasabi/S3 bucket utilization, byte counts, and quota thresholds |
| `/api/admin/system-banners` | `GET` | Public / Optional Auth | None | `system_banners` | `200` | Active platform-wide announcements, maintenance notices |
| `/api/admin/system-banners` | `POST` | Bearer Token (Super Admin) | Body: `text`, `severity`, `active` | `system_banners` | `201`, `400` | Publishes or toggles global maintenance mode banner |
| `/api/admin/feature-flags` | `GET` | Bearer Token (Admin) | None | `feature_flags` | `200`, `401` | Returns all global and tenant-level feature toggle states |
| `/api/admin/feature-flags/:id` | `PATCH` | Bearer Token (Super Admin) | Body: `enabled`, `rolloutPct` | `feature_flags` | `200`, `400`, `404` | Updates rollout percentage or enables/disables platform feature |

---

### Domain B — Enterprise Multi-Tenant & SSO

| Endpoint Path | Method | Auth / RBAC Guard | Validation Schema | Primary DB Table | Status Codes | Description |
|---|---|---|---|---|---|---|
| `/api/enterprise/tenants` | `GET` | Bearer Token (Super Admin) | Query: `search`, `page`, `limit` | `enterprise_tenants` | `200`, `401` | Paginated listing of enterprise tenant organizations |
| `/api/enterprise/tenants` | `POST` | Bearer Token (Super Admin) | Body: Tenant Registration Schema | `enterprise_tenants` | `201`, `400`, `409` | Creates tenant organization, allocates slug, and seeds admin user |
| `/api/enterprise/tenants/:id` | `GET` | Bearer Token (Tenant Admin) | Param: `id` (Tenant UUID) | `enterprise_tenants` | `200`, `403`, `404` | Retrieves tenant metadata, seat count, storage quotas, branding |
| `/api/enterprise/tenants/:id` | `PATCH` | Bearer Token (Tenant Admin) | Body: Tenant Update Schema | `enterprise_tenants` | `200`, `400`, `403` | Modifies branding, whitelabel colors, logos, and seat allocations |
| `/api/enterprise/tenants/:id/seats`| `POST` | Bearer Token (Tenant Admin) | Body: `userId`, `role` | `enterprise_tenants`, `users`| `200`, `400`, `409` | Atomically allocates seat via `SELECT FOR UPDATE` pessimistic lock |
| `/api/enterprise/tenants/:id/dns` | `POST` | Bearer Token (Tenant Admin) | Body: `domain` (FQDN) | `tenant_domains` | `200`, `400`, `409` | Registers custom subdomain and generates CNAME validation records |
| `/api/enterprise/tenants/:id/sso` | `GET` | Bearer Token (Tenant Admin) | Param: `id` (Tenant UUID) | `enterprise_sso_config` | `200`, `403`, `404` | Retrieves tenant SAML 2.0 configuration, ACS URL, and status |
| `/api/enterprise/tenants/:id/sso` | `POST` / `PUT` | Bearer Token (Tenant Admin) | Body: SAML Configuration Schema | `enterprise_sso_config` | `200`, `400`, `403` | Saves verified IdP metadata, signing certs, and JIT provisioning options |
| `/api/enterprise/sso/metadata-fetch`| `POST` | Bearer Token (Tenant Admin) | Body: `url` (Strict HTTPS) | None (Network) | `200`, `400`, `502` | Fetches and parses remote IdP XML with anti-SSRF IP pinning |
| `/api/enterprise/tenants/:id/saml/metadata` | `GET` | Public (Strict XML) | Param: `id` (Tenant Slug) | `enterprise_sso_config` | `200`, `404` | Serves standard SAML 2.0 SP EntityDescriptor XML metadata |
| `/api/enterprise/tenants/:id/saml/login` | `GET` | Public (Browser Nav) | Param: `id` (Tenant Slug) | `saml_authn_requests` | `302`, `404` | Generates DEFLATE AuthnRequest and redirects to corporate IdP |
| `/api/enterprise/tenants/:id/saml/acs` | `POST` | Public (IdP Callback) | Body: `SAMLResponse`, `RelayState` | `saml_assertion_replay`, `users` | `302`, `400`, `401` | Validates SAML assertion signature, replay, audience, sets auth session |

---

### Domain C — Web CV, Portfolio Studio & Showcase

| Endpoint Path | Method | Auth / RBAC Guard | Validation Schema | Primary DB Table | Status Codes | Description |
|---|---|---|---|---|---|---|
| `/api/candidate/portfolio` | `GET` | Bearer Token (Candidate) | None | `portfolios` | `200`, `401` | Retrieves candidate's web CV blocks, design theme, layout settings |
| `/api/candidate/portfolio` | `PUT` | Bearer Token (Candidate) | Body: Portfolio Schema | `portfolios` | `200`, `400`, `401` | Updates web portfolio content, project links, media showcases |
| `/api/candidate/portfolio/qr` | `GET` | Bearer Token (Candidate) | Query: `format`, `size` | `portfolios` | `200`, `401` | Generates high-resolution vector QR code linking to candidate web CV |
| `/api/public/showcase/:slug` | `GET` | Public / Anti-Abuse Rate Limit | Param: `slug` | `portfolios`, `users` | `200`, `404` | Serves sanitized candidate public showcase with PII redaction |
| `/api/candidate/portfolio/privacy` | `PATCH` | Bearer Token (Candidate) | Body: Privacy Toggle Schema | `portfolios` | `200`, `400` | Configures phone/email redaction and anonymous contact form forwarding |

---

### Domain D — Candidate Core & Job Tracker

| Endpoint Path | Method | Auth / RBAC Guard | Validation Schema | Primary DB Table | Status Codes | Description |
|---|---|---|---|---|---|---|
| `/api/auth/candidate/register` | `POST` | Public / Rate Limited | Body: Candidate Registration Schema | `users`, `profiles` | `201`, `400`, `409` | Registers candidate account, hashes password via Argon2/bcrypt |
| `/api/auth/candidate/login` | `POST` | Public / Rate Limited | Body: Candidate Login Schema | `users` | `200`, `401`, `429` | Validates credentials, issues JWT or prompts for MFA challenge |
| `/api/auth/mfa/setup` | `POST` | Bearer Token (Auth User) | None | `users` | `200`, `401` | Generates TOTP secret key and QR code for authenticator apps |
| `/api/auth/mfa/verify` | `POST` | Bearer Token (Auth User) | Body: `token` (6 digits) | `users` | `200`, `400`, `401` | Confirms TOTP setup or fulfills login MFA challenge |
| `/api/candidate/profile` | `GET` | Bearer Token (Candidate) | None | `profiles` | `200`, `401` | Retrieves candidate profile, skills, education, work experience |
| `/api/candidate/profile` | `PUT` | Bearer Token (Candidate) | Body: Profile Schema + Concurrency Tag | `profiles` | `200`, `400`, `409` | Updates profile with optimistic concurrency version checking |
| `/api/candidate/gdpr/export` | `GET` | Bearer Token (Candidate) | None | All Candidate Tables | `200`, `401` | Generates comprehensive JSON package of all candidate personal data |
| `/api/candidate/gdpr/erasure` | `POST` | Bearer Token (Candidate) | Body: `passwordConfirmation` | All Candidate Tables | `200`, `401`, `403` | Executes GDPR "Right to be Forgotten" cascading anonymization |
| `/api/candidate/jobs` | `GET` | Bearer Token (Candidate) | Query: `keywords`, `location`, `remote`| `jobs` | `200`, `401` | Search job postings with faceted filtering |
| `/api/candidate/applications` | `GET` | Bearer Token (Candidate) | None | `applications` | `200`, `401` | Retrieves candidate's active job application tracking board |
| `/api/candidate/applications` | `POST` | Bearer Token (Candidate) | Body: Application Submission Schema | `applications` | `201`, `400`, `409` | Submits job application with resume snapshot and cover letter |
| `/api/candidate/interview-coach/session` | `POST` | Bearer Token (Candidate) | Body: `jobId`, `interviewType` | `interview_sessions` | `201`, `400` | Creates AI interview coaching session with contextual question set |
| `/api/candidate/interview-coach/:id/turn` | `POST` | Bearer Token (Candidate) | Body: `userAnswerText`, `audioUrl` | `interview_turns` | `200`, `400` | Evaluates response via LLM and returns feedback and follow-up |

---

### Domain E — ATS Resume Builder & Export Queue

| Endpoint Path | Method | Auth / RBAC Guard | Validation Schema | Primary DB Table | Status Codes | Description |
|---|---|---|---|---|---|---|
| `/api/resumes` | `GET` | Bearer Token (Candidate) | None | `resumes` | `200`, `401` | Retrieves candidate's resumes with template tags and updated dates |
| `/api/resumes` | `POST` | Bearer Token (Candidate) | Body: Resume Initialization Schema | `resumes` | `201`, `400` | Creates a new resume document from selected template baseline |
| `/api/resumes/:id` | `GET` | Bearer Token (Candidate) | Param: `id` (UUID) | `resumes`, `resume_sections` | `200`, `403`, `404` | Retrieves complete resume document graph, sections, and items |
| `/api/resumes/:id` | `PUT` | Bearer Token (Candidate) | Body: Complete Resume Data Graph | `resumes`, `resume_sections` | `200`, `400`, `403` | Autosaves resume document with atomic section updates |
| `/api/resumes/:id/export/pdf` | `POST` | Bearer Token (Candidate) | Body: Export Configuration Schema | `export_queue` | `202`, `400`, `403` | Enqueues background A4 auto-pagination and PDF generation job |
| `/api/resumes/:id/export/status/:jobId` | `GET` | Bearer Token (Candidate) | Param: `jobId` | `export_queue` | `200`, `404` | Polling endpoint for PDF compilation progress and download URL |

---

### Domain F — Employer Talent Portal & Messaging

| Endpoint Path | Method | Auth / RBAC Guard | Validation Schema | Primary DB Table | Status Codes | Description |
|---|---|---|---|---|---|---|
| `/api/employer/company` | `GET` | Bearer Token (Employer) | None | `companies` | `200`, `401` | Retrieves employer organization profile and team members |
| `/api/employer/company` | `PUT` | Bearer Token (Employer Admin) | Body: Company Profile Schema | `companies` | `200`, `400`, `403` | Updates company details, logo, description, and hiring locations |
| `/api/employer/jobs` | `GET` | Bearer Token (Employer) | None | `jobs` | `200`, `401` | Lists active, draft, and archived job postings for the employer |
| `/api/employer/jobs` | `POST` | Bearer Token (Employer) | Body: Job Posting Schema | `jobs` | `201`, `400` | Creates and publishes a new job opening with requirements |
| `/api/employer/jobs/:id/applicants` | `GET` | Bearer Token (Employer) | Param: `id` (Job UUID) | `applications`, `profiles` | `200`, `403`, `404` | Retrieves candidate application cards for the recruiter evaluation drawer |
| `/api/employer/applications/:id/status`| `PATCH` | Bearer Token (Employer) | Body: `status`, `rejectionReason` | `applications`, `outbox` | `200`, `400`, `403` | Updates pipeline stage; enqueues polite rejection email if rejected |
| `/api/messages/conversations` | `GET` | Bearer Token (Authenticated) | None | `conversations` | `200`, `401` | Lists user's active messaging threads with unread indicators |
| `/api/messages/conversations/:id` | `GET` | Bearer Token (Participant) | Param: `id` | `conversation_messages` | `200`, `403`, `404` | Fetches message history with sender attributes and timestamps |
| `/api/messages/conversations/:id/send` | `POST` | Bearer Token (Participant) | Body: `messageText`, `attachments` | `conversation_messages` | `201`, `400`, `403` | Appends message to thread and emits real-time notification |
| `/api/messages/conversations/:id/read` | `POST` | Bearer Token (Participant) | Body: `lastReadMessageId` | `conversation_participants`| `200`, `400`, `403` | Monotonically advances participant read cursor (no unverified skips) |

---

### Domain G — Commercial Billing, Support & Blog

| Endpoint Path | Method | Auth / RBAC Guard | Validation Schema | Primary DB Table | Status Codes | Description |
|---|---|---|---|---|---|---|
| `/api/billing/checkout` | `POST` | Bearer Token (Authenticated) | Body: Checkout Initialization Schema| `orders` | `200`, `400` | Creates payment session for Stripe Checkout or Razorpay Order |
| `/api/billing/webhooks/stripe` | `POST` | Stripe Signature Header | Raw Body + Stripe Signature | `orders`, `subscriptions` | `200`, `400` | Verifies Stripe HMAC signature and provisions subscription tier |
| `/api/billing/webhooks/razorpay` | `POST` | Razorpay Signature Header | Raw Body + Razorpay Signature | `orders`, `subscriptions` | `200`, `400` | Verifies Razorpay HMAC signature and records payment receipt |
| `/api/billing/invoices` | `GET` | Bearer Token (Authenticated) | None | `invoices` | `200`, `401` | Lists billing history and downloadable GST-compliant tax invoices |
| `/api/billing/invoices/:id/download` | `GET` | Bearer Token (Invoice Owner) | Param: `id` | `invoices` | `200`, `403`, `404` | Streams rendered PDF of GST invoice with state tax breakdown |
| `/api/support/tickets` | `GET` | Bearer Token (Authenticated) | None | `support_tickets` | `200`, `401` | Retrieves customer support tickets and conversation status |
| `/api/support/tickets` | `POST` | Bearer Token (Authenticated) | Body: Support Ticket Schema | `support_tickets` | `201`, `400` | Creates a new customer support case with category and urgency |
| `/api/blog/posts` | `GET` | Public | Query: `tag`, `page`, `limit` | `blog_posts` | `200` | Returns published career advice, resume tips, and industry articles |
| `/api/blog/posts/:slug` | `GET` | Public | Param: `slug` | `blog_posts` | `200`, `404` | Retrieves single blog post article with sanitized HTML content |

---

## 3. SECURITY & CONTRACT VALIDATION SUMMARY

1. **Strict Content-Type Enforcement:** All mutating endpoints (`POST`, `PUT`, `PATCH`) require `Content-Type: application/json` except for `/api/enterprise/tenants/:id/saml/acs` (`application/x-www-form-urlencoded`) and webhook ingestion endpoints (`application/json` with raw body verification).
2. **Pessimistic Locking:** Critical transactional routes (`/seats`, `/read`) utilize `SELECT ... FOR UPDATE` row locks to prevent race conditions in seat quotas and message cursor tracking.
3. **Defense Against IDOR:** All candidate, employer, and tenant routes verify ownership against the authenticated JWT session claims before querying or updating records.
4. **Zero Uncaught Exceptions:** All async controllers are wrapped with standard error handling middleware, preventing unhandled promise rejections from leaking stack traces.
