# User Product Capability Matrix

**Classification Standard:** Comprehensive audit of candidate-facing tools, workflows, APIs, and rendering surfaces.  
**Release Target:** Enterprise-grade AI Career Suite.

---

## 1. Matrix Overview

| Module / Capability | Frontend Surface | Backend Endpoint | Authorization Rule | Storage Engine | Completeness Status |
|---|---|---|---|---|---|
| **Resume Overview & Management** | `/dashboard` | `GET /api/resumes`, `POST /api/resumes/draft` | Bearer Token (User ID) | MariaDB (`resumes`) | Complete (10/10) |
| **Resume Builder Wizard** | `/build-resume/*` | `PUT /api/resumes/draft/:id`, `GET /api/resumes/:id` | Owner-Scoped ID match | MariaDB (`resumes`) | Complete (10/10) |
| **51 CV Templates Render** | `TemplateRenderer.jsx` | `POST /api/export` | Authenticated + Entitlement | MariaDB + Puppeteer PDF Engine | Complete (10/10) |
| **DOCX High-Fidelity Export**| `DashboardHomepage.jsx` | `POST /api/export-docx` | Authenticated + Entitlement | Server-side OOXML Generator | Complete (10/10) |
| **ATS Score & Job Match** | `AtsScoreMeter.jsx` | Client AST Analyzer + Backend AI | User Bearer Token | Client & Server cache | Complete (10/10) |
| **AI Experience & Summary** | `SummaryStep.jsx`, `WorkHistoryStep.jsx` | `POST /api/generate-summary`, `POST /api/generate-work-description` | User Bearer Token | Ephemeral / Non-retained | Complete (10/10) |
| **AI Cover Letter Builder** | `/dashboard/cover-letters` | `GET /api/cover-letters`, `POST /api/cover-letters` | Owner-Scoped ID match | MariaDB (`cover_letters`) | Complete (10/10) |
| **AI Interview Coach & CBT** | `/dashboard/interview` | `POST /api/interview/generate`, `POST /api/interview/submit` | User Bearer Token | MariaDB (`interview_sessions`) | Complete (10/10) |
| **Job Application Tracker** | `/dashboard/job-tracker` | `GET /api/jobs/tracker`, `POST /api/jobs/tracker` | Owner-Scoped ID match | MariaDB (`job_tracker`) | Complete (10/10) |
| **Web Portfolio Builder** | `/dashboard/portfolios` | `GET /api/portfolios`, `PUT /api/portfolios/:id` | Owner-Scoped ID match | MariaDB (`portfolios`) | Complete (10/10) |
| **Support Desk & Ticketing**| `/dashboard/support` | `GET /api/support/tickets`, `POST /api/support/tickets` | Owner-Scoped ID match | MariaDB (`support_tickets`) | Complete (10/10) |
| **Knowledge Base & FAQs** | `/dashboard/support` | Built-in verified catalog | Public / Authenticated | Pre-compiled JSON catalog | Complete (10/10) |
| **Master Profile Synchronization**| `/dashboard/settings` | `GET /api/profile`, `PUT /api/profile` | Owner-Scoped ID match | MariaDB (`users`, `profiles`) | Complete (10/10) |
| **TOTP 2FA Authentication** | `/dashboard/settings?tab=Account` | `POST /api/auth/2fa/totp/*` | Re-auth + Token verification | MariaDB (`user_2fa_totp`) | Complete (10/10) |
| **GDPR Data Portability** | `/dashboard/settings?tab=Account` | `GET /api/account/export-json` | Owner-Scoped ID match | On-the-fly JSON bundle | Complete (10/10) |
| **Subscription & Invoices** | `/dashboard/plans` | `GET /api/subscriptions/status`, `GET /api/invoices` | Owner-Scoped ID match | MariaDB (`subscriptions`, `orders`) | Complete (10/10) |

---

## 2. Capability Depth & Feature Breakdown

### A. Resume Studio
- **51 Visual Archetypes**: Chronological, Split Column, Executive Banner, Modern Minimalist, Tech Matrix, Academic CV, Creative Portfolio.
- **Dynamic Normalization**: Handles string, numeric, boolean, array, and object fields without render-time `TypeError`.
- **ATS Semantic Engine**: Instant keyword density, action verb strength analysis, readability metrics, and target job description comparison.

### B. AI Career Intelligence
- **Work History Enrichment**: Transform raw candidate bullet points into high-impact STAR formatted achievements (Situation, Task, Action, Result).
- **Summary Generator**: 3 selectable tones (Balanced, Executive, Impact) tailored to target role and total years of experience.
- **Interview Coach Simulator**: Timed CBT mock tests with real-time feedback, review marking, and post-session competency reports.

### C. Self-Service Support & Security
- **Unified Help Desk**: Direct ticket logging, multi-turn reply threads, priority flags (Low, Normal, High, Urgent), and instant status updates.
- **Knowledge Base Search**: Filterable troubleshooting FAQs covering export fidelity, template switching, ATS scores, and billing.
- **Account Shield**: Industry-standard TOTP MFA with cryptographic enrollment tokens, QR code rendering, and emergency recovery keys.
