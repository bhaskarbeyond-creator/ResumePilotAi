# CANDIDATE_DASHBOARD_PAGES.md
## Comprehensive Master Inventory of All Candidate Workspace Surfaces & Routes

**Authority:** Lead Architecture & Technical Governance (Antigravity)  
**Project:** IME365 — Candidate Workspace Suite  
**Generated Date:** 2026-10-14  
**Router Anchors:** `src/main.jsx`, `src/components/Dashboard/DashboardMain/DashboardMain.jsx`, `src/components/BuildResume/BuildResume.jsx`  

---

### 1. Architectural Overview & Router Topology

The Candidate Portal routing is split across three distinct router levels:
1. **Top-Level Application Router (`src/main.jsx`)**: Mounts top-level namespaces (`/dashboard/*`, `/build-resume/*`, `/portfolio/*`, `/shared/*`, `/export/*`), guest routes, and authentication guards.
2. **Dashboard Sub-Router (`src/components/Dashboard/DashboardMain/DashboardMain.jsx`)**: Mounts the 28-route candidate workspace table rendered inside `<CubaCandidateShell>`.
3. **Resume Builder Sub-Router (`src/components/BuildResume/BuildResume.jsx`)**: Mounts the 12 candidate step routes and review/export studio.

---

### 2. Core Candidate Dashboard Pages (Mounted under `/dashboard/*`)

| # | Page / Feature Name | Mounted URL Route | Serving Component | Exact Source File |
|:---:|:---|:---|:---|:---|
| **1** | **Candidate Cockpit / Overview** | `/dashboard` | `<DashboardHomepage>` | `src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx` |
| **2** | **Cover Letters Hub** | `/dashboard/cover-letters` | `<CoverLetter>` | `src/components/CoverLetter/CoverLetter.jsx` |
| **3** | **Portfolios & Web CV** | `/dashboard/portfolios` | `<DashboardPortfolios>` | `src/components/Dashboard/DashboardPortfolios/DashboardPortfolios.jsx` |
| **4** | **Saved Favorites & Bookmarks** | `/dashboard/favorites` | `<DashboardFavourites>` | `src/components/Dashboard/DashboardFavourites/DashboardFavourites.jsx` |
| **5** | **Notifications Hub** | `/dashboard/notifications` | `<DashboardNotifications>` | `src/components/Dashboard/DashboardNotifications/DashboardNotifications.jsx` |
| **6** | **Browse Job Portal (Main)** | `/dashboard/jobs` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **7** | **Job Listings Portal** | `/dashboard/jobs/portal` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **8** | **Single Job Detail View** | `/dashboard/jobs/portal/:jobId` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **9** | **Job Search & Filter Browser** | `/dashboard/jobs/browse` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **10** | **Job Category Listing** | `/dashboard/jobs/category/:catName` | `<MainJobListings>` | `src/components/JobsListings/MainJobListings.jsx` |
| **11** | **Job Tracker (Kanban Pipeline)** | `/dashboard/job-tracker` | `<JobTracker>` | `src/components/AppliedJobs/JobTracker.jsx` |
| **12** | **Submitted Applications** | `/dashboard/applied-jobs` | `<AppliedJobs>` | `src/components/AppliedJobs/AppliedJobs.jsx` |
| **13** | **AI Interview Coach & CBT Simulator** | `/dashboard/interview` | `<DashboardInterviews>` | `src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx` |
| **14** | **Messages & Recruiter Chat** | `/dashboard/messages` | `<DashboardMessages>` | `src/components/Dashboard/DashboardMessages/DashboardMessages.jsx` |
| **15** | **Subscription, Quotas & Plans** | `/dashboard/plans` | `<Billing>` | `src/components/Billing/Billing.jsx` |
| **16** | **Settings & Master Configuration** | `/dashboard/settings` | `<DashboardSettings>` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` |
| **17** | **Master Profile Data (Tab View)** | `/dashboard/settings?tab=Profile` | `<DashboardSettings>` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` |
| **18** | **Security & 2FA Hub (Tab View)** | `/dashboard/settings?tab=Security` | `<DashboardSettings>` | `src/components/Dashboard/DashboardSettings/DashboardSettings.jsx` |
| **19** | **Help Desk & Support Center** | `/dashboard/support` | `<DashboardSupport>` | `src/components/Dashboard/DashboardSupport/DashboardSupport.jsx` |
| **20** | **Candidate Design System Showcase** | `/dashboard/design-system` | `<DesignSystemShowcase>` | `src/components/cuba/DesignSystemShowcase.jsx` (lazy import in DashboardMain.jsx) |

---

### 3. Resume Builder Master Studio & 12 Step Pages (`/build-resume/*`)

All mounted within the authenticated candidate workspace via `src/components/BuildResume/BuildResume.jsx`:

| # | Builder Step / Screen | URL Route Path | Serving Sub-Component | Purpose & Data Surface |
|:---:|:---|:---|:---|:---|
| **21** | **Builder Index / Root** | `/build-resume` | `<HeadingStep>` | Default landing route for active resume editing. |
| **22** | **Step 1: Contact & Heading** | `/build-resume/heading` | `<HeadingStep>` | Full name, target role, email, phone, location, photo upload. |
| **23** | **Step 2: Work History** | `/build-resume/work-history` | `<WorkHistoryStep>` | Employment timeline, bullet points, AI bullet enhancement. |
| **24** | **Step 3: Education** | `/build-resume/education` | `<EducationStep>` | Degrees, institutions, GPA, graduation dates, coursework. |
| **25** | **Step 4: Skills & Competencies** | `/build-resume/skills` | `<SkillsStep>` | Technical & soft skills with automated deduplication engine. |
| **26** | **Step 5: Languages** | `/build-resume/languages` | `<LanguagesStep>` | Native/spoken languages and CEFR/standard proficiency levels. |
| **27** | **Step 6: Executive Summary** | `/build-resume/summary` | `<SummaryStep>` | AI Executive Bio generator grounded in prior candidate steps. |
| **28** | **Step 7: Projects** | `/build-resume/projects` | `<ProjectsStep>` | Portfolio projects, tech stacks, repository and live URLs. |
| **29** | **Step 8: Certifications** | `/build-resume/certifications` | `<CertificationsStep>` | Professional licenses, issuing bodies, expiry, credential IDs. |
| **30** | **Step 9: Achievements** | `/build-resume/achievements` | `<AchievementsStep>` | Industry awards, honors, key milestones, publications. |
| **31** | **Step 10: References** | `/build-resume/references` | `<ReferencesStep>` | Professional reference contacts and endorsements. |
| **32** | **Step 11: Custom Sections** | `/build-resume/custom` | `<CustomSectionsStep>` | User-defined flexible content sections and custom headers. |
| **33** | **Step 12: Review & Template Hub** | `/build-resume/review` | `<ReviewStep>` | Comprehensive preview, ATS scorecard, 51-template switcher, PDF/DOCX downloads. |

---

### 4. Dedicated Candidate Creation & Public Sharing Surfaces

| # | Surface Name | URL Route Path | Serving Component | Purpose |
|:---:|:---|:---|:---|:---|
| **34** | **Portfolio Builder Studio** | `/portfolio/builder` | `<PortfolioBuilder>` | Standalone interactive web-portfolio designer. |
| **35** | **Public Live Candidate Portfolio** | `/portfolio/:slug` | `<PublicPortfolio>` | Public-facing responsive web portfolio for employers. |
| **36** | **Candidate Portfolio Gallery** | `/portfolios` | `<PortfolioGallery>` | Searchable gallery of candidate web portfolios. |
| **37** | **Public Shared Candidate Resume** | `/shared/:resumeId` | `<PublicResume>` | Direct shareable read-only link for a specific resume. |

---

### 5. Candidate High-Fidelity Export & Print Preview Surfaces

Mounted under `/export/` for dynamic rendering and high-fidelity PDF/print generation:

| # | Route Pattern | Total Modules | Description |
|:---:|:---|:---:|:---|
| **38–88** | `/export/Cv1/:resumeId/:language` through `/export/Cv51/:resumeId/:language` | **51 Pages** | High-fidelity print/export renderers for all 51 certified CV templates (`Cv1` through `Cv51` in `src/cv-templates/`). |
| **89–92** | `/export/Cover1/:resumeId/:language` through `/export/Cover4/:resumeId/:language` | **4 Pages** | High-fidelity print/export renderers for all 4 Cover Letter templates (`Cover1` through `Cover4`). |

---

### 6. Candidate Aliases & Automatic Redirections

These routes exist in the router to automatically redirect older bookmarks or alternate paths directly into the maintained candidate workspace:

| Original URL Path | Redirects To Canonical Path | Description |
|:---|:---|:---|
| `/dashboard/profile` | `/dashboard/settings?tab=profile` | Profile edit tab |
| `/dashboard/security` | `/dashboard/settings?tab=security` | 2FA and Security tab |
| `/dashboard/account` | `/dashboard/settings` | General account settings |
| `/dashboard/billing` | `/dashboard/plans` | Candidate subscriptions & quotas |
| `/dashboard/my-resumes` | `/dashboard` | Candidate documents overview |
| `/dashboard/cv` | `/dashboard/cover-letters` | Cover letters hub |
| `/dashboard/job-matching` | `/dashboard/job-tracker` | Candidate job tracker pipeline |
| `/dashboard/tickets` | `/dashboard/support` | Support ticketing center |
| `/dashboard/help` | `/dashboard/support` | Help desk |
| `/resume-builder` & `/resume-builder/*` | `/build-resume` | Canonical Resume Builder |
| `/create-resume` & `/create-resume/*` | `/build-resume` | Canonical Resume Builder |
| `/resume/:step` | `/build-resume/heading` | Step alias redirect |
| `/resumes` & `/resumes/*` | `/dashboard` | Candidate documents overview |
| `/dashboard2` & `/dashboard2/*` | `/dashboard` | Legacy dashboard redirect |
| `/dashboard/my-employments` | `/employer/jobs` | Role-switching redirect |
| `/dashboard/my-companies` | `/employer/company` | Role-switching redirect |

---

### 7. Candidate Navigation Groups (`src/components/cuba/candidateNavigation.js`)

The Cuba candidate shell organizes these destinations into three primary groups in the sidebar:
1. **Workspace**: Overview (`/dashboard`), Resumes & Master CV (`/build-resume`), Cover Letters (`/dashboard/cover-letters`), Portfolios (`/dashboard/portfolios`), Saved Favorites (`/dashboard/favorites`), Notifications (`/dashboard/notifications`).
2. **Job Intelligence**: Browse Jobs (`/dashboard/jobs`), Job Tracker (`/dashboard/job-tracker`), Submitted Applications (`/dashboard/applied-jobs`), AI Interview Coach (`/dashboard/interview`), Messages & Chat (`/dashboard/messages`).
3. **Account & Security**: Subscription & Plans (`/dashboard/plans`), Master Profile Data (`/dashboard/settings?tab=Profile`), Security & 2FA Hub (`/dashboard/settings?tab=Security`), Support (`/dashboard/support`).
