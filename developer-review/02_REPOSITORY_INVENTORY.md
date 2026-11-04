# 02. REPOSITORY INVENTORY & APPLICATION ARCHITECTURE MAP
## IME365 – Interview Made Easy

**Target Repository:** `D:\xampp\htdocs\IME365`  
**Commit:** `0d1a52fc389ff540e4d6d8291391a67872f74150`  
**Inventory Date:** November 4, 2026  
**Auditor:** Antigravity (Google DeepMind) — Principal Systems Architect  

---

## 1. Actual Technology Stack

| Layer | Component | Version | Verification Source |
|---|---|---|---|
| **Operating System** | Windows 10/11 (win32-x64) | 10.0.26100 | Runtime OS probe |
| **Web Server / Reverse Proxy** | Apache HTTPD | 2.4.58 (Win64) | `curl -i` Server header |
| **SSL / TLS Engine** | OpenSSL | 3.1.3 | Apache configuration |
| **PHP Runtime** (Admin Tools) | PHP | 8.2.12 | Apache mod_php |
| **Relational Database** | MariaDB | 10.4.32 | `SELECT VERSION()` via MySQL2 |
| **Backend Runtime** | Node.js | v24.18.0 / v22.x compatible | `process.version` |
| **Backend Framework** | Express | 5.2.1 | `backend/package.json` |
| **Database Driver** | MySQL2 | 3.24.2 | `backend/package.json` |
| **Auth / Identity Provider** | Firebase Admin SDK | 14.2.0 | `backend/package.json` (Identity only) |
| **Security Middleware** | Helmet, express-rate-limit | 8.3.0, 8.6.2 | `backend/package.json` |
| **Payment SDKs** | Stripe, paytmchecksum | 22.5.0, 1.5.1 | `backend/package.json` |
| **Document Processing** | docx, sharp, mammoth | 9.5.1, 0.35.5, 1.13.0 | `backend/package.json` |
| **Frontend Framework** | React | 19.2.8 | `frontend/package.json` |
| **Frontend DOM** | React DOM | 19.2.8 | `frontend/package.json` |
| **Build Tool / Bundler** | Vite | 8.3.0 | `frontend/package.json` |
| **CSS Framework** | Tailwind CSS | 4.3.3 | `frontend/package.json` (`@tailwindcss/vite`) |
| **UI Primitives** | Radix UI (22 component packages) | 1.2.0 – 2.4.1 | `frontend/package.json` |
| **Icons Library** | Lucide React | 1.59.0 | `frontend/package.json` |
| **State & Data Fetching** | TanStack Query & Table | 5.104.3, 9.3.1 | `frontend/package.json` |
| **Form Management** | React Hook Form + Zod | 7.90.0, 3.25.76 | `frontend/package.json` |
| **Animation Library** | Framer Motion | 14.3.0 | `frontend/package.json` |
| **Linter** | Oxlint | 1.81.0 | `frontend/package.json` |
| **Type Checker** | TypeScript | ~6.0.2 | `frontend/package.json` |
| **E2E Automation** | Playwright Test | 1.50.1 / 1.62.1 | `frontend/package.json` |
| **Accessibility Testing** | @axe-core/playwright | 4.10.0 | `frontend/package.json` |

---

## 2. Quantitative File & Codebase Breakdown

### Census of Tracked Repository Files
*Excluding `node_modules`, `.git`, `dist`, `test-results`, and `.bridge`:*

| Extension | File Count | Purpose |
|---|---:|---|
| `.js` | **1,233** | Backend routes, services, migrations, unit tests, scripts |
| `.jsx` | **519** | Legacy React 18 frontend (root `src/` — superseded) |
| `.png` / `.JPG` / `.svg` / `.ico` | **760** | Template previews, media assets, test screenshots |
| `.md` / `.txt` / `.jsonl` | **376** | Audit history, specifications, evidence registers |
| `.mjs` / `.cjs` | **319** | Build scripts, certification runners, migration probes |
| `.json` | **176** | Manifests, test fixtures, package configs |
| `.tsx` | **167** | Active React 19 + TypeScript components and pages |
| `.css` / `.scss` | **272** | Styles, design tokens, template typography |
| `.sql` | **125** | Database migrations (forward + down), seed fixtures |
| `.ts` | **122** | TypeScript models, lib utilities, Playwright specs |
| `.woff2` / `.ttf` | **112** | Local typography assets for headless PDF export |
| `.py` / `.sh` / `.php` / `.bat` | **52** | Auxiliary verification scripts, proxy scripts |
| **Total Tracked Files** | **4,409** | **Complete repository workspace** |

### Line Count by Subsystem

| Subsystem Directory | Line Count | Language Mix | Status |
|---|---:|---|:---:|
| `backend/` | **124,108** | JavaScript, SQL | **ACTIVE PRODUCTION** |
| `frontend/src/` | **78,300** | TypeScript, TSX, CSS | **ACTIVE PRODUCTION** |
| `src/` (root) | **224,927** | JavaScript, JSX, SCSS | **DEAD / SUPERSEDED** |
| `scripts/` & `tools/` | **28,642** | JavaScript, MJS, Python | **INTERNAL TOOLING** |
| `developer-review/` | **28,444** | Markdown, CJS, Python | **AUDIT ARTIFACTS** |
| **Total Application Code** | **484,421** | | |

---

## 3. Backend Module & Service Inventory

The active backend comprises **29 modular route files** under `backend/routes/`, coordinated through `backend/index.js`, delegating to specialized services and repositories:

### 3.1 Modular Routes (`backend/routes/`)

| Route File | Mount Path | Primary Responsibilities |
|---|---|---|
| `adminAudit.js` | `/api/admin/audit-logs` | Platform audit log searching, filtering, and credential redaction |
| `adminPlatformOperations.js` | `/api/admin/platform` | Backup/restore management, cache clearing, operator mutations |
| `adminUsers.js` | `/api/admin/users` | User 360 management, role elevation, suspension, session cutoff |
| `ai.js` | `/api/ai` | Resume enhancement, summary generation, skills, bullet rewrite |
| `billing.js` | `/api/billing` | Checkout intents, plan pricing, subscriptions, invoices, receipts |
| `blogData.js` | `/api/blog-data`, `/api/blog` | CMS article publishing, drafting, scheduling, public blog read |
| `coupons.js` | `/api/coupons` | Discount coupon creation, validation, usage limits |
| `covers.js` | `/api/covers` | Cover letter CRUD, template selection, auto-save |
| `databaseAdmin.js` | `/api/admin/database` | Database migration runner status, schema integrity checks |
| `email.js` | `/api/email` | SMTP configuration, transactional template dispatch |
| `employerSettings.js` | `/api/employer/settings` | Employer branding, ATS preferences, company profile |
| `enterprise.js` | `/api/enterprise`, `/api/org` | Tenant lifecycle, workspaces, member seats, roles, SAML |
| `enterpriseM2m.js` | `/api/enterprise/m2m` | Machine-to-machine service accounts, scoped API keys |
| `errorResponder.js` | Shared helper | Uniform error response formatter, request ID tagging |
| `interviews.js` | `/api/interviews` | Question generation, CBT exam simulator, scorecard persistence |
| `jobsData.js` | `/api/jobs-data`, `/api/jobs` | Job postings, Kanban application tracker, applicant review |
| `miscData.js` | `/api/misc` | System settings, announcements, contact messages, reviews |
| `notifications.js` | `/api/notifications` | In-app user notifications, read state, delivery preferences |
| `notificationsData.js` | `/api/notifications-data` | Relational notifications persistence and polling |
| `outboxAdmin.js` | `/api/admin/outbox` | Durable outbox dead-letter queue (DLQ) inspection and retries |
| `platform.js` | `/api/platform` | Liveness, readiness, service availability, PDF export |
| `portfolios.js` | `/api/portfolios` | WebCV studio builder, custom domains, media gallery |
| `publicDiscovery.js` | `/api/public` | SEO sitemap, robots.txt, public job listings, public resumes |
| `publicPortfolios.js` | `/api/public/portfolios` | Public vanity URL routing (`/portfolio/:slug`), password unlock |
| `resumes.js` | `/api/resumes` | Resume CRUD, debounced auto-save, PDF/DOCX generation, ATS scoring |
| `saml.js` | `/api/saml` | Enterprise SSO SAML IdP metadata, SP assertion consumer |
| `support.js` | `/api/support` | Candidate help desk, support tickets, agent ticket desk |
| `usersData.js` | `/api/users-data` | Candidate user profile, avatar upload, password changes |
| `voiceInterview.js` | `/api/candidate/voice-interview`| WebRTC SFU room creation, PCM audio streaming, live transcript |

### 3.2 Core Backend Services (`backend/services/`)

| Service Module | Purpose & Invariants |
|---|---|
| `aiRuntime.js` | Master multi-provider orchestration (NVIDIA, Gemini, OpenAI, Groq, OpenRouter, DeepSeek), token accounting, circuit breaker, JSON normalization |
| `aiAdmin.js` | Super Admin AI provider settings, live connection ping, credential vault storage |
| `paymentActivation.js` | Atomic webhook reconciliation (Stripe, PayPal, Razorpay, Paytm), idempotent entitlement activation, transaction rollback on failure |
| `invoiceService.js` | Indian GST-compliant tax calculations (CGST/SGST/IGST), currency formatting, invoice number sequence generation |
| `providerRefunds.js` | State-machine refund ledger, entitlement revocation, credit note generation |
| `docxExport.js` & `docxThemes.js` | High-fidelity OpenXML (.docx) generation for all 51 resume templates matching PDF layouts |
| `platformHealth.js` | Live database probe, memory/CPU metrics, authoritative engine status, route table reflection |
| `candidateContext.js` | Structured interview context extractor, experience parsing, skill taxonomy mapping |
| `liveInterviewSession.js` | Real-time WebRTC audio room state management, silence detection, turn taking |
| `portfolioProtectionService.js` | Bcrypt portfolio password verification, gallery media protection |
| `sessionRevocation.js` | Database-backed operator session revocation (`revoked_sessions` table) with cross-process cutoff checking |

---

## 4. Frontend Route & Page Inventory (`frontend/src/`)

The active frontend application is declared in `frontend/src/app/router.tsx`, using lazy loading for all views:

### 4.1 Route Catalog

| Path | Component / Page | Access Control | User Role |
|---|---|---|---|
| `/` | `LandingPage` (`@/pages/landing`) | Public | Anonymous |
| `/login` | `LoginPage` (`@/pages/auth/login`) | Unauthenticated | RedirectIfAuthenticated |
| `/features` | `FeaturesPage` (`@/pages/features/index`) | Public | Anonymous |
| `/pricing` | `PricingPage` (`@/pages/billing/pricing`) | Public | Anonymous |
| `/contact` | `ContactPage` (`@/pages/cms/index`) | Public | Anonymous |
| `/blog` | `BlogPage` (`@/pages/blog/index`) | Public | Anonymous |
| `/blog/:slug` | `BlogPage` (`@/pages/blog/index`) | Public | Anonymous |
| `/jobs`, `/jobs/browse`, `/jobs/portal` | `JobsPortalPage` (`@/pages/jobs/portal`) | Public | Anonymous |
| `/jobs/city/:slug`, `/jobs/in/:slug` | `RegionalJobsPage` (`@/pages/jobs/regional-hub`) | Public | Anonymous |
| `/portfolios` | `PortfolioGalleryPage` (`@/pages/portfolio/gallery`) | Public | Anonymous |
| `/portfolio/:slug` | `PublicPortfolioPage` (`@/pages/portfolio/public-portfolio`) | Public | Anonymous |
| `/p/:custompage` | `CMSPage` (`@/pages/cms/index`) | Public | Anonymous |
| `/shared/:resumeId` | `SharedResumePage` (`@/pages/shared/resume-view`) | Public | Anonymous |
| `/dashboard` | `DashboardOverview` (`@/pages/dashboard/overview`) | Authenticated | USER (Candidate) |
| `/dashboard/resumes` | `ResumesPage` (`@/pages/dashboard/resumes`) | Authenticated | USER (Candidate) |
| `/dashboard/ats-score`, `/dashboard/ats` | `ATSScorePage` (`@/pages/dashboard/ats-score`) | Authenticated | USER (Candidate) |
| `/dashboard/job-tracker` | `JobTrackerPage` (`@/pages/dashboard/job-tracker`) | Authenticated | USER (Candidate) |
| `/dashboard/applied-jobs` | `AppliedJobsPage` (`@/pages/dashboard/applied-jobs`) | Authenticated | USER (Candidate) |
| `/dashboard/interviews` | `InterviewCoachPage` (`@/pages/dashboard/interview-coach`) | Authenticated | USER (Candidate) |
| `/dashboard/cover-letters` | `CoverLettersPage` (`@/pages/dashboard/cover-letters`) | Authenticated | USER (Candidate) |
| `/dashboard/portfolio` | `PortfolioBuilderPage` (`@/pages/portfolio/builder`) | Authenticated | USER (Candidate) |
| `/dashboard/ai` | `AIAssistantPage` (`@/pages/dashboard/ai-assistant`) | Authenticated | USER (Candidate) |
| `/dashboard/messages` | `MessagesPage` (`@/pages/dashboard/messages`) | Authenticated | USER (Candidate) |
| `/dashboard/favourites` | `FavouritesPage` (`@/pages/dashboard/favourites`) | Authenticated | USER (Candidate) |
| `/dashboard/notifications` | `NotificationsPage` (`@/pages/dashboard/notifications`) | Authenticated | USER (Candidate) |
| `/dashboard/support` | `SupportPage` (`@/pages/dashboard/support`) | Authenticated | USER (Candidate) |
| `/dashboard/settings` | `SettingsPage` (`@/pages/dashboard/settings`) | Authenticated | USER (Candidate) |
| `/build-resume`, `/build-resume/*` | `ResumeBuilderPage` (`@/pages/dashboard/resume-builder`) | Authenticated | USER (Candidate) |
| `/coverletter/*`, `/cover-letter/*` | `CoverLetterBuilderPage` (`@/pages/dashboard/cover-letter-builder`) | Authenticated | USER (Candidate) |
| `/employer`, `/employer/*` | `EmployerPortalPage` (`@/pages/employer/portal`) | Authenticated | EMPLOYER |
| `/org`, `/org/:slug/*` | `EnterpriseConsolePage` (`@/pages/enterprise/console`) | Authenticated | ENTERPRISE OWNER / MEMBER |
| `/admin`, `/admin/*` | `AdminConsolePage` (`@/pages/admin/console`) | RBAC Required | ADMIN, SUPER_ADMIN, SUPPORT, AUDITOR |
| `/blog-editor`, `/blog-editor/:postId` | `BlogEditorPage` (`@/pages/blog/editor`) | RBAC Required | ADMIN, SUPER_ADMIN |
| `/preview/:resumeId` | `CVRendererPage` (`@/pages/export/cv-renderer`) | Token / Auth | RequireExportAccess |
| `/export/Cv1`..`Cv100/:resumeId/:lang` | `CVRendererPage` (`@/pages/export/cv-renderer`) | Headless Token | RequireExportAccess (#renderToken) |
| `/export/Cover1`..`Cover4/:resumeId/:lang` | `CVRendererPage` (`@/pages/export/cv-renderer`) | Headless Token | RequireExportAccess (#renderToken) |

---

## 5. Database Schema & Migration Inventory

MariaDB database `ai_resume_builder` contains **98 tables** governed by **44 sequential migrations**:

### Migration History (100% Applied, 0 Pending)
- `001_baseline.sql` — Core platform tables (users, resumes, jobs, subscriptions, payments)
- `002` through `006` — Single-owner enterprise tenancy, invoice ledgers, AI usage ledger
- `007` through `012` — Job tracker revisions, outbox constraints, refund state machine & credit notes
- `013` through `015` — Relational CMS authority, discovery defaults, support tickets
- `016` through `018` — Resume target role & JD analysis, live interview sessions, interview scheduling
- `019` through `025` — Grace period audit logs, regional geo projections, messaging read state
- `026` through `030` — AI quota counters, tenant credentials, AI routing decision ledger, team lifecycle
- `031` through `036` — Interview slots, custom domains, tenant quotas, session revocations, employer settings, application evaluations
- `037` through `044` — Enterprise SAML SSO, voice interview infrastructure, tenant branding, IP access rules & jail, portfolio gallery & protection, candidate ATS ranking, bank settlement ledger.

### Table Grouping by Domain

| Domain | Table Count | Key Tables |
|---|---:|---|
| **Identity & Access** | 7 | `users`, `revoked_sessions`, `oauth_states`, `oauth_exchange_codes`, `password_reset_tokens`, `email_verification_tokens`, `ip_access_rules` |
| **Resumes & Documents** | 5 | `resumes`, `public_resumes`, `covers`, `canonical_documents`, `export_render_tokens` |
| **Enterprise Tenancy** | 16 | `enterprise_tenants`, `enterprise_workspaces`, `enterprise_memberships`, `enterprise_teams`, `enterprise_sso_config`, `enterprise_tenant_credentials`, `enterprise_quota_buckets`, `tenant_custom_domains` |
| **Interviews & AI Coaching** | 6 | `live_interview_sessions`, `interview_slots`, `application_evaluations`, `voice_interview_rooms`, `voice_interview_transcripts`, `candidate_ats_ranking` |
| **AI Governance & Ledger** | 5 | `ai_usage`, `ai_quota_counters`, `ai_routing_decisions`, `enterprise_ai_usage`, `prompt_cache` |
| **Jobs & Applicants** | 4 | `jobs`, `job_tracker`, `applications`, `employer_settings` |
| **Portfolios & WebCV** | 3 | `portfolios`, `portfolio_custom_domains`, `portfolio_media` |
| **Payments & Invoicing** | 10 | `payment_orders`, `invoices`, `credit_notes`, `payment_bank_settlements`, `payment_settlement_items`, `payment_webhook_events`, `coupons`, `coupon_redemptions`, `subscriptions`, `subscription_audit_log` |
| **CMS, Support & Comms** | 9 | `blog`, `support_tickets`, `support_ticket_messages`, `contact_messages`, `conversations`, `conversation_messages`, `notifications`, `notification_outbox`, `custom_pages` |
| **Infrastructure & Audit** | 8 | `admin_audit_logs`, `security_audit_logs`, `enterprise_audit_events`, `schema_migrations`, `schema_migration_attempts`, `system_settings`, `database_authority`, `deadlock_probe` |

---

## 6. Dead, Duplicate & Deprecated Code Analysis

1. **Dead Legacy Root Tree (`/src/`):** 519 `.jsx` files and 224,927 lines of React 18 code reside at the repository root. This tree is entirely bypassed by the production build (`scripts/sync-dist.mjs` targets `frontend/dist`). It represents severe technical and cognitive debt.
2. **Unreachable Route Handler (`backend/index.js:5555`):** The Naukri scraper endpoint (`POST /api/jobs/naukri`) is completely shadowed by `router.post('/:id')` in `backend/routes/jobsData.js:292` mounted at `backend/index.js:558`.
3. **Dead Database Fallback Modules:** Stale references to Firestore adapters and Redis caching exist in obsolete documentation files, though the actual runtime cleanly rejects them (`firestoreDataPlane: "REMOVED"`).
