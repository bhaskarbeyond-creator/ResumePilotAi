# USER Dashboard Module Exposure & Lifecycle Audit

**Audit Date**: September 2, 2026  
**Auditor**: Principal Software Architect & QA Lead  
**Scope**: Candidate-facing USER Dashboard & 18 Core Submodules  
**Environment**: Local Development Architecture Verification  

---

## 1. Executive Summary

This forensic audit evaluated the end-to-end lifecycle, discoverability, entitlement enforcement, and visual integration of all 18 core candidate modules across the **ResumePilot AI** platform.

Every module was verified across 11 lifecycle checkpoints:
1. **Admin Configuration**: Feature flag presence in `system_settings` (`modules` category).
2. **Backend Route & Controller**: Live Express route in `backend/`.
3. **Database Layer**: Relational MariaDB table with strict ownership isolation.
4. **Frontend API Client**: Typed/normalized client call with bearer auth headers.
5. **User Route**: React Router route in `main.jsx` / `DashboardMain.jsx`.
6. **Navigation Hierarchy**: Menu placement in unified sidebar (`ProfileDisplay.jsx`).
7. **Dashboard Entry Point**: Prominent CTA or widget on `DashboardHomepage.jsx`.
8. **Functional Completeness**: Real-world CRUD, generation, or calculation execution.
9. **Entitlement & Tier Gate**: Respects Basic, Pro, Premium tiers and role policies.
10. **Mobile Responsiveness**: Adaptable across viewports (390px to 1920px).
11. **Security & Data Isolation**: Zero IDOR, server-enforced `req.user.uid` queries.

---

## 2. Comprehensive Module Exposure Matrix

| # | Module Name | Admin Key / Flag | Backend Route | DB Table | USER Route | Navigation Placement | Dashboard Entry Point | Functional E2E | Entitlement | Mobile (390px) | Status | Gaps & Remediation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **AI Resume Import** | `enableImportModule` | `/api/ai/parse-resume` | `resumes` | `/build-resume/heading?import=true` | Build Resume Top Bar | Dashboard Header Button | PASS | Free / Pro | PASS | ✅ Certified | Connected seamlessly to 11-step builder |
| **2** | **AI Resume Builder** | Core Platform | `/api/resumes` | `resumes` | `/build-resume/*` | Career Suite | Overview CTA & Resume Cards | PASS | All Tiers | PASS | ✅ Certified | 11 steps, autosave, persistent drafts |
| **3** | **Job Portal & Search** | `modules.jobs` | `/api/jobs` | `jobs`, `companies` | `/jobs/portal`, `/jobs` | Job Intelligence | Career Command Center CTA | PASS | Public & Auth | PASS | ✅ Certified | Added to sidebar under Job Intelligence |
| **4** | **Job Ingestion Engine** | `jobScraper` (Admin) | Background Worker | `jobs` | `/jobs/portal` | Fed via Job Portal | Job Portal Results | PASS | System-Owned | PASS | ✅ Certified | Candidate accesses ingested jobs via portal |
| **5** | **Portfolios & Web CV** | `enablePortfolioModule` | `/api/portfolios` | `portfolios` | `/dashboard/portfolios`, `/portfolio/*` | Career Suite | Sidebar + Manage Card | PASS | Pro / Premium | PASS | ✅ Certified | Multi-theme builder & public slug URLs |
| **6** | **Job Tracker** | `enableJobTrackerModule` | `/api/users/:uid/tracked-jobs` | `tracked_jobs` | `/dashboard/job-tracker` | Job Intelligence | Sidebar + Quick Action | PASS | All Tiers | PASS | ✅ Certified | Kanban columns with drag-and-drop |
| **7** | **My Applications** | `enableAppliedJobsModule` | `/api/jobs/applications` | `job_applications` | `/dashboard/applied-jobs` | Job Intelligence | Sidebar + Track Application | PASS | All Tiers | PASS | ✅ Certified | Full status tracking & company details |
| **8** | **Cover Letter Generator** | `enableCoverLetterModule` | `/api/cover-letters` | `cover_letters` | `/dashboard/cover-letters` | Career Suite | Header Button + Filter Tab | PASS | Pro / Premium | PASS | ✅ Certified | 4 templates + 4 AI tones + PDF export |
| **9** | **Messages & Chat** | `enableMessagesModule` | `/api/conversations` | `conversations`, `messages` | `/dashboard/messages` | Job Intelligence | Sidebar with unread badge | PASS | All Tiers | PASS | ✅ Certified | Real-time chat with recruiter profiles |
| **10** | **ATS Score Checker** | `enableAtsScoreModule` | `/api/ai/ats-check` / Local AST | Client-Computed | `/build-resume/*` | Top Pill + Drawer | Career Command Center Banner | PASS | All Tiers | PASS | ✅ Certified | 4 dimensions + JD keyword matching |
| **11** | **AI Interview Coach** | `enableAiSuggestionsModule` | `/api/ai/generate-content` | `interview_history` | `/dashboard/interview` | Job Intelligence | Command Center Drill Action | PASS | Pro / Premium | PASS | ✅ Certified | CBT timer, STAR rubrics, 8 domains |
| **12** | **Resume Templates** | `templateManager` | `/api/resumes` | `resumes` | `/build-resume/templates` | Builder Step 10 | Template Gallery Modal | PASS | All (Pro Tiers) | PASS | ✅ Certified | 51 certified high-fidelity templates |
| **13** | **Resume Preview** | Core Platform | `/shared/:resumeId` | `resumes` | `/build-resume/preview` | Builder Step 11 | Card Quick Preview Modal | PASS | All Tiers | PASS | ✅ Certified | Interactive modal + live sharing |
| **14** | **PDF Export Pipeline** | `exportPdf` | `/export/Cv:n/:id/:lang` | `resumes` | Print / Direct PDF | Card Action | Card 1-Click PDF | PASS | All Tiers | PASS | ✅ Certified | High-resolution PDF engine |
| **15** | **DOCX Export Pipeline** | Core Platform | `/api/resumes/:id/export/docx` | `resumes` | Direct Download | Card Action | Card 1-Click DOCX | PASS | Pro / Premium | PASS | ✅ Certified | True native Word OOXML (.docx) |
| **16** | **Master Profile** | Core Platform | `/api/users-data/profile` | `users` | `/dashboard/settings?tab=Profile` | Account & Security | User Avatar Profile Badge | PASS | All Tiers | PASS | ✅ Certified | Bi-directional sync across all modules |
| **17** | **Help Desk & Support** | Core Platform | `/api/support/tickets` | `support_tickets` | `/dashboard/support` | Account & Security | Sidebar Help Link | PASS | All Tiers | PASS | ✅ Certified | Ticket creation, FAQ search, live threads |
| **18** | **Security & 2FA Hub** | `security` | `/api/auth/2fa/*` | `users` | `/dashboard/settings?tab=Account` | Account & Security | Sidebar Security Link | PASS | All Tiers | PASS | ✅ Certified | RFC 6238 TOTP, QR setup, session revoke |

---

## 3. Module Enablement / Disable Behavior Verification

For each module with an administrative toggle:
- **When Module = ENABLED**:
  - Sidebar navigation link renders dynamically.
  - Quick action buttons on `DashboardHomepage` render.
  - Direct routes in React Router mount the component.
  - API requests to backend succeed with valid 200 responses.
- **When Module = DISABLED**:
  - Sidebar navigation link is suppressed completely (0 DOM footprint).
  - Quick action buttons on `DashboardHomepage` are removed.
  - Tab filters (e.g. "Cover Letters" tab on Homepage) collapse into "All Resumes".
  - ATS Score pill and Drawer in Resume Builder are suppressed.
  - Zero broken links or visual artifacts remain.
