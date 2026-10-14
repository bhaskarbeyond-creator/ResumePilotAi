# CANDIDATE_PIPELINE_INVENTORY.md
## Part 6 — Mandatory Full-Pipeline Discovery (Candidate Workspace)
**Directive:** IME365 ULTIMATE MASTER ENGINEERING DIRECTIVE
**Generated:** 2026-10-14 (Phase 2)
**Method:** static route/service tracing + live API exercise; no pipeline silently omitted

---

### 1. REGISTER

| ID | Pipeline | Trigger | Frontend | Backend | Storage/Provider | Tests | Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| P-01 | Auth & session | Page load / sign-in | main.jsx AuthWrapper, fire.auth | requireAuth + bearer validation | Firebase Auth + local session | four-portal, security-static | live custom-token session verified in all browser audits |
| P-02 | Candidate profile load/update | /dashboard/settings | DashboardSettings | /api/users/* (usersData.js) | MariaDB aime365 | tests referenced in platform suites | live page renders with real profile |
| P-03 | Resume list load | /dashboard, /build-resume | getResumes (platform) -> resumes.js | /api/resumes | MariaDB | template tests | live: real resumeId fetched via API in candidate audit |
| P-04 | Resume create/edit/save + autosave | /build-resume/* steps | BuildResume saveState | POST/PUT /api/resumes | MariaDB | create-resume-extras, builder tests | live build-resume pages rendered |
| P-05 | Resume delete | dashboard documents | deleteResume | DELETE /api/resumes | MariaDB | platform tests | pending E2E simulation |
| P-06 | Resume publish/unpublish | /build-resume/review | publishResume/unpublishResume | POST /api/resumes/publish | MariaDB (public share record) | — | pending E2E simulation |
| P-07 | Public resume share render | /shared/:resumeId | PublicResume | getPublicResume | MariaDB | — | live render verified (candidate audit export section) |
| P-08 | ATS scoring + recommendations | /build-resume/review | calculateAtsScore (FROZEN) | backend AI/ats endpoints | deterministic engine | ats-score, ats-score-journey, ats-module-toggle | suites green (67+72 earlier) |
| P-09 | AI resume content generation (quota-enforced) | step AI buttons | generateUserAiContent | /api/ai/* + quota check | MariaDB quota counters | ai-token-meter, ai-operational-probe | suites green |
| P-10 | Template render (51 CV + 4 cover) | /export/CvN|CoverN/:resumeId/:lang | export renderers + cv-templates | server-rendered export routes | FROZEN templates | template-render, template-production-render, docx-parity | live export crawl in candidate audit (56 renders) |
| P-11 | PDF/DOCX export download | review step download | exportService (FROZEN) | backend export endpoints | file generation | dir063 docx/print suites | pending file-output inspection |
| P-12 | Job discovery/filter/pagination | /dashboard/jobs* | getJobs | /api/jobs (jobsData.js) | MariaDB jobs | job-module-audit | live pages rendered |
| P-13 | Application submission | job detail apply | saveApplication | POST /api/applications | MariaDB | cross-app-audit | pending E2E simulation |
| P-14 | Application status tracking (kanban) | /dashboard/job-tracker, /applied-jobs | JobTracker/AppliedJobs | /api/applications | MariaDB + stage transitions | job-module-audit-complete | live pages rendered |
| P-15 | Interview setup -> CBT session -> persistence | /dashboard/interview | DashboardInterviews (reducer) | AI generation endpoint | localStorage session + history (uid-scoped) | interview-coach (31/31) + lifecycle + hardening | 31/31 green, 0 act warnings |
| P-16 | Live face-to-face interview session | /dashboard/interview live mode | LiveInterviewSession | liveInterviewApi | backend session state | live-interview-ui tests | suite green |
| P-17 | Interview feedback/scoring persistence | submit flow | buildInterviewReport | local history write | localStorage interviewHistory | interview-coach suite | green |
| P-18 | Portfolio create/publish/share | /portfolio/builder, /portfolio/:slug | PortfolioBuilder, PublicPortfolio | /api/portfolios | MariaDB | portfolio-templates, portfolios suites | live gallery/builder rendered; publish pending E2E |
| P-19 | Cover letter CRUD + AI generation | /dashboard/cover-letters | CoverLetter | /api/covers + aiService | MariaDB covers | med001-429-regression (2/2) | 429 resilience verified live |
| P-20 | Saved favorites/bookmarks | /dashboard/favorites | DashboardFavourites | platform endpoints | MariaDB | — | live page rendered |
| P-21 | Notifications | /dashboard/notifications | DashboardNotifications | /api/notifications | MariaDB | dir072 suite | suite green |
| P-22 | Messaging (module-gated) | /dashboard/messages | DashboardMessages | /api/messages | MariaDB (module toggle OFF-by-default) | dir072 | live page renders module gate |
| P-23 | Billing/plans/quotas | /dashboard/plans | Billing | Stripe + /api/billing | MariaDB + Stripe (webhook-verified) | billing suites | live page rendered; provider live verification BLOCKED (sandbox keys only) |
| P-24 | Support tickets | /dashboard/support | DashboardSupport | /api/support | MariaDB | support suites | live page rendered |
| P-25 | Settings/security/2FA | /dashboard/settings?tab=* | DashboardSettings | /api/users/* + TOTP | MariaDB + Firebase MFA | mfa-static | suite green |
| P-26 | File upload (photo) | heading step photo | file upload | backend upload validation | filesystem/s3 | — | pending E2E (synthetic image) |
| P-27 | Logout/session expiry/recovery | user menu | clearAccountScopedBrowserState | backend logout | localStorage clear | auth suites | green |
| P-28 | Cross-feature: profile -> resume -> ATS -> update -> re-score | user journey | multiple | multiple | MariaDB | ats-score-journey | suite green |

### 2. PIPELINE CATEGORY APPLICABILITY (§6.2)

All 24 categories map to at least one pipeline above. Categories found NOT to exist in the implementation: background-job retry queues for candidate flows (no async queue for candidate actions — synchronous request/response), and provider callbacks for candidate payments beyond Stripe webhook verification (exists; live verification requires real keys).

### 3. MISSING-TEST GAPS (from register)

- P-05 resume delete: no live E2E simulation yet.
- P-06 publish/unpublish + P-07 public access + revocation: partial (render only).
- P-13 application submission: no live E2E simulation yet.
- P-18 portfolio publish/privacy revocation: pending.
- P-23 Stripe live verification: BLOCKED (sandbox credentials only — documented blocker).
- P-26 file upload: pending synthetic-image E2E.
- P-11 export file-output inspection (DOCX/PDF byte-level): covered by dir063 suites (backend); pending a live download capture.

