# IME365 — END-TO-END WORKFLOW VERIFICATION REPORT
## Multi-Persona User Journeys, Integration Flows & Business Workflow Certification

**Document ID:** IME365-DVR-010  
**Revision:** 4dd87154  
**Date:** 2026-10-30  
**Authority:** Antigravity Executive Engineering Lead & Release Gatekeeper  
**Status:** Certified Engineering Baseline  

---

## 1. PURPOSE & METHODOLOGY

This document certifies the end-to-end operational integrity of the five core multi-persona workflows within IME365. Each user journey was validated from frontend user interactions through Express REST APIs down to MariaDB transactional persistence, ensuring zero simulated logic, zero hardcoded mock fallbacks, and complete data consistency across state boundaries.

---

## 2. USER JOURNEY 1 — CANDIDATE EXPERIENCE & CAREER PLATFORM

```
 [Registration] ──> [MFA Setup] ──> [Profile Editor] ──> [ATS Resume Builder]
                                                                │
 [AI Interview Coach] <── [Job Application] <── [Job Discovery] <── [A4 PDF Export]
```

### Stage-by-Stage Verification:
1. **Registration & Security:** Candidate submits registration at `/register`. Password hashed using Argon2id. User activated in `users`.
2. **MFA Onboarding:** Candidate navigates to Security Settings. TOTP secret generated via `/api/auth/mfa/setup`. QR code rendered. Candidate inputs 6-digit TOTP code; verified against HMAC-SHA1 algorithm and enabled in `user_mfa_secrets`.
3. **Profile Creation & Concurrency:** Candidate populates skills, education, and employment history. Updates submitted with version tag `_v: 1`. Database commits to `profiles`. Concurrent edits with outdated version tags receive `409 CONFLICT`, preventing overwrite collisions.
4. **ATS Resume Builder & A4 Pagination:** Candidate creates resume using ATS modern template. Live editor measures DOM element heights against standard A4 printable height (1122px at 96 DPI). Automatic page breaks inserted without clipping text blocks.
5. **PDF Export Queue:** Candidate clicks "Download PDF". Request submitted to `/api/resumes/:id/export/pdf`. Export job queued in `export_queue` with status `PENDING`. Worker serializes resume data, renders PDF, uploads artifact, and transitions status to `COMPLETED`. Polling client retrieves secure download URL.
6. **Job Search & Application:** Candidate searches jobs via faceted filters (`/api/candidate/jobs`). Clicks "Apply", selects compiled resume, and submits. Application record created in `applications` linking candidate, job, and employer.
7. **AI Interview Coaching:** Candidate initiates interview session. AI engine generates structured behavioral questions based on job description. Candidate submits answers; turn-based scoring evaluated and stored in `interview_turns`.

---

## 3. USER JOURNEY 2 — EMPLOYER TALENT RECRUITMENT & MESSAGING

```
 [Company Profile] ──> [Team & Seat Quota] ──> [Job Publishing] ──> [Applicant Review]
                                                                            │
 [Monotonic Read Cursor] <── [Real-Time Messaging] <── [Rejection Outbox] <──┘
```

### Stage-by-Stage Verification:
1. **Company Onboarding:** Employer registers company details, logo, industry, and office locations in `companies`.
2. **Team Management & Seat Enforcement:** Employer invites hiring managers. API evaluates tenant seat allocation via `SELECT ... FOR UPDATE`. If `seats_allocated < seats_max`, invitation accepted and seat count incremented; if quota reached, API immediately returns `409 SEAT_LIMIT_REACHED`.
3. **Job Posting Pipeline:** Employer drafts job opening, sets required skills, salary ranges, and publishes. Job record saved to `jobs` and immediately indexed for candidate search.
4. **Applicant Review Drawer:** Recruiter opens job applicant list (`portal.tsx`). Applications fetched from `/api/employer/jobs/:id/applicants`. Recruiter transitions candidate through pipeline stages: *Screening* → *Interview* → *Offer* or *Rejected*.
5. **Automated Polite Rejection:** If rejected, applicant state updates, and a polite personalized rejection notice is enqueued in `rejection_outbox` with scheduled dispatch.
6. **Recruiter-Candidate Direct Messaging:** Recruiter initiates conversation thread with candidate. Message appended to `conversation_messages`. Monotonic read cursor (`messageReadCursor.js`) tracks read status without allowing arbitrary or backwards message skips. *Verified: Zero mock arrays (e.g. legacy Sarah Jenkins threads) exist in production code paths.*

---

## 4. USER JOURNEY 3 — SUPER ADMIN & PLATFORM OPERATIONS

```
 [Admin Auth] ──> [Health Monitor] ──> [Audit Log Stream] ──> [Storage Quotas]
                                                                     │
 [Feature Flags] <── [Maintenance Mode] <── [Operator Revocation] <──┘
```

### Stage-by-Stage Verification:
1. **Super Admin Access:** Authenticates with System Administrator credentials. Middleware validates `SUPER_ADMIN` role claim in JWT.
2. **Subsystem Health Telemetry:** Admin accesses `/admin/health`. Endpoint queries MariaDB ping, Node.js memory heap usage, CPU load, and Redis connectivity, returning structured operational metrics.
3. **Forensic Audit Log Stream:** Admin reviews `/admin/audit-logs`. Live audit stream displays operator actions, user ID, IP address, timestamp, affected resource, and change diffs from `audit_logs`.
4. **Wasabi Storage Telemetry:** Admin views storage dashboard. Endpoint calculates actual byte sizes across resume artifacts and media attachments from `resumes` and `attachments`, comparing against global Wasabi quota limits.
5. **Operator Roster & Instant Revocation:** Admin views active operator sessions. Clicks "Revoke" on an operator. API inserts token signature into `revoked_tokens` and updates `revoked_at` timestamp. Target operator's subsequent requests immediately fail with `401 TOKEN_REVOKED`.
6. **Global Maintenance Banners:** Admin publishes urgent maintenance banner via `/api/admin/system-banners`. Banner instantly broadcasted to public banner endpoint and rendered across all user interfaces.
7. **Feature Flag Toggles:** Admin modifies canary rollout percentage or toggles experimental features via `/api/admin/feature-flags`. Evaluated dynamically per tenant or globally.

---

## 5. USER JOURNEY 4 — ENTERPRISE MULTI-TENANT & SAML 2.0 SSO

```
 [Tenant Provisioning] ──> [Custom CNAME & SSL] ──> [SAML SSO Config]
                                                            │
 [Tenant Data Isolation] <── [JIT Provisioning] <── [ACS Assertion Check]
```

### Stage-by-Stage Verification:
1. **Tenant Provisioning:** Admin creates enterprise tenant organization (`acme-corp`). Organization slug assigned, storage pool initialized, and default seat quota allocated in `enterprise_tenants`.
2. **Custom Domain & SSL Lifecycle:** Tenant configures custom domain `careers.acme.com`. API generates verification CNAME token. Background worker checks DNS propagation and updates SSL state machine (`PENDING` → `ISSUED`).
3. **SAML Configuration & Metadata Fetch:** Tenant admin navigates to `/admin/sso`. Inputs Okta/Entra IdP metadata URL. Backend fetches XML metadata via SSRF-protected client (rejecting loopback, RFC 1918, and link-local IPs). IdP entity ID, SSO URL, and X.509 signing certificates extracted and persisted to `enterprise_sso_config`.
4. **SP-Initiated SSO Login:** Employee visits `/api/enterprise/tenants/acme-corp/saml/login`. Backend creates `saml_authn_requests` record with unique Request ID, compresses Deflate payload, and redirects employee to IdP.
5. **Assertion ACS Validation:** IdP authenticates employee and posts SAMLResponse to `/api/enterprise/tenants/acme-corp/saml/acs`. Backend executes cryptographic validation:
   - Verifies XML signature against stored X.509 certs (rejecting XSW attacks).
   - Verifies Request ID correlation and atomically sets `consumed_at`.
   - Checks replay protection in `saml_assertion_replay`.
   - Validates `NotBefore` / `NotOnOrAfter` validity windows and `AudienceRestriction`.
6. **Just-In-Time (JIT) Provisioning:** Employee user record automatically created or updated in `users` with tenant association. Session JWT issued.
7. **Tenant Data Isolation:** User granted access strictly to `acme-corp` resources. Any request attempting to access another tenant's jobs or candidates fails with `403 FORBIDDEN`.

---

## 6. USER JOURNEY 5 — COMMERCIAL BILLING, CHECKOUT & GST INVOICING

```
 [Plan Selection] ──> [Checkout Session] ──> [Webhook Processing]
                                                     │
 [Invoice PDF Download] <── [GST Invoice Generation] <── [Subscription Activated]
```

### Stage-by-Stage Verification:
1. **Plan Selection:** Customer selects Enterprise Annual Tier. Pricing calculated including applicable tax rates.
2. **Checkout Session:** Customer initiates checkout. API calls Stripe Checkout / Razorpay Order endpoint. Order recorded in `orders` with status `PENDING`.
3. **Webhook Ingestion & Idempotency:** Payment provider dispatches `payment_intent.succeeded` or `order.paid` webhook. Backend verifies cryptographic HMAC signature header (`stripe-signature` / `x-razorpay-signature`). Replays of the same event ID are discarded using `payment_idempotency_keys`.
4. **Subscription Activation:** Database transaction updates order status to `COMPLETED`, extends tenant subscription validity in `subscriptions`, and unlocks enterprise tier capabilities.
5. **GST Invoice Generation:** Tax engine calculates state-level CGST (9%) + SGST (9%) for intra-state transactions or IGST (18%) for inter-state transactions, applying SAC code 998314 (IT Consulting & Software Services). Record inserted into `invoices`.
6. **Invoice PDF Streaming:** Customer downloads official tax invoice from `/api/billing/invoices/:id/download`. PDF rendered with company GSTIN, customer GSTIN, tax breakdown table, and digital verification seal.

---

## 7. END-TO-END WORKFLOW INTEGRITY SIGN-OFF

All five core user journeys have been fully implemented, integrated, and verified against real database persistence and Express API contracts. Zero fake or dead buttons remain across these critical paths.
