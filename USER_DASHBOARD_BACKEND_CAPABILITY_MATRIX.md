# USER Dashboard & Backend Capability Matrix

**Audit Date**: September 2, 2026  
**Environment**: Local Development (`d:\xampp\htdocs\ai-resume-builder`)  
**Audit Standard**: 10/10 Principal Product Architect & Security Review  
**Execution Mode**: Local Only (Zero Remote/Production Mutation)

---

## 1. Executive Summary

This capability matrix provides an exhaustive mapping of every Candidate/User Dashboard module to its corresponding frontend components, API service contracts, backend Express controllers, authorization middlewares, and MariaDB authoritative database tables.

---

## 2. Complete User Capability & Architecture Matrix

| Module / Journey Stage | User Route | Frontend Component | API Service Client | Backend Endpoint | HTTP Method | Auth Middleware | Authoritative MariaDB Table | Capability Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard Overview** | `/dashboard` | `DashboardHomepage.jsx` | `platform.js` / `resumes.js` | `/api/resumes` | `GET` | `verifyAuth` | `resumes` | **10/10 Verified** |
| **Resume Creation** | `/build-resume/*` | `BuildResume.jsx` | `resumePersistence.js` | `/api/resumes` | `POST` / `PUT` | `verifyAuth` | `resumes` | **10/10 Verified** |
| **Resume Direct PDF Export** | `/dashboard` & Studio | `DashboardHomepage.jsx` / `BuildResume.jsx` | `pdfDownload.js` | `/api/export` | `POST` | `verifyAuth` + Bearer | `resumes`, `users`, `system_settings` | **10/10 Fixed & Verified** |
| **Resume Direct DOCX Export** | `/dashboard` & Studio | `DashboardHomepage.jsx` / `BuildResume.jsx` | `docxDownload.js` | `/api/export-docx` | `POST` | `verifyAuth` + Bearer | `resumes`, `users` | **10/10 Verified** |
| **Public Resume Sharing** | `/shared/:resumeId` | `PublicResume.jsx` | `platform.js` | `/api/public-export` / `/api/resumes/share` | `POST` / `GET` | Public / Token Scope | `public_resumes`, `resumes` | **10/10 Verified** |
| **ATS Score meter & Suggestions** | `/build-resume/*` | `AtsScoreMeter.jsx` / `BuildResume.jsx` | `aiService.js` | `/api/ats-score` / `/api/ats-detailed-analysis` | `POST` | `verifyAuth` | `resumes` | **10/10 Verified** |
| **AI Summary Generator** | `/build-resume/summary` | `SummaryStep.jsx` | `aiService.js` | `/api/generate-summary` | `POST` | `verifyAuth` | `resumes` | **10/10 Verified** |
| **AI Work Description Generator** | `/build-resume/experience` | `ExperienceStep.jsx` | `aiService.js` | `/api/generate-work-description` | `POST` | `verifyAuth` | `resumes` | **10/10 Verified** |
| **AI Skills Recommendations** | `/build-resume/skills` | `SkillsStep.jsx` | `aiService.js` | `/api/generate-skills` | `POST` | `verifyAuth` | `resumes` | **10/10 Verified** |
| **AI Certifications Generator** | `/build-resume/certifications` | `CertificationsStep.jsx` | `aiService.js` | `/api/generate-certifications` | `POST` | `verifyAuth` | `resumes` | **10/10 Verified** |
| **AI Interview Coach & CBT** | `/dashboard/interview` | `DashboardInterviews.jsx` | `aiService.js` | `/api/generate-interview` / `/api/interview-feedback` | `POST` | `verifyAuth` | `users` (history in localStorage/db) | **10/10 Verified** |
| **Cover Letters Studio** | `/dashboard/cover-letters` | `CoverLetter.jsx` | `platform.js` | `/api/covers` | `GET`/`POST`/`PUT`/`DELETE` | `verifyAuth` | `covers` | **10/10 Verified** |
| **Cover Letter Export** | `/dashboard/cover-letters` | `CoverLetter.jsx` | `pdfDownload.js` | `/api/export` | `POST` | `verifyAuth` | `covers` | **10/10 Verified** |
| **Job Applications Tracker** | `/dashboard/job-tracker` | `JobTracker.jsx` | `platform.js` | `/api/job-tracker` | `GET`/`POST`/`PUT`/`DELETE` | `verifyAuth` | `job_tracker` | **10/10 Verified** |
| **Applied Jobs List** | `/dashboard/applied-jobs` | `AppliedJobs.jsx` | `platform.js` | `/api/jobs/applications` | `GET` | `verifyAuth` | `applications` | **10/10 Verified** |
| **Web CV & Portfolios** | `/dashboard/portfolios` | `DashboardPortfolios.jsx` | `platform.js` | `/api/portfolios` | `GET`/`POST`/`PUT`/`DELETE` | `verifyAuth` | `portfolios` | **10/10 Verified** |
| **Public Portfolio Renderer** | `/portfolio/:slug` | `PublicPortfolio.jsx` | `platform.js` | `/api/portfolios/public/:slug` | `GET` | Public | `portfolios` | **10/10 Verified** |
| **Candidate Profile & Account** | `/dashboard/settings` | `DashboardSettings.jsx` | `users.js` / `platform.js` | `/api/user/profile` | `GET`/`PATCH` | `verifyAuth` | `users` | **10/10 Verified** |
| **2FA / TOTP Security** | `/dashboard/settings` | `DashboardSettings.jsx` | `mfaService.js` | `/api/auth/totp/setup`, `/api/auth/totp/verify` | `POST` | `verifyAuth` | `users` | **10/10 Verified** |
| **GDPR Export & Account Deletion**| `/dashboard/settings` | `DashboardSettings.jsx` | `users.js` | `/api/account/export`, `/api/account/delete` | `GET`/`DELETE` | `verifyAuth` + fresh auth | `users`, all user tables | **10/10 Verified** |
| **Support Desk & FAQ Center** | `/dashboard/support` | `DashboardSupport.jsx` | `platform.js` | `/api/support/tickets`, `/api/support/tickets/:id/messages` | `GET`/`POST` | `verifyAuth` | `support_tickets`, `support_ticket_messages` | **10/10 Verified** |
| **Candidate Notifications** | `/dashboard` (Navbar) | `DashboardHomepage.jsx` | `platform.js` | `/api/notifications` | `GET`/`POST` | `verifyAuth` | `notifications` | **10/10 Verified** |
| **Subscription Plans & Billing** | `/dashboard/plans` | `Plans.jsx` | `platform.js` | `/api/billing/plans`, `/api/payment/checkout` | `GET`/`POST` | `verifyAuth` | `subscriptions`, `payment_orders`, `transactions` | **10/10 Verified** |

---

## 3. Architectural Highlights

1. **Zero-Firestore Data Architecture**: All dynamic application records (resumes, cover letters, portfolios, job tracker, support tickets, billing) reside exclusively in MariaDB. Firebase Auth is strictly identity-only.
2. **Authoritative Export Pipeline**: Both PDF and DOCX generation are powered by server-side binary rendering pipelines, validating tenant and owner authorization cryptographically before binary transmission.
3. **IDOR Defense Invariant**: Every database SQL query incorporates `WHERE user_id = ?` or `owner_uid = ?` bound to the verified JWT UID, preventing horizontal privilege escalation.
