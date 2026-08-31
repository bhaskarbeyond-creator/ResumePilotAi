# ResumePilot AI — Complete System Architecture

**Document Version:** 3.0 (Production Certified)  
**System Baseline:** Node.js Express 5.2.1 • MariaDB / MySQL 8.0 • React 19 • Vite 8.2.1  
**Deployment Target:** Linux Apache/Nginx Reverse Proxy • Production Sync at `https://airesume.projectdemo.guru`

---

## 1. High-Level Architecture Topology

ResumePilot AI employs a decoupled, enterprise-grade multi-tier architecture designed for high throughput, sub-second AI inference, deterministic ATS parsing, and multi-tenant data isolation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT VIEWPORT TIER                             │
│  React 19 • Vite 8.2.1 • React Router 7.18 • Tailwind CSS 4 • SASS • i18n   │
│  15 Languages (RTL) • Tiptap & Lexical Rich Text • Real-Time ATS Meter      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / TLS 1.3
                                       │ Bearer Authorization (Firebase JWT)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY & SECURITY TIER                          │
│  Express 5.2.1 • Helmet 8.3 • Rate Limiting • CORS • Request Correlation    │
│  Token Verifier • RBAC Enforcement (5 Roles) • TOTP MFA Gatekeeper          │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│          CORE SERVICES TIER          │  │       AI ORCHESTRATION TIER       │
│ • Resume Generation & Step Engine    │  │ • Multi-Provider Dispatcher       │
│ • 51 Resume & 4 Cover Template Presets│ │ • NVIDIA NIM (Llama 3.2 11B Vision)│
│ • Native DOCX OOXML Export Engine    │  │ • Google Gemini (2.0 Flash)       │
│ • Playwright PDF Export Service      │  │ • OpenAI / Groq / DeepSeek / OR   │
│ • AI Interview Coach & CBT Simulator │  │ • Grounding & Anti-Hallucination  │
│ • WebCV Portfolio Builder Studio     │  │ • Resilient JSON Sanitizer        │
│ • GST Invoicing & Billing Ledger     │  │ • Deterministic Seeded Fallbacks  │
└───────────────────┬──────────────────┘  └───────────────────┬───────────────┘
                    │                                         │
                    ▼                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA PERSISTENCE & QUEUE TIER                        │
│  MariaDB 10.6+ / MySQL 8.0 (30 Canonical Tables • 15 Versioned Migrations) │
│  • HMAC-SHA256 Durable Outbox & DLQ • AES-256-GCM Multi-Tenant Cryptography │
│  • SHA-256 Logical Backup Engine • Continuous Background Sync Daemon        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Layer Architecture

- **Core Framework:** React 19.1.0 with React Router DOM 7.18.2 for client-side routing.
- **Build Engine:** Vite 8.2.1 with fast module replacement (HMR) and production asset bundling.
- **Styling Architecture:** 
  - Tailwind CSS 4.1.8 utility classes.
  - SASS (`.scss`) modules for template-specific typographic precision and print page setups.
  - Curated color palettes with WCAG AA luminance contrast auto-detection (`getContrastTextColor`).
- **Internationalization (i18n):** `i18next` supporting 15 locales with automatic LTR/RTL direction detection (Arabic, Persian, Hebrew, Urdu).
- **Editor Subsystem:** Tiptap 3.4 & Lexical 0.32 rich text editors with `DOMPurify` XSS sanitization.
- **State Management & Communication:**
  - React Context (`AuthContext`, `AdminContext`, `EnterpriseContext`).
  - Axios request interceptors automatically attaching cryptographically verified Firebase Bearer ID tokens to all same-origin `/api/*` requests.

---

## 3. Backend REST & Security Architecture

- **Runtime:** Node.js 20+ / Express 5.2.1.
- **Identity Trust Boundary:** Identity is authenticated via Firebase Auth; every incoming API request is verified server-side. Request bodies containing user-injected `uid`, `role`, or `tenantId` are rejected at the gateway.
- **Role-Based Access Control (RBAC):**
  - `USER`: Personal resume builder, portfolio, job tracker, and standard AI operations.
  - `SUPPORT`: Read-only user lookup, email delivery logs, and help desk ticket resolution.
  - `AUDITOR`: Immutable audit log examination, tenant telemetry, and compliance reporting.
  - `ADMIN`: Tenant provisioning, user management, template configuration, and AI usage quotas.
  - `SUPER_ADMIN`: Secrets management, payment gateway credentials, DB failovers, and destructive account actions (Strictly gated by **TOTP MFA** + recent `auth_time`).
- **Security Middleware Stack:**
  - `helmet` (Strict Content Security Policy, X-Frame-Options).
  - `express-rate-limit` (Abuse and DDoS throttling per IP / user).
  - CSRF and CORS origin verification.

---

## 4. AI Orchestration & Multi-Provider Runtime

The AI subsystem (`backend/services/aiRuntime.js`) features an enterprise-grade failover dispatcher and strict factual grounding architecture:

```
[ User Request + Candidate Facts ]
               │
               ▼
[ Request Validation & Input Sanitization ]
               │
               ▼
[ Grounded Prompt Assembly (Zero-Hallucination Rules) ]
               │
               ▼
[ Primary AI Provider Dispatch (e.g. NVIDIA NIM / Gemini) ]
        │                               │ (If Provider Timeout or 429/500)
        │ (Success)                     ▼
        │               [ Failover Provider Dispatch (Groq / OpenAI / DeepSeek) ]
        │                               │ (If All Remote APIs Fail)
        │                               ▼
        │               [ Deterministic Seeded Fallback Engine ]
        ▼                               │
[ Resilient JSON Extraction & Control-Character Repair ]
               │
               ▼
[ Factual Grounding Verification & Excerpt Cross-Check ]
               │
               ▼
[ Client Response with X-AI-Provider / X-AI-Model Headers ]
```

### Key AI Safety Invariants:
1. **Zero Hallucination Grounding:** Prompts enforce strict source-of-truth rules where only candidate-provided facts are summarized or formatted. The model is forbidden from inventing responsibilities, dates, credentials, or metrics.
2. **Resilient JSON Parser (`extractJson`):** Raw unescaped newlines, tabs, and trailing commas common in open-source LLM outputs are sanitized prior to JSON parsing, preventing runtime `Bad control character` syntax crashes.
3. **Seeded Offline Fallbacks:** The AI Interview Coach and Grammar checkers possess deterministic offline algorithms ensuring 100% platform availability even during cloud network partitions.

---

## 5. Database Architecture & Persistence Layer

The primary application data store is **MariaDB / MySQL** containing 30 relational tables managed through 15 versioned migrations (`backend/database/migrations/`). Direct browser-to-Firestore data dependencies have been completely eliminated.

### Core Entity Relationships:

```
┌──────────────┐       1:N       ┌────────────────────────┐
│    users     ├─────────────────┤        resumes         │
│ (id, email)  │                 │ (id, user_id, content) │
└──────┬───────┘                 └───────────┬────────────┘
       │                                     │
       │ 1:N                                 │ 1:N
       ▼                                     ▼
┌──────────────┐                 ┌────────────────────────┐
│  portfolios  │                 │    resume_versions     │
└──────────────┘                 └────────────────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐       1:N       ┌────────────────────────┐
│   tenants    ├─────────────────┤   tenant_memberships   │
│ (id, name)   │                 │ (tenant_id, user_id)   │
└──────┬───────┘                 └────────────────────────┘
       │
       │ 1:N
       ▼
┌────────────────────────┐       1:N       ┌────────────────────────┐
│   enterprise_outbox    ├─────────────────┤  payment_order_ledger  │
│ (id, payload, dlq)     │                 │ (id, uid, amount, tax) │
└────────────────────────┘                 └────────────────────────┘
```

### Table Manifest:
1. `users`: Master user profiles, auth provider tags, and account statuses.
2. `resumes`: Owner-scoped resume documents with JSON-serialized section payloads.
3. `resume_versions`: Historical snapshots for audit and rollback.
4. `covers`: Cover letter documents and customized application letters.
5. `portfolios`: Public WebCV slug mappings, theme preferences, and project showcases.
6. `tenants`: Enterprise organizations with tenant-specific domain mappings.
7. `tenant_memberships`: User-to-tenant IAM roles, permissions, and workspace bindings.
8. `enterprise_outbox`: HMAC-SHA256 signed transactional queue with DLQ failover.
9. `payment_orders`: Versioned payment records, plan tokens, and gateway identifiers.
10. `billing_invoices`: Immutable GST tax invoices with auto-calculated tax breakdowns.
11. `refund_credit_notes`: Reversible refund state-machine transaction records.
12. `job_postings`: Public and employer-managed career listings.
13. `job_applications`: Candidate submission records with resume attachments.
14. `job_tracker`: Personal Kanban job application workflow records.
15. `support_tickets`: Customer assistance tickets, priorities, and conversation threads.
16. `blog_posts`: CMS articles, slug indexes, publication dates, and category tags.
17. `admin_audit_logs`: Immutable security ledger of all platform administrative events.
18. *Additional 13 tables for settings, quotas, coupons, reviews, and platform configuration.*

---

## 6. Document Generation & Export Pipeline

The platform provides dual-engine document export supporting both pixel-perfect PDF rendering and semantic Microsoft Word DOCX packaging:

### 1. High-Fidelity PDF Pipeline:
- **Server Engine:** Playwright headless Chromium browser rendering the exact client DOM at 300 DPI print quality.
- **Client Fallback:** Client-side HTML5 canvas capture via `html2pdf.js` and `jsPDF`.
- **Page Break Intelligence:** `smartPartitioner.js` dynamically measures section element heights, enforcing clean page breaks without orphaned headers or split paragraphs.

### 2. Native DOCX High-Fidelity Export Pipeline:
- **OOXML Generator:** Native Microsoft Word document construction using `docx` 9.5.
- **Theme Parity:** 51 distinct DOCX themes (`docxThemes.js`) mirroring the visual branding, color codes, bullet geometries, column split proportions, and typography of the 51 web templates.
- **Conditional Section Suppression:** Empty optional sections are dynamically suppressed from the XML document tree, preventing blank headings in generated files.

---

## 7. Enterprise Multi-Tenancy & Governance Architecture

- **Tenant Isolation Context:** Requests entering `/api/enterprise/*` pass through `tenantContext.js` which resolves the user's active organization from their verified session, completely preventing Insecure Direct Object Reference (IDOR) attacks.
- **Cryptographic Storage Provider:** Sensitive tenant data and user credentials are encrypted at rest using **AES-256-GCM** with unique initialization vectors and authentication tags (`encryptionProvider.js`).
- **Durable Asynchronous Outbox:** Background jobs (such as email delivery and webhook notifications) are staged within MariaDB in the same transaction as the business operation, signed with HMAC-SHA256, and processed by an autonomous worker daemon with exponential backoff and Dead-Letter-Queue (DLQ) protection.
- **Logical Backup & Byte-for-Byte Restoration:** Administrators can trigger SHA-256 verified tenant backups and perform dry-run restorations to test disaster recovery resilience without service interruption.

---

*Architectural specification certified against active production codebase.*
